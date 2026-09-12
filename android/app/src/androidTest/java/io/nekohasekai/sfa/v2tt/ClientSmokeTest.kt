package io.nekohasekai.sfa.v2tt

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.sfa.database.Profile
import io.nekohasekai.sfa.database.ProfileManager
import io.nekohasekai.sfa.database.Settings
import io.nekohasekai.sfa.database.TypedProfile
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ClientSmokeTest {
    @Test fun updateDialogShowsOnlyV2ttRelease() {
        val previous = Settings.checkUpdateEnabled
        val previousShown = Settings.lastShownUpdateVersion
        Settings.checkUpdateEnabled = false
        Settings.lastShownUpdateVersion = 0
        io.nekohasekai.sfa.update.UpdateState.setUpdate(io.nekohasekai.sfa.update.UpdateInfo(
            999999, "999.0.0", "https://github.com/wangzun233/V2TT/releases/tag/test-only",
            "https://github.com/wangzun233/V2TT/releases/tag/test-only", "Isolated update test", false,
        ))
        try {
            androidx.test.core.app.ActivityScenario.launch(io.nekohasekai.sfa.compose.MainActivity::class.java).use {
                val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
                fun hasVersion(node: android.view.accessibility.AccessibilityNodeInfo?): Boolean {
                    if (node == null) return false
                    if (node.text?.contains("999.0.0") == true) return true
                    return (0 until node.childCount).any { hasVersion(node.getChild(it)) }
                }
                var found = false
                for (attempt in 0 until 50) {
                    if (hasVersion(automation.rootInActiveWindow)) { found = true; break }
                    Thread.sleep(100)
                }
                assertTrue("Update dialog must show the candidate version", found)
            }
        } finally {
            io.nekohasekai.sfa.update.UpdateState.setUpdate(null)
            Settings.checkUpdateEnabled = previous
            Settings.lastShownUpdateVersion = previousShown
        }
    }

    private fun fixture(): String = InstrumentationRegistry.getInstrumentation().context.assets.open("manifest.json").bufferedReader().use { it.readText() }

    @Test fun a_nativeCoreLoadsAndValidatesAllModes() {
        assertEquals("1.14.0", Libbox.version())
        DeviceManifest.modes.forEach { mode -> Libbox.checkConfig(ProfileContent.forCore(fixture(), mode)) }
    }

    @Test fun b_atomicCacheAndModesPersist() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "v2tt-smoke-cache.json")
        ProfileContent.write(file, fixture())
        assertTrue(ProfileContent.isV2tt(file.readText()))
        val previous = ProfileContent.mode
        try {
            DeviceManifest.modes.forEach { ProfileContent.mode = it; assertEquals(it, ProfileContent.mode) }
        } finally { ProfileContent.mode = previous; file.delete() }
    }

    @Test fun c_revokedCacheCannotConnect() {
        assertThrows(IllegalArgumentException::class.java) { ProfileContent.forCore("{\"v2tt_revoked\":true}") }
    }

    @Test fun staleRemoteCacheCannotConnect() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "stale-profile.json")
        ProfileContent.write(file, fixture())
        val profile = Profile(typed = TypedProfile().apply {
            type = TypedProfile.Type.Remote
            path = file.path
            lastUpdated = java.util.Date(System.currentTimeMillis() - 73L * 60 * 60 * 1000)
        })
        try { assertThrows(IllegalArgumentException::class.java) { ProfileContent.assertUsable(profile) } } finally { file.delete() }
    }

    @Test fun d_installIsolatedDirectFixture(): Unit = runBlocking {
        // Only runs in a clean test emulator; no real subscription or account is used.
        if (ProfileManager.list().isNotEmpty()) return@runBlocking
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.filesDir, "configs/smoke.json")
        file.parentFile!!.mkdirs()
        ProfileContent.write(file, fixture())
        val profile = Profile(name = "本地验收", typed = TypedProfile().apply { type = TypedProfile.Type.Local; path = file.path })
        ProfileManager.create(profile, andSelect = true)
        ProfileContent.mode = "direct"
        ProfileContent.assertUsable(profile)
        Settings.rebuildServiceMode()
        assertEquals("vpn", Settings.serviceMode)
        assertEquals(profile.id, Settings.selectedProfile)
    }
}
