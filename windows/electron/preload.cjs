const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('v2tt', {
  getManifest: () => ipcRenderer.invoke('manifest:get'),
  refreshManifest: () => ipcRenderer.invoke('manifest:refresh'),
  getSubscription: () => ipcRenderer.invoke('subscription:get'),
  setSubscription: (payload) => ipcRenderer.invoke('subscription:set', payload),
  removeSubscription: () => ipcRenderer.invoke('subscription:remove'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (payload) => ipcRenderer.invoke('settings:set', payload),
  getStatus: () => ipcRenderer.invoke('proxy:status'),
  connect: (payload) => ipcRenderer.invoke('proxy:connect', payload),
  disconnect: () => ipcRenderer.invoke('proxy:disconnect'),
  setMode: (payload) => ipcRenderer.invoke('proxy:set-mode', payload),
  runDiagnostics: () => ipcRenderer.invoke('diagnostics:run'),
  testNode: (payload) => ipcRenderer.invoke('diagnostics:node', payload),
  exportReport: () => ipcRenderer.invoke('support:export'),
})
