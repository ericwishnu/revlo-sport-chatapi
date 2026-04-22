'use client'
import { useEffect, useState } from 'react'
import {
  Plus, Trash2, Send, Eye, AlertCircle, CheckCircle, X, Search, ChevronDown, ChevronUp
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import ConfirmModal from '@/app/(dashboard)/components/ConfirmModal'

type InvoiceItem = {
  id: string
  name: string
  sku: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  productId: string | null
  variantId: string | null
}

type Invoice = {
  id: string
  invoiceNumber: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  notes: string | null
  subtotal: number
  shippingCost: number
  discountAmount: number
  totalAmount: number
  paymentStatus: 'UNPAID' | 'PAID' | 'CANCELLED'
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED'
  deliveredAt: string | null
  deliveryError: string | null
  items: InvoiceItem[]
  createdAt: string
}

type Product = {
  id: string
  name: string
  price: number
  sku: string | null
  variants: { id: string; name: string; sku: string | null; isActive: boolean }[]
}

type FormItem = {
  productId: string
  variantId: string
  name: string
  sku: string
  unitPrice: number
  quantity: number
}

type Toast = { type: 'success' | 'error'; message: string; id: number }

const paymentStatusLabel: Record<string, { label: string; color: string }> = {
  UNPAID: { label: 'Belum Dibayar', color: 'bg-yellow-100 text-yellow-700' },
  PAID: { label: 'Lunas', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-red-100 text-red-700' },
}

const deliveryStatusLabel: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Belum Dikirim', color: 'bg-gray-100 text-gray-600' },
  SENT: { label: 'Terkirim', color: 'bg-blue-100 text-blue-700' },
  FAILED: { label: 'Gagal', color: 'bg-red-100 text-red-700' },
}

const emptyForm = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  notes: '',
  shippingCost: 0,
  discountAmount: 0,
  sendEmail: true,
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [filterPayment, setFilterPayment] = useState('')
  const [filterDelivery, setFilterDelivery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formItems, setFormItems] = useState<FormItem[]>([])
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  function showToast(type: 'success' | 'error', message: string) {
    const id = Date.now()
    setToasts((t) => [...t, { type, message, id }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }

  async function load() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterPayment) params.set('paymentStatus', filterPayment)
    if (filterDelivery) params.set('deliveryStatus', filterDelivery)
    const res = await fetch(`/api/invoices?${params}`)
    const data = await res.json()
    setInvoices(Array.isArray(data) ? data : [])
  }

  async function loadProducts() {
    const res = await fetch('/api/products')
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    load()
  }, [search, filterPayment, filterDelivery])

  useEffect(() => {
    loadProducts()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setFormItems([])
    setShowForm(true)
  }

  function addItem() {
    setFormItems((prev) => [
      ...prev,
      { productId: '', variantId: '', name: '', sku: '', unitPrice: 0, quantity: 1 },
    ])
  }

  function removeItem(idx: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof FormItem, value: string | number) {
    setFormItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }

      if (field === 'productId') {
        const product = products.find((p) => p.id === value)
        if (product) {
          next[idx].name = product.name
          next[idx].sku = product.sku ?? ''
          next[idx].unitPrice = product.price
          next[idx].variantId = ''
        }
      }

      if (field === 'variantId' && value) {
        const product = products.find((p) => p.id === next[idx].productId)
        const variant = product?.variants.find((v) => v.id === value)
        if (variant && product) {
          next[idx].name = `${product.name} - ${variant.name}`
          next[idx].sku = variant.sku ?? product.sku ?? ''
        }
      }

      return next
    })
  }

  const subtotal = formItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const total = subtotal + Number(form.shippingCost) - Number(form.discountAmount)

  async function handleSave() {
    if (!form.customerName.trim() || !form.customerEmail.trim()) {
      showToast('error', 'Nama dan email customer wajib diisi')
      return
    }
    if (formItems.length === 0) {
      showToast('error', 'Tambahkan minimal 1 item')
      return
    }
    for (const item of formItems) {
      if (!item.name.trim() || item.unitPrice <= 0 || item.quantity < 1) {
        showToast('error', 'Pastikan semua item memiliki nama, harga, dan kuantitas yang valid')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone || null,
        notes: form.notes || null,
        shippingCost: Number(form.shippingCost),
        discountAmount: Number(form.discountAmount),
        sendEmail: form.sendEmail,
        items: formItems.map((item) => ({
          productId: item.productId || null,
          variantId: item.variantId || null,
          name: item.name,
          sku: item.sku || null,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
      }

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Gagal membuat invoice')
        return
      }

      showToast(
        'success',
        form.sendEmail
          ? `Invoice ${data.invoiceNumber} berhasil dibuat dan dikirim ke ${form.customerEmail}`
          : `Invoice ${data.invoiceNumber} berhasil dibuat`
      )
      setShowForm(false)
      load()
    } catch {
      showToast('error', 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendEmail(invoice: Invoice) {
    setSending(invoice.id)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Gagal mengirim email')
      } else {
        showToast('success', data.message)
        load()
      }
    } catch {
      showToast('error', 'Terjadi kesalahan')
    } finally {
      setSending(null)
    }
  }

  async function handleUpdatePayment(id: string, status: string) {
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus: status }),
    })
    if (res.ok) {
      showToast('success', 'Status pembayaran diperbarui')
      load()
    } else {
      showToast('error', 'Gagal memperbarui status')
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('success', 'Invoice dihapus')
      setDeleteTargetId(null)
      load()
    } else {
      showToast('error', 'Gagal menghapus invoice')
    }
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

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice</h1>
          <p className="text-gray-500 text-sm mt-0.5">{invoices.length} invoice</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Buat Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari invoice, nama, atau email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua Pembayaran</option>
          <option value="UNPAID">Belum Dibayar</option>
          <option value="PAID">Lunas</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
        <select
          value={filterDelivery}
          onChange={(e) => setFilterDelivery(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua Pengiriman</option>
          <option value="PENDING">Belum Dikirim</option>
          <option value="SENT">Terkirim</option>
          <option value="FAILED">Gagal</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8"></th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">No. Invoice</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tanggal</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Pembayaran</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoices.map((inv) => (
              <>
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedId === inv.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-blue-600">{inv.invoiceNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{inv.customerName}</p>
                    <p className="text-xs text-gray-400">{inv.customerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(inv.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatCurrency(inv.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={inv.paymentStatus}
                      onChange={(e) => handleUpdatePayment(inv.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${paymentStatusLabel[inv.paymentStatus].color}`}
                    >
                      <option value="UNPAID">Belum Dibayar</option>
                      <option value="PAID">Lunas</option>
                      <option value="CANCELLED">Dibatalkan</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${deliveryStatusLabel[inv.deliveryStatus].color}`}
                      >
                        {deliveryStatusLabel[inv.deliveryStatus].label}
                      </span>
                      {inv.deliveryStatus === 'FAILED' && inv.deliveryError && (
                        <span className="text-xs text-red-500 max-w-[120px] truncate" title={inv.deliveryError}>
                          {inv.deliveryError}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setDetailInvoice(inv)}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                        title="Lihat detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSendEmail(inv)}
                        disabled={sending === inv.id}
                        className="p-1.5 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 disabled:opacity-50"
                        title="Kirim ulang email"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(inv.id)}
                        className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                        title="Hapus invoice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === inv.id && (
                  <tr key={`${inv.id}-expanded`} className="bg-blue-50/40">
                    <td colSpan={8} className="px-8 py-4">
                      <div className="text-sm">
                        <p className="font-medium text-gray-700 mb-2">Item Pesanan</p>
                        <table className="w-full max-w-xl">
                          <thead>
                            <tr className="text-xs text-gray-500 border-b">
                              <th className="text-left pb-1">Produk</th>
                              <th className="text-center pb-1">Qty</th>
                              <th className="text-right pb-1">Harga</th>
                              <th className="text-right pb-1">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inv.items.map((item) => (
                              <tr key={item.id} className="border-b border-blue-100">
                                <td className="py-1.5 text-gray-800">
                                  {item.name}
                                  {item.sku && (
                                    <span className="text-xs text-gray-400 ml-1">({item.sku})</span>
                                  )}
                                </td>
                                <td className="py-1.5 text-center text-gray-600">{item.quantity}</td>
                                <td className="py-1.5 text-right text-gray-600">
                                  {formatCurrency(item.unitPrice)}
                                </td>
                                <td className="py-1.5 text-right font-medium text-gray-900">
                                  {formatCurrency(item.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 flex gap-6 text-xs text-gray-500">
                          {inv.shippingCost > 0 && (
                            <span>Ongkir: {formatCurrency(inv.shippingCost)}</span>
                          )}
                          {inv.discountAmount > 0 && (
                            <span>Diskon: -{formatCurrency(inv.discountAmount)}</span>
                          )}
                          {inv.notes && <span>Catatan: {inv.notes}</span>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  Belum ada invoice
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Hapus invoice"
        description="Invoice yang dihapus akan hilang dari riwayat dan tidak bisa dikembalikan."
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => deleteTargetId && handleDelete(deleteTargetId)}
      />

      {/* Create Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Buat Invoice Baru</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Customer *
                  </label>
                  <input
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Customer *
                  </label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">No. HP</label>
                  <input
                    value={form.customerPhone}
                    onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="08xx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Item Pesanan</label>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="w-4 h-4" /> Tambah Item
                  </button>
                </div>

                {formItems.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4 border border-dashed rounded-lg">
                    Klik "Tambah Item" untuk menambahkan produk
                  </p>
                )}

                <div className="space-y-2">
                  {formItems.map((item, idx) => {
                    const selectedProduct = products.find((p) => p.id === item.productId)
                    return (
                      <div key={idx} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-5">
                            <select
                              value={item.productId}
                              onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">— Pilih Produk —</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                              <option value="__custom__">— Input Manual —</option>
                            </select>
                          </div>
                          {selectedProduct && selectedProduct.variants.length > 0 && (
                            <div className="col-span-3">
                              <select
                                value={item.variantId}
                                onChange={(e) => updateItem(idx, 'variantId', e.target.value)}
                                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">— Variant —</option>
                                {selectedProduct.variants
                                  .filter((v) => v.isActive)
                                  .map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                          <div className="col-span-2">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Qty"
                            />
                          </div>
                          <div className="col-span-2 flex items-center justify-end">
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {(!item.productId || item.productId === '__custom__') && (
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              value={item.name}
                              onChange={(e) => updateItem(idx, 'name', e.target.value)}
                              className="col-span-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Nama produk"
                            />
                            <input
                              value={item.sku}
                              onChange={(e) => updateItem(idx, 'sku', e.target.value)}
                              className="col-span-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="SKU (opsional)"
                            />
                            <input
                              type="number"
                              min={0}
                              value={item.unitPrice}
                              onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                              className="col-span-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Harga satuan"
                            />
                          </div>
                        )}
                        {item.productId && item.productId !== '__custom__' && item.name && (
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{item.name}{item.sku ? ` · SKU: ${item.sku}` : ''}</span>
                            <span className="font-medium text-gray-800">
                              {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.unitPrice * item.quantity)}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Shipping & Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ongkos Kirim</label>
                  <input
                    type="number"
                    min={0}
                    value={form.shippingCost}
                    onChange={(e) => setForm((f) => ({ ...f, shippingCost: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Diskon</label>
                  <input
                    type="number"
                    min={0}
                    value={form.discountAmount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discountAmount: Number(e.target.value) }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Total preview */}
              {formItems.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {Number(form.shippingCost) > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Ongkos Kirim</span>
                      <span>{formatCurrency(Number(form.shippingCost))}</span>
                    </div>
                  )}
                  {Number(form.discountAmount) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Diskon</span>
                      <span>-{formatCurrency(Number(form.discountAmount))}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-blue-200 pt-1">
                    <span>Total</span>
                    <span className="text-blue-600">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}

              {/* Send email toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={form.sendEmail}
                  onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="sendEmail" className="text-sm text-gray-700">
                  Kirim invoice ke email customer setelah dibuat
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
                {saving ? 'Membuat...' : 'Buat Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{detailInvoice.invoiceNumber}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(detailInvoice.createdAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button
                onClick={() => setDetailInvoice(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Customer</p>
                <p className="font-medium">{detailInvoice.customerName}</p>
                <p className="text-sm text-gray-600">{detailInvoice.customerEmail}</p>
                {detailInvoice.customerPhone && (
                  <p className="text-sm text-gray-600">{detailInvoice.customerPhone}</p>
                )}
              </div>

              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Produk</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detailInvoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        {item.name}
                        {item.sku && <span className="text-xs text-gray-400 ml-1">({item.sku})</span>}
                      </td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(detailInvoice.subtotal)}</span>
                </div>
                {detailInvoice.shippingCost > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Ongkos Kirim</span>
                    <span>{formatCurrency(detailInvoice.shippingCost)}</span>
                  </div>
                )}
                {detailInvoice.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Diskon</span>
                    <span>-{formatCurrency(detailInvoice.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                  <span>Total</span>
                  <span className="text-blue-600">{formatCurrency(detailInvoice.totalAmount)}</span>
                </div>
              </div>

              {detailInvoice.notes && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <strong>Catatan:</strong> {detailInvoice.notes}
                </div>
              )}

              <div className="flex gap-3">
                <div>
                  <p className="text-xs text-gray-500">Status Pembayaran</p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${paymentStatusLabel[detailInvoice.paymentStatus].color}`}
                  >
                    {paymentStatusLabel[detailInvoice.paymentStatus].label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status Email</p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${deliveryStatusLabel[detailInvoice.deliveryStatus].color}`}
                  >
                    {deliveryStatusLabel[detailInvoice.deliveryStatus].label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
