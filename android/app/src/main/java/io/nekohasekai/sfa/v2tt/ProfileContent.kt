package io.nekohasekai.sfa.v2tt

import android.content.Context
import android.util.AtomicFile
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.sfa.Application
import io.nekohasekai.sfa.bg.BoxService
import io.nekohasekai.sfa.database.Profile
import io.nekohasekai.sfa.database.ProfileManager
import io.nekohasekai.sfa.database.Settings
import io.nekohasekai.sfa.database.TypedProfile
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.IOException
import java.util.Date
import javax.net.ssl.HttpsURLConnection

object ProfileContent {
    private val updateLock = Mutex()
    private val context get() = Application.application
    private val prefs get() = context.getSharedPreferences("v2tt", Context.MODE_PRIVATE)
    var mode: String
        get() = prefs.getString("mode", "smart")?.takeIf { it in DeviceManifest.modes } ?: "smart"
        set(value) { require(value in DeviceManifest.modes); check(prefs.edit().putString("mode", value).commit()) }

    @Synchronized
    private fun rulesDirectory(): String {
        val directory = File(context.filesDir, "v2tt-rules").apply { mkdirs() }
        for (name in listOf("geoip-cn.srs", "geosite-cn.srs")) {
            val file = File(directory, name)
            if (!file.exists()) context.assets.open("v2tt-rules/$name").use { input ->
                val atomic = AtomicFile(file)
                val stream = atomic.startWrite()
                try { input.copyTo(stream); atomic.finishWrite(stream) } catch (e: Exception) { atomic.failWrite(stream); throw e }
            }
        }
        return directory.absolutePath
    }

    fun isV2tt(content: String): Boolean = runCatching { DeviceManifest.isManifest(DeviceManifest.parse(content)) }.getOrDefault(false)

    fun forCore(content: String, selectedMode: String = mode): String {
        val root = DeviceManifest.parse(content)
        require("v2tt_revoked" !in root) { "订阅已失效，请联系管理员并重新更新" }
        return if (DeviceManifest.isManifest(root)) DeviceManifest.compile(content, selectedMode, rulesDirectory()) else content
    }

    fun check(content: String) = Libbox.checkConfig(forCore(content))

    fun assertUsable(profile: Profile) {
        val content = File(profile.typed.path).readText()
        val root = DeviceManifest.parse(content)
        require("v2tt_revoked" !in root) { "订阅已失效，请更新订阅" }
        if (DeviceManifest.isManifest(root)) {
            DeviceManifest.requireActive(root)
            if (profile.typed.type == TypedProfile.Type.Remote) {
                val age = System.currentTimeMillis() - profile.typed.lastUpdated.time
                require(age in 0..(72L * 60 * 60 * 1000)) { "订阅超过 72 小时未验证，请联网更新后连接" }
            }
        }
    }

    class SubscriptionRejected(val status: Int) : IOException("订阅服务器返回 HTTP $status，请确认账号状态和订阅链接")

    fun fetch(url: String): String {
        val uri = DeviceManifest.validateURL(url)
        val connection = uri.toURL().openConnection() as HttpsURLConnection
        try {
            connection.connectTimeout = 15000
            connection.readTimeout = 20000
            // Do not forward the secret subscription path to redirects or downgrade TLS.
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("User-Agent", "V2TT-Android/0.1.0")
            connection.setRequestProperty("Accept", "application/json")
            val status = connection.responseCode
            if (status != 200) throw SubscriptionRejected(status)
            require(connection.contentLengthLong <= DeviceManifest.MAX_BYTES) { "订阅内容过大" }
            val bytes = connection.inputStream.use { it.readBytesBounded(DeviceManifest.MAX_BYTES) }
            val content = bytes.toString(Charsets.UTF_8)
            require(isV2tt(content)) { "请使用 V2TT Client 专属订阅，不是 Clash 或 Hiddify 订阅" }
            check(content)
            return content
        } catch (e: SubscriptionRejected) {
            throw e
        } catch (e: IllegalArgumentException) {
            throw e
        } catch (_: IOException) {
            throw IOException("订阅下载失败，请检查网络、证书和链接")
        } finally {
            connection.disconnect()
        }
    }

    private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            require(output.size() + count <= limit) { "订阅内容过大" }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    fun write(file: File, content: String) {
        val atomic = AtomicFile(file)
        val stream = atomic.startWrite()
        try { stream.write(content.toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream) } catch (e: Exception) { atomic.failWrite(stream); throw e }
    }

    /** Metadata refresh alone must not restart a live game connection. */
    suspend fun refresh(profile: Profile): Boolean = updateLock.withLock {
        val file = File(profile.typed.path)
        val content = try { fetch(profile.typed.remoteURL) } catch (e: DeviceManifest.AccountExpired) {
            write(file, "{\"v2tt_revoked\":true}")
            if (profile.id == Settings.selectedProfile) BoxService.stop()
            throw e
        } catch (e: SubscriptionRejected) {
            if (e.status in listOf(401, 403, 404, 410)) {
                write(file, "{\"v2tt_revoked\":true}")
                if (profile.id == Settings.selectedProfile) BoxService.stop()
            }
            throw e
        }
        val compiled = forCore(content)
        val old = runCatching { forCore(file.readText()) }.getOrNull()
        write(file, content)
        profile.typed.lastUpdated = Date()
        ProfileManager.update(profile)
        old != compiled
    }
}
