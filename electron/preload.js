// Credential Manager – Preload script
// Exposes a typed, sandboxed API surface to the renderer via contextBridge.
// No raw Node/Electron APIs are exposed to the page.

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('credManager', {
  // Persist configuration (SharePoint credentials)
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Initialise MSAL with an Auth Client ID without persisting config to disk.
  // Used by the setup window so the admin can sign in BEFORE we know the
  // tenant ID (which we decode from the ID token after sign-in).
  initMsal: (data) => ipcRenderer.invoke('init-msal', data),

  // Returns the auth client ID baked into the build (or '' if none).
  // Setup window uses this to decide whether to show the manual-entry field.
  getDefaultAuthClientId: () => ipcRenderer.invoke('get-default-auth-client-id'),

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

  // Fresh Microsoft Graph access token (delegated, scope: User.Read + Files.ReadWrite.All + Sites.ReadWrite.All)
  getMsGraphToken: () => ipcRenderer.invoke('get-ms-graph-token'),

  // Tenant ID (`tid` claim) decoded from the signed-in user's ID token
  getMsTenantId: () => ipcRenderer.invoke('get-ms-tenant-id'),

  // Read the shared bootstrap.json from SharePoint root site (returns null if missing)
  fetchBootstrap: () => ipcRenderer.invoke('fetch-bootstrap'),

  // Upload bootstrap.json to SharePoint root site (admin only — usually after setup)
  uploadBootstrap: (data) => ipcRenderer.invoke('upload-bootstrap', data),

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
