import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { AuthorizedUser, StaffUser } from '../lib/types'

const ACCESS_LEVELS = ['Read', 'Write', 'Admin']
const BLANK: AuthorizedUser = { name: '', email: '', access_level: 'Read', notes: '' }

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: 12, background: 'var(--surface)', color: 'var(--text-1)',
  outline: 'none', fontFamily: 'Roboto, sans-serif',
}

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
      name: staff.full_name,
      email: staff.email,
      access_level: 'Read',
      notes: '',
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

  // Check if a user row matches a staff directory entry (was picked from directory)
  function isFromDirectory(u: AuthorizedUser) {
    return staffList.some(s => s.email.toLowerCase() === u.email.toLowerCase())
  }

  return (
    <div>
      {/* User rows */}
      {users.length === 0 && (
        <div style={{ padding: '10px 0', color: 'var(--text-3)', fontSize: 13 }}>
          No authorized users — add from directory or manually below
        </div>
      )}
      {users.map((u, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: 8, alignItems: 'center', padding: '10px 12px', marginBottom: 6, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          {/* Name + email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            {isFromDirectory(u) ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="icon icon-sm" style={{ fontSize: 14, color: 'var(--primary)', flexShrink: 0 }}>badge</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input value={u.name} onChange={e => update(i, 'name', e.target.value)} placeholder="Full name" style={inp} />
                <input type="email" value={u.email} onChange={e => update(i, 'email', e.target.value)} placeholder="Email" style={inp} />
              </div>
            )}
          </div>
          {/* Notes */}
          <input value={u.notes} onChange={e => update(i, 'notes', e.target.value)} placeholder="Notes (optional)" style={inp} />
          {/* Access level */}
          <select value={u.access_level} onChange={e => update(i, 'access_level', e.target.value)} style={{ ...inp, width: 'auto' }}>
            {ACCESS_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {/* Remove */}
          <button type="button" onClick={() => remove(i)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}>
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      ))}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, position: 'relative' }}>
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => { setPickerOpen(o => !o); setSearch('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-bg)', color: 'var(--primary)', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
          >
            <span className="icon icon-sm">person_search</span>Add from Directory
          </button>

          {pickerOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300, width: 340, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email, or department…"
                  style={{ ...inp, fontSize: 12 }}
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {filtered.length === 0 && (
                  <div style={{ padding: '12px 14px', color: 'var(--text-3)', fontSize: 12 }}>No matching staff users</div>
                )}
                {filtered.map(s => {
                  const added = alreadyAdded.has(s.email.toLowerCase())
                  return (
                    <div
                      key={s.user_id}
                      onMouseDown={() => !added && pickFromDirectory(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: added ? 'default' : 'pointer', opacity: added ? 0.45 : 1, borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { if (!added) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--primary)', fontWeight: 600, flexShrink: 0 }}>
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}{s.department ? ` · ${s.department}` : ''}</div>
                      </div>
                      {added && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>Added</span>}
                    </div>
                  )
                })}
              </div>
              {staffList.length === 0 && (
                <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>No staff users found — add them in the Users page first</div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={addManually}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
        >
          <span className="icon icon-sm">edit</span>Add Manually
        </button>
      </div>
    </div>
  )
}
