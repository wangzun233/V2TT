package io.nekohasekai.sfa.v2tt

import kotlinx.serialization.json.*
import java.net.URI
import java.time.Instant
import java.util.UUID

/** V2TT's device format is data, never an executable sing-box configuration. */
object DeviceManifest {
    const val MAX_BYTES = 262144
    val modes = listOf("smart", "fast", "global", "direct")
    private val openAI = listOf("openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com")
    class AccountExpired : IllegalArgumentException("账号已到期，请联系管理员续期并更新订阅")

    fun parse(content: String): JsonObject {
        require(content.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "订阅内容过大" }
        return try { Json.parseToJsonElement(content).jsonObject } catch (_: Exception) {
            throw IllegalArgumentException("订阅不是有效的 V2TT JSON 格式")
        }
    }

    fun isManifest(root: JsonObject): Boolean = "schema_version" in root || "nodes" in root

    fun validateURL(value: String): URI {
        val uri = try { URI(value.trim()) } catch (_: Exception) { throw IllegalArgumentException("订阅链接格式错误") }
        require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null) {
            "请输入 HTTPS 订阅链接，不要包含用户名或片段"
        }
        require(uri.port == -1 || uri.port in 1..65535) { "订阅端口无效" }
        return uri
    }

    fun expiresAt(root: JsonObject): Long? {
        val value = root.obj("profile")["expires_at"]
        require(value != null) { "订阅缺少有效期字段" }
        if (value == JsonNull) return null
        return try { Instant.parse(value.jsonPrimitive.content).toEpochMilli() } catch (_: Exception) {
            throw IllegalArgumentException("订阅有效期格式错误，请更新订阅")
        }
    }

    fun requireActive(root: JsonObject, now: Long = System.currentTimeMillis()) {
        if (expiresAt(root)?.let { now >= it } == true) throw AccountExpired()
    }

    fun compile(content: String, mode: String, rulesDirectory: String, now: Long = System.currentTimeMillis()): String {
        val root = parse(content)
        require(root["schema_version"]?.jsonPrimitive?.intOrNull == 1) { "不支持此订阅版本，请更新客户端" }
        require(mode in modes) { "无效的连接模式" }
        requireActive(root, now)
        val profile = root.obj("profile")
        profile.text("id"); profile.text("name")
        val routing = root.obj("routing")
        val nodes = root["nodes"]?.jsonArray ?: error("订阅缺少节点")
        require(nodes.size in 2..32) { "订阅节点数量无效" }
        val ids = nodes.map { it.jsonObject.text("id") }
        require(ids.distinct().size == ids.size) { "订阅包含重复节点" }
        fun node(id: String, type: String): JsonObject {
            val n = nodes.singleOrNull { it.jsonObject.text("id") == id }?.jsonObject
                ?: throw IllegalArgumentException("订阅缺少所需线路")
            require(n.text("type") == type) { "订阅线路类型不匹配" }
            require(n.text("server").none { it.isWhitespace() || it == '/' || it == '@' }) { "节点地址无效" }
            require(n["server_port"]?.jsonPrimitive?.intOrNull in 1..65535) { "节点端口无效" }
            val uuid = n.text("uuid")
            require(runCatching { UUID.fromString(uuid).toString().equals(uuid, true) }.getOrDefault(false)) { "节点 ID 无效" }
            require(n.obj("tls")["enabled"]?.jsonPrimitive?.booleanOrNull == true) { "不允许关闭 TLS" }
            n.obj("tls").text("server_name")
            return n
        }
        val daily = node(routing.text("daily_node"), "vless")
        val game = node(routing.text("game_node"), "tuic")
        val transport = daily.obj("transport")
        require(transport.text("type") == "ws" && transport.text("path").startsWith('/')) { "VLESS 需要 WebSocket 配置" }
        val congestion = game.text("congestion_control")
        require(congestion in listOf("bbr", "cubic", "new_reno")) { "TUIC 拥塞算法无效" }
        val relay = game.text("udp_relay_mode")
        require(relay in listOf("native", "quic")) { "TUIC UDP 模式无效" }
        val alpn = game.obj("tls")["alpn"]?.jsonArray ?: error("TUIC 缺少 ALPN")
        require(alpn.isNotEmpty() && alpn.size <= 8 && alpn.all { it.jsonPrimitive.content.length in 1..64 }) { "TUIC ALPN 无效" }

        val split = mode == "smart" || mode == "fast"
        val rules = buildJsonArray {
            add(obj("action" to "sniff"))
            add(obj("protocol" to "dns", "action" to "hijack-dns"))
            if (mode == "fast") add(obj("domain_suffix" to openAI, "outbound" to "daily-vless"))
            if (split) {
                add(obj("rule_set" to listOf("geosite-cn", "geoip-cn"), "outbound" to "direct"))
                add(obj("ip_is_private" to true, "outbound" to "direct"))
                add(obj("domain_suffix" to listOf("cn"), "outbound" to "direct"))
            }
            if (mode == "smart" || mode == "global") add(obj("network" to "udp", "port" to 443, "action" to "reject", "method" to "drop"))
        }
        val outbounds = buildJsonArray {
            add(obj("type" to "vless", "tag" to "daily-vless", "server" to daily.text("server"),
                "server_port" to daily["server_port"], "uuid" to daily.text("uuid"),
                "tls" to obj("enabled" to true, "server_name" to daily.obj("tls").text("server_name")),
                "transport" to obj("type" to "ws", "path" to transport.text("path"), "headers" to obj("Host" to transport.text("host")))))
            add(obj("type" to "tuic", "tag" to "game-tuic", "server" to game.text("server"),
                "server_port" to game["server_port"], "uuid" to game.text("uuid"), "password" to game.text("password"),
                "congestion_control" to congestion, "udp_relay_mode" to relay,
                "tls" to obj("enabled" to true, "server_name" to game.obj("tls").text("server_name"), "alpn" to alpn)))
            add(obj("type" to "direct", "tag" to "direct"))
        }
        val config = obj(
            "log" to obj("level" to "warn", "timestamp" to true),
            "dns" to obj(
                "servers" to listOf(obj("type" to "tls", "tag" to "secure-dns", "server" to "1.1.1.1", "detour" to "daily-vless"), obj("type" to "local", "tag" to "local-dns")),
                "rules" to if (split) listOf(obj("rule_set" to "geosite-cn", "server" to "local-dns")) else emptyList<JsonObject>(),
                "final" to if (mode == "direct") "local-dns" else "secure-dns", "strategy" to "ipv4_only"),
            // Capture IPv6 as well, even with IPv4-only DNS, to prevent literal IPv6 bypass.
            "inbounds" to listOf(obj("type" to "tun", "tag" to "tun-in", "address" to listOf("172.19.0.1/30", "fdfe:dcba:9876::1/126"), "auto_route" to true, "stack" to "mixed", "mtu" to 1400)),
            "outbounds" to outbounds,
            "route" to obj("auto_detect_interface" to true, "default_domain_resolver" to "local-dns", "rules" to rules,
                "rule_set" to if (split) listOf("geosite-cn", "geoip-cn").map { obj("type" to "local", "tag" to it, "format" to "binary", "path" to "$rulesDirectory/$it.srs") } else emptyList<JsonObject>(),
                "final" to when (mode) { "direct" -> "direct"; "fast" -> "game-tuic"; else -> "daily-vless" }),
            "experimental" to obj("clash_api" to obj("default_mode" to "rule")),
        )
        return config.toString()
    }

    fun JsonObject.obj(key: String): JsonObject = this[key]?.jsonObject ?: throw IllegalArgumentException("订阅缺少 $key")
    fun JsonObject.text(key: String): String {
        val value = this[key]?.jsonPrimitive?.contentOrNull
        require(value != null && value.length in 1..2048 && value.none { it == '\r' || it == '\n' }) { "订阅字段 $key 无效" }
        return value
    }
    fun obj(vararg values: Pair<String, Any?>): JsonObject = buildJsonObject { values.forEach { put(it.first, element(it.second)) } }
    private fun element(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is JsonElement -> value
        is String -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        is List<*> -> JsonArray(value.map(::element))
        else -> error("Unsupported JSON value")
    }
}
