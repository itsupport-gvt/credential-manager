import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { AuthorizedUser, StaffUser } from '../lib/types'

const ACCESS_LEVELS = ['Read', 'Write', 'Admin']
const BLANK: AuthorizedUser = { name: '', email: '', access_level: 'Read', notes: '' }

interface Props {
  users: AuthorizedUser[]
  onChange: (users: AuthorizedUser[]) => void
}

export function AuthorizedUsersEditor({ users, onChange }: Props) {
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.listStaffUsers().then(setStaffList).catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pickerOpen])

  const alreadyAdded = new Set(users.map(u => u.email.toLowerCase()))

  const filtered = staffList
    .filter(s => s.status === 'Active' || search.trim().length > 0)
    .filter(s => !search.trim() || (
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.department || '').toLowerCase().includes(search.toLowerCase())
    ))
    .slice(0, 10)

  function pickFromDirectory(staff: StaffUser) {
    if (alreadyAdded.has(staff.email.toLowerCase())) return
    onChange([...users, {
      name: staff.full_name, email: staff.email,
      access_level: 'Read', notes: '',
    }])
    setPickerOpen(false)
    setSearch('')
  }

  function addManually() {
    onChange([...users, { ...BLANK }])
  }

  function update(i: number, field: keyof AuthorizedUser, val: string) {
    onChange(users.map((u, idx) => idx === i ? { ...u, [field]: val } : u))
  }

  function remove(i: number) {
    onChange(users.filter((_, idx) => idx !== i))
  }

  function isFromDirectory(u: AuthorizedUser) {
    return staffList.some(s => s.email.toLowerCase() === u.email.toLowerCase())
  }

  return (
    <div>
      {/* Empty state */}
      {users.length === 0 && (
        <div style={{ padding: '12px 0', color: 'var(--text-3)', fontSize: 14 }}>
          No authorized users — add from directory or manually below
        </div>
      )}

      {/* User rows */}
      {users.map((u, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 140px 36px',
          gap: 10, alignItems: 'center',
          padding: '12px',
          marginBottom: 8,
          background: 'var(--surface-2)', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            {isFromDirectory(u) ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="icon icon-sm" style={{ color: 'var(--primary)', flexShrink: 0 }}>badge</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={u.name} onChange={e => update(i, 'name', e.target.value)} placeholder="Full name" className="md-input" style={{ height: 34, fontSize: 13 }} />
                <input type="email" value={u.email} onChange={e => update(i, 'email', e.target.value)} placeholder="Email" className="md-input" style={{ height: 34, fontSize: 13 }} />
              </div>
            )}
          </div>
          <input value={u.notes} onChange={e => update(i, 'notes', e.target.value)} placeholder="Notes (optional)" className="md-input" style={{ height: 34, fontSize: 13 }} />
          <select value={u.access_level} onChange={e => update(i, 'access_level', e.target.value)} className="md-select" style={{ height: 34, fontSize: 13 }}>
            {ACCESS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button
            type="button" onClick={() => remove(i)} title="Remove"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)' }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      ))}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, position: 'relative' }}>
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => { setPickerOpen(o => !o); setSearch('') }} className="md-btn md-btn-tonal md-btn-sm">
            <span className="icon icon-sm">person_search</span>Add from directory
          </button>

          {pickerOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
              width: 360, background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12,
              boxShadow: 'var(--shadow-2)', overflow: 'hidden',
            }}>
              <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email, or department…"
                  className="md-input"
                  style={{ height: 36, fontSize: 13 }}
                />
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {filtered.length === 0 && (
                  <div style={{ padding: '14px 16px', color: 'var(--text-3)', fontSize: 13 }}>No matching staff users</div>
                )}
                {filtered.map(s => {
                  const added = alreadyAdded.has(s.email.toLowerCase())
                  return (
                    <div
                      key={s.user_id}
                      onMouseDown={() => !added && pickFromDirectory(s)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px',
                        cursor: added ? 'default' : 'pointer',
                        opacity: added ? 0.45 : 1,
                      }}
                      onMouseEnter={e => { if (!added) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
                        flexShrink: 0,
                      }}>
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.email}{s.department ? ` · ${s.department}` : ''}
                        </div>
                      </div>
                      {added && <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>Added</span>}
                    </div>
                  )
                })}
              </div>
              {staffList.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
                  No staff users found — add them in the Users page first
                </div>
              )}
            </div>
          )}
        </div>

        <button type="button" onClick={addManually} className="md-btn md-btn-text md-btn-sm">
          <span className="icon icon-sm">edit</span>Add manually
        </button>
      </div>
    </div>
  )
}
