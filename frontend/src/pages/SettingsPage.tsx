import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { SyncStatus } from '../lib/types'

declare global {
  interface Window {
    credManager?: {
      getConfig: () => Promise<{
        tenantId: string
        clientId: string
        clientSecret: string
        fileUrl: string
      }>
      saveConfig: (config: {
        tenantId: string
        clientId: string
        clientSecret: string
        fileUrl: string
      }) => Promise<void>
      getAppVersion: () => string
      setTheme: (theme: 'light' | 'dark') => void
    }
  }
}

const isElectron = typeof window !== 'undefined' && !!window.credManager

function SyncResultBanner({
  type,
  message,
  onDismiss,
}: {
  type: 'success' | 'error'
  message: string
  onDismiss: () => void
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm ${
        type === 'success'
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
      }`}
    >
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-4 text-current opacity-60 hover:opacity-100">
        ✕
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncLoading, setSyncLoading] = useState(true)
  const [pushLoading, setPushLoading] = useState(false)
  const [pullLoading, setPullLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Electron config
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [config, setConfig] = useState({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    fileUrl: '',
  })
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    api
      .getSyncStatus()
      .then(setSyncStatus)
      .catch(() => {})
      .finally(() => setSyncLoading(false))

    if (isElectron && window.credManager) {
      setConfigLoading(true)
      window.credManager
        .getConfig()
        .then(setConfig)
        .catch(() => {})
        .finally(() => setConfigLoading(false))
    }
  }, [])

  async function handlePush() {
    setPushLoading(true)
    setResult(null)
    try {
      const res = await api.pushToExcel()
      setResult({
        type: 'success',
        message: `Pushed ${res.pushed_credentials} credentials and ${res.pushed_logs} log entries to SharePoint.`,
      })
      // Refresh sync status
      const status = await api.getSyncStatus()
      setSyncStatus(status)
    } catch (err) {
      setResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Push failed',
      })
    } finally {
      setPushLoading(false)
    }
  }

  async function handlePull() {
    setPullLoading(true)
    setResult(null)
    try {
      const res = await api.pullFromExcel()
      setResult({
        type: 'success',
        message: `Pulled ${res.credentials} credentials and ${res.logs} log entries from SharePoint.`,
      })
      const status = await api.getSyncStatus()
      setSyncStatus(status)
    } catch (err) {
      setResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Pull failed',
      })
    } finally {
      setPullLoading(false)
    }
  }

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault()
    if (!isElectron || !window.credManager) return
    setConfigSaving(true)
    try {
      await window.credManager.saveConfig(config)
      setResult({ type: 'success', message: 'Configuration saved successfully.' })
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setConfigSaving(false)
    }
  }

  const inputCls =
    'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500'

  function SectionCard({ title, children }: { title: string; children: ReactNode }) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Sync configuration and application settings
        </p>
      </div>

      <div className="space-y-5 max-w-2xl">
        {/* Notification banner */}
        {result && (
          <SyncResultBanner
            type={result.type}
            message={result.message}
            onDismiss={() => setResult(null)}
          />
        )}

        {/* Sync Status */}
        <SectionCard title="Sync Status">
          {syncLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ) : syncStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">Pending Credentials</span>
                <span
                  className={`text-sm font-semibold ${
                    syncStatus.pending_credentials > 0
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {syncStatus.pending_credentials}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">Pending Log Entries</span>
                <span
                  className={`text-sm font-semibold ${
                    syncStatus.pending_logs > 0
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {syncStatus.pending_logs}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Last Sync</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {syncStatus.last_sync
                    ? new Date(syncStatus.last_sync).toLocaleString()
                    : 'Never'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Could not load sync status</p>
          )}
        </SectionCard>

        {/* Push to SharePoint */}
        <SectionCard title="Push to SharePoint">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Push all pending local changes (credentials and change log entries) to the SharePoint
            Excel file.
          </p>
          <button
            onClick={handlePush}
            disabled={pushLoading}
            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {pushLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Pushing…
              </>
            ) : (
              'Push to SharePoint ↑'
            )}
          </button>
        </SectionCard>

        {/* Pull from SharePoint */}
        <SectionCard title="Pull from SharePoint">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Pull the latest data from SharePoint Excel into the local database. This will merge
            remote changes.
          </p>
          <button
            onClick={handlePull}
            disabled={pullLoading}
            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {pullLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Pulling…
              </>
            ) : (
              'Pull from SharePoint ↓'
            )}
          </button>
        </SectionCard>

        {/* SharePoint Configuration (Electron only) */}
        {isElectron && (
          <SectionCard title="SharePoint Configuration">
            {configLoading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 bg-gray-200 dark:bg-gray-700 rounded" />
                ))}
              </div>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Tenant ID
                  </label>
                  <input
                    type="text"
                    value={config.tenantId}
                    onChange={(e) => setConfig((c) => ({ ...c, tenantId: e.target.value }))}
                    className={inputCls}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={config.clientId}
                    onChange={(e) => setConfig((c) => ({ ...c, clientId: e.target.value }))}
                    className={inputCls}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={config.clientSecret}
                      onChange={(e) => setConfig((c) => ({ ...c, clientSecret: e.target.value }))}
                      className={inputCls + ' pr-16'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    SharePoint File URL
                  </label>
                  <input
                    type="url"
                    value={config.fileUrl}
                    onChange={(e) => setConfig((c) => ({ ...c, fileUrl: e.target.value }))}
                    className={inputCls}
                    placeholder="https://…/Credentials.xlsx"
                  />
                </div>
                <button
                  type="submit"
                  disabled={configSaving}
                  className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  {configSaving ? 'Saving…' : 'Save Configuration'}
                </button>
              </form>
            )}
          </SectionCard>
        )}

        {/* App Version */}
        <SectionCard title="App Version">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Version</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {isElectron && window.credManager?.getAppVersion
                ? window.credManager.getAppVersion()
                : 'Web mode'}
            </span>
          </div>
          {!isElectron && (
            <p className="text-xs text-gray-400 mt-2">
              Running in browser mode. Electron-specific features (config editor, native theme) are
              not available.
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
