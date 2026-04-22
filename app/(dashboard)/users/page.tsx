'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useSession } from 'next-auth/react'

type User = { id: string; name: string; email: string; role: 'ADMIN' | 'EDITOR'; createdAt: string }

export default function UsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EDITOR' as 'ADMIN' | 'EDITOR' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await fetch('/api/users').then(r => r.json())
    setUsers(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    setSaving(true); setError('')
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setSaving(false); setShowForm(false); setForm({ name: '', email: '', password: '', role: 'EDITOR' }); load()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus user "${name}"?`)) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    load()
  }

  const currentUserId = (session?.user as any)?.id

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen User</h1>
          <p className="text-gray-500 text-sm mt-0.5">{users.length} user terdaftar</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Tambah User
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Bergabung</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name} {u.id === currentUserId && <span className="text-xs text-blue-600">(Anda)</span>}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'ADMIN' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-3">
                  {u.id !== currentUserId && (
                    <button onClick={() => handleDelete(u.id, u.name)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b"><h2 className="font-semibold text-gray-900">Tambah User</h2></div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Nama *', key: 'name', type: 'text' },
                { label: 'Email *', key: 'email', type: 'email' },
                { label: 'Password *', key: 'password', type: 'password' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="EDITOR">Editor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => { setShowForm(false); setError('') }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
