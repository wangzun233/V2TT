import io.nekohasekai.sfa.v2tt.ClientUpdate
import org.junit.Assert.*
import org.junit.Test

class ClientUpdateTest {
    private fun feed(version: String = "0.1.10", code: Int = 10, url: String = "https://github.com/wangzun233/V2TT/releases/tag/v-test") =
        """{"schema":1,"android":{"version":"$version","versionCode":$code,"releaseUrl":"$url"}}"""

    @Test fun comparesNumericallyAndRequiresNewerCode() {
        assertEquals("0.1.10", ClientUpdate.parse(feed(), "0.1.9", 9)?.version)
        assertNull(ClientUpdate.parse(feed(), "0.1.10", 10))
        assertNull(ClientUpdate.parse(feed("0.1.8"), "0.1.9", 9))
        assertNull(ClientUpdate.parse(feed(code = 9), "0.1.9", 9))
    }

    @Test fun rejectsForeignOrExecutableLinks() {
        listOf("https://evil.test/", "file:///update.apk", "https://github.com/wangzun233/V2TT/releases/tag/v1?next=evil", "https://github.com/wangzun233/V2TT/releases/tag/v1/../other").forEach { url ->
            assertThrows(IllegalArgumentException::class.java) { ClientUpdate.parse(feed(url = url), "0.1.2", 3) }
        }
    }

    @Test fun rejectsMalformedVersionAndSchema() {
        assertThrows(IllegalArgumentException::class.java) { ClientUpdate.parse(feed("0.1.3-beta"), "0.1.2", 3) }
        assertThrows(IllegalArgumentException::class.java) { ClientUpdate.parse(feed().replace("\"schema\":1", "\"schema\":2"), "0.1.2", 3) }
    }
}
