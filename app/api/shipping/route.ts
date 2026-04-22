import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  estimatedDays: z.string().min(1),
  cost: z.number().optional().nullable(),
  isFree: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const methods = await db.shippingMethod.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(methods)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = schema.parse(await req.json())
  const method = await db.shippingMethod.create({ data })
  return NextResponse.json(method, { status: 201 })
}
