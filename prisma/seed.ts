import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 12)

  await prisma.user.upsert({
    where: { email: 'admin@revlosport.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@revlosport.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  await prisma.siteSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      storeName: 'Revlo Sport',
      storeDesc: 'Toko perlengkapan olahraga terpercaya',
    },
  })

  const category = await prisma.category.upsert({
    where: { name: 'Sepatu' },
    update: {},
    create: { name: 'Sepatu', description: 'Sepatu olahraga berbagai jenis' },
  })

  await prisma.product.upsert({
    where: { sku: 'SKU-DEMO-001' },
    update: {},
    create: {
      name: 'Sepatu Lari Pro X1',
      description: 'Sepatu lari ringan dengan sol anti-selip, cocok untuk lari pagi maupun marathon.',
      price: 450000,
      stock: 50,
      sku: 'SKU-DEMO-001',
      isActive: true,
      categoryId: category.id,
    },
  })

  await prisma.shippingMethod.createMany({
    skipDuplicates: true,
    data: [
      { name: 'JNE REG', description: 'Pengiriman reguler via JNE', estimatedDays: '2-3 hari kerja', cost: 15000 },
      { name: 'JNE YES', description: 'Yakin Esok Sampai — pengiriman 1 hari kerja', estimatedDays: '1 hari kerja', cost: 25000 },
      { name: 'COD (Bayar di Tempat)', description: 'Tersedia untuk area Jabodetabek', estimatedDays: '1-2 hari kerja', isFree: true },
    ],
  })

  await prisma.faq.createMany({
    skipDuplicates: true,
    data: [
      { question: 'Berapa lama proses pengiriman?', answer: 'Pengiriman reguler 2-3 hari kerja. Untuk JNE YES, 1 hari kerja.', category: 'Pengiriman', sortOrder: 1 },
      { question: 'Apakah bisa retur/tukar ukuran?', answer: 'Ya, bisa retur dalam 7 hari sejak barang diterima selama kondisi masih baik dan tag belum dilepas.', category: 'Retur', sortOrder: 2 },
      { question: 'Metode pembayaran apa saja yang tersedia?', answer: 'Transfer bank (BCA, BNI, Mandiri), QRIS, COD area Jabodetabek, dan dompet digital (OVO, GoPay, Dana).', category: 'Pembayaran', sortOrder: 3 },
    ],
  })

  console.log('✅ Seed selesai')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
