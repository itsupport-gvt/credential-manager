import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Credential, ChangeLogItem, AuthorizedUser, MfaMethod } from '../lib/types'
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
  const [parent, setParent] = useState<Credential | null>(null)
  const [children, setChildren] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getCredential(id)
      .then(c => {
        setCred(c)
        // Fetch parent if this is a child credential
        if (c.linked_credential_id) {
          api.getCredential(c.linked_credential_id).then(setParent).catch(() => {})
        }
        // Always fetch children (credentials that link to this one)
        api.listCredentials({ linked_to: c.credential_id, page_size: 100 })
          .then(r => setChildren(r.items))
          .catch(() => {})
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
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

      {/* ── Shared Identity: child banner (this credential uses a master) ── */}
      {parent && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', background: 'var(--primary-bg)', border: '1px solid rgba(26,115,232,.25)', borderRadius: 10 }}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>link</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>Shared Identity</div>
            <div style={{ fontSize: 13, color: 'var(--text-1)' }}>
              Auth for this service is provided by a shared master credential. Manage the password there.
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', width: 'fit-content' }}>
              <span className="icon icon-sm" style={{ color: 'var(--primary)' }}>lock</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{parent.service_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{parent.username_email}{parent.category ? ` · ${parent.category}` : ''}</div>
              </div>
              <Link
                to={`/credential/${parent.credential_id}`}
                style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}
              >
                View master <span className="icon icon-sm">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Shared Identity: master banner (other credentials link to this one) ── */}
      {children.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface-2)' }}>
            <span className="icon icon-sm" style={{ color: 'var(--primary)' }}>hub</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: "'Google Sans', sans-serif" }}>
              Shared Identity — used by {children.length} {children.length === 1 ? 'service' : 'services'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>
              These credentials authenticate via this master account
            </span>
          </div>
          <div style={{ background: 'var(--surface)' }}>
            {children.map((child, i) => (
              <div key={child.credential_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>lock</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{child.service_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {[child.category, child.tenant_name || child.tenant_code].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {child.service_url && (
                  <a href={child.service_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', flexShrink: 0 }}>
                    <span className="icon icon-sm">open_in_new</span>
                  </a>
                )}
                <StatusBadge status={child.status} />
                <Link
                  to={`/credential/${child.credential_id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}
                >
                  View <span className="icon icon-sm">arrow_forward</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <FR label="Credential Type" value={cred.credential_type ? (
              <span style={{ background: 'var(--primary-bg)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{cred.credential_type}</span>
            ) : null} />
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
            <FR label="Backup Codes" value={fmt(cred.backup_codes_location)} />
            <FR label="Security Notes" value={fmt(cred.security_notes)} />
          </Section>

          {/* MFA Methods */}
          <Section title="3. MFA Methods" open={(cred.mfa_methods?.length ?? 0) > 0}>
            {(!cred.mfa_methods || cred.mfa_methods.length === 0) ? (
              <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '8px 0' }}>No MFA methods configured</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(cred.mfa_methods as MfaMethod[]).map((m, i) => (
                  <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span className="icon icon-sm" style={{ color: 'var(--primary)' }}>security</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{m.type || 'MFA'}</span>
                      {m.app_name && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>· {m.app_name}</span>}
                    </div>
                    {m.person_name && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Person: {m.person_name}{m.person_email ? ` (${m.person_email})` : ''}</div>}
                    {m.phone && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Phone: {m.phone}</div>}
                    {m.notes && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontStyle: 'italic' }}>{m.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Authorized Users */}
          <Section title="4. Authorized Users" open={(cred.authorized_users?.length ?? 0) > 0}>
            {(!cred.authorized_users || cred.authorized_users.length === 0) ? (
              <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '8px 0' }}>No authorized users listed</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {['Name', 'Email', 'Access Level', 'Notes'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cred.authorized_users as AuthorizedUser[]).map((u, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{u.name || '—'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{u.email || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            background: u.access_level === 'Admin' ? 'var(--danger-bg)' : u.access_level === 'Write' ? 'var(--warn-bg)' : 'var(--primary-bg)',
                            color: u.access_level === 'Admin' ? 'var(--danger)' : u.access_level === 'Write' ? '#b06000' : 'var(--primary)',
                            padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          }}>{u.access_level || 'Read'}</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-3)', fontSize: 12 }}>{u.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="5. Account Details" open={false}>
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

          <Section title="6. Technical / API" open={false}>
            <FR label="Access Level" value={fmt(cred.access_level)} />
            <FR label="Linked Credential" value={cred.linked_credential_id ? (
              <Link to={`/credential/${cred.linked_credential_id}`} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="icon icon-sm">lock</span>
                {parent ? parent.service_name : cred.linked_credential_id}
              </Link>
            ) : null} />
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

          <Section title="7. Ownership & Tracking" open={false}>
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
