import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Credential, ChangeLogItem } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'
import { MaskedField } from '../components/MaskedField'

interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 bg-white dark:bg-gray-800">{children}</div>}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
      <div className="text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">{label}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100 break-all">
        {value || <span className="text-gray-300 dark:text-gray-600">—</span>}
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
    api
      .getChangeLog({ credential_id: credentialId, page, page_size: 20 })
      .then((data) => {
        setItems(data.items)
        setTotal(data.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [credentialId, page])

  if (loading) {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        No change history for this credential
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">{total} log entries</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Timestamp
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Action
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Field
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Old
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                New
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                By
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-t border-gray-100 dark:border-gray-700"
              >
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                  {new Date(item.timestamp).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      item.action === 'CREATE'
                        ? 'bg-green-100 text-green-800'
                        : item.action === 'DELETE' || item.action === 'ARCHIVE'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {item.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">
                  {item.field_changed}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-500 font-mono text-xs max-w-[120px] truncate">
                  {item.old_value_masked || '—'}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-mono text-xs max-w-[120px] truncate">
                  {item.new_value_masked || '—'}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                  {item.changed_by}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 20 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-400">
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CredentialDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [cred, setCred] = useState<Credential | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details')
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .getCredential(id)
      .then(setCred)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load credential'),
      )
      .finally(() => setLoading(false))
  }, [id])

  async function handleArchive() {
    if (!id || !cred) return
    if (!confirm(`Archive credential "${cred.service_name}"? This cannot be undone easily.`)) return
    setArchiving(true)
    try {
      await api.archiveCredential(id)
      navigate('/credentials')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Archive failed')
    } finally {
      setArchiving(false)
    }
  }

  function fmt(val: string | number | undefined | null) {
    if (val === null || val === undefined || val === '') return null
    return String(val)
  }

  function fmtDate(val: string | undefined | null) {
    if (!val) return null
    try {
      return new Date(val).toLocaleDateString()
    } catch {
      return val
    }
  }

  function fmtCurrency(val: number | undefined | null) {
    if (val == null || val === 0) return null
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      </div>
    )
  }

  if (!cred) return null

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/credentials')}
          className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 flex items-center gap-1"
        >
          ← Back to Credentials
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {cred.service_name}
              </h1>
              <StatusBadge status={cred.status} />
              <PriorityBadge priority={cred.priority} />
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                {cred.credential_id}
              </span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{cred.tenant_name || cred.tenant_code}</span>
              {cred.category && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{cred.category}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {cred.service_url && (
              <a
                href={cred.service_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Open Login Page ↗
              </a>
            )}
            <button
              onClick={() => navigate(`/credential/${id}/edit`)}
              className="px-3 py-2 text-sm bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-3 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              {archiving ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
        {(['details', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'history' ? 'Change History' : 'Details'}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <div>
          {/* 1. Core Identity */}
          <Section title="1. Core Identity">
            <div className="space-y-0">
              <FieldRow label="Credential ID" value={fmt(cred.credential_id)} />
              <FieldRow label="Tenant Code" value={fmt(cred.tenant_code)} />
              <FieldRow label="Tenant Name" value={fmt(cred.tenant_name)} />
              <FieldRow label="Category" value={fmt(cred.category)} />
              <FieldRow label="Subcategory" value={fmt(cred.subcategory)} />
              <FieldRow label="Service Name" value={fmt(cred.service_name)} />
              <FieldRow
                label="Service URL"
                value={
                  cred.service_url ? (
                    <a
                      href={cred.service_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {cred.service_url}
                    </a>
                  ) : null
                }
              />
              <FieldRow label="Environment" value={fmt(cred.environment)} />
              <FieldRow
                label="Status"
                value={cred.status ? <StatusBadge status={cred.status} /> : null}
              />
              <FieldRow
                label="Priority"
                value={cred.priority ? <PriorityBadge priority={cred.priority} /> : null}
              />
            </div>
          </Section>

          {/* 2. Authentication */}
          <Section title="2. Authentication">
            <div className="space-y-3">
              <FieldRow label="Username / Email" value={fmt(cred.username_email)} />
              <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <div className="text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">
                  Password
                </div>
                <MaskedField
                  label=""
                  credentialId={cred.credential_id}
                  field="password"
                  hasValue={cred.has_password}
                />
              </div>
              <FieldRow label="Recovery Email" value={fmt(cred.recovery_email)} />
              <FieldRow label="Recovery Phone" value={fmt(cred.recovery_phone)} />
              <FieldRow
                label="MFA Enabled"
                value={
                  cred.mfa_enabled ? (
                    <span
                      className={
                        cred.mfa_enabled === 'Yes'
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : 'text-gray-500'
                      }
                    >
                      {cred.mfa_enabled}
                    </span>
                  ) : null
                }
              />
              <FieldRow label="MFA Type" value={fmt(cred.mfa_type)} />
              <FieldRow label="MFA App Name" value={fmt(cred.mfa_app_name)} />
              <FieldRow label="Backup Codes Location" value={fmt(cred.backup_codes_location)} />
              <FieldRow label="Security Notes" value={fmt(cred.security_notes)} />
            </div>
          </Section>

          {/* 3. Account Details */}
          <Section title="3. Account Details" defaultOpen={false}>
            <div className="space-y-0">
              <FieldRow label="Account Display Name" value={fmt(cred.account_display_name)} />
              <FieldRow label="Account ID" value={fmt(cred.account_id)} />
              <FieldRow label="License Type" value={fmt(cred.license_type)} />
              <FieldRow label="Plan Tier" value={fmt(cred.plan_tier)} />
              <FieldRow label="Subscription Start" value={fmtDate(cred.subscription_start)} />
              <FieldRow label="Subscription End" value={fmtDate(cred.subscription_end)} />
              <FieldRow label="Auto Renewal" value={fmt(cred.auto_renewal)} />
              <FieldRow label="Monthly Cost" value={fmtCurrency(cred.monthly_cost)} />
              <FieldRow label="Billing Cycle" value={fmt(cred.billing_cycle)} />
              <FieldRow label="Billing Email" value={fmt(cred.billing_email)} />
              <FieldRow label="Payment Reference" value={fmt(cred.payment_reference)} />
            </div>
          </Section>

          {/* 4. Technical / API */}
          <Section title="4. Technical / API" defaultOpen={false}>
            <div className="space-y-3">
              <FieldRow label="Access Level" value={fmt(cred.access_level)} />
              <FieldRow
                label="Linked Credential ID"
                value={
                  cred.linked_credential_id ? (
                    <Link
                      to={`/credential/${cred.linked_credential_id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {cred.linked_credential_id}
                    </Link>
                  ) : null
                }
              />
              <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <div className="text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">
                  API Key
                </div>
                <MaskedField
                  label=""
                  credentialId={cred.credential_id}
                  field="api_key"
                  hasValue={cred.has_api_key}
                />
              </div>
              <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <div className="text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">
                  API Secret
                </div>
                <MaskedField
                  label=""
                  credentialId={cred.credential_id}
                  field="api_secret"
                  hasValue={cred.has_api_secret}
                />
              </div>
              <FieldRow label="Client ID" value={fmt(cred.client_id)} />
              <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <div className="text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">
                  Client Secret
                </div>
                <MaskedField
                  label=""
                  credentialId={cred.credential_id}
                  field="client_secret"
                  hasValue={cred.has_client_secret}
                />
              </div>
              <FieldRow label="Tenant ID (App)" value={fmt(cred.tenant_id_app)} />
              <FieldRow label="Subscription ID (Azure)" value={fmt(cred.subscription_id_azure)} />
              <FieldRow label="Server Hostname" value={fmt(cred.server_hostname)} />
              <FieldRow label="Port" value={fmt(cred.port)} />
              <FieldRow label="Protocol" value={fmt(cred.protocol)} />
              <FieldRow label="Database Name" value={fmt(cred.database_name)} />
            </div>
          </Section>

          {/* 5. Ownership & Tracking */}
          <Section title="5. Ownership & Tracking" defaultOpen={false}>
            <div className="space-y-0">
              <FieldRow label="Managed By" value={fmt(cred.managed_by)} />
              <FieldRow label="Managed By Email" value={fmt(cred.managed_by_email)} />
              <FieldRow label="Created By" value={fmt(cred.created_by)} />
              <FieldRow label="Created Date" value={fmtDate(cred.created_date)} />
              <FieldRow label="Last Updated By" value={fmt(cred.last_updated_by)} />
              <FieldRow label="Last Updated Date" value={fmtDate(cred.last_updated_date)} />
              <FieldRow label="Last Verified Date" value={fmtDate(cred.last_verified_date)} />
              <FieldRow label="Last Password Changed" value={fmtDate(cred.last_password_changed)} />
              <FieldRow
                label="Password Expiry"
                value={
                  cred.password_expiry_date ? (
                    <span
                      className={
                        new Date(cred.password_expiry_date) < new Date()
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : ''
                      }
                    >
                      {fmtDate(cred.password_expiry_date)}
                    </span>
                  ) : null
                }
              />
              <FieldRow label="Next Review Date" value={fmtDate(cred.next_review_date)} />
              <FieldRow
                label="Tags"
                value={
                  cred.tags ? (
                    <div className="flex flex-wrap gap-1">
                      {cred.tags.split(',').map((t) => (
                        <span
                          key={t.trim()}
                          className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs"
                        >
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  ) : null
                }
              />
              <FieldRow label="Notes" value={fmt(cred.notes)} />
            </div>
          </Section>
        </div>
      )}

      {activeTab === 'history' && id && <ChangeLogTable credentialId={id} />}
    </div>
  )
}
