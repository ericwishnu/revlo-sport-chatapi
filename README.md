# Revlo Sport — Knowledge Base & Admin Dashboard

Next.js 15 + Prisma + MySQL · Panel admin untuk produk, invoice, dan chatbot WhatsApp.

---

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Setup Awal](#2-setup-awal)
3. [Konfigurasi Environment Variables](#3-konfigurasi-environment-variables)
4. [Perintah Database](#4-perintah-database)
5. [Cara Update Schema Database](#5-cara-update-schema-database)
6. [Menjalankan Aplikasi](#6-menjalankan-aplikasi)
7. [Struktur Proyek](#7-struktur-proyek)
8. [API Endpoints](#8-api-endpoints)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prasyarat

| Tool | Versi minimum | Cek |
|---|---|---|
| Node.js | 18.x | `node -v` |
| npm | 9.x | `npm -v` |
| MySQL | 8.x | `mysql --version` |

---

## 2. Setup Awal

```bash
# 1. Clone atau masuk ke direktori proyek
cd revlo.sport

# 2. Install semua dependensi
npm install

# 3. Salin template environment (lalu isi nilainya — lihat bagian 3)
cp .env.example .env   # jika ada, atau buat .env manual

# 4. Sinkronkan schema ke database
npm run db:push

# 5. Isi data awal (admin, produk demo, menu WhatsApp, dll.)
npm run db:seed

# 6. Jalankan dev server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) dan login dengan:

- **Email:** `admin@revlosport.com`
- **Password:** `admin123`

---

## 3. Konfigurasi Environment Variables

Buat file `.env` di root proyek. Berikut semua variabel yang dibutuhkan:

```env
# ── Database ────────────────────────────────────────────────────────────────
# Format: mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME
DATABASE_URL="mysql://root:password@localhost:3306/revlosport_kb"

# ── NextAuth ─────────────────────────────────────────────────────────────────
# URL aplikasi (ganti saat deploy ke production)
NEXTAUTH_URL="http://localhost:3000"

# Secret acak — generate dengan: openssl rand -base64 32
NEXTAUTH_SECRET="isi-dengan-string-acak-yang-panjang"

# ── Chatbot API ───────────────────────────────────────────────────────────────
# API key untuk WhatsApp bot mengakses /api/knowledge-base
# Bisa string acak apa saja, asal sama di bot dan di sini
KB_API_KEY="isi-api-key-rahasia-kamu"

# ── SMTP (Kirim Invoice via Email) ────────────────────────────────────────────
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"          # "true" hanya jika port 465
SMTP_USER="emailkamu@gmail.com"
SMTP_PASS="xxxx xxxx xxxx xxxx"   # Gmail: gunakan App Password (bukan password biasa)
SMTP_FROM="emailkamu@gmail.com"   # Nama pengirim bisa diatur: "Revlo Sport <email>"
```

### Cara membuat Gmail App Password

1. Buka [myaccount.google.com](https://myaccount.google.com)
2. **Security → 2-Step Verification** → aktifkan jika belum
3. **Security → App passwords** → pilih **Mail** dan **Other**
4. Salin password 16 karakter yang muncul → paste ke `SMTP_PASS`

### Cara generate NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

---

## 4. Perintah Database

Semua perintah dijalankan dari root proyek.

| Perintah | Fungsi |
|---|---|
| `npm run db:push` | **Sinkronkan schema** ke DB tanpa migration file (cocok untuk development) |
| `npm run db:seed` | Isi data awal (idempotent — aman dijalankan berkali-kali) |
| `npm run db:studio` | Buka **Prisma Studio** (GUI untuk lihat/edit data langsung) |

### Kapan menggunakan `db:push`?

Jalankan `db:push` setiap kali kamu:
- Baru clone proyek dan ingin setup database
- Mengubah `prisma/schema.prisma` (tambah model, kolom, relasi)
- Deploy ke server baru

```bash
npm run db:push
```

> **Catatan:** `db:push` aman untuk development. Di production, pertimbangkan `prisma migrate deploy`.

---

## 5. Cara Update Schema Database

Ikuti langkah ini setiap kali ingin menambah tabel, kolom, atau relasi baru.

### Langkah-langkah

**Step 1 — Edit schema**

Buka `prisma/schema.prisma` dan buat perubahan. Contoh menambah kolom:

```prisma
model Product {
  id          String  @id @default(cuid())
  name        String
  // tambahkan kolom baru di sini:
  weight      Float?  // berat dalam gram (opsional)
  ...
}
```

**Step 2 — Push ke database**

```bash
npm run db:push
```

Perintah ini akan:
- Membuat tabel baru jika belum ada
- Menambah kolom baru yang kamu definisikan
- Meregenerasi Prisma Client otomatis

**Step 3 — Restart TypeScript server di VS Code** *(jika ada error merah di editor)*

```
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

Error seperti `Property 'namaModel' does not exist on type 'PrismaClient'` biasanya hilang setelah ini.

**Step 4 — Update seed jika perlu**

Jika model baru perlu data awal, tambahkan di `prisma/seed.ts` lalu jalankan:

```bash
npm run db:seed
```

### Contoh Lengkap: Menambah Model Baru

```prisma
// prisma/schema.prisma

model Review {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id])
  rating    Int
  comment   String?  @db.Text
  createdAt DateTime @default(now())
}

// Jangan lupa tambahkan relasi balik di model Product:
model Product {
  ...
  reviews   Review[]
}
```

```bash
npm run db:push   # buat tabel Review di database
```

### Menghapus Kolom atau Tabel

`db:push` akan mendeteksi kolom yang hilang dari schema dan menawarkan untuk menghapusnya dari database. Prisma akan meminta konfirmasi sebelum menghapus data.

```bash
npm run db:push
# Prisma akan tanya: "The following fields/tables will be deleted: ..."
# Ketik 'y' untuk lanjut
```

---

## 6. Menjalankan Aplikasi

```bash
# Development (hot reload)
npm run dev

# Build untuk production
npm run build

# Jalankan hasil build
npm run start
```

---

## 7. Struktur Proyek

```
revlo.sport/
├── app/
│   ├── (auth)/              # Halaman login
│   ├── (dashboard)/         # Semua halaman admin (butuh login)
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── invoices/        # Manajemen invoice
│   │   ├── shipping/
│   │   ├── faq/
│   │   ├── knowledge-base/
│   │   ├── settings/
│   │   │   └── whatsapp-menu/  # Manajemen menu bot WA
│   │   └── users/
│   └── api/
│       ├── auth/            # NextAuth
│       ├── products/        # CRUD produk
│       ├── categories/
│       ├── invoices/        # CRUD invoice + kirim email
│       ├── orders/          # Public endpoint untuk order customer
│       ├── whatsapp-menu/   # Public endpoint untuk bot WA
│       ├── settings/
│       │   └── whatsapp-menu/  # Admin CRUD menu WA
│       ├── shipping/
│       ├── faq/
│       ├── knowledge-base/
│       └── upload/
├── components/
│   └── sidebar.tsx
├── lib/
│   ├── auth.ts              # Konfigurasi NextAuth
│   ├── db.ts                # Prisma client singleton
│   ├── email.ts             # Template & pengiriman email invoice
│   └── utils.ts             # Helper: cn(), formatCurrency()
├── prisma/
│   ├── schema.prisma        # ← Definisi semua tabel/model
│   └── seed.ts              # ← Data awal
└── .env                     # ← Konfigurasi (jangan di-commit ke git!)
```

---

## 8. API Endpoints

### Public (tanpa auth)

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/orders` | Customer buat order → buat invoice + kirim email |
| `GET` | `/api/whatsapp-menu` | Bot WA ambil daftar menu aktif |
| `POST` | `/api/knowledge-base` | Bot WA query knowledge base (butuh `KB_API_KEY`) |

### Admin (butuh session login)

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET/POST` | `/api/invoices` | List & buat invoice |
| `GET/PUT/DELETE` | `/api/invoices/[id]` | Detail, update status, hapus |
| `POST` | `/api/invoices/[id]/send` | Kirim ulang email invoice |
| `GET` | `/api/orders/session` | List order session WhatsApp (filter status/nomor/aktif) |
| `PUT` | `/api/orders/session/[id]` | Aksi admin pada session (saat ini: cancel) |
| `GET/POST` | `/api/settings/whatsapp-menu` | List & buat menu WA |
| `PUT/DELETE` | `/api/settings/whatsapp-menu/[id]` | Edit & hapus menu WA |
| `PUT` | `/api/settings/whatsapp-menu/reorder` | Simpan urutan menu |
| `GET/POST/PUT/DELETE` | `/api/products/...` | CRUD produk & variant |

### Format request `POST /api/orders`

```json
{
  "customerName": "Budi Santoso",
  "customerEmail": "budi@email.com",
  "customerPhone": "08123456789",
  "items": [
    {
      "productId": "clxxx...",
      "variantId": "clyyy...",
      "quantity": 2
    }
  ],
  "shippingCost": 15000,
  "discountAmount": 0,
  "notes": "Tolong dikemas rapi"
}
```

---

## 9. Troubleshooting

### `Property 'namaModel' does not exist on type 'PrismaClient'`

Prisma Client belum diregenerasi atau TypeScript server belum reload.

```bash
npx prisma generate
# Lalu di VS Code: Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

### `Can't reach database server`

Cek apakah MySQL berjalan dan `DATABASE_URL` di `.env` sudah benar (host, port, user, password, nama database).

```bash
# Cek koneksi database
npx prisma db pull
```

### Email invoice tidak terkirim

1. Pastikan semua variabel `SMTP_*` di `.env` sudah diisi
2. Untuk Gmail: gunakan **App Password**, bukan password akun biasa
3. Cek log error di terminal saat membuat invoice

### Seed gagal karena data sudah ada

Seed menggunakan `upsert` — aman dijalankan berkali-kali. Jika masih gagal, cek error di terminal untuk tahu model/field mana yang bermasalah.

### Reset database (development only)

> ⚠️ **Semua data akan terhapus!**

```bash
# Hapus semua tabel dan buat ulang dari schema
npx prisma db push --force-reset

# Isi ulang data awal
npm run db:seed
```
