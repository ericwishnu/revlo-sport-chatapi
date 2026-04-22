'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type ShippingMethod = {
  id: string; name: string; description: string | null; estimatedDays: string
  cost: number | null; isFree: boolean; isActive: boolean
}

const emptyForm = { name: '', description: '', estimatedDays: '', cost: '', isFree: false, isActive: true }

export default function ShippingPage() {
  const [methods, setMethods] = useState<ShippingMethod[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ShippingMethod | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    const data = await fetch('/api/shipping').then(r => r.json())
    setMethods(data)
  }

  useEffect(() => { load() }, [])

  function openCreate() { setEditing(null); setForm(emptyForm); setShowForm(true) }

  function openEdit(m: ShippingMethod) {
    setEditing(m)
    setForm({ name: m.name, description: m.description ?? '', estimatedDays: m.estimatedDays, cost: m.cost?.toString() ?? '', isFree: m.isFree, isActive: m.isActive })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { ...form, cost: form.cost !== '' ? Number(form.cost) : null, description: form.description || null }
    const url = editing ? `/api/shipping/${editing.id}` : '/api/shipping'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false); setShowForm(false); load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus metode pengiriman ini?')) return
    await fetch(`/api/shipping/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggleActive(m: ShippingMethod) {
    await fetch(`/api/shipping/${m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !m.isActive }) })
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pengiriman</h1>
          <p className="text-gray-500 text-sm mt-0.5">Konfigurasi metode dan estimasi pengiriman</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> Tambah Metode
        </button>
      </div>

      <div className="grid gap-3">
        {methods.map(m => (
          <div key={m.id} className="bg-white rounded-xl border p-5 flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">{m.name}</h3>
                {!m.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Nonaktif</span>}
                {m.isFree && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Gratis</span>}
              </div>
              {m.description && <p className="text-sm text-gray-500 mb-2">{m.description}</p>}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">Estimasi: <strong>{m.estimatedDays}</strong></span>
                {!m.isFree && m.cost != null && <span className="text-gray-600">Biaya: <strong>{formatCurrency(m.cost)}</strong></span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(m)}>
                {m.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
              </button>
              <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {methods.length === 0 && <div className="text-center text-gray-400 py-8">Belum ada metode pengiriman</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b"><h2 className="font-semibold text-gray-900">{editing ? 'Edit' : 'Tambah'} Metode Pengiriman</h2></div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Nama *', key: 'name', type: 'text' },
                { label: 'Estimasi Waktu *', key: 'estimatedDays', type: 'text', placeholder: 'contoh: 2-3 hari kerja' },
                { label: 'Biaya (Rp)', key: 'cost', type: 'number' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} placeholder={placeholder} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isFree} onChange={e => setForm(f => ({ ...f, isFree: e.target.checked }))} />
                  Gratis Ongkir
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                  Aktif
                </label>
              </div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
