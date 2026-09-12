package io.nekohasekai.sfa.v2tt

import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URI

object ClientUpdate {
    const val feedUrl = "https://raw.githubusercontent.com/wangzun233/V2TT/main/updates/stable.json"
    private const val prefix = "https://github.com/wangzun233/V2TT/releases/tag/"
    data class Candidate(val version: String, val versionCode: Int, val releaseUrl: String)

    fun validateReleaseUrl(url: String): String {
        require(url.startsWith(prefix) && Regex("[A-Za-z0-9._-]+").matches(url.removePrefix(prefix))) { "更新链接不属于 V2TT 官方仓库" }
        return url
    }

    private fun version(value: String): List<Int> {
        require(Regex("(0|[1-9]\\d{0,2})\\.(0|[1-9]\\d{0,2})\\.(0|[1-9]\\d{0,2})").matches(value)) { "更新版本格式无效" }
        return value.split('.').map(String::toInt)
    }

    fun parse(text: String, current: String, currentCode: Int): Candidate? {
        val root = Json.parseToJsonElement(text).jsonObject
        require(root["schema"]?.jsonPrimitive?.int == 1) { "更新信息格式不受支持" }
        val item = root.getValue("android").jsonObject
        val name = item.getValue("version").jsonPrimitive.content
        val code = item.getValue("versionCode").jsonPrimitive.int
        require(code > 0)
        val url = validateReleaseUrl(item.getValue("releaseUrl").jsonPrimitive.content)
        val comparison = version(name).zip(version(current)).firstOrNull { it.first != it.second }
        if (comparison == null || comparison.first < comparison.second || code <= currentCode) return null
        return Candidate(name, code, url)
    }

    fun check(current: String, currentCode: Int): Candidate? {
        val connection = URI(feedUrl).toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        try {
            check(connection.responseCode == 200) { "更新服务暂不可用（HTTP ${connection.responseCode}）" }
            val bytes = connection.inputStream.use { it.readBytesBounded() }
            return parse(bytes.toString(Charsets.UTF_8), current, currentCode)
        } finally { connection.disconnect() }
    }

    private fun java.io.InputStream.readBytesBounded(): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            require(output.size() + count <= 16384) { "更新信息过大" }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
}
