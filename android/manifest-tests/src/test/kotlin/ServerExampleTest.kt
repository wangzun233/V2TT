import io.nekohasekai.sfa.v2tt.DeviceManifest
import org.junit.Test
import org.junit.Assert.assertTrue
import java.io.File

class ServerExampleTest {
    @Test fun serverSubscriptionCompilesInEveryAndroidMode() {
        val content = File(System.getProperty("serverExample")).readText()
        for (mode in DeviceManifest.modes) {
            val compiled = DeviceManifest.compile(content, mode, System.getProperty("rulesDir"))
            assertTrue(compiled.contains("daily-vless"))
            assertTrue(compiled.contains("game-tuic"))
        }
    }
}
