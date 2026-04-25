import { NextRequest, NextResponse } from 'next/server'
import { validateAutomationKey } from '@/lib/internalApiAuth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const authError = validateAutomationKey(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const dateParam = searchParams.get('date') // YYYY-MM-DD

  const base = dateParam ? new Date(dateParam) : new Date()
  if (isNaN(base.getTime())) {
    return NextResponse.json({ ok: false, error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 })
  }

  const startOfDay = new Date(base)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(base)
  endOfDay.setHours(23, 59, 59, 999)

  const invoices = await db.invoice.findMany({
    where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    select: { totalAmount: true, paymentStatus: true, orderStatus: true },
  })

  const totalOrders = invoices.length
  const totalRevenue = invoices
    .filter((i) => i.paymentStatus === 'PAID')
    .reduce((sum, i) => sum + i.totalAmount, 0)

  return NextResponse.json({
    ok: true,
    data: {
      date: startOfDay.toISOString().slice(0, 10),
      totalOrders,
      totalRevenue,
      awaitingPayment: invoices.filter((i) => i.orderStatus === 'AWAITING_PAYMENT').length,
      awaitingVerification: invoices.filter((i) => i.orderStatus === 'AWAITING_VERIFICATION').length,
      processing: invoices.filter((i) => i.orderStatus === 'PROCESSING').length,
      completed: invoices.filter((i) => i.orderStatus === 'COMPLETED').length,
    },
  })
}
