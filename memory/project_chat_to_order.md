---
name: Chat-to-Order WhatsApp Flow
description: Conversational order session system implemented for WhatsApp bot integration
type: project
---

Implemented full chat-to-order flow for WhatsApp bot. Key files added:

- `prisma/schema.prisma` — Added `OrderSessionStatus` enum and `WhatsAppOrderSession` model; made `Invoice.customerEmail` nullable (String?)
- `lib/orderSession.ts` — All session logic: step processors, stock checks, confirmation summary, invoice text builder
- `app/api/orders/session/start/route.ts` — POST: start or resume session by phone
- `app/api/orders/session/message/route.ts` — POST: process customer message, advance step
- `app/api/orders/session/confirm/route.ts` — POST: explicit confirm (calls processMessage with "YA")
- `app/api/orders/session/cancel/route.ts` — POST: cancel session
- `app/api/invoices/[id]/send/route.ts` — Fixed: guard against null customerEmail (WhatsApp orders have no email)

**Why:** Customer requested WhatsApp bot can guide users through an order flow step-by-step instead of one-shot payloads.

**How to apply:** Sessions expire after 24h. Invoice created on confirm, visible in admin dashboard. No email sent for WA orders (customerEmail is null). Stock never exposed as exact numbers.
