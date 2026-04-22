import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateSchema = z.object({
  menuKey: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  type: z.enum(['CHATBOT', 'HANDOFF', 'STATIC']).optional(),
  prompt: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const body = await req.json()
    const data = updateSchema.parse(body)
    const menu = await db.whatsappMenu.update({ where: { id }, data })
    return NextResponse.json(menu)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Menu key sudah digunakan' }, { status: 409 })
    }
    console.error('PUT /api/settings/whatsapp-menu/[id] error:', error)
    return NextResponse.json({ error: 'Gagal memperbarui menu' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    await db.whatsappMenu.delete({ where: { id } })
    return NextResponse.json({ message: 'Menu berhasil dihapus' })
  } catch {
    return NextResponse.json({ error: 'Menu tidak ditemukan' }, { status: 404 })
  }
}
