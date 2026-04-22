'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, AlertCircle, CheckCircle } from 'lucide-react'
import ImageUploader from '@/app/(dashboard)/components/ImageUploader'

type Variant = {
  id: string
  name: string
  color: string | null
  sku: string | null
  stock: number
  imageUrl: string | null
  isActive: boolean
}

type Toast = { type: 'success' | 'error'; message: string; id: number }

interface VariantManagerProps {
  productId: string
  onShowToast: (type: 'success' | 'error', message: string) => void
}

const emptyVariant = { name: '', color: '', sku: '', stock: 0, imageUrl: '', isActive: true }

export default function VariantManager({ productId, onShowToast }: VariantManagerProps) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Variant | null>(null)
  const [form, setForm] = useState(emptyVariant)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const res = await fetch(`/api/products/${productId}/variants`)
      if (!res.ok) throw new Error('Gagal mengambil variant')
      const data = await res.json()
      setVariants(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengambil variant'
      onShowToast('error', message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [productId])

  function openCreate() {
    setEditing(null)
    setForm(emptyVariant)
    setError(null)
    setShowForm(true)
  }

  function openEdit(v: Variant) {
    setEditing(v)
    setForm({
      name: v.name,
      color: v.color ?? '',
      sku: v.sku ?? '',
      stock: v.stock,
      imageUrl: v.imageUrl ?? '',
      isActive: v.isActive,
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    if (!form.name.trim()) {
      setError('Nama variant tidak boleh kosong')
      setSaving(false)
      return
    }

    if (form.stock < 0) {
      setError('Stok tidak boleh negatif')
      setSaving(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      color: form.color?.trim() || null,
      sku: form.sku?.trim() || null,
      imageUrl: form.imageUrl?.trim() || null,
      stock: Number(form.stock),
      isActive: Boolean(form.isActive),
    }

    try {
      const method = editing ? 'PUT' : 'POST'
      const url = editing 
        ? `/api/products/${productId}/variants/${editing.id}` 
        : `/api/products/${productId}/variants`

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const detailedError = errorData.details 
          ? `${errorData.error}: ${errorData.details.map((d: any) => d.message).join(', ')}`
          : errorData.error || `Error: ${res.statusText}`
        throw new Error(detailedError)
      }

      onShowToast('success', editing ? 'Variant berhasil diperbarui' : 'Variant berhasil ditambahkan')
      setShowForm(false)
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(message)
      onShowToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus variant ini?')) return
    try {
      const res = await fetch(`/api/products/${productId}/variants/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus variant')
      onShowToast('success', 'Variant berhasil dihapus')
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus variant'
      onShowToast('error', message)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Memuat variant...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Variant Produk</h3>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Tambah
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {variants.length === 0 ? (
          <div className="p-4 text-center text-gray-500 bg-gray-50">
            Belum ada variant untuk produk ini
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Nama</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Warna</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">SKU</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Stok</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Aktif</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {variants.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{v.name}</td>
                  <td className="px-3 py-2">
                    {v.color ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border border-gray-300"
                          style={{ backgroundColor: v.color }}
                        />
                        <span className="text-xs text-gray-600">{v.color}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{v.sku ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{v.stock}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      v.isActive 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {v.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(v)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
          <h4 className="font-semibold text-gray-900 mb-3">{editing ? 'Edit Variant' : 'Tambah Variant'}</h4>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">{error}</p>
                <p className="text-xs text-red-700 mt-1">Silakan periksa semua field yang wajib diisi</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {[
              { label: 'Nama Variant *', key: 'name', type: 'text', placeholder: 'contoh: Red, Blue, Green' },
              { label: 'Kode Warna (Hex)', key: 'color', type: 'text', placeholder: '#FF0000' },
              { label: 'SKU', key: 'sku', type: 'text', placeholder: 'SKU unik untuk variant' },
              { label: 'Stok', key: 'stock', type: 'number' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            {/* Image Upload */}
            <ImageUploader
              value={form.imageUrl}
              onChange={url => setForm(f => ({ ...f, imageUrl: url }))}
              label="Gambar Variant"
              placeholder="Upload foto variant"
            />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Aktif</label>
            </div>
          </div>

          <div className="mt-4 flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
