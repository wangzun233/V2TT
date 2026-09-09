!macro customUnInstall
  InitPluginsDir
  File /oname=$PLUGINSDIR\v2tt-uninstall.ps1 "${BUILD_RESOURCES_DIR}\uninstall-cleanup.ps1"
  ${If} ${isUpdated}
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\v2tt-uninstall.ps1" -InstallDirectory "$INSTDIR" -KeepStartup'
  ${Else}
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\v2tt-uninstall.ps1" -InstallDirectory "$INSTDIR"'
  ${EndIf}
!macroend
