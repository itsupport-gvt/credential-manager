import { useEffect, useState, type ChangeEvent, type ReactNode, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Tenant, Category, AuthorizedUser, MfaMethod } from '../lib/types'

const STATUSES         = ['Active', 'Inactive', 'Expired', 'Compromised', 'Archived']
const PRIORITIES       = ['Critical', 'High', 'Medium', 'Low']
const ENVIRONMENTS     = ['Production', 'Staging', 'Development', 'Testing', 'DR']
const CRED_TYPES       = ['Password', 'OTP-Only', 'API Key', 'OAuth2', 'Database', 'SSH', 'License Key', 'Certificate', 'Custom']
const MFA_TYPES        = ['TOTP', 'SMS', 'Email', 'Hardware Key', 'Passkey', 'Push', 'Biometric', 'Other']
const MFA_ACCESS_LEVELS = ['Read', 'Write', 'Admin']
const ACCESS_LEVELS    = ['Admin', 'Owner', 'Member', 'Viewer', 'Read-Only', 'Service Account']
const PROTOCOLS        = ['HTTPS', 'HTTP', 'SFTP', 'FTP', 'SSH', 'RDP', 'MySQL', 'PostgreSQL', 'MSSQL', 'Other']
const BILLING_CYCLES   = ['Monthly', 'Annual', 'Quarterly', 'Bi-Annual', 'One-Time']
const AUTO_RENEWALS    = ['Yes', 'No', 'Unknown']

const BLANK_MFA: MfaMethod = { type: 'TOTP', app_name: '', person_name: '', person_email: '', phone: '', notes: '' }
const BLANK_USER: AuthorizedUser = { name: '', email: '', access_level: 'Read', notes: '' }

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', fontFamily: 'Roboto, sans-serif' }

function FF({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="md-label">{label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}</label>
      {children}
    </div>
  )
}

function TI({ name, value, onChange, placeholder, required, type = 'text' }: { name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; placeholder?: string; required?: boolean; type?: string }) {
  return <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} style={inp} />
}

function SI({ name, value, onChange, options, placeholder }: { name: string; value: string; onChange: (e: ChangeEvent<HTMLSelectElement>) => void; options: string[]; placeholder?: string }) {
  return (
    <select name={name} value={value} onChange={onChange} style={inp}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function PI({ name, value, onChange, placeholder }: { name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} name={name} value={value} onChange={onChange} placeholder={placeholder ?? '(leave blank to skip)'} style={{ ...inp, paddingRight: 70 }} />
      <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
        <span className="icon icon-sm">{show ? 'visibility_off' : 'visibility'}</span>{show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

function Sec({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)' }}>{title}</span>
        <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && <div style={{ padding: '16px', background: 'var(--surface)' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div></div>}
    </div>
  )
}

interface FS {
  tenant_code: string; tenant_name: string; category: string; subcategory: string
  service_name: string; service_url: string; environment: string; status: string; priority: string
  credential_type: string
  username_email: string; password: string; recovery_email: string; recovery_phone: string
  backup_codes_location: string; security_notes: string
  account_display_name: string; account_id: string; license_type: string; plan_tier: string
  subscription_start: string; subscription_end: string; auto_renewal: string; monthly_cost: string
  billing_cycle: string; billing_email: string; payment_reference: string
  access_level: string; linked_credential_id: string; api_key: string; api_secret: string
  client_id: string; client_secret: string; tenant_id_app: string; subscription_id_azure: string
  server_hostname: string; port: string; protocol: string; database_name: string
  managed_by: string; managed_by_email: string; created_by: string; created_date: string; tags: string; notes: string
}

const today = () => new Date().toISOString().split('T')[0]

const EMPTY: FS = {
  tenant_code: '', tenant_name: '', category: '', subcategory: '', service_name: '', service_url: '', environment: 'Production', status: 'Active', priority: 'Medium',
  credential_type: 'Password',
  username_email: '', password: '', recovery_email: '', recovery_phone: '', backup_codes_location: '', security_notes: '',
  account_display_name: '', account_id: '', license_type: '', plan_tier: '', subscription_start: '', subscription_end: '', auto_renewal: 'No', monthly_cost: '', billing_cycle: '', billing_email: '', payment_reference: '',
  access_level: '', linked_credential_id: '', api_key: '', api_secret: '', client_id: '', client_secret: '', tenant_id_app: '', subscription_id_azure: '', server_hostname: '', port: '', protocol: '', database_name: '',
  managed_by: 'Current User', managed_by_email: '', created_by: 'Current User', created_date: today(), tags: '', notes: '',
}

export default function NewCredentialPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FS>(EMPTY)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([])
  const [authUsers, setAuthUsers] = useState<AuthorizedUser[]>([])

  useEffect(() => {
    api.listTenants().then(setTenants).catch(() => {})
    api.listCategories().then(setCategories).catch(() => {})
  }, [])

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'tenant_code') { const t = tenants.find(x => x.tenant_code === value); if (t) next.tenant_name = t.tenant_name }
      if (name === 'category') next.subcategory = ''
      return next
    })
  }

  const subcategories = categories.find(c => c.category_name === form.category)?.subcategories ?? []

  function validate() {
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
    const payload: Record<string, unknown> = {
      ...form,
      monthly_cost: form.monthly_cost ? parseFloat(form.monthly_cost) : 0,
      authorized_users: authUsers,
      mfa_methods: mfaMethods,
    }
    for (const s of ['password', 'api_key', 'api_secret', 'client_secret']) { if (!payload[s]) delete payload[s] }
    try {
      const c = await api.createCredential(payload as Parameters<typeof api.createCredential>[0])
      navigate(`/credential/${c.credential_id}`)
    } catch (err) { setErrors([err instanceof Error ? err.message : 'Failed']) }
    finally { setSubmitting(false) }
  }

  function updateMfa(i: number, field: keyof MfaMethod, val: string) {
    setMfaMethods(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m))
  }
  function updateUser(i: number, field: keyof AuthorizedUser, val: string) {
    setAuthUsers(prev => prev.map((u, idx) => idx === i ? { ...u, [field]: val } : u))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button onClick={() => navigate('/credentials')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: 0, marginBottom: 10 }}>
          <span className="icon icon-sm">arrow_back</span>Back to Credentials
        </button>
        <div className="page-title">New Credential</div>
        <div className="page-subtitle">Fill in the details to create a new credential record</div>
      </div>

      {errors.length > 0 && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c3', color: 'var(--danger)', padding: '12px 16px', borderRadius: 10, fontSize: 13 }}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Sec title="1. Core Identity">
          <FF label="Credential Type" required><SI name="credential_type" value={form.credential_type} onChange={handleChange} options={CRED_TYPES} /></FF>
          <FF label="Tenant" required>
            <select name="tenant_code" value={form.tenant_code} onChange={handleChange} style={inp}>
              <option value="">Select tenant…</option>
              {tenants.map(t => <option key={t.tenant_code} value={t.tenant_code}>{t.tenant_name} ({t.tenant_code})</option>)}
            </select>
          </FF>
          <FF label="Category" required>
            <select name="category" value={form.category} onChange={handleChange} style={inp}>
              <option value="">Select category…</option>
              {categories.map(c => <option key={c.category_id} value={c.category_name}>{c.category_name}</option>)}
            </select>
          </FF>
          <FF label="Subcategory">
            {subcategories.length > 0
              ? <SI name="subcategory" value={form.subcategory} onChange={handleChange} options={subcategories} placeholder="Select…" />
              : <TI name="subcategory" value={form.subcategory} onChange={handleChange} />}
          </FF>
          <FF label="Service Name" required><TI name="service_name" value={form.service_name} onChange={handleChange} required /></FF>
          <FF label="Service URL"><TI name="service_url" value={form.service_url} onChange={handleChange} type="url" placeholder="https://" /></FF>
          <FF label="Environment"><SI name="environment" value={form.environment} onChange={handleChange} options={ENVIRONMENTS} /></FF>
          <FF label="Status" required><SI name="status" value={form.status} onChange={handleChange} options={STATUSES} /></FF>
          <FF label="Priority" required><SI name="priority" value={form.priority} onChange={handleChange} options={PRIORITIES} /></FF>
        </Sec>

        <Sec title="2. Authentication">
          <FF label="Username / Email" required><TI name="username_email" value={form.username_email} onChange={handleChange} required /></FF>
          <FF label="Password"><PI name="password" value={form.password} onChange={handleChange} /></FF>
          <FF label="Recovery Email"><TI name="recovery_email" value={form.recovery_email} onChange={handleChange} type="email" /></FF>
          <FF label="Recovery Phone"><TI name="recovery_phone" value={form.recovery_phone} onChange={handleChange} type="tel" /></FF>
          <FF label="Backup Codes Location"><TI name="backup_codes_location" value={form.backup_codes_location} onChange={handleChange} /></FF>
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Security Notes"><textarea name="security_notes" value={form.security_notes} onChange={handleChange} rows={2} style={{ ...inp, resize: 'vertical' }} /></FF>
          </div>
        </Sec>

        {/* MFA Methods */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)' }}>3. MFA Methods</span>
            <button type="button" onClick={() => setMfaMethods(prev => [...prev, { ...BLANK_MFA }])} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-bg)', color: 'var(--primary)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              <span className="icon icon-sm">add</span>Add MFA
            </button>
          </div>
          <div style={{ padding: mfaMethods.length ? '12px 16px' : '0', background: 'var(--surface)' }}>
            {mfaMethods.length === 0 && <div style={{ padding: '12px 16px', color: 'var(--text-3)', fontSize: 13 }}>No MFA methods — click Add MFA to configure</div>}
            {mfaMethods.map((m, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 10, position: 'relative' }}>
                <button type="button" onClick={() => setMfaMethods(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center' }}>
                  <span className="icon icon-sm">delete</span>
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FF label="Type"><select value={m.type} onChange={e => updateMfa(i, 'type', e.target.value)} style={inp}>{MFA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></FF>
                  <FF label="App Name"><input value={m.app_name} onChange={e => updateMfa(i, 'app_name', e.target.value)} placeholder="e.g. Microsoft Authenticator" style={inp} /></FF>
                  <FF label="Person Name"><input value={m.person_name} onChange={e => updateMfa(i, 'person_name', e.target.value)} style={inp} /></FF>
                  <FF label="Person Email"><input type="email" value={m.person_email} onChange={e => updateMfa(i, 'person_email', e.target.value)} style={inp} /></FF>
                  <FF label="Phone"><input type="tel" value={m.phone} onChange={e => updateMfa(i, 'phone', e.target.value)} style={inp} /></FF>
                  <FF label="Notes"><input value={m.notes} onChange={e => updateMfa(i, 'notes', e.target.value)} style={inp} /></FF>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Authorized Users */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)' }}>4. Authorized Users</span>
            <button type="button" onClick={() => setAuthUsers(prev => [...prev, { ...BLANK_USER }])} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-bg)', color: 'var(--primary)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              <span className="icon icon-sm">add</span>Add User
            </button>
          </div>
          <div style={{ padding: authUsers.length ? '12px 16px' : '0', background: 'var(--surface)' }}>
            {authUsers.length === 0 && <div style={{ padding: '12px 16px', color: 'var(--text-3)', fontSize: 13 }}>No authorized users — click Add User to configure access</div>}
            {authUsers.map((u, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 10, position: 'relative' }}>
                <button type="button" onClick={() => setAuthUsers(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center' }}>
                  <span className="icon icon-sm">delete</span>
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FF label="Name"><input value={u.name} onChange={e => updateUser(i, 'name', e.target.value)} style={inp} /></FF>
                  <FF label="Email"><input type="email" value={u.email} onChange={e => updateUser(i, 'email', e.target.value)} style={inp} /></FF>
                  <FF label="Access Level"><select value={u.access_level} onChange={e => updateUser(i, 'access_level', e.target.value)} style={inp}>{MFA_ACCESS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select></FF>
                  <FF label="Notes"><input value={u.notes} onChange={e => updateUser(i, 'notes', e.target.value)} style={inp} /></FF>
                </div>
              </div>
            ))}
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
          <FF label="API Key"><PI name="api_key" value={form.api_key} onChange={handleChange} /></FF>
          <FF label="API Secret"><PI name="api_secret" value={form.api_secret} onChange={handleChange} /></FF>
          <FF label="Client ID"><TI name="client_id" value={form.client_id} onChange={handleChange} /></FF>
          <FF label="Client Secret"><PI name="client_secret" value={form.client_secret} onChange={handleChange} /></FF>
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
          <FF label="Created By"><TI name="created_by" value={form.created_by} onChange={handleChange} /></FF>
          <FF label="Created Date"><TI name="created_date" value={form.created_date} onChange={handleChange} type="date" /></FF>
          <FF label="Tags"><TI name="tags" value={form.tags} onChange={handleChange} placeholder="comma, separated, tags" /></FF>
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Notes"><textarea name="notes" value={form.notes} onChange={handleChange} rows={3} style={{ ...inp, resize: 'vertical' }} /></FF>
          </div>
        </Sec>

        <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button type="submit" disabled={submitting} className="md-btn md-btn-primary">
            {submitting ? 'Creating…' : <><span className="icon icon-sm">save</span>Create Credential</>}
          </button>
          <button type="button" onClick={() => navigate('/credentials')} className="md-btn md-btn-outlined">Cancel</button>
        </div>
      </form>
    </div>
  )
}
