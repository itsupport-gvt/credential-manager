import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../App'
import type { AuthUser, StaffUser } from '../lib/types'

// ── Shared styles ─────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)',
  outline: 'none', fontFamily: 'Roboto, sans-serif',
}

const ROLE_COLOR: Record<string, string> = {
  Admin: '#4285f4', Editor: '#34a853', Viewer: '#fbbc05', Auditor: '#ea4335', None: '#888',
}

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLOR[role] || '#6c6c6c'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
      background: c + '22', color: c, border: `1px solid ${c}44`,
    }}>
      <span className="icon icon-sm" style={{ fontSize: 12 }}>shield</span>
      {role}
    </span>
  )
}

function Avatar({ name, email, color }: { name: string; email: string; color?: string }) {
  const initials = (name || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const c = color || '#4285f4'
  return (
    <span style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: c + '33', color: c, border: `2px solid ${c}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
    }}>{initials}</span>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
      background: active ? 'rgba(52,168,83,.15)' : 'rgba(234,67,53,.1)',
      color: active ? '#34a853' : '#ea4335',
      border: `1px solid ${active ? 'rgba(52,168,83,.3)' : 'rgba(234,67,53,.25)'}`,
    }}>
      <span className="icon icon-sm" style={{ fontSize: 11 }}>{active ? 'check_circle' : 'block'}</span>
      {active ? 'Active' : 'Disabled'}
    </span>
  )
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, width: 520, maxWidth: '95vw',
        boxShadow: '0 16px 48px rgba(0,0,0,.4)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Google Sans', sans-serif" }}>
            {isEdit ? 'Edit User' : 'Add User'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <span className="icon">close</span>
          </button>
        </div>
        <form onSubmit={async e => { e.preventDefault(); await onSave(form) }} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label className="md-label">Full Name *</label>
              <input style={inp} name="full_name" value={form.full_name} onChange={ch} required placeholder="Jane Smith" />
            </div>
            <div>
              <label className="md-label">Email *</label>
              <input style={{ ...inp, opacity: isEdit ? .7 : 1 }} name="email" type="email" value={form.email} onChange={ch} required disabled={isEdit} placeholder="jane@company.com" />
            </div>
            <div>
              <label className="md-label">Role</label>
              <input style={inp} name="role" value={form.role} onChange={ch} placeholder="e.g. IT Manager" />
            </div>
            <div>
              <label className="md-label">Department</label>
              <input style={inp} name="department" value={form.department} onChange={ch} placeholder="e.g. IT" />
            </div>
            <div>
              <label className="md-label">Access Level</label>
              <select style={inp} name="access_level" value={form.access_level} onChange={ch}>
                <option value="">— Select —</option>
                {['Read', 'Read/Write', 'Admin'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="md-label">Status</label>
              <select style={inp} name="status" value={form.status} onChange={ch}>
                {['Active', 'Inactive'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="md-label">Notes</label>
            <textarea style={{ ...inp, height: 72, resize: 'vertical' }} name="notes" value={form.notes} onChange={ch} placeholder="Any additional notes…" />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="md-btn md-btn-outlined">Cancel</button>
            <button type="submit" disabled={saving} className="md-btn md-btn-primary">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add User'}
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

  // Staff directory state
  const [staff, setStaff]           = useState<StaffUser[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<StaffUser | null | 'new'>(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  // Entra auth users state
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
    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.6px', whiteSpace: 'nowrap' }}>
      {label}
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div className="page-title">Users</div>
        <div className="page-subtitle">Staff directory and application access control</div>
      </div>

      {/* ── Staff Directory ──────────────────────────────────────────────── */}
      <div className="md-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="icon icon-md" style={{ color: 'var(--primary)' }}>people</span>
            <div style={{ fontWeight: 600, fontFamily: "'Google Sans', sans-serif", fontSize: 14 }}>Staff Directory</div>
          </div>
          {isAdmin && (
            <button className="md-btn md-btn-primary" onClick={() => setEditTarget('new')} style={{ fontSize: 13 }}>
              <span className="icon icon-sm">person_add</span>Add User
            </button>
          )}
        </div>

        {staffLoading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 52, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            <span className="icon" style={{ fontSize: 40, opacity: .3 }}>group</span>
            <div style={{ marginTop: 10, fontSize: 14 }}>No staff users yet</div>
            {isAdmin && (
              <button className="md-btn md-btn-tonal" style={{ marginTop: 12 }} onClick={() => setEditTarget('new')}>
                <span className="icon icon-sm">person_add</span>Add First User
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {TH('Name')}
                {TH('Email')}
                {TH('Role / Dept')}
                {TH('Access')}
                {TH('Status')}
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map(u => (
                <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={u.full_name} email={u.email} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{u.full_name || '—'}</div>
                    </div>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.email}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{u.role || '—'}</div>
                    {u.department && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{u.department}</div>}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.access_level || '—'}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <StatusPill active={u.status === 'Active'} />
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="md-btn" onClick={() => setEditTarget(u)} style={{ fontSize: 12, padding: '4px 10px' }}>
                          <span className="icon icon-sm">edit</span>Edit
                        </button>
                        <button
                          className="md-btn"
                          onClick={() => handleDeleteStaff(u)}
                          disabled={deleting === u.user_id}
                          style={{ fontSize: 12, padding: '4px 10px', color: '#ea4335', background: 'rgba(234,67,53,.08)', border: '1px solid rgba(234,67,53,.3)' }}
                        >
                          {deleting === u.user_id
                            ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                            : <span className="icon icon-sm">delete</span>
                          }
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

      {/* ── App Access (Entra sign-ins) — only when auth is enabled ──────── */}
      {authEnabled && (
        <div className="md-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="icon icon-md" style={{ color: 'var(--primary)' }}>verified_user</span>
            <div>
              <div style={{ fontWeight: 600, fontFamily: "'Google Sans', sans-serif", fontSize: 14 }}>App Access</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Microsoft accounts that have signed in — roles assigned in Entra ID</div>
            </div>
          </div>

          {authLoading ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 52, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : authUsers.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              No users have signed in yet
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {TH('User')}{TH('Email')}{TH('Entra Role')}{TH('Last Sign-in')}{TH('Status')}<th />
                </tr>
              </thead>
              <tbody>
                {authUsers.map(u => {
                  const isSelf = u.oid === me?.oid
                  const busy = toggling === u.oid
                  return (
                    <tr key={u.oid} style={{ borderBottom: '1px solid var(--border)', opacity: u.is_active ? 1 : .5, transition: 'opacity .2s' }}>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={u.name} email={u.email} color={ROLE_COLOR[u.effective_role]} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                            {u.name || '—'}
                            {isSelf && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(you)</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.email || '—'}</td>
                      <td style={{ padding: '11px 16px' }}><RoleBadge role={u.effective_role} /></td>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(u.last_login)}</td>
                      <td style={{ padding: '11px 16px' }}><StatusPill active={u.is_active} /></td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => toggleAuthStatus(u)}
                            disabled={busy}
                            className="md-btn"
                            style={{
                              fontSize: 12, padding: '4px 12px',
                              background: u.is_active ? 'rgba(234,67,53,.08)' : 'rgba(52,168,83,.1)',
                              color: u.is_active ? '#ea4335' : '#34a853',
                              border: `1px solid ${u.is_active ? 'rgba(234,67,53,.3)' : 'rgba(52,168,83,.3)'}`,
                            }}
                          >
                            {busy
                              ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                              : u.is_active ? 'Disable' : 'Enable'
                            }
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

      {/* Edit / Add modal */}
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
