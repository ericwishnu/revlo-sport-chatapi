import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const withCount = req.nextUrl.searchParams.get('count') === '1'
  const categories = await db.category.findMany({
    orderBy: { name: 'asc' },
    ...(withCount ? { include: { _count: { select: { products: true } } } } : {}),
  })
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, description } = await req.json()
  const category = await db.category.create({ data: { name, description } })
  return NextResponse.json(category, { status: 201 })
}
