import { NextRequest, NextResponse } from 'next/server'
import { validateAutomationKey } from '@/lib/internalApiAuth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const authError = validateAutomationKey(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('customerPhone')
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'customerPhone parameter is required' }, { status: 400 })
  }

  const direct = await db.invoice.findFirst({
    where: { customerPhone: phone },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })

  if (direct) {
    return NextResponse.json({ ok: true, data: direct })
  }

  // Fallback: find via WhatsApp session link
  const session = await db.whatsAppOrderSession.findFirst({
    where: { customerPhone: phone, status: 'CONFIRMED', invoiceId: { not: null } },
    select: { invoiceId: true },
    orderBy: { updatedAt: 'desc' },
  })

  if (!session?.invoiceId) {
    return NextResponse.json({ ok: true, data: null })
  }

  const invoice = await db.invoice.findUnique({
    where: { id: session.invoiceId },
    include: { items: true },
  })

  return NextResponse.json({ ok: true, data: invoice ?? null })
}
