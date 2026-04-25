import { NextRequest, NextResponse } from 'next/server'

export function validateAutomationKey(req: NextRequest): NextResponse | null {
  const configuredKey = process.env.INTERNAL_AUTOMATION_KEY

  if (!configuredKey) {
    console.warn('[internal] INTERNAL_AUTOMATION_KEY is not configured')
    return NextResponse.json({ ok: false, error: 'Internal API not configured' }, { status: 503 })
  }

  const provided = req.headers.get('x-automation-key')
  if (!provided || provided !== configuredKey) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
