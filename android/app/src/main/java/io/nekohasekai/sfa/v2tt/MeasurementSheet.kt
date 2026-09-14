package io.nekohasekai.sfa.v2tt

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeasurementSheet(connected: Boolean) {
    var open by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    var route by remember { mutableIntStateOf(1) }
    val result by NetworkMeasurement.state.collectAsState()
    val scope = rememberCoroutineScope()
    fun format(value: Double?, unit: String) = value?.let { String.format(Locale.ROOT, "%.1f %s", it, unit) } ?: "--"
    LaunchedEffect(connected) { if (!connected) NetworkMeasurement.cancel() }
    DisposableEffect(Unit) { onDispose { NetworkMeasurement.cancel() } }
    OutlinedButton(onClick = { open = true }, enabled = connected) { Icon(Icons.Default.Speed, null); Spacer(Modifier.width(8.dp)); Text("服务器测速") }
    if (open) ModalBottomSheet(sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), onDismissRequest = { NetworkMeasurement.cancel(); open = false }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("服务器测速", style = MaterialTheme.typography.titleLarge)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("直连", "VLESS", "TUIC").forEachIndexed { index, label ->
                    SegmentedButton(selected = route == index, onClick = { route = index }, enabled = !result.running,
                        shape = SegmentedButtonDefaults.itemShape(index, 3), label = { Text(label) })
                }
            }
            Text(result.phase, style = MaterialTheme.typography.labelLarge)
            result.route?.let { Text("结果线路：${listOf("直连", "VLESS", "TUIC")[it]}", style = MaterialTheme.typography.bodySmall) }
            Text("HTTPS 延迟中位数：${format(result.latency, "ms")}")
            Text("延迟波动：${format(result.jitter, "ms")} · 请求失败 ${result.failures}/${result.attempts}")
            Text("下载平均：${format(result.download, "Mbps")}\n下载峰值：${format(result.downloadPeak, "Mbps")}")
            Text("上传平均：${format(result.upload, "Mbps")}\n上传峰值：${format(result.uploadPeak, "Mbps")}")
            Text(String.format(Locale.ROOT, "已确认传输 %.2f MiB", result.bytes / 1048576.0), style = MaterialTheme.typography.bodySmall)
            result.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (result.running) OutlinedButton(onClick = { NetworkMeasurement.cancel() }) { Icon(Icons.Default.Stop, null); Text("停止") }
                else {
                    OutlinedButton(onClick = { scope.launch { NetworkMeasurement.start(route, false) } }, enabled = connected) { Icon(Icons.Default.Speed, null); Text("测延迟") }
                    Button(onClick = { confirm = true }, enabled = connected) { Icon(Icons.Default.Speed, null); Text("测速度") }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("开始速度测试？") },
        text = { Text("下载和上传各最多 128 MiB，计入服务器流量，可能影响正在进行的游戏或通话。") },
        confirmButton = { TextButton(onClick = { confirm = false; scope.launch { NetworkMeasurement.start(route, true) } }) { Text("开始测速") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("取消") } })
}
