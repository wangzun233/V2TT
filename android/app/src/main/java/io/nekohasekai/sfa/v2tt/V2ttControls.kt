package io.nekohasekai.sfa.v2tt

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.sfa.constant.Status
import io.nekohasekai.sfa.database.Profile
import io.nekohasekai.sfa.v2tt.DeviceManifest.obj
import io.nekohasekai.sfa.v2tt.DeviceManifest.text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun V2ttControls(profile: Profile?, status: Status, onImport: () -> Unit, onRefresh: () -> Unit) {
    val scope = rememberCoroutineScope()
    var selectedMode by remember { mutableStateOf(ProfileContent.mode) }
    var name by remember { mutableStateOf<String?>(null) }
    var expiry by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(profile?.id, profile?.typed?.lastUpdated?.time) {
        name = null
        expiry = ""
        error = null
        if (profile == null) return@LaunchedEffect
        withContext(Dispatchers.IO) {
            runCatching {
                val root = DeviceManifest.parse(File(profile.typed.path).readText())
                if (DeviceManifest.isManifest(root)) {
                    val accountName = root.obj("profile").text("name")
                    val expires = DeviceManifest.expiresAt(root)
                    val text = expires?.let {
                        val date = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(it))
                        if (it <= System.currentTimeMillis()) "已到期 · $date" else "有效期至 $date"
                    } ?: "无到期时间"
                    withContext(Dispatchers.Main) { name = accountName; expiry = text }
                }
            }.onFailure {
                withContext(Dispatchers.Main) { error = "订阅信息无法读取，请更新订阅" }
            }
        }
    }

    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(name ?: "V2TT Client", style = MaterialTheme.typography.titleLarge)
                Text(if (name != null) expiry else "Android · sing-box ${Libbox.version()}", style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onImport, enabled = !busy) { Icon(Icons.Default.AddLink, "导入订阅") }
            if (profile != null) IconButton(onClick = onRefresh, enabled = !busy) { Icon(Icons.Default.Refresh, "更新订阅") }
        }
        if (name != null) {
            val labels = listOf("智能", "极速", "全局", "直连")
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                DeviceManifest.modes.forEachIndexed { index, value ->
                    SegmentedButton(
                        selected = selectedMode == value,
                        enabled = !busy && status != Status.Starting && status != Status.Stopping,
                        shape = SegmentedButtonDefaults.itemShape(index, labels.size),
                        onClick = {
                            if (value == selectedMode) return@SegmentedButton
                            scope.launch {
                                busy = true
                                error = null
                                val previous = selectedMode
                                try {
                                    withContext(Dispatchers.IO) {
                                        if (profile != null) ProfileContent.check(File(profile.typed.path).readText())
                                        ProfileContent.mode = value
                                        if (status == Status.Started) Libbox.newStandaloneCommandClient().serviceReload()
                                    }
                                    selectedMode = value
                                } catch (_: Exception) {
                                    withContext(Dispatchers.IO) {
                                        ProfileContent.mode = previous
                                        if (status == Status.Started) runCatching { Libbox.newStandaloneCommandClient().serviceReload() }
                                    }
                                    error = "模式切换失败，已恢复原设置；请检查连接状态"
                                } finally { busy = false }
                            }
                        },
                        label = { Text(labels[index]) },
                    )
                }
            }
            Text(when (selectedMode) {
                "smart" -> "国内直连 · 国外 VLESS"
                "fast" -> "国内直连 · 国外 TUIC · OpenAI VLESS"
                "global" -> "全部流量 VLESS"
                else -> "全部流量直连"
            }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else if (profile == null) {
            FilledTonalButton(onClick = onImport) { Icon(Icons.Default.AddLink, null); Spacer(Modifier.width(8.dp)); Text("导入 V2TT 订阅") }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        HorizontalDivider()
    }
}
