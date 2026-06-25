import { useEffect, useRef, useState, type ChangeEvent, type ReactNode, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { AutoInput } from '../components/AutoInput'
import { AuthorizedUsersEditor } from '../components/AuthorizedUsersEditor'
import type { Credential, Tenant, Category, AuthorizedUser, MfaMethod, ReferenceData } from '../lib/types'

const DEFAULT_STATUSES       = ['Active', 'Inactive', 'Expired', 'Compromised', 'Archived']
const DEFAULT_PRIORITIES     = ['Critical', 'High', 'Medium', 'Low']
const DEFAULT_ENVIRONMENTS   = ['Production', 'Staging', 'Development', 'Testing', 'DR']
const DEFAULT_CRED_TYPES     = ['Password', 'OTP-Only', 'API Key', 'OAuth2', 'Database', 'SSH', 'License Key', 'Certificate', 'Identity / SSO', 'Custom']
const DEFAULT_MFA_TYPES      = ['TOTP', 'SMS', 'Email', 'Hardware Key', 'Passkey', 'Push', 'Biometric', 'Other']
const DEFAULT_ACCESS_LEVELS  = ['Admin', 'Owner', 'Member', 'Viewer', 'Read-Only', 'Service Account']
const DEFAULT_PROTOCOLS      = ['HTTPS', 'HTTP', 'SFTP', 'FTP', 'SSH', 'RDP', 'MySQL', 'PostgreSQL', 'MSSQL', 'Other']
const DEFAULT_BILLING_CYCLES = ['Monthly', 'Annual', 'Quarterly', 'Bi-Annual', 'One-Time']
const DEFAULT_AUTO_RENEWALS  = ['Yes', 'No', 'Unknown']

const BLANK_MFA: MfaMethod = { type: 'TOTP', app_name: '', person_name: '', person_email: '', phone: '', notes: '' }

function FF({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="md-label">
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}
function TI({ name, value, onChange, placeholder, required, type = 'text' }: { name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; placeholder?: string; required?: boolean; type?: string }) {
  return <input type={type} name={name} value={value ?? ''} onChange={onChange} placeholder={placeholder} required={required} className="md-input" />
}
function SI({ name, value, onChange, options, placeholder }: { name: string; value: string; onChange: (e: ChangeEvent<HTMLSelectElement>) => void; options: string[]; placeholder?: string }) {
  return (
    <select name={name} value={value ?? ''} onChange={onChange} className="md-select">
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
function SecretEdit({ name, label, hasValue, enabled, value, onToggle, onChange }: { name: string; label: string; hasValue: boolean; enabled: boolean; value: string; onToggle: () => void; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="md-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: enabled ? 8 : 0 }}>
        <input type="checkbox" id={`chg_${name}`} checked={enabled} onChange={onToggle} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--primary)' }} />
        <label htmlFor={`chg_${name}`} style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
          {hasValue ? 'Change existing value' : 'Set a value'}
        </label>
      </div>
      {enabled ? (
        <div style={{ position: 'relative' }}>
          <input type={show ? 'text' : 'password'} name={name} value={value} onChange={onChange} placeholder="Enter new value…" className="md-input" style={{ paddingRight: 80 }} />
          <button type="button" onClick={() => setShow(s => !s)} style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary)', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px',
          }}>
            <span className="icon icon-sm">{show ? 'visibility_off' : 'visibility'}</span>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : hasValue ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>Value set (encrypted)</div>
      ) : null}
    </div>
  )
}

function Sec({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="md-card" style={{ overflow: 'hidden', marginBottom: 12, padding: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left',
        fontFamily: "'Google Sans', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-1)',
      }}>
        {title}
        <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 20px 24px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 16 }}>{children}</div>
        </div>
      )}
    </div>
  )
}

type FormFields = Omit<Credential, 'id' | 'has_password' | 'has_api_key' | 'has_api_secret' | 'has_client_secret' | 'monthly_cost'> & { monthly_cost: string }

export default function EditCredentialPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const formRef = useRef<HTMLFormElement>(null)
  const [cred, setCred] = useState<Credential | null>(null)
  const [form, setForm] = useState<FormFields | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<{ service_names: string[]; service_urls: string[]; usernames: string[] }>({ service_names: [], service_urls: [], usernames: [] })
  const [refData, setRefData] = useState<ReferenceData>({})

  const [chPw, setChPw] = useState(false); const [newPw, setNewPw] = useState('')
  const [chAk, setChAk] = useState(false); const [newAk, setNewAk] = useState('')
  const [chAs, setChAs] = useState(false); const [newAs, setNewAs] = useState('')
  const [chCs, setChCs] = useState(false); const [newCs, setNewCs] = useState('')
  const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([])
  const [authUsers, setAuthUsers] = useState<AuthorizedUser[]>([])

  useEffect(() => {
    api.getSuggestions().then(setSuggestions).catch(() => {})
    api.getReferenceData().then(setRefData).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Auto-focus first form field once the credential has loaded
  useEffect(() => {
    if (!form) return
    const t = setTimeout(() => {
      const first = formRef.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      )
      first?.focus()
    }, 50)
    return () => clearTimeout(t)
  }, [form?.credential_id])  // re-focus when we switch credentials

  useEffect(() => {
    if (!id) return
    Promise.all([api.getCredential(id), api.listTenants(), api.listCategories()])
      .then(([c, t, cats]) => {
        setCred(c); setTenants(t); setCategories(cats)
        setForm({ ...c, monthly_cost: c.monthly_cost != null ? String(c.monthly_cost) : '' } as unknown as FormFields)
        setMfaMethods(Array.isArray(c.mfa_methods) ? c.mfa_methods : [])
        setAuthUsers(Array.isArray(c.authorized_users) ? c.authorized_users : [])
      })
      .catch((e: unknown) => setErrors([e instanceof Error ? e.message : 'Failed to load']))
      .finally(() => setLoading(false))
  }, [id])

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(f => f ? { ...f, [e.target.name]: e.target.value } : f)
  }

  const subcategories = categories.find(c => c.category_name === form?.category)?.subcategories ?? []

  const STATUSES       = refData.status         ?? DEFAULT_STATUSES
  const PRIORITIES     = refData.priority        ?? DEFAULT_PRIORITIES
  const ENVIRONMENTS   = refData.environment     ?? DEFAULT_ENVIRONMENTS
  const CRED_TYPES     = refData.credential_type ?? DEFAULT_CRED_TYPES
  const MFA_TYPES      = refData.mfa_type        ?? DEFAULT_MFA_TYPES
  const ACCESS_LEVELS  = refData.access_level    ?? DEFAULT_ACCESS_LEVELS
  const PROTOCOLS      = refData.protocol        ?? DEFAULT_PROTOCOLS
  const BILLING_CYCLES = refData.billing_cycle   ?? DEFAULT_BILLING_CYCLES
  const AUTO_RENEWALS  = refData.auto_renewal    ?? DEFAULT_AUTO_RENEWALS

  function validate() {
    if (!form) return ['Form not loaded']
    const e: string[] = []
    if (!form.tenant_code) e.push('Tenant is required')
    if (!form.category) e.push('Category is required')
    if (!form.service_name) e.push('Service Name is required')
    if (!form.username_email) e.push('Username / Email is required')
    return e
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate(); if (errs.length) { setErrors(errs); return }
    setErrors([]); setSubmitting(true)
    if (!form || !id) return
    const payload: Record<string, unknown> = {
      ...form,
      monthly_cost: form.monthly_cost ? parseFloat(form.monthly_cost) : 0,
      last_updated_by: user?.name || user?.email || '',
      last_updated_date: new Date().toISOString().split('T')[0],
      authorized_users: authUsers,
      mfa_methods: mfaMethods,
    }
    if (chPw && newPw) payload.password = newPw
    if (chAk && newAk) payload.api_key = newAk
    if (chAs && newAs) payload.api_secret = newAs
    if (chCs && newCs) payload.client_secret = newCs
    try { await api.updateCredential(id, payload); navigate(`/credential/${id}`) }
    catch (err) { setErrors([err instanceof Error ? err.message : 'Update failed']) }
    finally { setSubmitting(false) }
  }

  function updateMfa(i: number, field: keyof MfaMethod, val: string) {
    setMfaMethods(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m))
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 28, width: 280, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )

  if (!form || !cred) return (
    <div style={{
      background: 'var(--danger-bg)', color: 'var(--danger)',
      padding: '12px 16px', borderRadius: 8, fontSize: 14,
    }}>
      {errors.join(', ') || 'Failed to load credential'}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 96 }}>
      <div>
        <button onClick={() => navigate(`/credential/${id}`)} className="md-btn md-btn-text md-btn-sm" style={{ marginLeft: -12, marginBottom: 12 }}>
          <span className="icon icon-sm">arrow_back</span>Back to credential
        </button>
        <div className="page-title">Edit: {cred.service_name}</div>
        <div className="page-subtitle" style={{ fontFamily: 'monospace' }}>{cred.credential_id}</div>
      </div>

      {errors.length > 0 && (
        <div style={{
          background: 'var(--danger-bg)', color: 'var(--danger)',
          padding: '12px 16px', borderRadius: 8, fontSize: 14,
        }}>
          <ul style={{ margin: 0, paddingLeft: 20 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit}>
        <Sec title="1. Core Identity">
          <FF label="Credential Type" required><SI name="credential_type" value={form.credential_type ?? 'Password'} onChange={handleChange} options={CRED_TYPES} /></FF>
          <FF label="Tenant" required>
            <select name="tenant_code" value={form.tenant_code} onChange={handleChange} className="md-select">
              <option value="">Select tenant…</option>
              {tenants.map(t => <option key={t.tenant_code} value={t.tenant_code}>{t.tenant_name} ({t.tenant_code})</option>)}
            </select>
          </FF>
          <FF label="Category" required>
            <select name="category" value={form.category} onChange={handleChange} className="md-select">
              <option value="">Select category…</option>
              {categories.map(c => <option key={c.category_id} value={c.category_name}>{c.category_name}</option>)}
            </select>
          </FF>
          <FF label="Subcategory">
            {subcategories.length > 0 ? (
              <select
                name="subcategory"
                value={form.subcategory ?? ''}
                onChange={handleChange}
                className="md-select"
                disabled={!form.category}
              >
                <option value="">{form.category ? 'Select…' : 'Select category first'}</option>
                {subcategories.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type="text"
                name="subcategory"
                value={form.subcategory ?? ''}
                onChange={handleChange}
                className="md-input"
                disabled={!form.category}
                placeholder={form.category ? '' : 'Select category first'}
              />
            )}
          </FF>
          <FF label="Service Name" required><AutoInput name="service_name" value={form.service_name} onChange={handleChange} suggestions={suggestions.service_names} required /></FF>
          <FF label="Service URL"><AutoInput name="service_url" value={form.service_url} onChange={handleChange} suggestions={suggestions.service_urls} type="url" /></FF>
          <FF label="Environment"><SI name="environment" value={form.environment} onChange={handleChange} options={ENVIRONMENTS} /></FF>
          <FF label="Status" required><SI name="status" value={form.status} onChange={handleChange} options={STATUSES} /></FF>
          <FF label="Priority" required><SI name="priority" value={form.priority} onChange={handleChange} options={PRIORITIES} /></FF>
        </Sec>

        <Sec title="2. Authentication">
          <FF label="Username / Email" required><AutoInput name="username_email" value={form.username_email} onChange={handleChange} suggestions={suggestions.usernames} required /></FF>
          <SecretEdit name="password" label="Password" hasValue={cred.has_password} enabled={chPw} value={newPw} onToggle={() => setChPw(v => !v)} onChange={e => setNewPw(e.target.value)} />
          <FF label="Recovery Email"><TI name="recovery_email" value={form.recovery_email} onChange={handleChange} type="email" /></FF>
          <FF label="Recovery Phone"><TI name="recovery_phone" value={form.recovery_phone} onChange={handleChange} type="tel" /></FF>
          <FF label="Backup Codes Location"><TI name="backup_codes_location" value={form.backup_codes_location} onChange={handleChange} /></FF>
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Security Notes"><textarea name="security_notes" value={form.security_notes} onChange={handleChange} rows={2} className="md-textarea" /></FF>
          </div>
        </Sec>

        {/* MFA Methods */}
        <div className="md-card" style={{ overflow: 'hidden', marginBottom: 12, padding: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
          }}>
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              3. MFA Methods
            </span>
            <button type="button" onClick={() => setMfaMethods(prev => [...prev, { ...BLANK_MFA }])} className="md-btn md-btn-tonal md-btn-sm">
              <span className="icon icon-sm">add</span>Add MFA
            </button>
          </div>
          <div style={{ padding: mfaMethods.length ? '4px 20px 20px' : '0 20px 20px', borderTop: '1px solid var(--border)' }}>
            {mfaMethods.length === 0 && (
              <div style={{ padding: '16px 0', color: 'var(--text-3)', fontSize: 14 }}>
                No MFA methods — click Add MFA to configure
              </div>
            )}
            {mfaMethods.map((m, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginTop: 12, position: 'relative' }}>
                <button type="button" onClick={() => setMfaMethods(prev => prev.filter((_, idx) => idx !== i))} style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-2)',
                }}>
                  <span className="icon icon-sm">delete</span>
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingRight: 32 }}>
                  <FF label="Type"><select value={m.type} onChange={e => updateMfa(i, 'type', e.target.value)} className="md-select">{MFA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></FF>
                  <FF label="App Name"><input value={m.app_name} onChange={e => updateMfa(i, 'app_name', e.target.value)} placeholder="e.g. Microsoft Authenticator" className="md-input" /></FF>
                  <FF label="Person Name"><input value={m.person_name} onChange={e => updateMfa(i, 'person_name', e.target.value)} className="md-input" /></FF>
                  <FF label="Person Email"><input type="email" value={m.person_email} onChange={e => updateMfa(i, 'person_email', e.target.value)} className="md-input" /></FF>
                  <FF label="Phone"><input type="tel" value={m.phone} onChange={e => updateMfa(i, 'phone', e.target.value)} className="md-input" /></FF>
                  <FF label="Notes"><input value={m.notes} onChange={e => updateMfa(i, 'notes', e.target.value)} className="md-input" /></FF>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Authorized Users — overflow visible so the directory picker dropdown isn't clipped */}
        <div className="md-card" style={{ marginBottom: 12, padding: 0 }}>
          <div style={{ padding: '16px 20px', borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}>
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              4. Authorized Users
            </span>
          </div>
          <div style={{ padding: '4px 20px 20px', borderTop: '1px solid var(--border)' }}>
            <AuthorizedUsersEditor users={authUsers} onChange={setAuthUsers} />
          </div>
        </div>

        <Sec title="5. Account Details" defaultOpen={false}>
          <FF label="Account Display Name"><TI name="account_display_name" value={form.account_display_name} onChange={handleChange} /></FF>
          <FF label="Account ID"><TI name="account_id" value={form.account_id} onChange={handleChange} /></FF>
          <FF label="License Type"><TI name="license_type" value={form.license_type} onChange={handleChange} /></FF>
          <FF label="Plan Tier"><TI name="plan_tier" value={form.plan_tier} onChange={handleChange} /></FF>
          <FF label="Subscription Start"><TI name="subscription_start" value={form.subscription_start} onChange={handleChange} type="date" /></FF>
          <FF label="Subscription End"><TI name="subscription_end" value={form.subscription_end} onChange={handleChange} type="date" /></FF>
          <FF label="Auto Renewal"><SI name="auto_renewal" value={form.auto_renewal} onChange={handleChange} options={AUTO_RENEWALS} /></FF>
          <FF label="Monthly Cost"><TI name="monthly_cost" value={form.monthly_cost} onChange={handleChange} type="number" placeholder="0.00" /></FF>
          <FF label="Billing Cycle"><SI name="billing_cycle" value={form.billing_cycle} onChange={handleChange} options={BILLING_CYCLES} placeholder="Select…" /></FF>
          <FF label="Billing Email"><TI name="billing_email" value={form.billing_email} onChange={handleChange} type="email" /></FF>
          <FF label="Payment Reference"><TI name="payment_reference" value={form.payment_reference} onChange={handleChange} /></FF>
        </Sec>

        <Sec title="6. Technical / API" defaultOpen={false}>
          <FF label="Access Level"><SI name="access_level" value={form.access_level} onChange={handleChange} options={ACCESS_LEVELS} placeholder="Select…" /></FF>
          <FF label="Linked Credential ID"><TI name="linked_credential_id" value={form.linked_credential_id} onChange={handleChange} /></FF>
          <SecretEdit name="api_key" label="API Key" hasValue={cred.has_api_key} enabled={chAk} value={newAk} onToggle={() => setChAk(v => !v)} onChange={e => setNewAk(e.target.value)} />
          <SecretEdit name="api_secret" label="API Secret" hasValue={cred.has_api_secret} enabled={chAs} value={newAs} onToggle={() => setChAs(v => !v)} onChange={e => setNewAs(e.target.value)} />
          <FF label="Client ID"><TI name="client_id" value={form.client_id} onChange={handleChange} /></FF>
          <SecretEdit name="client_secret" label="Client Secret" hasValue={cred.has_client_secret} enabled={chCs} value={newCs} onToggle={() => setChCs(v => !v)} onChange={e => setNewCs(e.target.value)} />
          <FF label="Tenant ID (App)"><TI name="tenant_id_app" value={form.tenant_id_app} onChange={handleChange} /></FF>
          <FF label="Azure Subscription ID"><TI name="subscription_id_azure" value={form.subscription_id_azure} onChange={handleChange} /></FF>
          <FF label="Server Hostname"><TI name="server_hostname" value={form.server_hostname} onChange={handleChange} /></FF>
          <FF label="Port"><TI name="port" value={form.port} onChange={handleChange} type="number" /></FF>
          <FF label="Protocol"><SI name="protocol" value={form.protocol} onChange={handleChange} options={PROTOCOLS} placeholder="Select…" /></FF>
          <FF label="Database Name"><TI name="database_name" value={form.database_name} onChange={handleChange} /></FF>
        </Sec>

        <Sec title="7. Ownership & Tracking" defaultOpen={false}>
          <FF label="Managed By"><TI name="managed_by" value={form.managed_by} onChange={handleChange} /></FF>
          <FF label="Managed By Email"><TI name="managed_by_email" value={form.managed_by_email} onChange={handleChange} type="email" /></FF>
          <FF label="Last Verified Date"><TI name="last_verified_date" value={form.last_verified_date} onChange={handleChange} type="date" /></FF>
          <FF label="Last Password Changed"><TI name="last_password_changed" value={form.last_password_changed} onChange={handleChange} type="date" /></FF>
          <FF label="Password Expiry Date"><TI name="password_expiry_date" value={form.password_expiry_date} onChange={handleChange} type="date" /></FF>
          <FF label="Next Review Date"><TI name="next_review_date" value={form.next_review_date} onChange={handleChange} type="date" /></FF>
          <FF label="Tags"><TI name="tags" value={form.tags} onChange={handleChange} placeholder="comma, separated, tags" /></FF>
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Notes"><textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className="md-textarea" /></FF>
          </div>
        </Sec>
      </form>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => formRef.current?.requestSubmit()} disabled={submitting} className="md-btn md-btn-primary">
            {submitting ? 'Saving…' : <><span className="icon icon-sm">save</span>Save changes</>}
          </button>
          <button type="button" onClick={() => navigate(`/credential/${id}`)} className="md-btn md-btn-text">Cancel</button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>Ctrl+S to save</span>
        </div>
      </div>
    </div>
  )
}
