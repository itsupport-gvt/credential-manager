import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { SyncStatus } from '../lib/types'
import { useToast } from '../App'

declare global {
  interface Window {
    credManager?: {
      getAppToken:    () => Promise<string>
      getConfig:      () => Promise<{ tenantId: string; clientId: string; authClientId?: string; clientSecret: string; fileUrl: string }>
      saveConfig:     (config: { tenantId: string; clientId: string; authClientId?: string; clientSecret: string; fileUrl: string }) => Promise<void>
      getAppVersion:  () => Promise<string>
      setTheme:       (theme: string) => Promise<{ ok: boolean }>
      openSettings:   () => Promise<{ ok: boolean }>
      checkForUpdates:() => Promise<{ ok: boolean; error?: string }>
    }
  }
}

const isElectron = typeof window !== 'undefined' && !!window.credManager

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text-1)',
  outline: 'none', fontFamily: 'Roboto, sans-serif',
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="md-card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="icon icon-md" style={{ color: 'var(--primary)' }}>{icon}</span>
        <div style={{ fontWeight: 600, fontFamily: "'Google Sans', sans-serif", fontSize: 14, color: 'var(--text-1)' }}>{title}</div>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: warn ? 'var(--warn)' : 'var(--text-1)' }}>{value}</span>
    </div>
  )
}

export default function SettingsPage() {
  const { showToast } = useToast()
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncLoading, setSyncLoading] = useState(true)
  const [pushBusy, setPushBusy] = useState(false)
  const [pullBusy, setPullBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [config, setConfig] = useState({ tenantId: '', clientId: '', authClientId: '', clientSecret: '', fileUrl: '' })
  const [showSecret, setShowSecret] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    api.getSyncStatus().then(setSyncStatus).catch(() => {}).finally(() => setSyncLoading(false))
    if (isElectron && window.credManager) {
      setConfigLoading(true)
      window.credManager.getConfig().then(cfg => setConfig({ authClientId: '', ...cfg })).catch(() => {}).finally(() => setConfigLoading(false))
      window.credManager.getAppVersion().then(setAppVersion).catch(() => setAppVersion('Unknown'))
    } else {
      setAppVersion('Web mode')
    }
  }, [])

  async function handlePush() {
    setPushBusy(true)
    try {
      const r = await api.pushToExcel()
      showToast(`Pushed ${r.pushed_credentials} credentials and ${r.pushed_logs} log entries`, 'success')
      const s = await api.getSyncStatus(); setSyncStatus(s)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Push failed', 'error') }
    finally { setPushBusy(false) }
  }

  async function handlePull() {
    setPullBusy(true)
    try {
      const r = await api.pullFromExcel()
      showToast(`Pulled ${r.credentials} credentials and ${r.logs} log entries`, 'success')
      const s = await api.getSyncStatus(); setSyncStatus(s)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Pull failed', 'error') }
    finally { setPullBusy(false) }
  }

  async function handleResetDb() {
    const confirmed = window.confirm(
      'This will DELETE all local credential data and re-pull from SharePoint.\n\n' +
      'Any unsynced local changes will be lost.\n\nAre you sure?'
    )
    if (!confirmed) return
    setResetBusy(true)
    try {
      const r = await api.resetDb()
      showToast(`Flushed ${r.deleted_credentials} credentials — pulled fresh from SharePoint`, 'success')
      const s = await api.getSyncStatus(); setSyncStatus(s)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Reset failed', 'error') }
    finally { setResetBusy(false) }
  }

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault()
    if (!isElectron || !window.credManager) return
    setConfigSaving(true)
    try {
      await window.credManager.saveConfig(config)
      showToast('Configuration saved', 'success')
    } catch (err) { showToast(err instanceof Error ? err.message : 'Save failed', 'error') }
    finally { setConfigSaving(false) }
  }

  async function handleCheckUpdates() {
    if (!isElectron || !window.credManager) return
    try {
      const r = await window.credManager.checkForUpdates()
      if (r.ok) showToast('Checking for updates…', 'info')
      else showToast(r.error || 'Update check failed', 'error')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Update check failed', 'error') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">SharePoint sync and application configuration</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 680 }}>
        {/* Sync Status */}
        <Card title="Sync Status" icon="cloud_sync">
          {syncLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 14, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s infinite', width: i === 2 ? '60%' : '80%' }} />)}
            </div>
          ) : syncStatus ? (
            <div>
              <Row label="Pending Credentials" value={syncStatus.pending_credentials} warn={syncStatus.pending_credentials > 0} />
              <Row label="Pending Log Entries" value={syncStatus.pending_logs} warn={syncStatus.pending_logs > 0} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Last Sync</span>
                <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{syncStatus.last_sync ? new Date(syncStatus.last_sync).toLocaleString() : 'Never'}</span>
              </div>
            </div>
          ) : <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Could not load sync status</div>}
        </Card>

        {/* Sync actions */}
        <Card title="SharePoint Sync" icon="sync">
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
            Push local changes to SharePoint or pull the latest data from the Excel file.
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="md-btn md-btn-primary" onClick={handlePush} disabled={pushBusy}>
              {pushBusy ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pushing…</> : <><span className="icon icon-sm">upload</span>Push to SharePoint</>}
            </button>
            <button className="md-btn md-btn-outlined" onClick={handlePull} disabled={pullBusy}>
              {pullBusy ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pulling…</> : <><span className="icon icon-sm">download</span>Pull from SharePoint</>}
            </button>
          </div>
        </Card>

        {/* SharePoint Config (Electron only) */}
        {isElectron && (
          <Card title="SharePoint Configuration" icon="settings_applications">
            {configLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 38, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ) : (
              <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="md-label">Azure AD Tenant ID</label>
                  <input style={inp} type="text" value={config.tenantId} onChange={e => setConfig(c => ({ ...c, tenantId: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
                <div>
                  <label className="md-label">SharePoint Client ID</label>
                  <input style={inp} type="text" value={config.clientId} onChange={e => setConfig(c => ({ ...c, clientId: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
                <div>
                  <label className="md-label">User Login App Client ID <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(credapp-365-auth)</span></label>
                  <input style={inp} type="text" value={config.authClientId} onChange={e => setConfig(c => ({ ...c, authClientId: e.target.value }))} placeholder="Leave blank to disable Microsoft login" />
                </div>
                <div>
                  <label className="md-label">Client Secret</label>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inp, paddingRight: 70 }} type={showSecret ? 'text' : 'password'} value={config.clientSecret} onChange={e => setConfig(c => ({ ...c, clientSecret: e.target.value }))} />
                    <button type="button" onClick={() => setShowSecret(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="icon icon-sm">{showSecret ? 'visibility_off' : 'visibility'}</span>
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="md-label">SharePoint File URL</label>
                  <input style={inp} type="url" value={config.fileUrl} onChange={e => setConfig(c => ({ ...c, fileUrl: e.target.value }))} placeholder="https://…/Credentials.xlsx" />
                </div>
                <div>
                  <button type="submit" disabled={configSaving} className="md-btn md-btn-primary">
                    {configSaving ? 'Saving…' : <><span className="icon icon-sm">save</span>Save Configuration</>}
                  </button>
                </div>
              </form>
            )}
          </Card>
        )}

        {/* Local DB reset */}
        <Card title="Local Database" icon="storage">
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
            If the SharePoint Excel file has been rebuilt or replaced and the app is showing stale data,
            use this to wipe the local cache and pull a fresh copy.
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 16,
            background: 'rgba(234,67,53,.06)', border: '1px solid rgba(234,67,53,.2)',
            fontSize: 13, color: 'var(--text-2)',
          }}>
            <span style={{ fontWeight: 600, color: '#ea4335' }}>Warning: </span>
            Any unsynced local changes will be permanently lost.
          </div>
          <button
            className="md-btn"
            onClick={handleResetDb}
            disabled={resetBusy}
            style={{
              background: 'rgba(234,67,53,.08)', color: '#ea4335',
              border: '1px solid rgba(234,67,53,.3)',
            }}
          >
            {resetBusy
              ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Resetting…</>
              : <><span className="icon icon-sm">delete_sweep</span>Flush Local DB &amp; Re-sync</>
            }
          </button>
        </Card>

        {/* Export */}
        <Card title="Data Export" icon="download">
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 14 }}>
            Export the complete change log as a CSV file.
          </div>
          <a href="/api/changelog/export" download="changelog.csv" className="md-btn md-btn-outlined" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            <span className="icon icon-sm">table_view</span>Export Change Log CSV
          </a>
        </Card>

        {/* App Info */}
        <Card title="Application" icon="info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Version</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                {appVersion || '…'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Built by</span>
              <span style={{ fontSize: 14, color: 'var(--text-1)' }}>Gravity Business Partners</span>
            </div>
            {isElectron && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Updates</span>
                <button onClick={handleCheckUpdates} className="md-btn md-btn-tonal" style={{ padding: '4px 14px', fontSize: 13 }}>
                  <span className="icon icon-sm">system_update</span>Check for Updates
                </button>
              </div>
            )}
            {!isElectron && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8 }}>
                Running in browser mode. Electron-specific features (configuration editor, native theme) are not available.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
