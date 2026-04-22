import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await db.siteSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', storeName: 'Revlo Sport' },
  })
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storeName, storeDesc, whatsapp, email, address, languageDefault, communicationStyle } = await req.json()
  const settings = await db.siteSettings.upsert({
    where: { id: 'singleton' },
    update: { storeName, storeDesc, whatsapp, email, address, languageDefault, communicationStyle },
    create: { id: 'singleton', storeName, storeDesc, whatsapp, email, address, languageDefault, communicationStyle },
  })
  return NextResponse.json(settings)
}
