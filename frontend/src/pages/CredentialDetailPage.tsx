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
    <div className="md-card" style={{ marginBottom: 12, overflow: 'hidden', padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
          fontFamily: "'Google Sans', sans-serif", fontSize: 14, fontWeight: 500,
          color: 'var(--text-1)',
        }}
      >
        <span>{title}</span>
        <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 20px 20px', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function FR({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16,
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-1)', wordBreak: 'break-word' }}>
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

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
  if (items.length === 0) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>No change history</div>

  function ab(a: string) {
    if (a === 'CREATE') return 'badge-active'
    if (a === 'DELETE' || a === 'ARCHIVE') return 'badge-danger'
    if (a === 'REVEAL' || a === 'ACCESS') return 'badge-purple'
    return 'badge-blue'
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{total} log entries</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Timestamp', 'Action', 'Field', 'Old', 'New', 'By'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 12px',
                  fontSize: 11, fontWeight: 500, color: 'var(--text-2)',
                  textTransform: 'uppercase', letterSpacing: .5,
                  borderBottom: '1px solid var(--border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{new Date(item.timestamp).toLocaleString()}</td>
                <td style={{ padding: '10px 12px' }}><span className={ab(item.action)}>{item.action}</span></td>
                <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{item.field_changed}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--danger)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.old_value_masked || '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--success)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.new_value_masked || '—'}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{item.changed_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 20 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Page {page} of {Math.ceil(total / 20)}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="md-btn md-btn-outlined md-btn-sm">Prev</button>
            <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="md-btn md-btn-outlined md-btn-sm">Next</button>
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
        if (c.linked_credential_id) {
          api.getCredential(c.linked_credential_id).then(setParent).catch(() => {})
        }
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
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )

  if (error) return (
    <div style={{
      background: 'var(--danger-bg)', color: 'var(--danger)',
      padding: '12px 16px', borderRadius: 8, fontSize: 14,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span className="icon icon-sm">error</span>{error}
    </div>
  )
  if (!cred) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Back */}
      <button
        onClick={() => navigate('/credentials')}
        className="md-btn md-btn-text md-btn-sm"
        style={{ alignSelf: 'flex-start', marginLeft: -12 }}
      >
        <span className="icon icon-sm">arrow_back</span>Back to credentials
      </button>

      {/* Header */}
      <div className="md-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <h1 style={{
                fontFamily: "'Google Sans', sans-serif",
                fontSize: 22, fontWeight: 400, color: 'var(--text-1)',
                margin: 0, letterSpacing: -.2,
              }}>{cred.service_name}</h1>
              <StatusBadge status={cred.status} />
              <PriorityBadge priority={cred.priority} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-3)' }}>{cred.credential_id}</span>
              <span style={{ color: 'var(--text-3)' }}>·</span>
              <span>{cred.tenant_name || cred.tenant_code}</span>
              {cred.category && <><span style={{ color: 'var(--text-3)' }}>·</span><span>{cred.category}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cred.service_url && (
              <a href={cred.service_url} target="_blank" rel="noopener noreferrer" className="md-btn md-btn-outlined md-btn-sm" style={{ textDecoration: 'none' }}>
                <span className="icon icon-sm">open_in_new</span>Open
              </a>
            )}
            <button className="md-btn md-btn-tonal md-btn-sm" onClick={() => navigate(`/credential/${id}/edit`)}>
              <span className="icon icon-sm">edit</span>Edit
            </button>
            <button className="md-btn md-btn-danger md-btn-sm" onClick={handleArchive} disabled={archiving}>
              <span className="icon icon-sm">archive</span>{archiving ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>
      </div>

      {/* Shared Identity: child banner */}
      {parent && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '16px 20px',
          background: 'var(--primary-bg)', borderRadius: 12,
        }}>
          <span className="icon" style={{ color: 'var(--primary)', flexShrink: 0 }}>link</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary)', marginBottom: 4 }}>Shared identity</div>
            <div style={{ fontSize: 14, color: 'var(--text-1)' }}>
              Authentication for this service is provided by a shared master credential.
            </div>
            <Link
              to={`/credential/${parent.credential_id}`}
              className="md-btn md-btn-text md-btn-sm"
              style={{ marginTop: 8, marginLeft: -12 }}
            >
              <span className="icon icon-sm">lock</span>
              View {parent.service_name}
              <span className="icon icon-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}

      {/* Shared Identity: master banner */}
      {children.length > 0 && (
        <div className="md-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 className="section-title">
              <span className="icon icon-sm" style={{ verticalAlign: 'middle', color: 'var(--primary)', marginRight: 8 }}>hub</span>
              Shared identity — used by {children.length} {children.length === 1 ? 'service' : 'services'}
            </h2>
          </div>
          <div>
            {children.map((child, i) => (
              <div
                key={child.credential_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px',
                  borderBottom: i < children.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>lock</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{child.service_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {[child.category, child.tenant_name || child.tenant_code].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <StatusBadge status={child.status} />
                <Link
                  to={`/credential/${child.credential_id}`}
                  className="md-btn md-btn-text md-btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  View
                  <span className="icon icon-sm">arrow_forward</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {([['details', 'Details'], ['history', 'Change history']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
              color: tab === t ? 'var(--primary)' : 'var(--text-2)',
              borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color .12s',
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="animate-in">
          <Section title="1. Core Identity">
            <FR label="Credential ID" value={fmt(cred.credential_id)} />
            <FR label="Credential Type" value={cred.credential_type ? <span className="md-chip">{cred.credential_type}</span> : null} />
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
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Password</div>
              <MaskedField label="" credentialId={cred.credential_id} field="password" hasValue={cred.has_password} />
            </div>
            <FR label="Recovery Email" value={fmt(cred.recovery_email)} />
            <FR label="Recovery Phone" value={fmt(cred.recovery_phone)} />
            <FR label="Backup Codes" value={fmt(cred.backup_codes_location)} />
            <FR label="Security Notes" value={fmt(cred.security_notes)} />
          </Section>

          <Section title="3. MFA Methods" open={(cred.mfa_methods?.length ?? 0) > 0}>
            {(!cred.mfa_methods || cred.mfa_methods.length === 0) ? (
              <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '8px 0' }}>No MFA methods configured</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(cred.mfa_methods as MfaMethod[]).map((m, i) => (
                  <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span className="icon icon-sm" style={{ color: 'var(--primary)' }}>security</span>
                      <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-1)' }}>{m.type || 'MFA'}</span>
                      {m.app_name && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>· {m.app_name}</span>}
                    </div>
                    {m.person_name && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Person: {m.person_name}{m.person_email ? ` (${m.person_email})` : ''}</div>}
                    {m.phone && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Phone: {m.phone}</div>}
                    {m.notes && <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{m.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="4. Authorized Users" open={(cred.authorized_users?.length ?? 0) > 0}>
            {(!cred.authorized_users || cred.authorized_users.length === 0) ? (
              <div style={{ color: 'var(--text-3)', fontSize: 14, padding: '8px 0' }}>No authorized users listed</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Access', 'Notes'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '10px 12px',
                          fontSize: 11, fontWeight: 500, color: 'var(--text-2)',
                          textTransform: 'uppercase', letterSpacing: .5,
                          borderBottom: '1px solid var(--border)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cred.authorized_users as AuthorizedUser[]).map((u, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{u.name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{u.email || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="md-chip">{u.access_level || 'Read'}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-3)' }}>{u.notes || '—'}</td>
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
              <Link to={`/credential/${cred.linked_credential_id}`} style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="icon icon-sm">lock</span>
                {parent ? parent.service_name : cred.linked_credential_id}
              </Link>
            ) : null} />
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>API Key</div>
              <MaskedField label="" credentialId={cred.credential_id} field="api_key" hasValue={cred.has_api_key} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>API Secret</div>
              <MaskedField label="" credentialId={cred.credential_id} field="api_secret" hasValue={cred.has_api_secret} />
            </div>
            <FR label="Client ID" value={fmt(cred.client_id)} />
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Client Secret</div>
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
              <span style={{
                color: new Date(cred.password_expiry_date) < new Date() ? 'var(--danger)' : 'var(--text-1)',
                fontWeight: new Date(cred.password_expiry_date) < new Date() ? 500 : 400,
              }}>{fmtDate(cred.password_expiry_date)}</span>
            ) : null} />
            <FR label="Next Review" value={fmtDate(cred.next_review_date)} />
            <FR label="Tags" value={cred.tags ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {cred.tags.split(',').map(t => <span key={t.trim()} className="md-chip">{t.trim()}</span>)}
              </div>
            ) : null} />
            <FR label="Notes" value={fmt(cred.notes)} />
          </Section>
        </div>
      )}

      {tab === 'history' && id && (
        <div className="md-card animate-in" style={{ padding: 24 }}>
          <ChangeLogTable credentialId={id} />
        </div>
      )}
    </div>
  )
}
