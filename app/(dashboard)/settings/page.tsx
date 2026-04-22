'use client'
import { useEffect, useState } from 'react'

type BankAccount = {
  bankName: string
  accountNumber: string
  accountHolder: string
}

const emptyBankAccount = { bankName: '', accountNumber: '', accountHolder: '' }
const emptyForm = {
  storeName: '',
  storeDesc: '',
  whatsapp: '',
  email: '',
  address: '',
  bankAccounts: [] as BankAccount[],
}

export default function SettingsPage() {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      setForm({
        storeName: d.storeName ?? '',
        storeDesc: d.storeDesc ?? '',
        whatsapp: d.whatsapp ?? '',
        email: d.email ?? '',
        address: d.address ?? '',
        bankAccounts: Array.isArray(d.bankAccounts) ? d.bankAccounts : [],
      })
    })
  }, [])

  function addBankAccount() {
    setForm((f) => ({ ...f, bankAccounts: [...f.bankAccounts, { ...emptyBankAccount }] }))
  }

  function updateBankAccount(index: number, field: keyof BankAccount, value: string) {
    setForm((f) => ({
      ...f,
      bankAccounts: f.bankAccounts.map((account, accountIndex) =>
        accountIndex === index ? { ...account, [field]: value } : account
      ),
    }))
  }

  function removeBankAccount(index: number) {
    setForm((f) => ({
      ...f,
      bankAccounts: f.bankAccounts.filter((_, accountIndex) => accountIndex !== index),
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const fields = [
    { label: 'Nama Toko *', key: 'storeName', type: 'text' },
    { label: 'WhatsApp', key: 'whatsapp', type: 'text', placeholder: '628123456789' },
    { label: 'Email', key: 'email', type: 'email' },
  ]

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan Toko</h1>
        <p className="text-gray-500 text-sm mt-0.5">Data ini akan tampil di knowledge base chatbot</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border p-6 space-y-5">
        {fields.map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input type={type} placeholder={placeholder} value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Toko</label>
          <textarea value={form.storeDesc} onChange={e => setForm(f => ({ ...f, storeDesc: e.target.value }))} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
          <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700">Rekening Bank</label>
              <p className="text-xs text-gray-500 mt-1">Data ini akan dipakai chatbot untuk memberi informasi pembayaran.</p>
            </div>
            <button
              type="button"
              onClick={addBankAccount}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Tambah Rekening
            </button>
          </div>

          {form.bankAccounts.length === 0 && (
            <div className="text-sm text-gray-400 border border-dashed rounded-lg px-4 py-5 text-center">
              Belum ada rekening bank.
            </div>
          )}

          <div className="space-y-3">
            {form.bankAccounts.map((account, index) => (
              <div key={index} className="border rounded-xl p-4 space-y-3 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Bank</label>
                    <input
                      type="text"
                      value={account.bankName}
                      onChange={e => updateBankAccount(index, 'bankName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="BCA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Rekening</label>
                    <input
                      type="text"
                      value={account.accountNumber}
                      onChange={e => updateBankAccount(index, 'accountNumber', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Atas Nama</label>
                    <input
                      type="text"
                      value={account.accountHolder}
                      onChange={e => updateBankAccount(index, 'accountHolder', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Momentum Asia"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeBankAccount(index)}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Hapus Rekening
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
          {saved && <span className="text-sm text-green-600">Tersimpan!</span>}
        </div>
      </form>
    </div>
  )
}
