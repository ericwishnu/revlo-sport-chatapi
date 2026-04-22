'use client'
import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown, AlertCircle, CheckCircle, X, Bot, Users, FileText
} from 'lucide-react'
import ConfirmModal from '@/app/(dashboard)/components/ConfirmModal'

type MenuType = 'CHATBOT' | 'HANDOFF' | 'STATIC'

type WhatsappMenu = {
  id: string
  menuKey: string
  title: string
  type: MenuType
  prompt: string | null
  content: string | null
  isActive: boolean
  sortOrder: number
}

type Toast = { type: 'success' | 'error'; message: string; id: number }

const typeOptions: { value: MenuType; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'CHATBOT', label: 'Chatbot', icon: Bot, desc: 'Jawab otomatis menggunakan AI & knowledge base' },
  { value: 'STATIC', label: 'Konten Statis', icon: FileText, desc: 'Tampilkan teks tetap (cocok untuk promo)' },
  { value: 'HANDOFF', label: 'Hubungi Admin', icon: Users, desc: 'Eskalasikan ke admin manusia' },
]

const emptyForm = {
  menuKey: '',
  title: '',
  type: 'CHATBOT' as MenuType,
  prompt: '',
  content: '',
  isActive: true,
}

export default function WhatsappMenuPage() {
  const [menus, setMenus] = useState<WhatsappMenu[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WhatsappMenu | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [deleteTarget, setDeleteTarget] = useState<WhatsappMenu | null>(null)

  function formatApiError(data: any, fallback: string) {
    if (Array.isArray(data?.details) && data.details.length > 0) {
      return `${data.error || fallback}: ${data.details.map((item: any) => item.message || item).join(', ')}`
    }
    return data?.error || fallback
  }

  function showToast(type: 'success' | 'error', message: string) {
    const id = Date.now()
    setToasts((t) => [...t, { type, message, id }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }

  async function load() {
    const res = await fetch('/api/settings/whatsapp-menu')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      showToast('error', formatApiError(data, 'Gagal mengambil daftar menu'))
      return
    }
    setMenus(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(m: WhatsappMenu) {
    setEditing(m)
    setForm({
      menuKey: m.menuKey,
      title: m.title,
      type: m.type,
      prompt: m.prompt ?? '',
      content: m.content ?? '',
      isActive: m.isActive,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.menuKey.trim() || !form.title.trim()) {
      showToast('error', 'Menu key dan judul wajib diisi')
      return
    }
    if (form.type === 'CHATBOT' && !form.prompt.trim()) {
      showToast('error', 'Prompt wajib diisi untuk tipe Chatbot')
      return
    }
    if (form.type === 'STATIC' && !form.content.trim()) {
      showToast('error', 'Konten wajib diisi untuk tipe Konten Statis')
      return
    }

    setSaving(true)
    try {
      const payload = {
        menuKey: form.menuKey.trim(),
        title: form.title.trim(),
        type: form.type,
        prompt: form.type === 'CHATBOT' ? form.prompt.trim() : null,
        content: form.type === 'STATIC' ? form.content.trim() : null,
        isActive: form.isActive,
        sortOrder: editing?.sortOrder ?? menus.length,
      }

      const url = editing ? `/api/settings/whatsapp-menu/${editing.id}` : '/api/settings/whatsapp-menu'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        showToast('error', formatApiError(data, 'Gagal menyimpan'))
        return
      }
      showToast('success', editing ? 'Menu berhasil diperbarui' : 'Menu berhasil ditambahkan')
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      load()
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(m: WhatsappMenu) {
    const res = await fetch(`/api/settings/whatsapp-menu/${m.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !m.isActive }),
    })
    if (res.ok) load()
    else {
      const data = await res.json().catch(() => null)
      showToast('error', formatApiError(data, 'Gagal mengubah status'))
    }
  }

  async function handleDelete(m: WhatsappMenu) {
    const res = await fetch(`/api/settings/whatsapp-menu/${m.id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('success', 'Menu dihapus')
      setDeleteTarget(null)
      load()
    } else {
      const data = await res.json().catch(() => null)
      showToast('error', formatApiError(data, 'Gagal menghapus'))
    }
  }

  async function move(index: number, direction: 'up' | 'down') {
    const next = [...menus]
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
    const reordered = next.map((m, i) => ({ ...m, sortOrder: i }))
    setMenus(reordered)

    await fetch('/api/settings/whatsapp-menu/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: reordered.map((m) => ({ id: m.id, sortOrder: m.sortOrder })) }),
    })
  }

  const typeInfo: Record<MenuType, { label: string; color: string }> = {
    CHATBOT: { label: 'Chatbot', color: 'bg-blue-100 text-blue-700' },
    HANDOFF: { label: 'Admin', color: 'bg-purple-100 text-purple-700' },
    STATIC: { label: 'Statis', color: 'bg-amber-100 text-amber-700' },
  }

  return (
    <div className="p-8">
      {/* Toast */}
      <div className="fixed top-4 right-4 z-[9999] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              t.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {t.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {t.message}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu WhatsApp Bot</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Kelola menu interaktif yang tampil saat customer memulai chat
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Tambah Menu
        </button>
      </div>

      {/* Preview box */}
      <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
          Preview menu aktif
        </p>
        <div className="text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
          {menus.filter((m) => m.isActive).length === 0
            ? 'Belum ada menu aktif'
            : menus
                .filter((m) => m.isActive)
                .map((m) => `[${m.menuKey}] ${m.title}`)
                .join('\n')}
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">Urutan</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">Key</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Judul</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tipe</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {menus.map((m, idx) => (
              <tr key={m.id} className={`hover:bg-gray-50 ${!m.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(idx, 'up')}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => move(idx, 'down')}
                      disabled={idx === menus.length - 1}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono font-bold text-gray-900 text-base">{m.menuKey}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{m.title}</p>
                  {m.type === 'CHATBOT' && m.prompt && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{m.prompt}</p>
                  )}
                  {m.type === 'STATIC' && m.content && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{m.content}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeInfo[m.type].color}`}>
                    {typeInfo[m.type].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(m)}>
                    {m.isActive ? (
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-300" />
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => openEdit(m)}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {menus.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  Belum ada menu. Klik "Tambah Menu" untuk memulai.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                {editing ? 'Edit Menu' : 'Tambah Menu Baru'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Menu Key *
                  </label>
                  <input
                    value={form.menuKey}
                    onChange={(e) => setForm((f) => ({ ...f, menuKey: e.target.value }))}
                    placeholder="Contoh: 1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">Tombol yang ditekan customer</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Judul Menu *
                  </label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Contoh: Cek Produk"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipe Menu *</label>
                <div className="space-y-2">
                  {typeOptions.map(({ value, label, icon: Icon, desc }) => (
                    <label
                      key={value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        form.type === value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="type"
                        value={value}
                        checked={form.type === value}
                        onChange={() => setForm((f) => ({ ...f, type: value }))}
                        className="mt-0.5"
                      />
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{label}</p>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Chatbot prompt */}
              {form.type === 'CHATBOT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prompt untuk AI *
                  </label>
                  <textarea
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    rows={3}
                    placeholder="Contoh: Jelaskan metode pembayaran yang tersedia untuk customer."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Perintah yang dikirim ke AI untuk menghasilkan respons
                  </p>
                </div>
              )}

              {/* Static content */}
              {form.type === 'STATIC' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Konten / Pesan *
                  </label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    rows={4}
                    placeholder="Contoh: Promo minggu ini: diskon 20% untuk semua sepatu lari!"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Teks ini akan langsung dikirimkan ke customer
                  </p>
                </div>
              )}

              {/* HANDOFF info */}
              {form.type === 'HANDOFF' && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
                  Menu ini akan mengarahkan customer ke admin manusia. Tidak ada konfigurasi tambahan.
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Menu aktif (tampil di bot)
                </label>
              </div>
            </div>

            <div className="p-5 border-t flex gap-3 justify-end bg-gray-50">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Hapus menu WhatsApp"
        description={deleteTarget ? `Menu "${deleteTarget.title}" akan dihapus dari alur chat customer.` : ''}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  )
}
