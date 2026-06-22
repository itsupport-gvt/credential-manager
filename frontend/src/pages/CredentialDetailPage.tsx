import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Credential, ChangeLogItem } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'
import { MaskedField } from '../components/MaskedField'
import { useToast } from '../App'

function Section({ title, open: defaultOpen = true, children }: { title: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
        background: 'var(--surface-2)', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)' }}>{title}</span>
        <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && <div style={{ padding: '16px', background: 'var(--surface)' }}>{children}</div>}
    </div>
  )
}

function FR({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', fontFamily: "'Google Sans', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-1)', wordBreak: 'break-all' }}>
        {value || <span style={{ color: 'var(--text-3)' }}>—</span>}
      </div>
    </div>
  )
}

function ChangeLogTable({ credentialId }: { credentialId: string }) {
  const [items, setItems] = useState<ChangeLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    api.getChangeLog({ credential_id: credentialId, page, page_size: 20 })
      .then(d => { setItems(d.items); setTotal(d.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [credentialId, page])

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
  if (items.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No change history</div>

  function ab(a: string) {
    if (a === 'CREATE') return 'badge-active'
    if (a === 'DELETE' || a === 'ARCHIVE') return 'badge-danger'
    if (a === 'REVEAL' || a === 'ACCESS') return 'badge-purple'
    return 'badge-blue'
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{total} log entries</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Timestamp', 'Action', 'Field', 'Old', 'New', 'By'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(item.timestamp).toLocaleString()}</td>
                <td style={{ padding: '8px 12px' }}><span className={ab(item.action)}>{item.action}</span></td>
                <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12 }}>{item.field_changed}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--danger)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.old_value_masked || '—'}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--success)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.new_value_masked || '—'}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-2)', fontSize: 12, whiteSpace: 'nowrap' }}>{item.changed_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 20 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Page {page} of {Math.ceil(total / 20)}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="md-btn md-btn-outlined" style={{ padding: '4px 12px', fontSize: 12 }}>Prev</button>
            <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="md-btn md-btn-outlined" style={{ padding: '4px 12px', fontSize: 12 }}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CredentialDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [cred, setCred] = useState<Credential | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getCredential(id).then(setCred).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false))
  }, [id])

  async function handleArchive() {
    if (!id || !cred) return
    if (!confirm(`Archive "${cred.service_name}"?`)) return
    setArchiving(true)
    try { await api.archiveCredential(id); showToast('Credential archived', 'success'); navigate('/credentials') }
    catch (e) { showToast(e instanceof Error ? e.message : 'Archive failed', 'error') }
    finally { setArchiving(false) }
  }

  function fmt(v: string | number | undefined | null) { return v != null && v !== '' ? String(v) : null }
  function fmtDate(v: string | undefined | null) { if (!v) return null; try { return new Date(v).toLocaleDateString() } catch { return v } }
  function fmtCurrency(v: number | undefined | null) { if (!v) return null; return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v) }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 28, background: 'var(--surface-2)', borderRadius: 6, width: 280, animation: 'pulse 1.5s infinite' }} />
      {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />)}
    </div>
  )

  if (error) return <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c3', color: 'var(--danger)', padding: '12px 16px', borderRadius: 10, fontSize: 14 }}>{error}</div>
  if (!cred) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Back */}
      <button onClick={() => navigate('/credentials')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: 0, alignSelf: 'flex-start' }}>
        <span className="icon icon-sm">arrow_back</span>Back to Credentials
      </button>

      {/* Header */}
      <div className="md-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="icon icon-md" style={{ color: 'var(--primary)' }}>lock</span>
              </div>
              <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{cred.service_name}</h1>
              <StatusBadge status={cred.status} />
              <PriorityBadge priority={cred.priority} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-3)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace' }}>{cred.credential_id}</span>
              <span>·</span>
              <span>{cred.tenant_name || cred.tenant_code}</span>
              {cred.category && <><span>·</span><span>{cred.category}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {cred.service_url && (
              <a href={cred.service_url} target="_blank" rel="noopener noreferrer" className="md-btn md-btn-outlined" style={{ textDecoration: 'none', fontSize: 13, padding: '6px 14px' }}>
                <span className="icon icon-sm">open_in_new</span>Open URL
              </a>
            )}
            <button className="md-btn md-btn-tonal" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => navigate(`/credential/${id}/edit`)}>
              <span className="icon icon-sm">edit</span>Edit
            </button>
            <button className="md-btn md-btn-danger" style={{ fontSize: 13, padding: '6px 14px' }} onClick={handleArchive} disabled={archiving}>
              <span className="icon icon-sm">archive</span>{archiving ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {([['details', 'Details'], ['history', 'Change History']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
            color: tab === t ? 'var(--primary)' : 'var(--text-2)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="animate-in">
          <Section title="1. Core Identity">
            <FR label="Credential ID" value={fmt(cred.credential_id)} />
            <FR label="Tenant" value={fmt(cred.tenant_name || cred.tenant_code)} />
            <FR label="Category" value={fmt(cred.category)} />
            <FR label="Subcategory" value={fmt(cred.subcategory)} />
            <FR label="Service Name" value={fmt(cred.service_name)} />
            <FR label="Service URL" value={cred.service_url ? <a href={cred.service_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{cred.service_url}</a> : null} />
            <FR label="Environment" value={fmt(cred.environment)} />
            <FR label="Status" value={cred.status ? <StatusBadge status={cred.status} /> : null} />
            <FR label="Priority" value={cred.priority ? <PriorityBadge priority={cred.priority} /> : null} />
          </Section>

          <Section title="2. Authentication">
            <FR label="Username / Email" value={fmt(cred.username_email)} />
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', fontFamily: "'Google Sans', sans-serif" }}>Password</div>
              <MaskedField label="" credentialId={cred.credential_id} field="password" hasValue={cred.has_password} />
            </div>
            <FR label="Recovery Email" value={fmt(cred.recovery_email)} />
            <FR label="Recovery Phone" value={fmt(cred.recovery_phone)} />
            <FR label="MFA Enabled" value={cred.mfa_enabled === 'Yes' ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>Yes</span> : 'No'} />
            <FR label="MFA Type" value={fmt(cred.mfa_type)} />
            <FR label="MFA App Name" value={fmt(cred.mfa_app_name)} />
            <FR label="Backup Codes" value={fmt(cred.backup_codes_location)} />
            <FR label="Security Notes" value={fmt(cred.security_notes)} />
          </Section>

          <Section title="3. Account Details" open={false}>
            <FR label="Account Display Name" value={fmt(cred.account_display_name)} />
            <FR label="Account ID" value={fmt(cred.account_id)} />
            <FR label="License Type" value={fmt(cred.license_type)} />
            <FR label="Plan Tier" value={fmt(cred.plan_tier)} />
            <FR label="Subscription Start" value={fmtDate(cred.subscription_start)} />
            <FR label="Subscription End" value={fmtDate(cred.subscription_end)} />
            <FR label="Auto Renewal" value={fmt(cred.auto_renewal)} />
            <FR label="Monthly Cost" value={fmtCurrency(cred.monthly_cost)} />
            <FR label="Billing Cycle" value={fmt(cred.billing_cycle)} />
            <FR label="Billing Email" value={fmt(cred.billing_email)} />
            <FR label="Payment Reference" value={fmt(cred.payment_reference)} />
          </Section>

          <Section title="4. Technical / API" open={false}>
            <FR label="Access Level" value={fmt(cred.access_level)} />
            <FR label="Linked Credential" value={cred.linked_credential_id ? <Link to={`/credential/${cred.linked_credential_id}`} style={{ color: 'var(--primary)' }}>{cred.linked_credential_id}</Link> : null} />
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', fontFamily: "'Google Sans', sans-serif" }}>API Key</div>
              <MaskedField label="" credentialId={cred.credential_id} field="api_key" hasValue={cred.has_api_key} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', fontFamily: "'Google Sans', sans-serif" }}>API Secret</div>
              <MaskedField label="" credentialId={cred.credential_id} field="api_secret" hasValue={cred.has_api_secret} />
            </div>
            <FR label="Client ID" value={fmt(cred.client_id)} />
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', fontFamily: "'Google Sans', sans-serif" }}>Client Secret</div>
              <MaskedField label="" credentialId={cred.credential_id} field="client_secret" hasValue={cred.has_client_secret} />
            </div>
            <FR label="Tenant ID (App)" value={fmt(cred.tenant_id_app)} />
            <FR label="Azure Subscription ID" value={fmt(cred.subscription_id_azure)} />
            <FR label="Server Hostname" value={fmt(cred.server_hostname)} />
            <FR label="Port" value={fmt(cred.port)} />
            <FR label="Protocol" value={fmt(cred.protocol)} />
            <FR label="Database Name" value={fmt(cred.database_name)} />
          </Section>

          <Section title="5. Ownership & Tracking" open={false}>
            <FR label="Managed By" value={fmt(cred.managed_by)} />
            <FR label="Managed By Email" value={fmt(cred.managed_by_email)} />
            <FR label="Created By" value={fmt(cred.created_by)} />
            <FR label="Created Date" value={fmtDate(cred.created_date)} />
            <FR label="Last Updated By" value={fmt(cred.last_updated_by)} />
            <FR label="Last Updated" value={fmtDate(cred.last_updated_date)} />
            <FR label="Last Verified" value={fmtDate(cred.last_verified_date)} />
            <FR label="Last Password Changed" value={fmtDate(cred.last_password_changed)} />
            <FR label="Password Expiry" value={cred.password_expiry_date ? (
              <span style={{ color: new Date(cred.password_expiry_date) < new Date() ? 'var(--danger)' : 'var(--text-1)', fontWeight: new Date(cred.password_expiry_date) < new Date() ? 600 : 400 }}>
                {fmtDate(cred.password_expiry_date)}
              </span>
            ) : null} />
            <FR label="Next Review" value={fmtDate(cred.next_review_date)} />
            <FR label="Tags" value={cred.tags ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {cred.tags.split(',').map(t => (
                  <span key={t.trim()} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px', fontSize: 11, color: 'var(--text-2)' }}>{t.trim()}</span>
                ))}
              </div>
            ) : null} />
            <FR label="Notes" value={fmt(cred.notes)} />
          </Section>
        </div>
      )}

      {tab === 'history' && id && (
        <div className="md-card animate-in" style={{ padding: 20 }}>
          <ChangeLogTable credentialId={id} />
        </div>
      )}
    </div>
  )
}
