import { ApiError } from './http.ts'
import { requireSecret } from './secrets.ts'

const BASE = 'https://mercosulpay.com/api/public/v1'

interface ProviderResult { id?: string; status?: string; reference_id?: string; amount?: number; total_debit?: number; qr_code?: string; qr_code_image?: string; [k: string]: unknown }

async function provider(path: string, method = 'GET', body?: unknown): Promise<ProviderResult> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${await requireSecret('MERCOSULPAY_API_KEY')}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      if (attempt < 1) { await new Promise(r => setTimeout(r, 1000)); continue }
      throw new ApiError(502, 'GATEWAY_UNCERTAIN', `Falha de rede com o gateway: ${(e as Error).message}`)
    }
    let data: any
    try { data = await res.json() } catch { throw new ApiError(502, 'GATEWAY_RESPONSE', 'Resposta incompleta do gateway.') }
    if (!res.ok) {
      const code = data?.error?.code ?? 'unknown'
      const retryable = res.status === 429 || res.status === 502 || code === 'provider_unavailable'
      const definitive = res.status === 401 || res.status === 403 || (res.status === 422 && !retryable)
      if (retryable && attempt < 1) { await new Promise(r => setTimeout(r, 1200)); continue }
      throw new ApiError(definitive ? 400 : 502, definitive ? 'GATEWAY_REJECTED' : 'GATEWAY_UNCERTAIN',
        `Gateway (${res.status} ${code}): ${data?.error?.message ?? 'erro'}`.slice(0, 250))
    }
    return data?.data ?? data
  }
}

export const brl = (cents: bigint | number) => Number(cents) / 100

export interface ChargeRecord {
  id: string; status: string; reference: string | null; amountCents: bigint
  qrCode?: string; qrCodeImage?: string; totalDebitCents: bigint | null
}
export function parseCharge(d: ProviderResult): ChargeRecord {
  if (typeof d?.id !== 'string' || typeof d?.amount !== 'number') throw new ApiError(502, 'GATEWAY_SCHEMA', 'Resposta do gateway sem campos obrigatórios.')
  const net = typeof d.net_amount === 'number' ? Math.round(d.net_amount * 100) : null
  return {
    id: d.id,
    status: String(d.status ?? 'pending'),
    reference: typeof d.reference_id === 'string' ? d.reference_id : null,
    amountCents: BigInt(Math.round(d.amount * 100)),
    qrCode: typeof d.qr_code === 'string' ? d.qr_code : undefined,
    qrCodeImage: typeof d.qr_code_image === 'string' ? d.qr_code_image : undefined,
    totalDebitCents: typeof d.total_debit === 'number' ? Math.round(d.total_debit * 100) : net,
  }
}

export async function createCharge(amountCents: bigint, referenceId: string, description: string): Promise<ChargeRecord> {
  const r = await provider('/pix/charges', 'POST', { amount: brl(amountCents), currency: 'BRL', description: description.slice(0, 200), reference_id: referenceId })
  return parseCharge(r)
}

export async function getCharge(id: string): Promise<ChargeRecord> {
  return parseCharge(await provider(`/pix/charges/${encodeURIComponent(id)}`))
}

export interface PixDestination { pix_key: string; pix_key_type: string; recipient_document?: string }
export function validatePixDestination(d: any): PixDestination {
  const t = String(d?.pix_key_type ?? '').toLowerCase()
  if (!['cpf', 'cnpj', 'email', 'phone', 'evp'].includes(t)) throw new ApiError(400, 'INVALID_PIX', 'Tipo de chave Pix inválido.')
  const key = String(d?.pix_key ?? '').trim()
  if (key.length < 3) throw new ApiError(400, 'INVALID_PIX', 'Informe a chave Pix.')
  const doc = String(d?.recipient_document ?? '').replace(/\D/g, '')
  const dest: PixDestination = { pix_key: key, pix_key_type: t }
  if (['phone', 'email', 'evp'].includes(t)) {
    if (![11, 14].includes(doc.length)) throw new ApiError(400, 'INVALID_PIX', 'Informe CPF ou CNPJ do titular da chave.')
    dest.recipient_document = doc
  } else if (doc) dest.recipient_document = doc
  return dest
}

export async function createWithdrawal(amountCents: bigint, dest: PixDestination, referenceId: string): Promise<ChargeRecord> {
  const r = await provider('/pix/withdrawals', 'POST', {
    amount: brl(amountCents), pix_key: dest.pix_key, pix_key_type: dest.pix_key_type,
    ...(dest.recipient_document ? { recipient_document: dest.recipient_document } : {}),
    reference_id: referenceId, description: 'Saque IAstetic',
  })
  return parseCharge(r)
}

// ---------- webhook (HMAC-SHA256) ----------
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyWebhook(headers: Headers, rawBody: string) {
  const secret = await requireSecret('MERCOSULPAY_WEBHOOK_SECRET')
  const ts = headers.get('x-mercosulpay-timestamp') ?? ''
  const sig = headers.get('x-mercosulpay-signature') ?? ''
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new ApiError(401, 'STALE_DELIVERY', 'Entrega expirada.')
  const expected = `sha256=${await hmacHex(secret, `${ts}.${rawBody}`)}`
  if (!timingSafeEqual(expected, sig)) throw new ApiError(401, 'INVALID_SIGNATURE', 'Assinatura inválida.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody))
  return {
    eventType: headers.get('x-mercosulpay-event') ?? '',
    deliveryId: headers.get('x-mercosulpay-delivery') ?? '',
    payloadHash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''),
  }
}
