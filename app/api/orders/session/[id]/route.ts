import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const updateSchema = z.object({
  action: z.enum(['cancel']),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const existing = await db.whatsAppOrderSession.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Session tidak ditemukan' }, { status: 404 })
    }

    if (data.action === 'cancel') {
      if (existing.status === 'CONFIRMED') {
        return NextResponse.json(
          {
            error:
              'Session yang sudah terkonfirmasi tidak bisa dibatalkan dari dashboard session. Kelola melalui invoice terkait.',
          },
          { status: 400 }
        )
      }

      if (existing.status === 'CANCELLED') {
        return NextResponse.json({ message: 'Session sudah dibatalkan sebelumnya', data: existing })
      }

      const updated = await db.whatsAppOrderSession.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          currentStep: 'cancelled',
        },
      })

      return NextResponse.json({ message: 'Session berhasil dibatalkan', data: updated })
    }

    return NextResponse.json({ error: 'Aksi tidak didukung' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validasi gagal', details: error.errors }, { status: 400 })
    }

    console.error('PUT /api/orders/session/[id] error:', error)
    return NextResponse.json({ error: 'Gagal memperbarui session' }, { status: 500 })
  }
}
