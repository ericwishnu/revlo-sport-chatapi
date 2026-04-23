'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Bot, MessageSquare, RefreshCw, Send, User } from 'lucide-react'

type ChatRole = 'customer' | 'bot'

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  createdAt: Date
}

type SessionResponse = {
  sessionId: string | null
  customerPhone: string
  status: string
  currentStep: string
  reply: string
}

export default function ChatSimulatorPage() {
  const [customerPhone, setCustomerPhone] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  const canStart = useMemo(() => customerPhone.trim().length > 0 && !loading, [customerPhone, loading])
  const canSend = useMemo(
    () => customerPhone.trim().length > 0 && message.trim().length > 0 && !loading,
    [customerPhone, message, loading]
  )

  function pushMessage(role: ChatRole, text: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text,
        createdAt: new Date(),
      },
    ])
  }

  async function callApi(path: string, payload: Record<string, unknown>): Promise<SessionResponse> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.error || 'Gagal memproses simulasi')
    }

    return data as SessionResponse
  }

  async function handleStartSession() {
    if (!canStart) return

    setLoading(true)
    setErrorText('')

    try {
      const data = await callApi('/api/orders/session/start', {
        customerPhone: customerPhone.trim(),
      })

      setSessionId(data.sessionId)
      setMessages([])
      pushMessage('bot', data.reply)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return

    const input = message.trim()
    pushMessage('customer', input)
    setMessage('')
    setLoading(true)
    setErrorText('')

    try {
      const payload: Record<string, unknown> = {
        customerPhone: customerPhone.trim(),
        message: input,
      }

      if (sessionId) payload.sessionId = sessionId

      const data = await callApi('/api/orders/session/message', payload)
      setSessionId(data.sessionId)
      pushMessage('bot', data.reply)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setSessionId(null)
    setMessages([])
    setMessage('')
    setErrorText('')
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Simulasi Respon Chat Customer</h1>
        <p className="text-sm text-gray-500 mt-1">
          Uji respon bot menggunakan endpoint order session yang sama dengan traffic WhatsApp asli.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Customer</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="628123456789"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleStartSession}
              disabled={!canStart}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              <MessageSquare className="w-4 h-4" />
              Mulai Sesi
            </button>
            <button
              onClick={handleReset}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Session ID: <span className="font-mono text-gray-700">{sessionId || '-'}</span>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="h-[460px] overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-10">
              Belum ada percakapan. Isi nomor customer lalu klik "Mulai Sesi".
            </div>
          ) : (
            messages.map((item) => (
              <div
                key={item.id}
                className={`flex ${item.role === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 shadow-sm border whitespace-pre-wrap text-sm leading-relaxed ${
                    item.role === 'customer'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-800 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
                    {item.role === 'customer' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                    <span>{item.role === 'customer' ? 'Customer' : 'Bot'}</span>
                  </div>
                  {item.text}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendMessage} className="border-t bg-white p-3">
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ketik pesan customer di sini..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Kirim
            </button>
          </div>
          {errorText ? <p className="mt-2 text-sm text-red-600">{errorText}</p> : null}
        </form>
      </div>
    </div>
  )
}
