import { db } from './db'

export type AutomationEvent =
  | 'invoice_created'
  | 'payment_claimed'
  | 'payment_verified'
  | 'order_completed'
  | 'order_cancelled'

export interface WebhookItem {
  productName: string
  variantName?: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface AutomationPayload {
  customer: { name: string; phone: string | null }
  order: {
    sessionId?: string
    invoiceId: string
    invoiceNumber: string
    orderStatus: string
    paymentStatus: string
    paymentMethod?: string | null
    subtotal: number
    shippingCost: number
    total: number
  }
  items: WebhookItem[]
  meta?: { channel?: string; note?: string | null }
}

function generateEventId(): string {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `evt_${ts}_${rand}`
}

export async function sendAutomationWebhook(
  event: AutomationEvent,
  payload: AutomationPayload
): Promise<void> {
  try {
    const settings = await db.siteSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings?.automationEnabled || !settings.automationWebhookUrl) return

    const body = {
      event,
      eventId: generateEventId(),
      occurredAt: new Date().toISOString(),
      source: 'revlo-backend',
      store: {
        name: settings.storeName,
        domain: process.env.NEXTAUTH_URL?.replace(/^https?:\/\//, '') ?? 'revlo-backend',
      },
      ...payload,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-revlo-event': event,
      'x-revlo-event-id': body.eventId,
    }
    if (settings.automationWebhookSecret) {
      headers['x-revlo-webhook-secret'] = settings.automationWebhookSecret
    }

    const res = await fetch(settings.automationWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.error(`[automation] Webhook ${event} failed: ${res.status} ${res.statusText}`)
    } else {
      console.log(`[automation] Webhook sent: ${event} (${body.eventId})`)
    }
  } catch (err) {
    // Never re-throw — webhook failures must not break core business flow
    console.error(`[automation] Webhook error (${event}):`, err instanceof Error ? err.message : err)
  }
}

export function extractPaymentMethod(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(/Pembayaran via:\s*([^|]+)/i)
  return match?.[1]?.trim() ?? null
}
