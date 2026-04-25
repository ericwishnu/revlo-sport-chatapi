import { NextRequest, NextResponse } from 'next/server'
import { validateAutomationKey } from '@/lib/internalApiAuth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const authError = validateAutomationKey(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('phone')
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'phone parameter is required' }, { status: 400 })
  }

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '5', 10), 20)

  const direct = await db.invoice.findMany({
    where: { customerPhone: phone },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  if (direct.length > 0) {
    return NextResponse.json({ ok: true, data: direct })
  }

  // Fallback: find via WhatsApp session links
  const sessions = await db.whatsAppOrderSession.findMany({
    where: { customerPhone: phone, status: 'CONFIRMED', invoiceId: { not: null } },
    select: { invoiceId: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  const invoiceIds = [...new Set(sessions.map((s) => s.invoiceId).filter(Boolean) as string[])]
  if (invoiceIds.length === 0) {
    return NextResponse.json({ ok: true, data: [] })
  }

  const data = await db.invoice.findMany({
    where: { id: { in: invoiceIds } },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ ok: true, data })
}
