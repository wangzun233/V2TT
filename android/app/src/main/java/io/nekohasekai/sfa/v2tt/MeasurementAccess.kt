package io.nekohasekai.sfa.v2tt

import io.nekohasekai.sfa.v2tt.DeviceManifest.obj
import io.nekohasekai.sfa.v2tt.DeviceManifest.text
import kotlinx.serialization.json.*
import java.net.InetAddress
import java.net.ServerSocket
import java.util.UUID

object MeasurementAccess {
    data class Access(val ports: List<Int>, val password: String, val hostname: String, val tokens: List<String>)
    @Volatile var current: Access? = null
        private set

    fun clear() { NetworkMeasurement.cancel(); current = null }

    fun attach(content: String): String {
        clear()
        val config = DeviceManifest.parse(content)
        val outbounds = config["outbounds"]?.jsonArray ?: return content
        val daily = outbounds.firstOrNull { it.jsonObject["tag"]?.jsonPrimitive?.content == "daily-vless" }?.jsonObject ?: return content
        val game = outbounds.firstOrNull { it.jsonObject["tag"]?.jsonPrimitive?.content == "game-tuic" }?.jsonObject ?: return content
        val sockets = (0..2).map { ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")) }
        val ports = try { sockets.map { it.localPort } } finally { sockets.forEach { it.close() } }
        val access = Access(ports, UUID.randomUUID().toString(), daily.obj("tls").text("server_name"), listOf(daily.text("uuid"), daily.text("uuid"), game.text("uuid")))
        val inbound = config["inbounds"]!!.jsonArray.toMutableList()
        val route = config.obj("route").toMutableMap()
        val rules = mutableListOf<JsonElement>()
        listOf("direct", "daily-vless", "game-tuic").forEachIndexed { index, outbound ->
            val tag = "measure-$index"
            inbound.add(DeviceManifest.obj("type" to "mixed", "tag" to tag, "listen" to "127.0.0.1", "listen_port" to ports[index], "users" to listOf(DeviceManifest.obj("username" to "probe", "password" to access.password))))
            // Connect to the origin while keeping the original HTTPS name for TLS verification.
            rules.add(DeviceManifest.obj("inbound" to listOf(tag), "outbound" to outbound, "override_address" to game.text("server"), "override_port" to 443))
        }
        rules.addAll(route["rules"]!!.jsonArray)
        route["rules"] = JsonArray(rules)
        current = access
        return JsonObject(config.toMutableMap().apply { put("inbounds", JsonArray(inbound)); put("route", JsonObject(route)) }).toString()
    }
}
