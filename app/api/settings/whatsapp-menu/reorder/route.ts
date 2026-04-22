import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { items } = schema.parse(await req.json())
    await db.$transaction(
      items.map((item) =>
        db.whatsappMenu.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    )
    return NextResponse.json({ message: 'Urutan berhasil disimpan' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal' }, { status: 400 })
    }
    console.error('PUT /api/settings/whatsapp-menu/reorder error:', error)
    return NextResponse.json({ error: 'Gagal menyimpan urutan' }, { status: 500 })
  }
}
