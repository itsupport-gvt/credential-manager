import { useEffect, useState, type ChangeEvent, type ReactNode, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Credential, Tenant, Category } from '../lib/types'

const STATUSES    = ['Active', 'Inactive', 'Expired', 'Compromised', 'Archived']
const PRIORITIES  = ['Critical', 'High', 'Medium', 'Low']
const ENVIRONMENTS = ['Production', 'Staging', 'Development', 'Testing', 'DR']
const MFA_TYPES   = ['TOTP', 'SMS', 'Email', 'Hardware Key', 'Push', 'Biometric', 'Other']
const ACCESS_LEVELS = ['Admin', 'Owner', 'Member', 'Viewer', 'Read-Only', 'Service Account']
const PROTOCOLS   = ['HTTPS', 'HTTP', 'SFTP', 'FTP', 'SSH', 'RDP', 'MySQL', 'PostgreSQL', 'MSSQL', 'Other']
const BILLING_CYCLES = ['Monthly', 'Annual', 'Quarterly', 'Bi-Annual', 'One-Time']
const AUTO_RENEWALS  = ['Yes', 'No', 'Unknown']

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
  return <input type={type} name={name} value={value ?? ''} onChange={onChange} placeholder={placeholder} required={required} style={inp} />
}
function SI({ name, value, onChange, options, placeholder }: { name: string; value: string; onChange: (e: ChangeEvent<HTMLSelectElement>) => void; options: string[]; placeholder?: string }) {
  return <select name={name} value={value ?? ''} onChange={onChange} style={inp}>{placeholder && <option value="">{placeholder}</option>}{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
}
function SecretEdit({ name, label, hasValue, enabled, value, onToggle, onChange }: { name: string; label: string; hasValue: boolean; enabled: boolean; value: string; onToggle: () => void; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="md-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: enabled ? 8 : 0 }}>
        <input type="checkbox" id={`chg_${name}`} checked={enabled} onChange={onToggle} style={{ width: 14, height: 14, cursor: 'pointer' }} />
        <label htmlFor={`chg_${name}`} style={{ fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>{hasValue ? 'Change existing value' : 'Set a value'}</label>
      </div>
      {enabled ? (
        <div style={{ position: 'relative' }}>
          <input type={show ? 'text' : 'password'} name={name} value={value} onChange={onChange} placeholder="Enter new value…" style={{ ...inp, paddingRight: 70 }} />
          <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span className="icon icon-sm">{show ? 'visibility_off' : 'visibility'}</span>{show ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : hasValue ? <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '4px 0' }}>Value set (encrypted)</div> : null}
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

type FormFields = Omit<Credential, 'id' | 'has_password' | 'has_api_key' | 'has_api_secret' | 'has_client_secret' | 'monthly_cost'> & { monthly_cost: string }

export default function EditCredentialPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [cred, setCred] = useState<Credential | null>(null)
  const [form, setForm] = useState<FormFields | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const [chPw, setChPw] = useState(false); const [newPw, setNewPw] = useState('')
  const [chAk, setChAk] = useState(false); const [newAk, setNewAk] = useState('')
  const [chAs, setChAs] = useState(false); const [newAs, setNewAs] = useState('')
  const [chCs, setChCs] = useState(false); const [newCs, setNewCs] = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([api.getCredential(id), api.listTenants(), api.listCategories()])
      .then(([c, t, cats]) => {
        setCred(c); setTenants(t); setCategories(cats)
        setForm({ ...c, monthly_cost: c.monthly_cost != null ? String(c.monthly_cost) : '' } as unknown as FormFields)
      })
      .catch((e: unknown) => setErrors([e instanceof Error ? e.message : 'Failed to load']))
      .finally(() => setLoading(false))
  }, [id])

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(f => f ? { ...f, [e.target.name]: e.target.value } : f)
  }

  const subcategories = categories.find(c => c.category_name === form?.category)?.subcategories ?? []

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
    const payload: Record<string, unknown> = { ...form, monthly_cost: form.monthly_cost ? parseFloat(form.monthly_cost) : 0, last_updated_by: 'Current User', last_updated_date: new Date().toISOString().split('T')[0] }
    if (chPw && newPw) payload.password = newPw
    if (chAk && newAk) payload.api_key = newAk
    if (chAs && newAs) payload.api_secret = newAs
    if (chCs && newCs) payload.client_secret = newCs
    try { await api.updateCredential(id, payload); navigate(`/credential/${id}`) }
    catch (err) { setErrors([err instanceof Error ? err.message : 'Update failed']) }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 28, width: 280, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />)}
    </div>
  )

  if (!form || !cred) return (
    <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c3', color: 'var(--danger)', padding: '12px 16px', borderRadius: 10, fontSize: 14 }}>
      {errors.join(', ') || 'Failed to load credential'}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button onClick={() => navigate(`/credential/${id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: 0, marginBottom: 10 }}>
          <span className="icon icon-sm">arrow_back</span>Back to Credential
        </button>
        <div className="page-title">Edit: {cred.service_name}</div>
        <div className="page-subtitle" style={{ fontFamily: 'monospace', fontSize: 12 }}>{cred.credential_id}</div>
      </div>

      {errors.length > 0 && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c3', color: 'var(--danger)', padding: '12px 16px', borderRadius: 10, fontSize: 13 }}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Sec title="1. Core Identity">
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
          <FF label="Service URL"><TI name="service_url" value={form.service_url} onChange={handleChange} type="url" /></FF>
          <FF label="Environment"><SI name="environment" value={form.environment} onChange={handleChange} options={ENVIRONMENTS} /></FF>
          <FF label="Status" required><SI name="status" value={form.status} onChange={handleChange} options={STATUSES} /></FF>
          <FF label="Priority" required><SI name="priority" value={form.priority} onChange={handleChange} options={PRIORITIES} /></FF>
        </Sec>

        <Sec title="2. Authentication">
          <FF label="Username / Email" required><TI name="username_email" value={form.username_email} onChange={handleChange} required /></FF>
          <SecretEdit name="password" label="Password" hasValue={cred.has_password} enabled={chPw} value={newPw} onToggle={() => setChPw(v => !v)} onChange={e => setNewPw(e.target.value)} />
          <FF label="Recovery Email"><TI name="recovery_email" value={form.recovery_email} onChange={handleChange} type="email" /></FF>
          <FF label="Recovery Phone"><TI name="recovery_phone" value={form.recovery_phone} onChange={handleChange} type="tel" /></FF>
          <FF label="MFA Enabled"><SI name="mfa_enabled" value={form.mfa_enabled} onChange={handleChange} options={['Yes', 'No']} /></FF>
          {form.mfa_enabled === 'Yes' && <>
            <FF label="MFA Type"><SI name="mfa_type" value={form.mfa_type} onChange={handleChange} options={MFA_TYPES} placeholder="Select…" /></FF>
            <FF label="MFA App Name"><TI name="mfa_app_name" value={form.mfa_app_name} onChange={handleChange} /></FF>
            <FF label="Backup Codes Location"><TI name="backup_codes_location" value={form.backup_codes_location} onChange={handleChange} /></FF>
          </>}
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Security Notes"><textarea name="security_notes" value={form.security_notes} onChange={handleChange} rows={2} style={{ ...inp, resize: 'vertical' }} /></FF>
          </div>
        </Sec>

        <Sec title="3. Account Details" defaultOpen={false}>
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

        <Sec title="4. Technical / API" defaultOpen={false}>
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

        <Sec title="5. Ownership & Tracking" defaultOpen={false}>
          <FF label="Managed By"><TI name="managed_by" value={form.managed_by} onChange={handleChange} /></FF>
          <FF label="Managed By Email"><TI name="managed_by_email" value={form.managed_by_email} onChange={handleChange} type="email" /></FF>
          <FF label="Last Verified Date"><TI name="last_verified_date" value={form.last_verified_date} onChange={handleChange} type="date" /></FF>
          <FF label="Last Password Changed"><TI name="last_password_changed" value={form.last_password_changed} onChange={handleChange} type="date" /></FF>
          <FF label="Password Expiry Date"><TI name="password_expiry_date" value={form.password_expiry_date} onChange={handleChange} type="date" /></FF>
          <FF label="Next Review Date"><TI name="next_review_date" value={form.next_review_date} onChange={handleChange} type="date" /></FF>
          <FF label="Tags"><TI name="tags" value={form.tags} onChange={handleChange} placeholder="comma, separated, tags" /></FF>
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Notes"><textarea name="notes" value={form.notes} onChange={handleChange} rows={3} style={{ ...inp, resize: 'vertical' }} /></FF>
          </div>
        </Sec>

        <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button type="submit" disabled={submitting} className="md-btn md-btn-primary">
            {submitting ? 'Saving…' : <><span className="icon icon-sm">save</span>Save Changes</>}
          </button>
          <button type="button" onClick={() => navigate(`/credential/${id}`)} className="md-btn md-btn-outlined">Cancel</button>
        </div>
      </form>
    </div>
  )
}
