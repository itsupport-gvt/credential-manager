// Credential Manager – Electron main process
// Gravity Business Partners
// Mirrors the Asset Manager Electron shell pattern

'use strict'

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, safeStorage } = require('electron')
const path   = require('path')
const fs     = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')
const net    = require('net')
const msal   = require('@azure/msal-node')

// electron-updater – graceful fallback in dev where the module may not be installed
let autoUpdater
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch (e) {
  autoUpdater = null
  console.warn('[updater] electron-updater not available:', e.message)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IS_DEV = !app.isPackaged

// userData resolves to  C:\Users\{user}\AppData\Roaming\CredentialManager
// because productName in package.json is "Credential Manager"
const APP_DATA    = app.getPath('userData')
const CONFIG_FILE = path.join(APP_DATA, 'config.json')
const ENV_FILE    = path.join(APP_DATA, '.env')
const LOG_FILE    = path.join(APP_DATA, 'credential-manager.log')

const BACKEND_EXE = IS_DEV
  ? path.join(__dirname, '..', 'backend', 'dist', 'credential-backend.exe')
  : path.join(process.resourcesPath, 'backend', 'credential-backend.exe')

const DEFAULT_PORT  = 8100
const MSAL_CACHE_FILE = path.join(APP_DATA, 'msal-cache.bin')

// Random 256-bit token generated fresh every launch.
// Passed to the backend process via env var; exposed to the renderer via IPC.
// Prevents any other process on this machine (or LAN) from calling the API.
const APP_SECRET_TOKEN = crypto.randomBytes(32).toString('hex')

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow    = null
let setupWindow   = null
let splashWindow  = null
let backendProcess = null
let currentPort   = DEFAULT_PORT

// ---------------------------------------------------------------------------
// MSAL state
// ---------------------------------------------------------------------------

let _msalApp     = null   // PublicClientApplication
let _msalAccount = null   // cached AccountInfo
let _msIdToken   = null   // raw JWT ID token (refreshed on each silent acquire)

// ---------------------------------------------------------------------------
// Auto-sync state — Electron-driven loop that calls the local backend's
// /api/sync/push and /api/sync/pull every AUTO_SYNC_INTERVAL_MS. Replaces
// the in-backend daemon-token thread removed in v1.4 (the backend can no
// longer acquire a Graph token on its own; the renderer's session has one).
// ---------------------------------------------------------------------------

const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000  // 60 minutes
let _autoSyncTimer = null

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------

function log (msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try {
    fs.mkdirSync(APP_DATA, { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Log rotation: keep file under ~500 KB by trimming to last 1000 lines
// ---------------------------------------------------------------------------

function rotateLogs () {
  try {
    if (!fs.existsSync(LOG_FILE)) return
    const stat = fs.statSync(LOG_FILE)
    if (stat.size < 512 * 1024) return
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n')
    const kept  = lines.slice(-1000).join('\n')
    fs.writeFileSync(LOG_FILE, kept + '\n', 'utf-8')
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// MSAL – Microsoft Entra ID user authentication (PKCE / public client)
// ---------------------------------------------------------------------------

function _createMsalCachePlugin () {
  return {
    beforeCacheAccess: async (ctx) => {
      try {
        if (!fs.existsSync(MSAL_CACHE_FILE)) return
        const raw = fs.readFileSync(MSAL_CACHE_FILE)
        const text = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(raw)
          : raw.toString('utf-8')
        ctx.tokenCache.deserialize(text)
      } catch (_) { /* first run / corrupted – start fresh */ }
    },
    afterCacheAccess: async (ctx) => {
      if (!ctx.cacheHasChanged) return
      try {
        const text = ctx.tokenCache.serialize()
        const data = safeStorage.isEncryptionAvailable()
          ? safeStorage.encryptString(text)
          : Buffer.from(text, 'utf-8')
        fs.mkdirSync(APP_DATA, { recursive: true })
        fs.writeFileSync(MSAL_CACHE_FILE, data)
      } catch (e) {
        log('[msal] cache write error: ' + e.message)
      }
    },
  }
}

// Fallback auth client ID baked into the build — used during the very first
// run when no config.json exists yet, so we can sign the user in BEFORE
// knowing the tenant or downloading the bootstrap. Override at runtime by
// setting AUTH_CLIENT_ID in the saved config.
const _DEFAULT_AUTH_CLIENT_ID = process.env.CRED_AUTH_CLIENT_ID || ''

function initMsal (config) {
  // Authority defaults to "organizations" (multi-tenant) until we know which
  // tenant the user belongs to — we discover it from the ID token's `tid`
  // claim on first sign-in.
  const authClientId = (config && config.authClientId) || _DEFAULT_AUTH_CLIENT_ID
  const tenantId     = (config && config.tenantId) || ''

  if (!authClientId) {
    log('[msal] auth not configured – login disabled (no authClientId)')
    _msalApp = null
    return
  }

  const authority = tenantId
    ? `https://login.microsoftonline.com/${tenantId}`
    : 'https://login.microsoftonline.com/organizations'

  const msalConfig = {
    auth: { clientId: authClientId, authority },
    cache: { cachePlugin: _createMsalCachePlugin() },
    system: { loggerOptions: { logLevel: msal.LogLevel.Warning, piiLoggingEnabled: false } },
  }

  _msalApp = new msal.PublicClientApplication(msalConfig)
  log(`[msal] initialised (clientId=${authClientId.slice(0,8)}… authority=${authority})`)
}

// Scopes for ID-token acquisition (backend /api/auth/me)
const _MSAL_SCOPES = ['openid', 'profile', 'email', 'offline_access']
// Scopes for Microsoft Graph delegated calls (SharePoint workbook + bootstrap)
const _GRAPH_SCOPES = ['User.Read', 'Files.ReadWrite.All', 'Sites.ReadWrite.All']

async function msAcquireSilent () {
  if (!_msalApp) return null
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts()
    if (!accounts || accounts.length === 0) return null
    // Multiple accounts cached and none explicitly selected → return null so
    // the login screen can show the account picker instead of silently picking one
    if (!_msalAccount && accounts.length > 1) return null
    const account = _msalAccount || accounts[0]
    const result  = await _msalApp.acquireTokenSilent({ scopes: _MSAL_SCOPES, account })
    _msalAccount = result.account
    _msIdToken   = result.idToken
    return result
  } catch (e) {
    log('[msal] silent acquire failed: ' + e.message)
    return null
  }
}

async function msAcquireInteractive () {
  if (!_msalApp) throw new Error('Auth not configured')

  const result = await _msalApp.acquireTokenInteractive({
    scopes: _MSAL_SCOPES,
    redirectUri: 'http://localhost',
    openBrowser: async (url) => { await shell.openExternal(url) },
    successTemplate: `
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#188038">Login successful!</h2>
        <p>You can close this tab and return to Credential Manager.</p>
      </body></html>`,
    errorTemplate: `
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#d93025">Login failed</h2><p>{error}</p>
      </body></html>`,
  })

  _msalAccount = result.account
  _msIdToken   = result.idToken
  return result
}

function _msUserFromResult (result) {
  if (!result) return null
  return {
    name:  result.account.name        || '',
    email: result.account.username    || '',
    oid:   result.account.localAccountId || '',
    token: result.idToken             || '',
  }
}

// Decode the `tid` (tenant id) claim from the cached ID token. Returns '' if unavailable.
function _decodeTenantIdFromIdToken () {
  if (!_msIdToken) return ''
  try {
    const payload = _msIdToken.split('.')[1]
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4)
    const json    = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    return JSON.parse(json).tid || ''
  } catch (e) {
    log('[msal] tid decode failed: ' + e.message)
    return ''
  }
}

// Acquire a Microsoft Graph access token (separate from the ID token).
async function msAcquireGraphToken () {
  if (!_msalApp) return null
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts()
    if (!accounts || accounts.length === 0) return null
    if (!_msalAccount && accounts.length > 1) return null
    const account = _msalAccount || accounts[0]
    const result  = await _msalApp.acquireTokenSilent({ scopes: _GRAPH_SCOPES, account })
    return result ? result.accessToken : null
  } catch (e) {
    log('[msal] graph token acquire failed: ' + e.message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Bootstrap (shared SharePoint config) helpers
// ---------------------------------------------------------------------------

const BOOTSTRAP_PATH = '/sites/root/drive/root:/Credential Manager/bootstrap.json'

async function fetchBootstrap () {
  const token = await msAcquireGraphToken()
  if (!token) return null
  try {
    const httpsMod = require('https')
    return await new Promise((resolve) => {
      const req = httpsMod.request({
        method:   'GET',
        hostname: 'graph.microsoft.com',
        path:     `/v1.0${BOOTSTRAP_PATH}:/content`,
        headers:  { Authorization: `Bearer ${token}` },
      }, (res) => {
        if (res.statusCode === 404) { resolve(null); res.resume(); return }
        if (res.statusCode !== 200) {
          log(`[bootstrap] fetch returned ${res.statusCode}`)
          resolve(null); res.resume(); return
        }
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch { resolve(null) }
        })
      })
      req.on('error', (e) => { log('[bootstrap] fetch error: ' + e.message); resolve(null) })
      req.end()
    })
  } catch (e) {
    log('[bootstrap] fetch threw: ' + e.message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Auto-sync loop
// ---------------------------------------------------------------------------

async function runAutoSync () {
  if (!_msalApp) return  // no auth configured

  const graphToken = await msAcquireGraphToken()
  if (!graphToken) {
    // User isn't signed in (or MSAL refresh token expired) — skip this tick.
    // We'll try again on the next interval. The user will re-sign-in
    // through the login screen when they next interact with the app.
    log('[autosync] skipped — no Graph token available')
    return
  }

  const baseUrl  = `http://127.0.0.1:${currentPort}`
  const headers  = {
    'Content-Type':      'application/json',
    'X-App-Token':       APP_SECRET_TOKEN,
    'X-MS-Graph-Token':  graphToken,
    'Authorization':     `Bearer ${_msIdToken || ''}`,
  }

  // Tiny localhost-only fetch helper using built-in http module
  const httpMod = require('http')
  const postJson = (path) => new Promise((resolve) => {
    const req = httpMod.request(`${baseUrl}${path}`, { method: 'POST', headers, timeout: 120_000 }, (res) => {
      let body = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error',   (e) => resolve({ status: 0, body: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.end()
  })

  try {
    const push = await postJson('/api/sync/push')
    log(`[autosync] push HTTP ${push.status}`)
    const pull = await postJson('/api/sync/pull')
    log(`[autosync] pull HTTP ${pull.status}`)
  } catch (e) {
    log('[autosync] error: ' + e.message)
  }
}

function startAutoSync () {
  if (_autoSyncTimer) return  // already running
  _autoSyncTimer = setInterval(() => {
    runAutoSync().catch((e) => log('[autosync] unhandled: ' + e.message))
  }, AUTO_SYNC_INTERVAL_MS)
  log(`[autosync] started (interval=${AUTO_SYNC_INTERVAL_MS / 1000}s)`)
}

function stopAutoSync () {
  if (_autoSyncTimer) {
    clearInterval(_autoSyncTimer)
    _autoSyncTimer = null
    log('[autosync] stopped')
  }
}

async function uploadBootstrap (bootstrap) {
  const token = await msAcquireGraphToken()
  if (!token) return { ok: false, error: 'No Graph token available — sign in first' }
  try {
    const httpsMod = require('https')
    const payload  = Buffer.from(JSON.stringify(bootstrap, null, 2), 'utf-8')
    return await new Promise((resolve) => {
      const req = httpsMod.request({
        method:   'PUT',
        hostname: 'graph.microsoft.com',
        path:     `/v1.0${BOOTSTRAP_PATH}:/content`,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      }, (res) => {
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true })
          } else {
            log(`[bootstrap] upload ${res.statusCode}: ${body}`)
            resolve({ ok: false, error: `HTTP ${res.statusCode}` })
          }
        })
      })
      req.on('error', (e) => resolve({ ok: false, error: e.message }))
      req.write(payload)
      req.end()
    })
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ---------------------------------------------------------------------------
// Helper: find a free TCP port starting from `start`
// ---------------------------------------------------------------------------

function findFreePort (start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > start + 100) {
        return reject(new Error('No free port found in range'))
      }
      const server = net.createServer()
      server.once('error', () => tryPort(port + 1))
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port, '127.0.0.1')
    }
    tryPort(start)
  })
}

// ---------------------------------------------------------------------------
// Helper: get LAN IP via UDP trick
// ---------------------------------------------------------------------------

function getLanIp () {
  return new Promise((resolve) => {
    const socket = require('dgram').createSocket('udp4')
    socket.connect(53, '8.8.8.8', () => {
      try { resolve(socket.address().address) } catch (_) { resolve('127.0.0.1') }
      socket.close()
    })
    socket.on('error', () => resolve('127.0.0.1'))
  })
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readConfig () {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

function writeConfig (data) {
  fs.mkdirSync(APP_DATA, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
  log('Config written to ' + CONFIG_FILE)
}

// ---------------------------------------------------------------------------
// UI settings (theme, etc.) — persisted separately from SharePoint config
// ---------------------------------------------------------------------------

const UI_SETTINGS_FILE = path.join(APP_DATA, 'ui-settings.json')

function readUiSettings () {
  try { return JSON.parse(fs.readFileSync(UI_SETTINGS_FILE, 'utf-8')) } catch (_) { return {} }
}

function writeUiSettings (patch) {
  const current = readUiSettings()
  const merged  = { ...current, ...patch }
  fs.mkdirSync(APP_DATA, { recursive: true })
  fs.writeFileSync(UI_SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// Write .env file that FastAPI/backend reads
// ---------------------------------------------------------------------------

function writeEnvFile (config, port) {
  const resolvedPort = port || currentPort || DEFAULT_PORT

  // Preserve the ENCRYPTION_KEY that the Python backend generated on first launch.
  // If we overwrite the file without it, the backend generates a NEW key and all
  // previously encrypted passwords become undecryptable.
  let encryptionKey = ''
  try {
    const existing = fs.readFileSync(ENV_FILE, 'utf-8')
    const match = existing.match(/^ENCRYPTION_KEY=(.+)$/m)
    if (match) encryptionKey = match[1].trim()
  } catch (_) { /* file doesn't exist yet – key will be auto-generated by backend */ }

  const lines = [
    `SHAREPOINT_TENANT_ID=${config.tenantId || ''}`,
    `SHAREPOINT_CLIENT_ID=${config.clientId || ''}`,
    `SHAREPOINT_CLIENT_SECRET=${config.clientSecret || ''}`,
    `SHAREPOINT_FILE_URL=${config.fileUrl || ''}`,
    `AUTH_CLIENT_ID=${config.authClientId || config.clientId || ''}`,
    `PORT=${resolvedPort}`,
    `CRED_DATA_DIR=${APP_DATA}`,
  ]
  if (encryptionKey) lines.push(`ENCRYPTION_KEY=${encryptionKey}`)

  fs.mkdirSync(APP_DATA, { recursive: true })
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', 'utf-8')
  log('.env written to ' + ENV_FILE)
}


// ---------------------------------------------------------------------------
// Poll /health until the backend is ready (or timeout)
// ---------------------------------------------------------------------------

function pollHealth (port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start    = Date.now()
    const interval = 1000

    const attempt = () => {
      const req = require('http').get(
        `http://127.0.0.1:${port}/health`,
        { timeout: 800 },
        (res) => {
          if (res.statusCode === 200) {
            log(`[health] backend ready on port ${port}`)
            resolve()
          } else {
            scheduleRetry()
          }
          res.resume()
        }
      )
      req.on('error', scheduleRetry)
      req.on('timeout', () => { req.destroy(); scheduleRetry() })
    }

    const scheduleRetry = () => {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Backend did not respond within ${timeout / 1000}s`))
      }
      setTimeout(attempt, interval)
    }

    attempt()
  })
}

// ---------------------------------------------------------------------------
// Splash window
// ---------------------------------------------------------------------------

function createSplashWindow () {
  splashWindow = new BrowserWindow({
    width:         360,
    height:        280,
    center:        true,
    frame:         false,
    alwaysOnTop:   true,
    transparent:   false,
    skipTaskbar:   true,
    resizable:     false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.on('closed', () => { splashWindow = null })
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow (port) {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  900,
    minHeight: 600,
    show:   false,
    titleBarStyle:    'hidden',
    titleBarOverlay:  {
      color:       readUiSettings().theme === 'dark' ? '#16191f' : '#ffffff',
      symbolColor: readUiSettings().theme === 'dark' ? '#e8eaed' : '#3c4043',
      height:      44,
    },
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // kick off update check ~5 s after main window appears
    if (autoUpdater) {
      setTimeout(() => {
        try { autoUpdater.checkForUpdatesAndNotify() } catch (e) {
          log('[updater] checkForUpdatesAndNotify error: ' + e.message)
        }
      }, 5000)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// Setup window
// ---------------------------------------------------------------------------

function createSetupWindow () {
  if (setupWindow) { setupWindow.focus(); return }

  setupWindow = new BrowserWindow({
    width:     520,
    height:    560,
    center:    true,
    resizable: false,
    frame:     true,
    title:     'Credential Manager – Setup',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  setupWindow.setMenuBarVisibility(false)
  setupWindow.loadFile(path.join(__dirname, 'setup.html'))
  setupWindow.on('closed', () => { setupWindow = null })
}

// ---------------------------------------------------------------------------
// Backend management
// ---------------------------------------------------------------------------

function startBackend (port) {
  if (!fs.existsSync(BACKEND_EXE)) {
    log('[backend] exe not found at ' + BACKEND_EXE)
    return
  }

  log(`[backend] spawning ${BACKEND_EXE} on port ${port}`)

  backendProcess = spawn(BACKEND_EXE, [], {
    env: {
      ...process.env,
      PORT:              String(port),
      CRED_DATA_DIR:     APP_DATA,
      APP_SECRET_TOKEN:  APP_SECRET_TOKEN,
      PYTHONUNBUFFERED:  '1',
    },
    windowsHide: true,
  })

  backendProcess.stdout.on('data', (d) => {
    const line = d.toString().trim()
    // Only log warn/error lines – verbose uvicorn access logs are too noisy
    if (/error|warning|warn|exception|traceback|critical/i.test(line)) {
      log('[backend] ' + line)
    }
  })
  backendProcess.stderr.on('data', (d) => {
    const line = d.toString().trim()
    if (line) log('[backend:err] ' + line)
  })
  backendProcess.on('exit', (code, signal) => {
    log(`[backend] exited  code=${code} signal=${signal}`)
    backendProcess = null
  })
}

function killBackend () {
  if (!backendProcess) return
  const pid = backendProcess.pid
  backendProcess = null
  if (!pid) return

  if (process.platform === 'win32') {
    // SIGTERM is ignored by Windows processes; use taskkill synchronously
    // /T kills the entire process tree (handles PyInstaller's child processes)
    try {
      require('child_process').spawnSync(
        'taskkill', ['/PID', String(pid), '/F', '/T'],
        { windowsHide: true }
      )
    } catch (_) { /* already dead */ }
  } else {
    try { process.kill(pid, 'SIGTERM') } catch (_) { /* already dead */ }
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('get-config', () => readConfig())

ipcMain.handle('save-config', (_event, data) => {
  writeConfig(data)
  writeEnvFile(data, currentPort)
  initMsal(data)
  return { ok: true }
})

// --- Microsoft auth IPC ---

ipcMain.handle('ms-login', async () => {
  try {
    const result = await msAcquireInteractive()
    return { ok: true, user: _msUserFromResult(result) }
  } catch (e) {
    log('[msal] interactive login error: ' + e.message)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('ms-logout', async () => {
  _msalAccount = null
  _msIdToken   = null
  // Clear the persisted cache
  try { if (fs.existsSync(MSAL_CACHE_FILE)) fs.unlinkSync(MSAL_CACHE_FILE) } catch (_) {}
  return { ok: true }
})

// Returns all accounts currently in the MSAL token cache (for the account picker)
ipcMain.handle('get-cached-accounts', async () => {
  if (!_msalApp) return []
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts()
    return (accounts || []).map(a => ({
      homeAccountId: a.homeAccountId,
      name:  a.name     || '',
      email: a.username || '',
    }))
  } catch { return [] }
})

// Select a specific cached account by homeAccountId and do a silent token acquire
ipcMain.handle('select-account', async (_event, homeAccountId) => {
  if (!_msalApp) return { ok: false, error: 'Auth not configured' }
  try {
    const accounts = await _msalApp.getTokenCache().getAllAccounts()
    const account  = (accounts || []).find(a => a.homeAccountId === homeAccountId)
    if (!account) return { ok: false, error: 'Account not found in cache' }
    const result = await _msalApp.acquireTokenSilent({ scopes: _MSAL_SCOPES, account })
    _msalAccount = result.account
    _msIdToken   = result.idToken
    return { ok: true, user: _msUserFromResult(result) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('get-ms-user', async () => {
  // Try silent first to populate _msalAccount from cache
  if (!_msalAccount) {
    const result = await msAcquireSilent()
    if (result) return _msUserFromResult(result)
    return null
  }
  return _msIdToken ? {
    name:  _msalAccount.name        || '',
    email: _msalAccount.username    || '',
    oid:   _msalAccount.localAccountId || '',
    token: _msIdToken,
  } : null
})

ipcMain.handle('get-ms-token', async () => {
  const result = await msAcquireSilent()
  return result ? result.idToken : null
})

ipcMain.handle('get-ms-graph-token', async () => {
  return await msAcquireGraphToken()
})

ipcMain.handle('get-ms-tenant-id', async () => {
  // Ensure we have a fresh ID token, then decode its `tid` claim.
  await msAcquireSilent()
  return _decodeTenantIdFromIdToken()
})

ipcMain.handle('fetch-bootstrap', async () => {
  return await fetchBootstrap()
})

ipcMain.handle('upload-bootstrap', async (_event, bootstrap) => {
  return await uploadBootstrap(bootstrap)
})

ipcMain.handle('setup-complete', async (_event, data) => {
  writeConfig(data)
  writeEnvFile(data, currentPort)
  initMsal(data)

  // Upload bootstrap.json so any teammate's next install is touch-free.
  // Best-effort — failure here doesn't block startup.
  if (data && data.fileUrl) {
    uploadBootstrap({ fileUrl: data.fileUrl })
      .then(r => log(`[bootstrap] upload after setup: ${JSON.stringify(r)}`))
      .catch(e => log('[bootstrap] upload error: ' + e.message))
  }

  if (setupWindow) { setupWindow.close(); setupWindow = null }

  // Restart backend with fresh config
  killBackend()

  createSplashWindow()
  startBackend(currentPort)

  try {
    await pollHealth(currentPort, 35000)
    if (!mainWindow) createMainWindow(currentPort)
    else mainWindow.loadURL(`http://127.0.0.1:${currentPort}`)
    if (splashWindow) { splashWindow.destroy(); splashWindow = null }
    startAutoSync()
    return { ok: true }
  } catch (err) {
    if (splashWindow) { splashWindow.destroy(); splashWindow = null }
    dialog.showErrorBox(
      'Backend failed to start',
      'The backend did not respond in time.\n\n' + err.message +
      '\n\nCheck the log at:\n' + LOG_FILE
    )
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('get-port',        () => currentPort)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-app-token',   () => APP_SECRET_TOKEN)

ipcMain.handle('open-settings', () => {
  createSetupWindow()
  return { ok: true }
})

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { ok: false, error: 'auto-updater not available' }
  try {
    await autoUpdater.checkForUpdatesAndNotify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('set-theme', (_event, theme) => {
  writeUiSettings({ theme })
  if (mainWindow) {
    const isDark = theme === 'dark'
    mainWindow.setTitleBarOverlay({
      color:       isDark ? '#16191f' : '#ffffff',
      symbolColor: isDark ? '#e8eaed' : '#3c4043'
    })
  }
  return { ok: true }
})

ipcMain.handle('get-theme', () => {
  return readUiSettings().theme || 'light'
})

ipcMain.handle('show-about', (_event) => {
  dialog.showMessageBox(mainWindow || BrowserWindow.getFocusedWindow(), {
    type:    'info',
    title:   'About Credential Manager',
    message: 'Credential Manager',
    detail: [
      `Version: ${app.getVersion()}`,
      'Built by Gravity Business Partners',
      '',
      'A secure SharePoint-backed credential store',
      'for IT teams.',
    ].join('\n'),
    buttons: ['OK'],
  })
  return { ok: true }
})

// ---------------------------------------------------------------------------
// Auto-updater setup
// ---------------------------------------------------------------------------

function setupAutoUpdater () {
  if (!autoUpdater) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log('[updater] checking for update…')
  })

  autoUpdater.on('update-available', (info) => {
    log(`[updater] update available: ${info.version}`)
    if (mainWindow) {
      mainWindow.webContents.send('update-available', { version: info.version })
    }
  })

  autoUpdater.on('update-not-available', () => {
    log('[updater] already up to date')
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    log(`[updater] download ${Math.round(progress.percent)}%`)
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    log(`[updater] update downloaded: ${info.version}`)
    dialog.showMessageBox({
      type:    'info',
      title:   'Update Ready',
      message: `Version ${info.version} is ready to install.`,
      detail:  'The application will restart to apply the update.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    log('[updater] error: ' + err.message)
  })
}

// ---------------------------------------------------------------------------
// App ready – main startup flow
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Single-instance lock
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    log('Another instance is running – quitting')
    app.quit()
    return
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  setupAutoUpdater()

  // Ensure APP_DATA dir exists
  fs.mkdirSync(APP_DATA, { recursive: true })
  rotateLogs()
  log('=== Credential Manager starting ===')
  log('APP_DATA: ' + APP_DATA)

  // Find free port
  try {
    currentPort = await findFreePort(DEFAULT_PORT)
    log('Using port ' + currentPort)
  } catch (err) {
    dialog.showErrorBox('Port error', 'Could not find a free port: ' + err.message)
    app.quit()
    return
  }

  // Read config
  let config = readConfig()

  if (!config) {
    // First run on this machine — try to bootstrap from SharePoint using the
    // user's M365 sign-in BEFORE asking the user to type anything.
    //
    // Bootstrap requires an authClientId baked into the build (or env var).
    // Without one, we can't sign the user in, so we fall back to the legacy
    // manual setup form.
    if (_DEFAULT_AUTH_CLIENT_ID) {
      log('No local config – initialising MSAL with default authority for bootstrap')
      initMsal(null)  // uses _DEFAULT_AUTH_CLIENT_ID + organizations authority

      // Attempt silent acquire first (in case this user has signed in before
      // on another app that shares the MSAL cache — rare but free to try).
      const silent = await msAcquireSilent()
      if (silent) {
        log('[bootstrap] silent acquire succeeded — fetching bootstrap.json')
        const bs = await fetchBootstrap()
        if (bs && bs.fileUrl) {
          config = {
            tenantId:     _decodeTenantIdFromIdToken() || '',
            authClientId: _DEFAULT_AUTH_CLIENT_ID,
            clientId:     '',  // no longer needed (delegated-only)
            clientSecret: '',  // no longer needed (delegated-only)
            fileUrl:      bs.fileUrl,
          }
          writeConfig(config)
          log('[bootstrap] config auto-written from SharePoint bootstrap')
        }
      }
    }

    if (!config) {
      log('No config and no usable bootstrap – opening setup window')
      createSetupWindow()
      return
    }
  }

  // Config exists – write env, init MSAL, and start backend
  log('Config found – starting backend')
  writeEnvFile(config, currentPort)
  initMsal(config)

  // Attempt silent token acquire in the background (populates cache)
  msAcquireSilent().catch(() => {})

  createSplashWindow()
  startBackend(currentPort)

  try {
    await pollHealth(currentPort, 35000)
    createMainWindow(currentPort)                                    // create first
    if (splashWindow) { splashWindow.destroy(); splashWindow = null } // then close splash
    startAutoSync()
  } catch (err) {
    if (splashWindow) { splashWindow.destroy(); splashWindow = null }
    const choice = await dialog.showMessageBox({
      type:    'error',
      title:   'Backend failed to start',
      message: 'The Credential Manager backend did not respond in time.',
      detail:  err.message + '\n\nLog: ' + LOG_FILE,
      buttons: ['Retry', 'Open Setup', 'Quit'],
      defaultId: 0,
    })
    if (choice.response === 0) {
      // Retry: restart the whole startup sequence
      app.relaunch()
      app.quit()
    } else if (choice.response === 1) {
      createSetupWindow()
    } else {
      app.quit()
    }
  }
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // macOS: re-open when dock icon clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    if (mainWindow === null && currentPort) createMainWindow(currentPort)
  }
})

app.on('before-quit', () => {
  log('=== before-quit: killing backend ===')
  stopAutoSync()
  killBackend()
})

// Safety net: kill backend if the Node process itself exits (crash, SIGINT, etc.)
process.on('exit', killBackend)
