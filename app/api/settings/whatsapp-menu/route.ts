import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  menuKey: z.string().min(1, 'Menu key wajib diisi'),
  title: z.string().min(1, 'Judul wajib diisi'),
  type: z.enum(['CHATBOT', 'HANDOFF', 'STATIC']),
  prompt: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const menus = await db.whatsappMenu.findMany({
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(menus)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const data = schema.parse(body)
    const menu = await db.whatsappMenu.create({ data })
    return NextResponse.json(menu, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Menu key sudah digunakan' }, { status: 409 })
    }
    console.error('POST /api/settings/whatsapp-menu error:', error)
    return NextResponse.json({ error: 'Gagal membuat menu' }, { status: 500 })
  }
}
