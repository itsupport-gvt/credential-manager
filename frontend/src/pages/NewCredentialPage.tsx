import { useEffect, useState, type ChangeEvent, type ReactNode, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Tenant, Category } from '../lib/types'

const STATUSES = ['Active', 'Inactive', 'Expired', 'Compromised', 'Archived']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const ENVIRONMENTS = ['Production', 'Staging', 'Development', 'Testing', 'DR']
const MFA_TYPES = ['TOTP', 'SMS', 'Email', 'Hardware Key', 'Push', 'Biometric', 'Other']
const ACCESS_LEVELS = ['Admin', 'Owner', 'Member', 'Viewer', 'Read-Only', 'Service Account']
const PROTOCOLS = ['HTTPS', 'HTTP', 'SFTP', 'FTP', 'SSH', 'RDP', 'MySQL', 'PostgreSQL', 'MSSQL', 'Other']
const BILLING_CYCLES = ['Monthly', 'Annual', 'Quarterly', 'Bi-Annual', 'One-Time']
const AUTO_RENEWALS = ['Yes', 'No', 'Unknown']

interface FormState {
  // Core Identity
  tenant_code: string
  tenant_name: string
  category: string
  subcategory: string
  service_name: string
  service_url: string
  environment: string
  status: string
  priority: string
  // Authentication
  username_email: string
  password: string
  recovery_email: string
  recovery_phone: string
  mfa_enabled: string
  mfa_type: string
  mfa_app_name: string
  backup_codes_location: string
  security_notes: string
  // Account Details
  account_display_name: string
  account_id: string
  license_type: string
  plan_tier: string
  subscription_start: string
  subscription_end: string
  auto_renewal: string
  monthly_cost: string
  billing_cycle: string
  billing_email: string
  payment_reference: string
  // Technical / API
  access_level: string
  linked_credential_id: string
  api_key: string
  api_secret: string
  client_id: string
  client_secret: string
  tenant_id_app: string
  subscription_id_azure: string
  server_hostname: string
  port: string
  protocol: string
  database_name: string
  // Ownership
  managed_by: string
  managed_by_email: string
  created_by: string
  created_date: string
  last_updated_by: string
  last_updated_date: string
  tags: string
  notes: string
}

function today() {
  return new Date().toISOString().split('T')[0]
}

const EMPTY_FORM: FormState = {
  tenant_code: '', tenant_name: '', category: '', subcategory: '',
  service_name: '', service_url: '', environment: 'Production',
  status: 'Active', priority: 'Medium',
  username_email: '', password: '', recovery_email: '', recovery_phone: '',
  mfa_enabled: 'No', mfa_type: '', mfa_app_name: '', backup_codes_location: '', security_notes: '',
  account_display_name: '', account_id: '', license_type: '', plan_tier: '',
  subscription_start: '', subscription_end: '', auto_renewal: 'No',
  monthly_cost: '', billing_cycle: '', billing_email: '', payment_reference: '',
  access_level: '', linked_credential_id: '', api_key: '', api_secret: '',
  client_id: '', client_secret: '', tenant_id_app: '', subscription_id_azure: '',
  server_hostname: '', port: '', protocol: '', database_name: '',
  managed_by: 'Current User', managed_by_email: '',
  created_by: 'Current User', created_date: today(),
  last_updated_by: 'Current User', last_updated_date: today(),
  tags: '', notes: '',
}

interface FieldProps {
  label: string
  required?: boolean
  children: ReactNode
}

function FormField({ label, required, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500'

function TextInput({
  name, value, onChange, placeholder, required, type = 'text',
}: {
  name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; required?: boolean; type?: string
}) {
  return (
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className={inputCls}
    />
  )
}

function SelectInput({
  name, value, onChange, options, placeholder,
}: {
  name: string; value: string; onChange: (e: ChangeEvent<HTMLSelectElement>) => void
  options: string[]; placeholder?: string
}) {
  return (
    <select name={name} value={value} onChange={onChange} className={inputCls}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function PasswordInput({
  name, value, onChange, placeholder,
}: {
  name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? '(leave blank to not set)'}
        className={inputCls + ' pr-16'}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

function FormSection({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-white dark:bg-gray-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
        </div>
      )}
    </div>
  )
}

export default function NewCredentialPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    api.listTenants().then(setTenants).catch(() => {})
    api.listCategories().then(setCategories).catch(() => {})
  }, [])

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (name === 'category') {
      setForm((f) => ({ ...f, category: value, subcategory: '' }))
    }
    if (name === 'tenant_code') {
      const tenant = tenants.find((t) => t.tenant_code === value)
      if (tenant) setForm((f) => ({ ...f, tenant_code: value, tenant_name: tenant.tenant_name }))
    }
  }

  const subcategories =
    categories.find((c) => c.category_name === form.category)?.subcategories ?? []

  function validate(): string[] {
    const errs: string[] = []
    if (!form.tenant_code) errs.push('Tenant is required')
    if (!form.category) errs.push('Category is required')
    if (!form.service_name) errs.push('Service Name is required')
    if (!form.status) errs.push('Status is required')
    if (!form.priority) errs.push('Priority is required')
    if (!form.username_email) errs.push('Username / Email is required')
    return errs
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)

    const payload: Record<string, unknown> = { ...form }
    if (form.monthly_cost !== '') payload.monthly_cost = parseFloat(form.monthly_cost)
    else payload.monthly_cost = 0
    // Only include secrets if non-empty
    const secrets = ['password', 'api_key', 'api_secret', 'client_secret']
    for (const s of secrets) {
      if (!payload[s]) delete payload[s]
    }

    try {
      const created = await api.createCredential(payload as Parameters<typeof api.createCredential>[0])
      navigate(`/credential/${created.credential_id}`)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to create credential'])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/credentials')}
          className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 flex items-center gap-1"
        >
          ← Back to Credentials
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">New Credential</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Fill in the details to create a new credential record
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
          <ul className="list-disc list-inside text-sm space-y-1">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 1. Core Identity */}
        <FormSection title="1. Core Identity">
          <FormField label="Tenant" required>
            <SelectInput
              name="tenant_code"
              value={form.tenant_code}
              onChange={handleChange}
              options={tenants.map((t) => t.tenant_code)}
              placeholder="Select tenant…"
            />
          </FormField>
          <FormField label="Category" required>
            <SelectInput
              name="category"
              value={form.category}
              onChange={handleChange}
              options={categories.map((c) => c.category_name)}
              placeholder="Select category…"
            />
          </FormField>
          <FormField label="Subcategory">
            {subcategories.length > 0 ? (
              <SelectInput
                name="subcategory"
                value={form.subcategory}
                onChange={handleChange}
                options={subcategories}
                placeholder="Select subcategory…"
              />
            ) : (
              <TextInput name="subcategory" value={form.subcategory} onChange={handleChange} />
            )}
          </FormField>
          <FormField label="Service Name" required>
            <TextInput name="service_name" value={form.service_name} onChange={handleChange} required />
          </FormField>
          <FormField label="Service URL">
            <TextInput name="service_url" value={form.service_url} onChange={handleChange} type="url" placeholder="https://" />
          </FormField>
          <FormField label="Environment">
            <SelectInput name="environment" value={form.environment} onChange={handleChange} options={ENVIRONMENTS} />
          </FormField>
          <FormField label="Status" required>
            <SelectInput name="status" value={form.status} onChange={handleChange} options={STATUSES} />
          </FormField>
          <FormField label="Priority" required>
            <SelectInput name="priority" value={form.priority} onChange={handleChange} options={PRIORITIES} />
          </FormField>
        </FormSection>

        {/* 2. Authentication */}
        <FormSection title="2. Authentication">
          <FormField label="Username / Email" required>
            <TextInput name="username_email" value={form.username_email} onChange={handleChange} required />
          </FormField>
          <FormField label="Password">
            <PasswordInput name="password" value={form.password} onChange={handleChange} />
          </FormField>
          <FormField label="Recovery Email">
            <TextInput name="recovery_email" value={form.recovery_email} onChange={handleChange} type="email" />
          </FormField>
          <FormField label="Recovery Phone">
            <TextInput name="recovery_phone" value={form.recovery_phone} onChange={handleChange} type="tel" />
          </FormField>
          <FormField label="MFA Enabled">
            <SelectInput name="mfa_enabled" value={form.mfa_enabled} onChange={handleChange} options={['Yes', 'No']} />
          </FormField>
          {form.mfa_enabled === 'Yes' && (
            <>
              <FormField label="MFA Type">
                <SelectInput name="mfa_type" value={form.mfa_type} onChange={handleChange} options={MFA_TYPES} placeholder="Select type…" />
              </FormField>
              <FormField label="MFA App Name">
                <TextInput name="mfa_app_name" value={form.mfa_app_name} onChange={handleChange} />
              </FormField>
              <FormField label="Backup Codes Location">
                <TextInput name="backup_codes_location" value={form.backup_codes_location} onChange={handleChange} />
              </FormField>
            </>
          )}
          <FormField label="Security Notes">
            <textarea
              name="security_notes"
              value={form.security_notes}
              onChange={handleChange}
              rows={2}
              className={inputCls}
            />
          </FormField>
        </FormSection>

        {/* 3. Account Details */}
        <FormSection title="3. Account Details" defaultOpen={false}>
          <FormField label="Account Display Name">
            <TextInput name="account_display_name" value={form.account_display_name} onChange={handleChange} />
          </FormField>
          <FormField label="Account ID">
            <TextInput name="account_id" value={form.account_id} onChange={handleChange} />
          </FormField>
          <FormField label="License Type">
            <TextInput name="license_type" value={form.license_type} onChange={handleChange} />
          </FormField>
          <FormField label="Plan Tier">
            <TextInput name="plan_tier" value={form.plan_tier} onChange={handleChange} />
          </FormField>
          <FormField label="Subscription Start">
            <TextInput name="subscription_start" value={form.subscription_start} onChange={handleChange} type="date" />
          </FormField>
          <FormField label="Subscription End">
            <TextInput name="subscription_end" value={form.subscription_end} onChange={handleChange} type="date" />
          </FormField>
          <FormField label="Auto Renewal">
            <SelectInput name="auto_renewal" value={form.auto_renewal} onChange={handleChange} options={AUTO_RENEWALS} />
          </FormField>
          <FormField label="Monthly Cost">
            <TextInput name="monthly_cost" value={form.monthly_cost} onChange={handleChange} type="number" placeholder="0.00" />
          </FormField>
          <FormField label="Billing Cycle">
            <SelectInput name="billing_cycle" value={form.billing_cycle} onChange={handleChange} options={BILLING_CYCLES} placeholder="Select…" />
          </FormField>
          <FormField label="Billing Email">
            <TextInput name="billing_email" value={form.billing_email} onChange={handleChange} type="email" />
          </FormField>
          <FormField label="Payment Reference">
            <TextInput name="payment_reference" value={form.payment_reference} onChange={handleChange} />
          </FormField>
        </FormSection>

        {/* 4. Technical / API */}
        <FormSection title="4. Technical / API" defaultOpen={false}>
          <FormField label="Access Level">
            <SelectInput name="access_level" value={form.access_level} onChange={handleChange} options={ACCESS_LEVELS} placeholder="Select…" />
          </FormField>
          <FormField label="Linked Credential ID">
            <TextInput name="linked_credential_id" value={form.linked_credential_id} onChange={handleChange} />
          </FormField>
          <FormField label="API Key">
            <PasswordInput name="api_key" value={form.api_key} onChange={handleChange} />
          </FormField>
          <FormField label="API Secret">
            <PasswordInput name="api_secret" value={form.api_secret} onChange={handleChange} />
          </FormField>
          <FormField label="Client ID">
            <TextInput name="client_id" value={form.client_id} onChange={handleChange} />
          </FormField>
          <FormField label="Client Secret">
            <PasswordInput name="client_secret" value={form.client_secret} onChange={handleChange} />
          </FormField>
          <FormField label="Tenant ID (App)">
            <TextInput name="tenant_id_app" value={form.tenant_id_app} onChange={handleChange} />
          </FormField>
          <FormField label="Subscription ID (Azure)">
            <TextInput name="subscription_id_azure" value={form.subscription_id_azure} onChange={handleChange} />
          </FormField>
          <FormField label="Server Hostname">
            <TextInput name="server_hostname" value={form.server_hostname} onChange={handleChange} />
          </FormField>
          <FormField label="Port">
            <TextInput name="port" value={form.port} onChange={handleChange} type="number" />
          </FormField>
          <FormField label="Protocol">
            <SelectInput name="protocol" value={form.protocol} onChange={handleChange} options={PROTOCOLS} placeholder="Select…" />
          </FormField>
          <FormField label="Database Name">
            <TextInput name="database_name" value={form.database_name} onChange={handleChange} />
          </FormField>
        </FormSection>

        {/* 5. Ownership & Tracking */}
        <FormSection title="5. Ownership & Tracking" defaultOpen={false}>
          <FormField label="Managed By">
            <TextInput name="managed_by" value={form.managed_by} onChange={handleChange} />
          </FormField>
          <FormField label="Managed By Email">
            <TextInput name="managed_by_email" value={form.managed_by_email} onChange={handleChange} type="email" />
          </FormField>
          <FormField label="Created By">
            <TextInput name="created_by" value={form.created_by} onChange={handleChange} />
          </FormField>
          <FormField label="Created Date">
            <TextInput name="created_date" value={form.created_date} onChange={handleChange} type="date" />
          </FormField>
          <FormField label="Tags">
            <TextInput name="tags" value={form.tags} onChange={handleChange} placeholder="comma, separated, tags" />
          </FormField>
          <FormField label="Notes">
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className={inputCls}
            />
          </FormField>
        </FormSection>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="submit"
            disabled={submitting}
            className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Credential'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/credentials')}
            className="px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
