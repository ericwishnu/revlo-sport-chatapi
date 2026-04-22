import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_DIR = join(process.cwd(), 'public/uploads/products')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validasi tipe file
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File harus berupa gambar' }, { status: 400 })
    }

    // Validasi ukuran file (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Ukuran file terlalu besar (max 5MB)' }, { status: 400 })
    }

    // Ensure directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()
    const filename = `${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`
    const filepath = join(UPLOAD_DIR, filename)

    // Convert file to buffer and write
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)

    // Return public URL
    const publicUrl = `/uploads/products/${filename}`
    return NextResponse.json({
      url: publicUrl,
      filename,
      message: 'Upload berhasil',
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Gagal upload file' },
      { status: 500 }
    )
  }
}
