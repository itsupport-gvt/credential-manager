import { useEffect, useState, type ChangeEvent } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../App'
import type { AuthUser, StaffUser } from '../lib/types'

function RoleBadge({ role }: { role: string }) {
  return <span className="md-chip">{role}</span>
}

function Avatar({ name, email }: { name: string; email: string }) {
  const initials = (name || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: 'var(--primary)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
    }}>{initials}</span>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={active ? 'badge-active' : 'badge-neutral'}>{active ? 'Active' : 'Disabled'}</span>
}

function formatDate(iso: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

// ── Staff user form ───────────────────────────────────────────────────────────

type SForm = Omit<StaffUser, 'user_id'>
const EMPTY_FORM: SForm = { full_name: '', email: '', role: '', department: '', access_level: '', status: 'Active', notes: '' }

function StaffUserModal({ initial, onSave, onClose, saving }: {
  initial?: StaffUser
  onSave: (data: SForm) => Promise<void>
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<SForm>(initial ?? EMPTY_FORM)
  const ch = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const isEdit = !!initial

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(32,33,36,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="animate-in" style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560,
        boxShadow: '0 24px 56px rgba(0,0,0,.3)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: "'Google Sans', sans-serif",
            fontSize: 18, fontWeight: 400, color: 'var(--text-1)',
          }}>
            {isEdit ? 'Edit user' : 'Add user'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-2)', display: 'flex', alignItems: 'center',
            padding: 8, borderRadius: '50%',
          }}>
            <span className="icon icon-sm">close</span>
          </button>
        </div>
        <form
          onSubmit={async e => { e.preventDefault(); await onSave(form) }}
          style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="md-label">Full name *</label>
              <input className="md-input" name="full_name" value={form.full_name} onChange={ch} required placeholder="Jane Smith" />
            </div>
            <div>
              <label className="md-label">Email *</label>
              <input
                className="md-input"
                style={{ opacity: isEdit ? .7 : 1 }}
                name="email" type="email" value={form.email}
                onChange={ch} required disabled={isEdit} placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="md-label">Role</label>
              <input className="md-input" name="role" value={form.role} onChange={ch} placeholder="e.g. IT Manager" />
            </div>
            <div>
              <label className="md-label">Department</label>
              <input className="md-input" name="department" value={form.department} onChange={ch} placeholder="e.g. IT" />
            </div>
            <div>
              <label className="md-label">Access level</label>
              <select className="md-select" name="access_level" value={form.access_level} onChange={ch}>
                <option value="">— Select —</option>
                {['Read', 'Read/Write', 'Admin'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="md-label">Status</label>
              <select className="md-select" name="status" value={form.status} onChange={ch}>
                {['Active', 'Inactive'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="md-label">Notes</label>
            <textarea className="md-textarea" name="notes" value={form.notes} onChange={ch} placeholder="Any additional notes…" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button type="button" onClick={onClose} className="md-btn md-btn-text">Cancel</button>
            <button type="submit" disabled={saving} className="md-btn md-btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me, authEnabled } = useAuth()
  const { showToast } = useToast()
  const isAdmin = !authEnabled || me?.role === 'Admin'

  const [staff, setStaff]           = useState<StaffUser[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<StaffUser | null | 'new'>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  const [authUsers, setAuthUsers]     = useState<AuthUser[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const [toggling, setToggling]       = useState<string | null>(null)

  useEffect(() => {
    api.listStaffUsers()
      .then(setStaff)
      .catch(() => showToast('Failed to load staff directory', 'error'))
      .finally(() => setStaffLoading(false))

    if (authEnabled) {
      api.listAuthUsers()
        .then(setAuthUsers)
        .catch(() => {})
        .finally(() => setAuthLoading(false))
    } else {
      setAuthLoading(false)
    }
  }, [authEnabled])

  async function handleSaveStaff(data: SForm) {
    setSaving(true)
    try {
      if (editTarget === 'new') {
        const created = await api.createStaffUser(data)
        setStaff(prev => [...prev, created].sort((a, b) => a.full_name.localeCompare(b.full_name)))
        showToast('User added', 'success')
      } else if (editTarget) {
        const updated = await api.updateStaffUser(editTarget.user_id, data)
        setStaff(prev => prev.map(u => u.user_id === updated.user_id ? updated : u))
        showToast('User updated', 'success')
      }
      setEditTarget(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteStaff(u: StaffUser) {
    if (!window.confirm(`Remove "${u.full_name || u.email}" from the staff directory?`)) return
    setDeleting(u.user_id)
    try {
      await api.deleteStaffUser(u.user_id)
      setStaff(prev => prev.filter(x => x.user_id !== u.user_id))
      showToast('User removed', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setDeleting(null)
    }
  }

  async function toggleAuthStatus(u: AuthUser) {
    setToggling(u.oid)
    try {
      const updated = await api.setUserStatus(u.oid, !u.is_active)
      setAuthUsers(prev => prev.map(x => x.oid === updated.oid ? updated : x))
      showToast(`${u.name || u.email} ${updated.is_active ? 'enabled' : 'disabled'}`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setToggling(null)
    }
  }

  const TH = (label: string) => (
    <th style={{
      padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500,
      color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5,
      whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
    }}>{label}</th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <div className="page-title">Users</div>
        <div className="page-subtitle">Staff directory and application access</div>
      </div>

      {/* Staff Directory */}
      <div className="md-card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 className="section-title">Staff directory</h2>
          {isAdmin && (
            <button className="md-btn md-btn-primary md-btn-sm" onClick={() => setEditTarget('new')}>
              <span className="icon icon-sm">person_add</span>Add user
            </button>
          )}
        </div>

        {staffLoading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 56, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <span className="icon icon-xl" style={{ color: 'var(--text-3)', display: 'block', marginBottom: 12 }}>group</span>
            <div style={{ color: 'var(--text-2)', fontSize: 14 }}>No staff users yet</div>
            {isAdmin && (
              <button className="md-btn md-btn-tonal md-btn-sm" style={{ marginTop: 16 }} onClick={() => setEditTarget('new')}>
                <span className="icon icon-sm">person_add</span>Add first user
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {TH('Name')}
                {TH('Email')}
                {TH('Role / Dept')}
                {TH('Access')}
                {TH('Status')}
                <th style={{ borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {staff.map((u, i) => (
                <tr key={u.user_id} style={{ borderBottom: i < staff.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar name={u.full_name} email={u.email} />
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{u.full_name || '—'}</div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.email}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{u.role || '—'}</div>
                    {u.department && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{u.department}</div>}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.access_level || '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatusPill active={u.status === 'Active'} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setEditTarget(u)}
                          title="Edit"
                          style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span className="icon icon-sm">edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(u)}
                          disabled={deleting === u.user_id}
                          title="Delete"
                          style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)' }}
                        >
                          {deleting === u.user_id
                            ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                            : <span className="icon icon-sm">delete</span>}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* App Access (Entra sign-ins) */}
      {authEnabled && (
        <div className="md-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{
            padding: '20px 24px', borderBottom: '1px solid var(--border)',
          }}>
            <h2 className="section-title">App access</h2>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              Microsoft accounts that have signed in — roles assigned in Entra ID
            </div>
          </div>

          {authLoading ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 56, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : authUsers.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
              No users have signed in yet
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {TH('User')}{TH('Email')}{TH('Entra role')}{TH('Last sign-in')}{TH('Status')}
                  <th style={{ borderBottom: '1px solid var(--border)' }} />
                </tr>
              </thead>
              <tbody>
                {authUsers.map((u, i) => {
                  const isSelf = u.oid === me?.oid
                  const busy = toggling === u.oid
                  return (
                    <tr key={u.oid} style={{ borderBottom: i < authUsers.length - 1 ? '1px solid var(--border)' : 'none', opacity: u.is_active ? 1 : .55 }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Avatar name={u.name} email={u.email} />
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                            {u.name || '—'}
                            {isSelf && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>(you)</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.email || '—'}</td>
                      <td style={{ padding: '14px 16px' }}><RoleBadge role={u.effective_role} /></td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(u.last_login)}</td>
                      <td style={{ padding: '14px 16px' }}><StatusPill active={u.is_active} /></td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => toggleAuthStatus(u)}
                            disabled={busy}
                            className="md-btn md-btn-text md-btn-sm"
                            style={{ color: u.is_active ? 'var(--danger)' : 'var(--success)' }}
                          >
                            {busy
                              ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                              : u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editTarget !== null && (
        <StaffUserModal
          initial={editTarget === 'new' ? undefined : editTarget}
          onSave={handleSaveStaff}
          onClose={() => setEditTarget(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
