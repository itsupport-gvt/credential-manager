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

  // Switch color theme: 'dark' | 'light'
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getTheme: ()      => ipcRenderer.invoke('get-theme'),

  // Per-launch secret token — injected into every API request header
  getAppToken: () => ipcRenderer.invoke('get-app-token'),

  // Microsoft Entra ID login / logout
  msLogin:    () => ipcRenderer.invoke('ms-login'),
  msLogout:   () => ipcRenderer.invoke('ms-logout'),

  // Current signed-in user ({ name, email, oid, token }) or null
  getMsUser:  () => ipcRenderer.invoke('get-ms-user'),

  // Fresh ID token string (does silent acquire / refresh) or null
  getMsToken: () => ipcRenderer.invoke('get-ms-token'),

  // All accounts currently in the MSAL cache (for account picker on login screen)
  getCachedAccounts: () => ipcRenderer.invoke('get-cached-accounts'),

  // Select a specific cached account by homeAccountId (silent acquire)
  selectAccount: (homeAccountId) => ipcRenderer.invoke('select-account', homeAccountId),

  // Listen for update events pushed from main process
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', (_event, info) => cb(info))
  },
  onUpdateNotAvailable: (cb) => {
    ipcRenderer.on('update-not-available', () => cb())
  },
  onUpdateProgress: (cb) => {
    ipcRenderer.on('update-download-progress', (_event, info) => cb(info))
  },
})
