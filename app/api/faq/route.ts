import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().default('Umum'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const faqs = await db.faq.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] })
  return NextResponse.json(faqs)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = schema.parse(await req.json())
  const faq = await db.faq.create({ data })
  return NextResponse.json(faq, { status: 201 })
}
