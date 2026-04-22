'use client'
import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle, Download, Upload } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import ImageUploader from '@/app/(dashboard)/components/ImageUploader'
import VariantManager from '@/app/(dashboard)/components/VariantManager'

type Category = { id: string; name: string }
type Product = {
  id: string; name: string; description: string | null; price: number
  stock: number | null; sku: string | null; imageUrl: string | null
  isActive: boolean; categoryId: string | null; category: Category | null
}
type Toast = { type: 'success' | 'error'; message: string; id: number }

const emptyForm = { name: '', description: '', price: 0, stock: '', sku: '', imageUrl: '', isActive: true, categoryId: '' }

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'variant'>('info')
  const importFileRef = useRef<HTMLInputElement>(null)

  function showToast(type: 'success' | 'error', message: string) {
    const id = Date.now()
    setToasts(t => [...t, { type, message, id }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  async function load() {
    const [p, c] = await Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ])
    setProducts(p)
    setCategories(c)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setActiveTab('info')
    setShowForm(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: p.price,
      stock: p.stock?.toString() ?? '',
      sku: p.sku ?? '',
      imageUrl: p.imageUrl ?? '',
      isActive: p.isActive,
      categoryId: p.categoryId ?? '',
    })
    setActiveTab('info')
    setError(null)
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    
    // Validasi nama produk
    if (!form.name.trim()) {
      showToast('error', 'Nama produk tidak boleh kosong')
      setSaving(false)
      return
    }
    
    if (form.price <= 0) {
      showToast('error', 'Harga harus lebih besar dari 0')
      setSaving(false)
      return
    }

    const payload = {
      ...form,
      price: Number(form.price),
      stock: form.stock !== '' ? Number(form.stock) : null,
      sku: form.sku || null,
      imageUrl: form.imageUrl || null,
      categoryId: form.categoryId || null,
      description: form.description || null,
    }

    try {
      const method = editing ? 'PUT' : 'POST'
      const url = editing ? `/api/products/${editing.id}` : '/api/products'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const errorMsg = errorData.error || errorData.message || `Error: ${res.statusText}`
        setError(errorMsg)
        showToast('error', errorMsg)
        return
      }

      showToast('success', editing ? 'Produk berhasil diperbarui' : 'Produk berhasil ditambahkan')
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(message)
      showToast('error', message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus produk ini?')) return
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Error: ${res.statusText}`)
      }
      showToast('success', 'Produk berhasil dihapus')
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus produk'
      showToast('error', message)
    }
  }

  async function toggleActive(p: Product) {
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Error: ${res.statusText}`)
      }
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengubah status'
      showToast('error', message)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/products/export')
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Gagal export produk')
      }

      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast('success', 'Export produk berhasil')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal export produk'
      showToast('error', message)
    } finally {
      setExporting(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Gagal import produk')
      }

      const summary = data.summary
      showToast(
        'success',
        `Import selesai. Baru: ${summary?.created ?? 0}, Update: ${summary?.updated ?? 0}, Gagal: ${summary?.failed ?? 0}`
      )
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal import produk'
      showToast('error', message)
    } finally {
      setImporting(false)
      if (importFileRef.current) {
        importFileRef.current.value = ''
      }
    }
  }

  return (
    <div className="p-8">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produk</h1>
          <p className="text-gray-500 text-sm mt-0.5">{products.length} produk terdaftar</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={handleExport}
            disabled={exporting || importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Export...' : 'Export'}
          </button>
          <button
            onClick={() => importFileRef.current?.click()}
            disabled={exporting || importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Import...' : 'Import'}
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Tambah Produk
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Produk</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Kategori</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Harga</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stok</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  {p.sku && <p className="text-xs text-gray-400">SKU: {p.sku}</p>}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.category?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.price)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{p.stock ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(p)} className="inline-flex">
                    {p.isActive
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5 text-gray-300" />
                    }
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada produk</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900 mb-4">{editing ? 'Edit Produk' : 'Tambah Produk'}</h2>
              
              {/* Tabs */}
              <div className="flex gap-4 border-b">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`pb-2 px-1 font-medium text-sm transition-colors ${
                    activeTab === 'info'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Info Produk
                </button>
                {editing && (
                  <button
                    onClick={() => setActiveTab('variant')}
                    className={`pb-2 px-1 font-medium text-sm transition-colors ${
                      activeTab === 'variant'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Variant
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'info' ? (
                <div className="p-5 space-y-4">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-red-900">{error}</p>
                    </div>
                  )}
                  
                  {[
                    { label: 'Nama Produk *', key: 'name', type: 'text' },
                    { label: 'Harga (Rp) *', key: 'price', type: 'number' },
                    { label: 'Stok', key: 'stock', type: 'number' },
                    { label: 'SKU', key: 'sku', type: 'text' },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                      <input
                        type={type}
                        value={(form as any)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}

                  {/* Image Upload */}
                  <ImageUploader
                    value={form.imageUrl}
                    onChange={url => setForm(f => ({ ...f, imageUrl: url }))}
                    label="Gambar Produk"
                    placeholder="Upload foto produk"
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                    <select
                      value={form.categoryId}
                      onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Tanpa Kategori —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                    <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Produk aktif</label>
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  {editing && <VariantManager productId={editing.id} onShowToast={showToast} />}
                </div>
              )}
            </div>

            <div className="p-5 border-t flex gap-3 justify-end bg-gray-50">
              <button onClick={() => { setShowForm(false); setActiveTab('info') }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
              {activeTab === 'info' && (
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
