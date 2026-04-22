import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, email, password, role } = await req.json()
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email sudah digunakan' }, { status: 400 })

  const hashed = await bcrypt.hash(password, 12)
  const user = await db.user.create({
    data: { name, email, password: hashed, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
