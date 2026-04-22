'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react'
import ConfirmModal from '@/app/(dashboard)/components/ConfirmModal'

type Faq = { id: string; question: string; answer: string; category: string; sortOrder: number; isActive: boolean }

const emptyForm = { question: '', answer: '', category: 'Umum', sortOrder: 0, isActive: true }

export default function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Faq | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  async function load() {
    const data = await fetch('/api/faq').then(r => r.json())
    setFaqs(data)
  }

  useEffect(() => { load() }, [])

  function openCreate() { setEditing(null); setForm(emptyForm); setShowForm(true) }

  function openEdit(f: Faq) {
    setEditing(f)
    setForm({ question: f.question, answer: f.answer, category: f.category, sortOrder: f.sortOrder, isActive: f.isActive })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { ...form, sortOrder: Number(form.sortOrder) }
    const url = editing ? `/api/faq/${editing.id}` : '/api/faq'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false); setShowForm(false); load()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/faq/${id}`, { method: 'DELETE' })
    setDeleteTargetId(null)
    load()
  }

  async function toggleActive(f: Faq) {
    await fetch(`/api/faq/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !f.isActive }) })
    load()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const grouped = faqs.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push(f)
    return acc
  }, {} as Record<string, Faq[]>)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FAQ</h1>
          <p className="text-gray-500 text-sm mt-0.5">{faqs.length} pertanyaan terdaftar</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Tambah FAQ
        </button>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">{category}</h2>
            <div className="bg-white rounded-xl border divide-y overflow-hidden">
              {items.map(f => (
                <div key={f.id} className={!f.isActive ? 'opacity-50' : ''}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <button onClick={() => toggleExpand(f.id)} className="mt-0.5 text-gray-400">
                      {expanded.has(f.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 text-sm">{f.question}</p>
                      {expanded.has(f.id) && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{f.answer}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggleActive(f)}>
                        {f.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                      <button onClick={() => openEdit(f)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTargetId(f.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {faqs.length === 0 && <div className="text-center text-gray-400 py-8">Belum ada FAQ</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
            <div className="p-5 border-b"><h2 className="font-semibold text-gray-900">{editing ? 'Edit' : 'Tambah'} FAQ</h2></div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pertanyaan *</label>
                <input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jawaban *</label>
                <textarea value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Urutan</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Aktif
              </label>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Hapus FAQ"
        description="Pertanyaan dan jawaban ini akan dihapus permanen dari knowledge base."
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => deleteTargetId && handleDelete(deleteTargetId)}
      />
    </div>
  )
}
