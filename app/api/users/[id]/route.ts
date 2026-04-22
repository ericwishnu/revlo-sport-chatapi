import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if ((session.user as any).id === id) {
    return NextResponse.json({ error: 'Tidak bisa hapus akun sendiri' }, { status: 400 })
  }

  await db.user.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { name, role } = await req.json()
  const user = await db.user.update({
    where: { id },
    data: { name, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })
  return NextResponse.json(user)
}
