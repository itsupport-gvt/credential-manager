import { useEffect, useState, type ChangeEvent } from 'react'
import { api } from '../lib/api'
import type { Category } from '../lib/types'
import { useToast } from '../App'

interface CatForm { category_name: string; category_code: string; description: string; subcategories: string }
const EMPTY: CatForm = { category_name: '', category_code: '', description: '', subcategories: '' }

function CategoryForm({ initial = EMPTY, onSubmit, onCancel, submitting, isEdit }: {
  initial?: CatForm; onSubmit: (d: CatForm) => Promise<void>; onCancel: () => void; submitting: boolean; isEdit?: boolean
}) {
  const [form, setForm] = useState<CatForm>(initial)
  const ch = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <form onSubmit={async e => { e.preventDefault(); await onSubmit(form) }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label className="md-label">Category name *</label>
          <input className="md-input" name="category_name" value={form.category_name} onChange={ch} required placeholder="e.g. Microsoft 365" />
        </div>
        <div>
          <label className="md-label">Category code *</label>
          <input className="md-input" name="category_code" value={form.category_code} onChange={ch} required placeholder="e.g. M365" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="md-label">Description</label>
          <input className="md-input" name="description" value={form.description} onChange={ch} placeholder="Short description" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="md-label">Subcategories (semicolon-separated)</label>
          <textarea className="md-textarea" name="subcategories" value={form.subcategories} onChange={ch} rows={3}
            placeholder="Global Admin;SharePoint Admin;Exchange Admin" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting} className="md-btn md-btn-primary">
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
        </button>
        <button type="button" onClick={onCancel} className="md-btn md-btn-text">Cancel</button>
      </div>
    </form>
  )
}

export default function CategoriesPage() {
  const { showToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.listCategories()
      .then(setCategories)
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : 'Failed to load', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = query
    ? categories.filter(c => c.category_name.toLowerCase().includes(query.toLowerCase()) || c.category_code.toLowerCase().includes(query.toLowerCase()))
    : categories

  async function handleAdd(data: CatForm) {
    setSubmitting(true)
    try {
      const cat = await api.createCategory(data)
      setCategories(p => [...p, cat]); setShowAdd(false)
      showToast(`Category "${data.category_name}" added`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
    finally { setSubmitting(false) }
  }

  async function handleEdit(id: string, data: CatForm) {
    setSubmitting(true)
    try {
      const cat = await api.updateCategory(id, data)
      setCategories(p => p.map(c => c.category_id === id ? cat : c)); setEditing(null)
      showToast('Category updated', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
    finally { setSubmitting(false) }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await api.deleteCategory(id); setCategories(p => p.filter(c => c.category_id !== id))
      if (expanded === id) setExpanded(null)
      showToast(`Category deleted`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to delete', 'error') }
    finally { setDeleting(null) }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ height: 28, width: 140, background: 'var(--surface-2)', borderRadius: 6 }} />
        <div style={{ height: 36, width: 140, background: 'var(--surface-2)', borderRadius: 18 }} />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ height: 56, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Categories</div>
          <div className="page-subtitle">{categories.length} categories</div>
        </div>
        <button className="md-btn md-btn-primary" onClick={() => { setShowAdd(true); setEditing(null) }}>
          <span className="icon icon-sm">add</span>Add category
        </button>
      </div>

      <div style={{ position: 'relative', maxWidth: 480 }}>
        <span className="icon icon-sm" style={{
          position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-3)', pointerEvents: 'none',
        }}>search</span>
        <input
          type="text" placeholder="Search categories…" value={query}
          onChange={e => setQuery(e.target.value)}
          className="md-input" style={{ paddingLeft: 42, paddingRight: query ? 42 : 16 }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: 6, borderRadius: '50%',
            display: 'flex', alignItems: 'center',
          }}>
            <span className="icon icon-sm">close</span>
          </button>
        )}
      </div>

      {showAdd && (
        <div className="md-card animate-in" style={{ padding: '24px 28px' }}>
          <h2 className="section-title" style={{ marginBottom: 20 }}>New category</h2>
          <CategoryForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} submitting={submitting} />
        </div>
      )}

      <div className="md-card" style={{ overflow: 'hidden', padding: 0 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <span className="icon icon-xl" style={{ color: 'var(--text-3)', display: 'block', marginBottom: 12 }}>category</span>
            <div style={{ color: 'var(--text-2)', fontSize: 14 }}>{query ? 'No categories match your search' : 'No categories yet'}</div>
          </div>
        ) : filtered.map((cat, i) => (
          <div key={cat.category_id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>

            <div
              className="md-row"
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}
              onClick={() => { setExpanded(e => e === cat.category_id ? null : cat.category_id); setEditing(null) }}
            >
              <span className="icon" style={{ color: 'var(--text-3)' }}>category</span>
              <div style={{ width: 80, flexShrink: 0 }}>
                <span className="md-chip">{cat.category_code}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{cat.category_name}</div>
                {cat.description && <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{cat.description}</div>}
              </div>
              <div style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-3)' }}>
                {cat.subcategories.length} subcategories
              </div>
              <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{expanded === cat.category_id ? 'expand_less' : 'expand_more'}</span>
            </div>

            {expanded === cat.category_id && (
              <div style={{ padding: '20px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                {editing === cat.category_id ? (
                  <CategoryForm
                    initial={{
                      category_name: cat.category_name,
                      category_code: cat.category_code,
                      description: cat.description,
                      subcategories: cat.subcategories.join(';'),
                    }}
                    onSubmit={d => handleEdit(cat.category_id, d)}
                    onCancel={() => setEditing(null)}
                    submitting={submitting}
                    isEdit
                  />
                ) : (
                  <div>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Description</div>
                      <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{cat.description || '—'}</div>
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>
                        Subcategories ({cat.subcategories.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {cat.subcategories.map(s => <span key={s} className="md-chip">{s}</span>)}
                        {cat.subcategories.length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 14 }}>No subcategories</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="md-btn md-btn-tonal md-btn-sm" onClick={() => setEditing(cat.category_id)}>
                        <span className="icon icon-sm">edit</span>Edit
                      </button>
                      <button className="md-btn md-btn-danger md-btn-sm" onClick={() => handleDelete(cat.category_id, cat.category_name)} disabled={deleting === cat.category_id}>
                        <span className="icon icon-sm">delete</span>{deleting === cat.category_id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
