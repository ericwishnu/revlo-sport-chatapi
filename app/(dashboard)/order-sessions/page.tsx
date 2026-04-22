'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import ConfirmModal from '@/app/(dashboard)/components/ConfirmModal'

type SessionStatus = 'DRAFT' | 'AWAITING_CONFIRMATION' | 'CONFIRMED' | 'CANCELLED'

type InvoiceSummary = {
  id: string
  invoiceNumber: string
  totalAmount: number
  paymentStatus: 'UNPAID' | 'PAID' | 'CANCELLED'
  orderStatus:
    | 'AWAITING_PAYMENT'
    | 'AWAITING_VERIFICATION'
    | 'PAYMENT_CONFIRMED'
    | 'PROCESSING'
    | 'COMPLETED'
  createdAt: string
}

type OrderSession = {
  id: string
  customerPhone: string
  status: SessionStatus
  currentStep: string
  payloadJson: Record<string, unknown>
  invoiceId: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
  invoice: InvoiceSummary | null
}

type ApiResponse = {
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  data: OrderSession[]
}

type Toast = { type: 'success' | 'error'; message: string; id: number }

const statusLabel: Record<SessionStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  AWAITING_CONFIRMATION: {
    label: 'Menunggu Konfirmasi',
    color: 'bg-amber-100 text-amber-800',
  },
  CONFIRMED: { label: 'Terkonfirmasi', color: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-red-100 text-red-700' },
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function OrderSessionsPage() {
  const [rows, setRows] = useState<OrderSession[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [phoneFilter, setPhoneFilter] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [meta, setMeta] = useState<ApiResponse['meta']>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<OrderSession | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (phoneFilter.trim()) params.set('customerPhone', phoneFilter.trim())
    params.set('activeOnly', String(activeOnly))
    params.set('page', String(page))
    params.set('limit', String(limit))
    return params.toString()
  }, [statusFilter, phoneFilter, activeOnly, page, limit])

  function showToast(type: 'success' | 'error', message: string) {
    const id = Date.now()
    setToasts((prev) => [...prev, { type, message, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 4000)
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/session?${query}`)
      const data = (await res.json()) as ApiResponse | { error?: string }
      if (!res.ok || !('data' in data)) {
        showToast('error', 'Gagal memuat order session')
        return
      }
      setRows(data.data)
      setMeta(data.meta)
    } catch {
      showToast('error', 'Terjadi kesalahan saat mengambil data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [query])

  async function handleCancelSession(sessionId: string) {
    try {
      const res = await fetch(`/api/orders/session/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        showToast('error', data?.error || 'Gagal membatalkan session')
        return
      }

      showToast('success', data?.message || 'Session berhasil dibatalkan')
      setCancelTarget(null)
      load()
    } catch {
      showToast('error', 'Terjadi kesalahan saat membatalkan session')
    }
  }

  return (
    <div className="p-8">
      <div className="fixed top-4 right-4 z-[9999] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Session</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Pantau sesi pemesanan WhatsApp customer secara real-time
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={phoneFilter}
            onChange={(e) => {
              setPage(1)
              setPhoneFilter(e.target.value)
            }}
            placeholder="Cari nomor WhatsApp..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1)
            setStatusFilter(e.target.value)
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua Status</option>
          <option value="DRAFT">Draft</option>
          <option value="AWAITING_CONFIRMATION">Menunggu Konfirmasi</option>
          <option value="CONFIRMED">Terkonfirmasi</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>

        <select
          value={String(activeOnly)}
          onChange={(e) => {
            setPage(1)
            setActiveOnly(e.target.value === 'true')
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="true">Hanya Sesi Aktif</option>
          <option value="false">Semua Sesi</option>
        </select>

        <select
          value={String(limit)}
          onChange={(e) => {
            setPage(1)
            setLimit(Number(e.target.value))
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="20">20 / halaman</option>
          <option value="50">50 / halaman</option>
          <option value="100">100 / halaman</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" />
              <th className="text-left px-4 py-3 font-medium text-gray-600">No. WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Step</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Updated</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Expired</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedId === row.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.customerPhone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusLabel[row.status].color}`}>
                      {statusLabel[row.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.currentStep}</td>
                  <td className="px-4 py-3">
                    {row.invoice ? (
                      <div className="space-y-0.5">
                        <p className="font-mono text-blue-600">{row.invoice.invoiceNumber}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(row.invoice.totalAmount)}</p>
                        <Link
                          href={`/invoices?search=${encodeURIComponent(row.invoice.invoiceNumber)}`}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Buka Invoice
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Belum ada invoice</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(row.updatedAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(row.expiresAt)}</td>
                </tr>

                {expandedId === row.id && (
                  <tr key={`${row.id}-expanded`} className="bg-blue-50/40">
                    <td colSpan={7} className="px-8 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white border rounded-lg p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Payload Session
                          </p>
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words bg-gray-50 rounded p-3 max-h-64 overflow-auto">
                            {JSON.stringify(row.payloadJson ?? {}, null, 2)}
                          </pre>
                        </div>

                        <div className="bg-white border rounded-lg p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Ringkasan Session
                          </p>
                          <div className="text-sm text-gray-700 space-y-1">
                            <p>
                              <span className="text-gray-500">Session ID:</span> {row.id}
                            </p>
                            <p>
                              <span className="text-gray-500">Dibuat:</span> {formatDate(row.createdAt)}
                            </p>
                            <p>
                              <span className="text-gray-500">Update Terakhir:</span> {formatDate(row.updatedAt)}
                            </p>
                            {row.invoice && (
                              <>
                                <p>
                                  <span className="text-gray-500">Status Pembayaran:</span>{' '}
                                  {row.invoice.paymentStatus}
                                </p>
                                <p>
                                  <span className="text-gray-500">Status Order:</span> {row.invoice.orderStatus}
                                </p>
                                <div className="pt-1">
                                  <Link
                                    href={`/invoices?search=${encodeURIComponent(row.invoice.invoiceNumber)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-700"
                                  >
                                    Lihat Invoice di Tab Baru
                                  </Link>
                                </div>
                              </>
                            )}
                          </div>

                          {row.status !== 'CANCELLED' && row.status !== 'CONFIRMED' && (
                            <div className="mt-3 pt-3 border-t">
                              <button
                                onClick={() => setCancelTarget(row)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
                              >
                                Batalkan Session
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {loading ? 'Memuat data...' : 'Belum ada order session'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Total {meta.total} session • Halaman {meta.page} dari {meta.totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={meta.page <= 1}
            className="px-3 py-1.5 text-sm border rounded-lg text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Prev
            </span>
          </button>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={meta.page >= meta.totalPages}
            className="px-3 py-1.5 text-sm border rounded-lg text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-1">
              Next <ChevronRight className="w-4 h-4" />
            </span>
          </button>
        </div>
      </div>

      <ConfirmModal
        open={cancelTarget !== null}
        title="Batalkan session"
        description="Session pemesanan ini akan ditandai sebagai dibatalkan. Lanjutkan?"
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && handleCancelSession(cancelTarget.id)}
      />
    </div>
  )
}
