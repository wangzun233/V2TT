package io.nekohasekai.sfa.v2tt

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import okhttp3.*
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.InetSocketAddress
import java.net.Proxy
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs

object NetworkMeasurement {
    data class Result(val phase: String = "未测试", val running: Boolean = false, val route: Int? = null, val latency: Double? = null,
        val jitter: Double? = null, val failures: Int = 0, val attempts: Int = 0, val download: Double? = null,
        val upload: Double? = null, val downloadPeak: Double? = null, val uploadPeak: Double? = null,
        val bytes: Long = 0, val error: String? = null)
    private val mutable = MutableStateFlow(Result())
    val state = mutable.asStateFlow()
    private val cancelled = AtomicBoolean(false)
    @Volatile private var client: OkHttpClient? = null
    private val lock = kotlinx.coroutines.sync.Mutex()
    fun cancel() { cancelled.set(true); client?.dispatcher?.cancelAll() }
    private fun now() = System.nanoTime() / 1e9

    suspend fun start(route: Int, speed: Boolean) = withContext(Dispatchers.IO) {
        if (!lock.tryLock()) return@withContext
        try {
            require(route in 0..2)
            val access = MeasurementAccess.current ?: error("请先连接 V2TT 节点")
            cancelled.set(false)
            mutable.value = Result(phase = "测量延迟", running = true, route = route)
            val http = OkHttpClient.Builder()
                .proxy(Proxy(Proxy.Type.HTTP, InetSocketAddress("127.0.0.1", access.ports[route])))
                .proxyAuthenticator { _, response ->
                    if (response.request.header("Proxy-Authorization") != null) null
                    else response.request.newBuilder().header("Proxy-Authorization", Credentials.basic("probe", access.password)).build()
                }
                .connectTimeout(10, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS).callTimeout(12, TimeUnit.SECONDS)
                .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
                .protocols(listOf(Protocol.HTTP_1_1)).build()
            client = http
            fun request(action: String, payload: ByteArray? = null): Response {
                check(!cancelled.get()) { "已停止" }
                val req = Request.Builder().url("https://${access.hostname}/_v2tt/measure/v1/$action?nonce=${System.nanoTime()}")
                    .header("Authorization", "Bearer ${access.tokens[route]}")
                    .header("Accept-Encoding", "identity").header("Cache-Control", "no-cache")
                if (payload != null) req.post(payload.toRequestBody())
                val response = http.newCall(req.build()).execute()
                if (response.code != (if (action == "ping") 204 else 200) || response.header("X-V2TT-Measure") != "1" || response.header("Content-Encoding") != null) {
                    val code = response.code
                    response.close()
                    error("测速端点不可用（HTTP $code）")
                }
                return response
            }
            val samples = mutableListOf<Double>()
            repeat(5) { attempt ->
                val began = now()
                try { request("ping").use { }; samples.add((now() - began) * 1000) }
                catch (e: Exception) { if (cancelled.get()) throw e }
                val sorted = samples.sorted()
                mutable.value = mutable.value.copy(latency = if (sorted.isEmpty()) null else (sorted[(sorted.size - 1) / 2] + sorted[sorted.size / 2]) / 2,
                    jitter = if (samples.size > 1) samples.zipWithNext { a, b -> abs(a - b) }.average() else null,
                    failures = attempt + 1 - samples.size, attempts = attempt + 1)
            }
            check(samples.isNotEmpty()) { "无法访问服务器测速端点" }
            if (speed) for (upload in listOf(false, true)) coroutineScope {
                val bytes = AtomicLong(); val reserved = AtomicLong()
                val began = now(); val finished = AtomicBoolean(false)
                var previousTime = began; var previousBytes = 0L; var peak: Double? = null
                val baseBytes = mutable.value.bytes
                fun tick() {
                    val time = now(); val count = bytes.get()
                    if (time - previousTime >= .9) peak = maxOf(peak ?: 0.0, (count - previousBytes) * 8 / (time - previousTime) / 1e6)
                    val mean = count * 8 / maxOf(.001, time - began) / 1e6
                    mutable.value = if (upload) mutable.value.copy(phase = "上传中", upload = mean, uploadPeak = peak, bytes = baseBytes + count)
                    else mutable.value.copy(phase = "下载中", download = mean, downloadPeak = peak, bytes = baseBytes + count)
                    previousTime = time; previousBytes = count
                }
                val deadline = launch { delay(10000); finished.set(true); http.dispatcher.cancelAll() }
                val ticker = launch { while (isActive) { delay(1000); tick() } }
                try {
                    (0..3).map { async(Dispatchers.IO) {
                        var size = 256 * 1024
                        while (!finished.get() && !cancelled.get()) {
                            val count = if (upload) size else 16 * 1024 * 1024
                            if (reserved.addAndGet(count.toLong()) > 128L * 1024 * 1024) break
                            val started = now()
                            try {
                                if (upload) {
                                    val payload = ByteArray(count).also { SecureRandom().nextBytes(it) }
                                    request("upload", payload).use { response ->
                                        val source = response.body!!.source()
                                        require(!source.request(4097)) { "测速响应无效" }
                                        val ack = DeviceManifest.parse(source.readUtf8())["received"]!!.jsonPrimitive.long
                                        require(ack == count.toLong()) { "服务器上传确认无效" }
                                    }
                                    bytes.addAndGet(count.toLong())
                                    size = (count / maxOf(.001, now() - started)).toInt().coerceIn(64 * 1024, 8 * 1024 * 1024)
                                } else request("download").use { response ->
                                    require(response.body!!.contentLength() == 16L * 1024 * 1024) { "测速响应长度无效" }
                                    response.body!!.byteStream().use { input ->
                                        val buffer = ByteArray(64 * 1024)
                                        while (true) { val n = input.read(buffer); if (n < 0) break; bytes.addAndGet(n.toLong()) }
                                    }
                                }
                            } catch (e: Exception) {
                                if (!finished.get() && !cancelled.get()) { finished.set(true); http.dispatcher.cancelAll(); throw e }
                            }
                        }
                    } }.awaitAll()
                } finally { finished.set(true); deadline.cancelAndJoin(); ticker.cancelAndJoin(); http.dispatcher.cancelAll(); tick() }
                check(!cancelled.get()) { "已停止" }
                check(bytes.get() > 0) { "没有收到有效测速数据" }
            }
            check(!cancelled.get()) { "已停止" }
            mutable.value = mutable.value.copy(phase = "完成", running = false)
        } catch (_: Exception) {
            mutable.value = mutable.value.copy(phase = if (cancelled.get()) "已停止" else "测试失败", running = false,
                error = if (cancelled.get()) null else "测速失败，请检查节点连接、服务器测速服务及网络")
        } finally { client?.dispatcher?.cancelAll(); client?.connectionPool?.evictAll(); client = null; lock.unlock() }
    }
}
