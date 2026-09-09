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
    private fun fixture(): String = InstrumentationRegistry.getInstrumentation().context.assets.open("manifest.json").bufferedReader().use { it.readText() }

    @Test fun a_nativeCoreLoadsAndValidatesAllModes() {
        assertEquals("1.13.19", Libbox.version())
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
