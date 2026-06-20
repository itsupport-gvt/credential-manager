import { useEffect, useState, type ChangeEvent } from 'react'
import { api } from '../lib/api'
import type { Tenant, Stats } from '../lib/types'

const STATUSES = ['Active', 'Inactive']

const inputCls =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500'

interface TenantFormState {
  tenant_code: string
  tenant_name: string
  industry: string
  primary_contact: string
  contact_email: string
  contact_phone: string
  account_manager: string
  contract_start: string
  contract_end: string
  status: string
  notes: string
}

const EMPTY_TENANT: TenantFormState = {
  tenant_code: '', tenant_name: '', industry: '',
  primary_contact: '', contact_email: '', contact_phone: '',
  account_manager: '', contract_start: '', contract_end: '',
  status: 'Active', notes: '',
}

interface TenantFormProps {
  initial?: TenantFormState
  onSubmit: (data: TenantFormState) => Promise<void>
  onCancel: () => void
  submitting: boolean
  isEdit?: boolean
}

function TenantForm({ initial = EMPTY_TENANT, onSubmit, onCancel, submitting, isEdit }: TenantFormProps) {
  const [form, setForm] = useState<TenantFormState>(initial)

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await onSubmit(form)
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Tenant Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="tenant_code"
            value={form.tenant_code}
            onChange={handleChange}
            required
            disabled={isEdit}
            className={inputCls + (isEdit ? ' opacity-60 cursor-not-allowed' : '')}
            placeholder="e.g. ACME"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Tenant Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="tenant_name"
            value={form.tenant_name}
            onChange={handleChange}
            required
            className={inputCls}
            placeholder="Acme Corporation"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Industry</label>
          <input type="text" name="industry" value={form.industry} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Primary Contact</label>
          <input type="text" name="primary_contact" value={form.primary_contact} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contact Email</label>
          <input type="email" name="contact_email" value={form.contact_email} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contact Phone</label>
          <input type="tel" name="contact_phone" value={form.contact_phone} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Account Manager</label>
          <input type="text" name="account_manager" value={form.account_manager} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
          <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contract Start</label>
          <input type="date" name="contract_start" value={form.contract_start} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contract End</label>
          <input type="date" name="contract_end" value={form.contract_end} onChange={handleChange} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Tenant'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        status === 'Active'
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
      }`}
    >
      {status}
    </span>
  )
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.listTenants(), api.getStats()])
      .then(([t, s]) => {
        setTenants(t)
        setStats(s)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function credCountForTenant(code: string): number {
    if (!stats) return 0
    const found = stats.by_tenant.find((t) => t.code === code)
    return found ? found.count : 0
  }

  async function handleAdd(data: TenantFormState) {
    setSubmitting(true)
    setFormError(null)
    try {
      const created = await api.createTenant(data)
      setTenants((prev) => [...prev, created])
      setShowAddForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create tenant')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(code: string, data: TenantFormState) {
    setSubmitting(true)
    setFormError(null)
    try {
      const updated = await api.updateTenant(code, data)
      setTenants((prev) => prev.map((t) => (t.tenant_code === code ? updated : t)))
      setEditingCode(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update tenant')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tenants</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {tenants.length} tenant{tenants.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingCode(null) }}
          className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
        >
          + Add Tenant
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 mb-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">New Tenant</h2>
          {formError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">
              {formError}
            </div>
          )}
          <TenantForm
            onSubmit={handleAdd}
            onCancel={() => setShowAddForm(false)}
            submitting={submitting}
          />
        </div>
      )}

      {/* Tenant table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {tenants.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            No tenants yet. Add one above.
          </div>
        ) : (
          <div>
            {tenants.map((tenant) => (
              <div key={tenant.tenant_code} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                {/* Row */}
                <div
                  className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  onClick={() => {
                    if (expandedCode === tenant.tenant_code) {
                      setExpandedCode(null)
                      setEditingCode(null)
                    } else {
                      setExpandedCode(tenant.tenant_code)
                      setEditingCode(null)
                    }
                  }}
                >
                  <div className="w-24 flex-shrink-0">
                    <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {tenant.tenant_code}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {tenant.tenant_name}
                    </div>
                    {tenant.industry && (
                      <div className="text-xs text-gray-400 truncate">{tenant.industry}</div>
                    )}
                  </div>
                  <div className="hidden sm:block flex-shrink-0 w-40 text-sm text-gray-500 dark:text-gray-400 truncate">
                    {tenant.primary_contact}
                  </div>
                  <div className="hidden md:block flex-shrink-0">
                    <StatusBadge status={tenant.status} />
                  </div>
                  <div className="flex-shrink-0 text-sm text-gray-500 dark:text-gray-400 text-right">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {credCountForTenant(tenant.tenant_code)}
                    </span>{' '}
                    creds
                  </div>
                  <div className="text-gray-400 text-xs flex-shrink-0">
                    {expandedCode === tenant.tenant_code ? '▲' : '▼'}
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedCode === tenant.tenant_code && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    {editingCode === tenant.tenant_code ? (
                      <div className="pt-4">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Edit Tenant</h3>
                        {formError && (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">
                            {formError}
                          </div>
                        )}
                        <TenantForm
                          initial={{
                            tenant_code: tenant.tenant_code,
                            tenant_name: tenant.tenant_name,
                            industry: tenant.industry,
                            primary_contact: tenant.primary_contact,
                            contact_email: tenant.contact_email,
                            contact_phone: tenant.contact_phone,
                            account_manager: tenant.account_manager,
                            contract_start: tenant.contract_start,
                            contract_end: tenant.contract_end,
                            status: tenant.status,
                            notes: tenant.notes,
                          }}
                          onSubmit={(data) => handleEdit(tenant.tenant_code, data)}
                          onCancel={() => setEditingCode(null)}
                          submitting={submitting}
                          isEdit
                        />
                      </div>
                    ) : (
                      <div className="pt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                          {[
                            ['Tenant Code', tenant.tenant_code],
                            ['Industry', tenant.industry],
                            ['Contact Email', tenant.contact_email],
                            ['Contact Phone', tenant.contact_phone],
                            ['Account Manager', tenant.account_manager],
                            ['Contract Start', tenant.contract_start],
                            ['Contract End', tenant.contract_end],
                            ['Status', tenant.status],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <div className="text-xs font-medium text-gray-400 dark:text-gray-500">{label}</div>
                              <div className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                                {value || <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                        {tenant.notes && (
                          <div className="mb-4">
                            <div className="text-xs font-medium text-gray-400 dark:text-gray-500">Notes</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{tenant.notes}</div>
                          </div>
                        )}
                        <button
                          onClick={() => setEditingCode(tenant.tenant_code)}
                          className="px-3 py-1.5 text-sm bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
