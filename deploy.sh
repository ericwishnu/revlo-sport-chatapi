#!/bin/bash
set -e

echo "=== Revlo Sport KB — Deploy ==="

# 1. Pull latest code
git pull origin main

# 2. Build image baru
docker compose build app

# 3. Jalankan migrasi database
docker compose run --rm app npx prisma db push

# 4. Restart app
docker compose up -d

echo "=== Deploy selesai ==="
echo "App berjalan di http://localhost"
