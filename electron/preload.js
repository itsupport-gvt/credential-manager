// Credential Manager – Preload script
// Exposes a typed, sandboxed API surface to the renderer via contextBridge.
// No raw Node/Electron APIs are exposed to the page.

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('credManager', {
  // Persist configuration (SharePoint credentials)
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Read currently saved configuration
  getConfig: () => ipcRenderer.invoke('get-config'),

  // First-run setup: save config then start backend
  setupComplete: (data) => ipcRenderer.invoke('setup-complete', data),

  // Get the port the backend is listening on
  getPort: () => ipcRenderer.invoke('get-port'),

  // Application version from package.json
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Open the settings / re-configuration window
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // Trigger an auto-update check
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Show the native About dialog
  showAbout: () => ipcRenderer.invoke('show-about'),

  // Switch color theme: 'dark' | 'light' | 'system'
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),

  // Listen for update events pushed from main process
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', (_event, info) => cb(info))
  },
  onUpdateProgress: (cb) => {
    ipcRenderer.on('update-download-progress', (_event, info) => cb(info))
  },
})
