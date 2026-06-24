import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { SyncStatus, RefDataItem } from '../lib/types'
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
      uploadBootstrap?: (data: { fileUrl: string }) => Promise<{ ok: boolean; error?: string }>
    }
  }
}

const isElectron = typeof window !== 'undefined' && !!window.credManager

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="md-card" style={{ padding: '24px 28px', marginBottom: 16, breakInside: 'avoid' }}>
      <h2 className="section-title" style={{ marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  )
}

function StatRow({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 500,
        color: warn ? 'var(--warn)' : 'var(--text-1)',
        fontFamily: warn ? "'Google Sans', sans-serif" : undefined,
      }}>{value}</span>
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
  const [appVersion, setAppVersion] = useState<string>('')
  const [refItems, setRefItems]       = useState<RefDataItem[]>([])
  const [refLoading, setRefLoading]   = useState(true)
  const [refExpanded, setRefExpanded] = useState<string | null>(null)
  const [addingTo, setAddingTo]       = useState<string | null>(null)
  const [newValue, setNewValue]       = useState('')
  const [refBusy, setRefBusy]         = useState(false)

  const LIST_LABELS: Record<string, string> = {
    credential_type: 'Credential types',
    status:          'Status values',
    priority:        'Priority levels',
    environment:     'Environments',
    protocol:        'Protocols',
    billing_cycle:   'Billing cycles',
    auto_renewal:    'Auto-renewal options',
    mfa_type:        'MFA types',
    access_level:    'Access levels',
  }

  useEffect(() => {
    api.getSyncStatus().then(setSyncStatus).catch(() => {}).finally(() => setSyncLoading(false))
    if (isElectron && window.credManager) {
      setConfigLoading(true)
      window.credManager.getConfig().then(cfg => setConfig({ authClientId: '', ...cfg })).catch(() => {}).finally(() => setConfigLoading(false))
      window.credManager.getAppVersion().then(setAppVersion).catch(() => setAppVersion('Unknown'))
    } else {
      setAppVersion('Web mode')
    }
    api.getAllRefDataItems().then(setRefItems).catch(() => {}).finally(() => setRefLoading(false))
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
    if (!window.confirm(
      'This will DELETE all local credential data and re-pull from SharePoint.\n\nAny unsynced local changes will be lost.\n\nAre you sure?'
    )) return
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
      if (r.ok) showToast('Checking for updates — result will appear shortly', 'info')
      else showToast(r.error || 'Update check failed', 'error')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Update check failed', 'error') }
  }

  async function handleAddRefItem(listName: string) {
    const val = newValue.trim()
    if (!val) return
    setRefBusy(true)
    try {
      const maxOrder = Math.max(0, ...refItems.filter(r => r.list_name === listName).map(r => r.sort_order))
      const item = await api.createRefDataItem({ list_name: listName, value: val, sort_order: maxOrder + 1 })
      setRefItems(prev => [...prev, item])
      setNewValue('')
      setAddingTo(null)
      showToast(`Added "${val}"`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to add', 'error') }
    finally { setRefBusy(false) }
  }

  async function handleToggleRefItem(item: RefDataItem) {
    setRefBusy(true)
    try {
      const updated = await api.updateRefDataItem(item.id, { is_active: !item.is_active })
      setRefItems(prev => prev.map(r => r.id === item.id ? updated : r))
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to update', 'error') }
    finally { setRefBusy(false) }
  }

  async function handleDeleteRefItem(item: RefDataItem) {
    if (!window.confirm(`Remove "${item.value}"?`)) return
    setRefBusy(true)
    try {
      await api.deleteRefDataItem(item.id)
      setRefItems(prev => prev.filter(r => r.id !== item.id))
      showToast(`Removed "${item.value}"`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to delete', 'error') }
    finally { setRefBusy(false) }
  }

  const refByList = refItems.reduce<Record<string, RefDataItem[]>>((acc, r) => {
    ;(acc[r.list_name] ??= []).push(r)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Sync, configuration, and reference data</div>
      </div>

      <div style={{ columnWidth: 440, columnGap: 16 }}>

        <Card title="Sync status">
          {syncLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 16, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : syncStatus ? (
            <div>
              <StatRow label="Pending credentials" value={syncStatus.pending_credentials} warn={syncStatus.pending_credentials > 0} />
              <StatRow label="Pending log entries" value={syncStatus.pending_logs} warn={syncStatus.pending_logs > 0} />
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0',
              }}>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Last sync</span>
                <span style={{ fontSize: 14, color: 'var(--text-1)' }}>
                  {syncStatus.last_sync ? new Date(syncStatus.last_sync).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          ) : <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Could not load sync status</div>}
        </Card>

        <Card title="SharePoint sync">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
            Push local changes to SharePoint or pull the latest data from the Excel file.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="md-btn md-btn-primary" onClick={handlePush} disabled={pushBusy}>
              {pushBusy
                ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pushing…</>
                : <><span className="icon icon-sm">upload</span>Push to SharePoint</>}
            </button>
            <button className="md-btn md-btn-outlined" onClick={handlePull} disabled={pullBusy}>
              {pullBusy
                ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pulling…</>
                : <><span className="icon icon-sm">download</span>Pull from SharePoint</>}
            </button>
          </div>
        </Card>

        {isElectron && (
          <Card title="SharePoint configuration">
            {configLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} style={{ height: 40, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
                ))}
              </div>
            ) : (
              <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0, lineHeight: 1.5 }}>
                  SharePoint access now uses your Microsoft 365 sign-in directly — no client secrets
                  or tenant IDs to manage. The workbook URL is shared with teammates via a bootstrap file.
                </p>
                <div>
                  <label className="md-label">SharePoint Workbook URL</label>
                  <input
                    className="md-input"
                    type="url"
                    value={config.fileUrl}
                    onChange={e => setConfig(c => ({ ...c, fileUrl: e.target.value }))}
                    placeholder="https://…/Credentials.xlsx"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="submit" disabled={configSaving} className="md-btn md-btn-primary">
                    {configSaving ? 'Saving…' : <><span className="icon icon-sm">save</span>Save configuration</>}
                  </button>
                  <button
                    type="button"
                    className="md-btn md-btn-outlined"
                    onClick={async () => {
                      if (!window.credManager?.uploadBootstrap) {
                        showToast('Bootstrap upload not available in this build', 'error')
                        return
                      }
                      const r = await window.credManager.uploadBootstrap({ fileUrl: config.fileUrl })
                      showToast(r.ok ? 'Bootstrap re-uploaded to SharePoint' : (r.error || 'Upload failed'), r.ok ? 'success' : 'error')
                    }}
                  >
                    <span className="icon icon-sm">cloud_upload</span>Re-upload bootstrap
                  </button>
                </div>
              </form>
            )}
          </Card>
        )}

        <Card title="Local database">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
            If the SharePoint Excel file has been rebuilt and the app is showing stale data, wipe the local cache and pull fresh.
          </p>
          <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 16,
            background: 'var(--danger-bg)', color: 'var(--danger)',
            fontSize: 13, lineHeight: 1.5,
          }}>
            Any unsynced local changes will be permanently lost.
          </div>
          <button className="md-btn md-btn-danger" onClick={handleResetDb} disabled={resetBusy}>
            {resetBusy
              ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Resetting…</>
              : <><span className="icon icon-sm">delete_sweep</span>Flush local DB &amp; re-sync</>}
          </button>
        </Card>

        <Card title="Reference data">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
            Manage dropdown options used across all credential forms. Changes sync to SharePoint.
          </p>
          {refLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 40, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(LIST_LABELS).map(([listName, label]) => {
                const items = refByList[listName] ?? []
                const isOpen = refExpanded === listName
                return (
                  <div key={listName} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <button
                      onClick={() => setRefExpanded(isOpen ? null : listName)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                        textAlign: 'left', color: 'var(--text-1)', fontSize: 14, fontWeight: 500,
                        fontFamily: "'Google Sans', sans-serif",
                      }}
                    >
                      <span>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {items.filter(r => r.is_active).length} active
                        </span>
                        <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{isOpen ? 'expand_less' : 'expand_more'}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {items.sort((a, b) => a.sort_order - b.sort_order).map(item => (
                            <div key={item.id} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '10px 0', borderBottom: '1px solid var(--border)',
                              opacity: item.is_active ? 1 : 0.5,
                            }}>
                              <span style={{ flex: 1, fontSize: 14, color: item.is_active ? 'var(--text-1)' : 'var(--text-3)' }}>{item.value}</span>
                              <button
                                onClick={() => handleToggleRefItem(item)}
                                disabled={refBusy}
                                title={item.is_active ? 'Disable' : 'Enable'}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.is_active ? 'var(--success)' : 'var(--text-3)', display: 'flex', padding: 4 }}
                              >
                                <span className="icon icon-sm">{item.is_active ? 'toggle_on' : 'toggle_off'}</span>
                              </button>
                              <button
                                onClick={() => handleDeleteRefItem(item)}
                                disabled={refBusy}
                                title="Delete"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                              >
                                <span className="icon icon-sm">delete</span>
                              </button>
                            </div>
                          ))}
                          {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '10px 0', fontStyle: 'italic' }}>No items yet</div>}
                        </div>
                        <div style={{ marginTop: 12 }}>
                          {addingTo === listName ? (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                autoFocus
                                value={newValue}
                                onChange={e => setNewValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRefItem(listName) } if (e.key === 'Escape') { setAddingTo(null); setNewValue('') } }}
                                placeholder="New value…"
                                className="md-input"
                                style={{ flex: 1, height: 36 }}
                              />
                              <button className="md-btn md-btn-primary md-btn-sm" onClick={() => handleAddRefItem(listName)} disabled={refBusy || !newValue.trim()}>Add</button>
                              <button className="md-btn md-btn-text md-btn-sm" onClick={() => { setAddingTo(null); setNewValue('') }}>Cancel</button>
                            </div>
                          ) : (
                            <button className="md-btn md-btn-text md-btn-sm" onClick={() => { setAddingTo(listName); setNewValue('') }}>
                              <span className="icon icon-sm">add</span>Add value
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Data export">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16 }}>
            Export the complete change log as a CSV file.
          </p>
          <a href="/api/changelog/export" download="changelog.csv" className="md-btn md-btn-outlined" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            <span className="icon icon-sm">table_view</span>Export change log
          </a>
        </Card>

        <Card title="Application">
          <StatRow label="Version" value={appVersion || '…'} />
          {isElectron && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Updates</span>
              <button onClick={handleCheckUpdates} className="md-btn md-btn-tonal md-btn-sm">
                <span className="icon icon-sm">system_update</span>Check for updates
              </button>
            </div>
          )}
          {!isElectron && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 8 }}>
              Running in browser mode. Configuration editor and native theme are not available.
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
