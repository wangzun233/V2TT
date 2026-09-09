const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const fs = require('node:fs')
const path = require('node:path')
const run = promisify(execFile)
const TASK = 'V2TT Client Auto Start'
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

async function powershell(script) {
  const preamble = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
  const result = await run(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(preamble + script, 'utf16le').toString('base64'),
  ], { windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 128 * 1024 })
  return result.stdout.trim()
}

function createStartup(app) {
  const executable = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  let cache = { startup: false, startupError: '' }
  const read = async () => {
    if (!app.isPackaged) return { startup: false, startupError: '' }
    const json = await powershell(`
      $task = @(Get-ScheduledTask -TaskPath '\\' | Where-Object { $_.TaskName -eq ${quote(TASK)} })
      if ($task.Count -eq 0) { @{ enabled = $false; execute = ''; arguments = '' } | ConvertTo-Json -Compress }
      else { $t = $task[0]; @{ enabled = ($t.State -ne 'Disabled'); execute = $t.Actions[0].Execute; arguments = $t.Actions[0].Arguments } | ConvertTo-Json -Compress }
    `)
    const task = JSON.parse(json)
    return { startup: Boolean(task.enabled && path.resolve(task.execute).toLowerCase() === path.resolve(executable()).toLowerCase() && task.arguments === '--autostart'), startupError: '' }
  }
  return {
    async get(refresh = false) {
      if (refresh) {
        try { cache = await read() }
        catch { cache = { ...cache, startupError: '无法读取 Windows 开机启动状态，请重试' } }
      }
      return { ...cache }
    },
    async set(enabled) {
      if (!app.isPackaged) throw new Error('请在安装后的客户端中设置开机自启')
      if (typeof enabled !== 'boolean') throw new Error('开机自启参数无效')
      if (enabled) {
        if (!fs.existsSync(executable())) throw new Error('客户端程序路径不存在')
        await powershell(`
          $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
          $action = New-ScheduledTaskAction -Execute ${quote(executable())} -Argument '--autostart' -WorkingDirectory ${quote(path.dirname(executable()))}
          $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
          $trigger.Delay = 'PT10S'
          $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
          $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
          Register-ScheduledTask -TaskPath '\\' -TaskName ${quote(TASK)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
        `)
      } else {
        await powershell(`Get-ScheduledTask -TaskPath '\\' | Where-Object { $_.TaskName -eq ${quote(TASK)} } | Unregister-ScheduledTask -Confirm:$false`)
      }
      cache = await read()
      if (cache.startup !== enabled) throw new Error('Windows 未确认启动设置已生效')
      return { ...cache }
    },
  }
}

module.exports = { createStartup }
