import { NextRequest, NextResponse } from 'next/server'
import { validateAutomationKey } from '@/lib/internalApiAuth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const authError = validateAutomationKey(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const olderThanMinutes = parseInt(searchParams.get('olderThanMinutes') ?? '0', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

  const cutoff = olderThanMinutes > 0 ? new Date(Date.now() - olderThanMinutes * 60 * 1000) : undefined

  const data = await db.invoice.findMany({
    where: {
      paymentStatus: 'UNPAID',
      orderStatus: 'AWAITING_PAYMENT',
      ...(cutoff ? { createdAt: { lte: cutoff } } : {}),
    },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  return NextResponse.json({ ok: true, data })
}
