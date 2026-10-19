import { ApiError } from './http.ts'
import { requireSecret } from './secrets.ts'

const BASE = 'https://api.stripe.com/v1'

async function stripe(path: string, method = 'GET', params?: Record<string, string | number | boolean | undefined>): Promise<any> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${await requireSecret('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params
      ? Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
      : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  let data: any
  try { data = await res.json() } catch { throw new ApiError(502, 'STRIPE_RESPONSE', 'Resposta incompleta do Stripe.') }
  if (!res.ok) throw new ApiError(400, 'STRIPE_ERROR', `Stripe: ${data?.error?.message ?? res.status}`.slice(0, 250))
  return data
}

export interface CheckoutOpts {
  companyId: string
  description: string
  amountCents: bigint
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  metadata: Record<string, string>
}

/** Checkout de cobrança avulsa ou assinatura com price_id. */
export async function createCheckout(o: CheckoutOpts & { priceId?: string; planId?: string; period?: string }) {
  const params: Record<string, string | number | boolean | undefined> = {
    mode: o.priceId ? 'subscription' : 'payment',
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    customer_email: o.customerEmail,
    'metadata[company_id]': o.companyId,
    client_reference_id: o.companyId,
    allow_promotion_codes: true,
  }
  for (const [k, v] of Object.entries(o.metadata)) params[`metadata[${k}]`] = v
  if (o.priceId) {
    params['line_items[0][price]'] = o.priceId
    params['line_items[0][quantity]'] = 1
    if (o.planId) params['subscription_data[metadata][plan_id]'] = o.planId
    if (o.period) params['subscription_data[metadata][period]'] = o.period
    params['subscription_data[metadata][company_id]'] = o.companyId
  } else {
    params['line_items[0][price_data][currency]'] = 'brl'
    params['line_items[0][price_data][unit_amount]'] = Number(o.amountCents)
    params['line_items[0][price_data][product_data][name]'] = o.description.slice(0, 200)
    params['line_items[0][quantity]'] = 1
    params['payment_intent_data[metadata][company_id]'] = o.companyId
  }
  const s = await stripe('/checkout/sessions', 'POST', params)
  return { id: String(s.id), url: String(s.url), customer: s.customer ? String(s.customer) : undefined }
}

export async function getSession(id: string) { return stripe(`/checkout/sessions/${encodeURIComponent(id)}`) }
export async function getSubscription(id: string) { return stripe(`/subscriptions/${encodeURIComponent(id)}`) }
export async function cancelSubscription(id: string) { return stripe(`/subscriptions/${encodeURIComponent(id)}`, 'DELETE', { invoice_now: false }) }

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function eq(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

/** Verifica assinatura do webhook Stripe (t=...,v1=...). */
export async function verifyStripeWebhook(rawBody: string, signatureHeader: string) {
  const secret = await requireSecret('STRIPE_WEBHOOK_SECRET')
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')))
  const ts = parts.t, sigs = (signatureHeader.match(/v1=([a-f0-9]+)/g) ?? []).map(s => s.slice(3))
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new ApiError(401, 'STALE_DELIVERY', 'Entrega expirada.')
  const expected = await hmacHex(secret, `${ts}.${rawBody}`)
  if (!sigs.some(s => eq(s, expected))) throw new ApiError(401, 'INVALID_SIGNATURE', 'Assinatura Stripe inválida.')
  try { return JSON.parse(rawBody) } catch { throw new ApiError(400, 'BAD_PAYLOAD', 'Payload inválido.') }
}
