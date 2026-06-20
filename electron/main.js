// Credential Manager – Electron main process
// Gravity Business Partners
// Mirrors the Asset Manager Electron shell pattern

'use strict'

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell } = require('electron')
const path   = require('path')
const fs     = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')
const net    = require('net')

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
// Write .env file that FastAPI/backend reads
// ---------------------------------------------------------------------------

function writeEnvFile (config, port) {
  const resolvedPort = port || currentPort || DEFAULT_PORT
  const lines = [
    `SHAREPOINT_TENANT_ID=${config.tenantId || ''}`,
    `SHAREPOINT_CLIENT_ID=${config.clientId || ''}`,
    `SHAREPOINT_CLIENT_SECRET=${config.clientSecret || ''}`,
    `SHAREPOINT_FILE_URL=${config.fileUrl || ''}`,
    `PORT=${resolvedPort}`,
    `CRED_DATA_DIR=${APP_DATA}`,
  ]
  fs.mkdirSync(APP_DATA, { recursive: true })
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', 'utf-8')
  log('.env written to ' + ENV_FILE)
}

// ---------------------------------------------------------------------------
// Sync frontend assets from ASAR / resources into userData/static/
// This means auto-updated app bundles are always written fresh on launch.
// ---------------------------------------------------------------------------

function syncFrontend () {
  const dest = path.join(APP_DATA, 'static')
  try {
    if (!fs.existsSync(FRONTEND_DIST)) {
      log('[sync] frontend-dist not found at ' + FRONTEND_DIST + ' – skipping')
      return
    }
    fs.mkdirSync(dest, { recursive: true })
    copyDirRecursive(FRONTEND_DIST, dest)
    log('[sync] frontend synced from ' + FRONTEND_DIST + ' → ' + dest)
  } catch (err) {
    log('[sync] ERROR: ' + err.message)
  }
}

function copyDirRecursive (src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath  = path.join(src,  entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
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

  const splashHtml = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: #0f0f1a;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    user-select: none;
  }
  .logo {
    width: 72px; height: 72px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; font-weight: 800; color: #fff;
    margin-bottom: 20px;
    box-shadow: 0 8px 32px rgba(99,102,241,.45);
  }
  h1 { font-size: 18px; font-weight: 700; letter-spacing: .3px; margin-bottom: 4px; }
  .sub { font-size: 12px; color: #94a3b8; margin-bottom: 28px; }
  .status { font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 6px; }
  .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #6366f1;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: .3; transform: scale(.8); }
    50%      { opacity: 1;  transform: scale(1.2); }
  }
</style>
</head>
<body>
  <div class="logo">CM</div>
  <h1>Credential Manager</h1>
  <p class="sub">Gravity Business Partners</p>
  <div class="status">
    <div class="dot"></div>
    Starting application&hellip;
  </div>
</body>
</html>`

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml))
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
      color:       nativeTheme.shouldUseDarkColors ? '#1f2937' : '#ffffff',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#e2e8f0' : '#111827',
      height: 32,
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

  backendProcess.stdout.on('data', (d) => log('[backend] ' + d.toString().trim()))
  backendProcess.stderr.on('data', (d) => log('[backend:err] ' + d.toString().trim()))
  backendProcess.on('exit', (code, signal) => {
    log(`[backend] exited  code=${code} signal=${signal}`)
    backendProcess = null
  })
}

function killBackend () {
  if (!backendProcess) return
  try {
    backendProcess.kill('SIGTERM')
  } catch (_) { /* already dead */ }

  // Windows fallback: taskkill by PID
  if (process.platform === 'win32' && backendProcess.pid) {
    try {
      spawn('taskkill', ['/PID', String(backendProcess.pid), '/F', '/T'], {
        windowsHide: true, detached: true,
      }).unref()
    } catch (_) { /* best effort */ }
  }
  backendProcess = null
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('get-config', () => readConfig())

ipcMain.handle('save-config', (_event, data) => {
  writeConfig(data)
  writeEnvFile(data, currentPort)
  return { ok: true }
})

ipcMain.handle('setup-complete', async (_event, data) => {
  writeConfig(data)
  writeEnvFile(data, currentPort)

  if (setupWindow) { setupWindow.close(); setupWindow = null }

  // Restart backend with fresh config
  killBackend()

  createSplashWindow()
  startBackend(currentPort)

  try {
    await pollHealth(currentPort, 35000)
    if (splashWindow) { splashWindow.destroy(); splashWindow = null }
    if (!mainWindow) {
      createMainWindow(currentPort)
    } else {
      mainWindow.loadURL(`http://127.0.0.1:${currentPort}`)
      mainWindow.show()
    }
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
  // theme: 'dark' | 'light' | 'system'
  nativeTheme.themeSource = theme
  if (mainWindow) {
    const dark = nativeTheme.shouldUseDarkColors
    mainWindow.setTitleBarOverlay({
      color:       dark ? '#1f2937' : '#ffffff',
      symbolColor: dark ? '#e2e8f0' : '#111827',
    })
  }
  return { ok: true }
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

  // Sync frontend assets
  syncFrontend()

  // Read config
  const config = readConfig()

  if (!config) {
    // First run – show setup wizard
    log('No config found – opening setup window')
    createSetupWindow()
    return
  }

  // Config exists – write env and start backend
  log('Config found – starting backend')
  writeEnvFile(config, currentPort)

  createSplashWindow()
  startBackend(currentPort)

  try {
    await pollHealth(currentPort, 35000)
    if (splashWindow) { splashWindow.destroy(); splashWindow = null }
    createMainWindow(currentPort)
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
  killBackend()
})
