import io.nekohasekai.sfa.v2tt.DeviceManifest
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class DeviceManifestTest {
    private val now = 1800000000000L
    private val fixture = """{
      "schema_version":1,
      "profile":{"id":"test-account","name":"Test","expires_at":null,"update_interval_hours":1},
      "routing":{"daily_node":"d","game_node":"g","default_mode":"smart"},
      "nodes":[
        {"id":"d","name":"Daily","type":"vless","server":"daily.example.com","server_port":443,
         "uuid":"12345678-1234-4234-8234-123456789abc","tls":{"enabled":true,"server_name":"daily.example.com"},
         "transport":{"type":"ws","path":"/test","host":"daily.example.com"}},
        {"id":"g","name":"Game","type":"tuic","server":"game.example.com","server_port":443,
         "uuid":"12345678-1234-4234-8234-123456789abd","password":"fixture-only-not-a-secret",
         "congestion_control":"bbr","udp_relay_mode":"native","tls":{"enabled":true,"server_name":"game.example.com","alpn":["h3"]}}
      ]} """.trimIndent()

    private fun config(mode: String, content: String = fixture): JsonObject =
        Json.parseToJsonElement(DeviceManifest.compile(content, mode, System.getProperty("rulesDir"), now)).jsonObject
    private fun rules(mode: String) = config(mode)["route"]!!.jsonObject["rules"]!!.jsonArray

    @Test fun allModesCompileAndExport() {
        val directory = File(System.getProperty("configOutput")).apply { mkdirs() }
        DeviceManifest.modes.forEach { mode ->
            val result = config(mode)
            assertEquals(3, result["outbounds"]!!.jsonArray.size)
            File(directory, "$mode.json").writeText(result.toString())
        }
    }
    @Test fun smartBypassesChinaBeforeDroppingQuic() {
        val rules = rules("smart")
        assertTrue(rules.indexOfFirst { "rule_set" in it.jsonObject } < rules.indexOfFirst { "port" in it.jsonObject })
        assertEquals("daily-vless", config("smart")["route"]!!.jsonObject["final"]!!.jsonPrimitive.content)
    }
    @Test fun fastKeepsOpenAiOnVless() {
        assertTrue(rules("fast").any { it.jsonObject["domain_suffix"]?.jsonArray?.contains(JsonPrimitive("chatgpt.com")) == true && it.jsonObject["outbound"] == JsonPrimitive("daily-vless") })
        assertEquals("game-tuic", config("fast")["route"]!!.jsonObject["final"]!!.jsonPrimitive.content)
        assertFalse(rules("fast").any { "port" in it.jsonObject })
    }
    @Test fun globalDoesNotBypassChina() {
        assertFalse(rules("global").any { "rule_set" in it.jsonObject })
        assertEquals("daily-vless", config("global")["route"]!!.jsonObject["final"]!!.jsonPrimitive.content)
    }
    @Test fun directUsesLocalDnsAndNoProxyRules() {
        val result = config("direct")
        assertEquals("local-dns", result["dns"]!!.jsonObject["final"]!!.jsonPrimitive.content)
        assertEquals("direct", result["route"]!!.jsonObject["final"]!!.jsonPrimitive.content)
        assertFalse(rules("direct").any { "outbound" in it.jsonObject })
    }
    @Test fun capturesIpv6WithoutPublishingController() {
        val result = config("smart")
        assertEquals(2, result["inbounds"]!!.jsonArray[0].jsonObject["address"]!!.jsonArray.size)
        assertFalse(result.toString().contains("external_controller"))
        assertFalse(result.toString().contains("process_name"))
    }
    @Test fun neverImportsArbitraryOutboundFields() {
        val input = fixture.replace("\"schema_version\":1", "\"schema_version\":1,\"outbounds\":[{\"type\":\"direct\"}],\"log\":{\"output\":\"/tmp/pwn\"}")
        assertFalse(config("smart", input).toString().contains("/tmp/pwn"))
    }
    @Test fun noExpiryRemainsUnlimited() { assertNull(DeviceManifest.expiresAt(DeviceManifest.parse(fixture))) }
    @Test fun metadataChangeDoesNotChangeRuntimeConfig() {
        assertEquals(config("smart"), config("smart", fixture.replace("\"schema_version\":1", "\"schema_version\":1,\"generated_at\":\"2099-01-01T00:00:00Z\"")))
    }
    @Test fun expiredAccountIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("\"expires_at\":null", "\"expires_at\":\"2020-01-01T00:00:00Z\"")) } }
    @Test fun malformedExpiryIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("\"expires_at\":null", "\"expires_at\":\"bad-date\"")) } }
    @Test fun missingNodeIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("\"game_node\":\"g\"", "\"game_node\":\"missing\"")) } }
    @Test fun disabledTlsIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("\"enabled\":true", "\"enabled\":false")) } }
    @Test fun invalidPortIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("\"server_port\":443", "\"server_port\":0")) } }
    @Test fun invalidUuidIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("12345678-1234-4234-8234-123456789abc", "bad")) } }
    @Test fun unknownSchemaIsRejected() { assertThrows(IllegalArgumentException::class.java) { config("smart", fixture.replace("\"schema_version\":1", "\"schema_version\":2")) } }
    @Test fun oversizedDocumentIsRejected() { assertThrows(IllegalArgumentException::class.java) { DeviceManifest.parse(" ".repeat(DeviceManifest.MAX_BYTES + 1)) } }
    @Test fun subscriptionRequiresHttps() {
        listOf("http://example.com/sub", "file:///etc/passwd", "https://user:pass@example.com/sub", "https://example.com/sub#token").forEach {
            assertThrows(IllegalArgumentException::class.java) { DeviceManifest.validateURL(it) }
        }
        assertEquals("example.com", DeviceManifest.validateURL("https://example.com/sub?token=test").host)
    }
}
