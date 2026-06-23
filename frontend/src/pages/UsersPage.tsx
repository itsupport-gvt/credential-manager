import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../App'
import type { AuthUser } from '../lib/types'

const ROLE_COLOR: Record<string, string> = {
  Admin:   '#4285f4',
  Editor:  '#34a853',
  Viewer:  '#fbbc05',
  Auditor: '#ea4335',
  None:    '#888',
}

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLOR[role] || '#888'
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

function Avatar({ name, email, role }: { name: string; email: string; role: string }) {
  const initials = (name || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const c = ROLE_COLOR[role] || '#888'
  return (
    <span style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: c + '33', color: c, border: `2px solid ${c}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
    }}>{initials}</span>
  )
}

function formatDate(iso: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const { showToast } = useToast()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const isAdmin = me?.role === 'Admin'

  useEffect(() => {
    api.listAuthUsers()
      .then(setUsers)
      .catch(() => showToast('Failed to load users', 'error'))
      .finally(() => setLoading(false))
  }, [])

  async function toggleStatus(u: AuthUser) {
    if (!isAdmin) return
    setToggling(u.oid)
    try {
      const updated = await api.setUserStatus(u.oid, !u.is_active)
      setUsers(prev => prev.map(x => x.oid === updated.oid ? updated : x))
      showToast(`${u.name || u.email} ${updated.is_active ? 'enabled' : 'disabled'}`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setToggling(null)
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-3)' }}>
        <span className="icon" style={{ fontSize: 48, opacity: .3 }}>lock</span>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Admin access required</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="page-title">Users</div>
        <div className="page-subtitle">Microsoft accounts that have signed into this app</div>
      </div>

      <div className="md-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 52, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
            <span className="icon" style={{ fontSize: 48, opacity: .3 }}>group</span>
            <div style={{ marginTop: 12, fontSize: 14 }}>No users have signed in yet</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['User', 'Email', 'Role', 'Last Sign-in', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
                    letterSpacing: '.6px', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.oid === me?.oid
                const busy = toggling === u.oid
                return (
                  <tr key={u.oid} style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: u.is_active ? 1 : 0.5,
                    transition: 'opacity .2s',
                  }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={u.name} email={u.email} role={u.effective_role} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                            {u.name || '—'}
                            {isSelf && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(you)</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>{u.email || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <RoleBadge role={u.effective_role} />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {formatDate(u.last_login)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                        background: u.is_active ? 'rgba(52,168,83,.15)' : 'rgba(234,67,53,.1)',
                        color: u.is_active ? '#34a853' : '#ea4335',
                        border: `1px solid ${u.is_active ? 'rgba(52,168,83,.3)' : 'rgba(234,67,53,.25)'}`,
                      }}>
                        <span className="icon icon-sm" style={{ fontSize: 11 }}>{u.is_active ? 'check_circle' : 'block'}</span>
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {!isSelf && (
                        <button
                          onClick={() => toggleStatus(u)}
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

      <div style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 4 }}>
        Roles are assigned in <strong>Microsoft Entra ID</strong> → Enterprise Applications → {' '}
        <em>credapp-365-auth</em> → Users and groups.
        Disabling a user here blocks sign-in to this app without affecting their Entra account.
      </div>
    </div>
  )
}
