import { cors, json, errorResponse, ApiError } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { verifyWebhook, parseCharge } from '../_shared/mercosulpay.ts'
import { settleCompleted } from '../_shared/payments-lib.ts'

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const raw = await req.text()
    const env = await verifyWebhook(req.headers, raw)
    if (!env.deliveryId) throw new ApiError(400, 'NO_DELIVERY', 'Entrega sem id.')
    const payload = JSON.parse(raw)
    const d = payload?.data ?? payload?.object ?? payload
    const reference = d?.reference_id
    if (typeof reference !== 'string' || !/^[-0-9a-f]{36}$/i.test(reference)) throw new ApiError(400, 'WEBHOOK_SCHEMA', 'Referência inválida.')

    const db = serviceClient()
    const { data: existing } = await db.from('webhook_deliveries').select('*').eq('delivery_id', env.deliveryId).maybeSingle()
    if (existing) {
      if (existing.status === 'processed') return json({ ok: true })
    } else {
      const { error } = await db.from('webhook_deliveries').insert({ delivery_id: env.deliveryId, provider: 'mercosulpay', event_type: env.eventType, payload_hash: env.payloadHash })
      if (error && error.code !== '23505') throw new ApiError(503, 'EVENT_NOT_RECORDED', 'Falha ao registrar evento.')
    }

    const { data: pay } = await db.from('payments').select('*').eq('id', reference).maybeSingle()
    if (!pay) throw new ApiError(404, 'REFERENCE_NOT_FOUND', 'Operação não encontrada.')

    let status: 'processed' | 'review' = 'review'
    if (env.eventType === 'pix.received' && pay.provider === 'mercosulpay' && ['pending', 'created', 'uncertain'].includes(pay.status)) {
      const rec = parseCharge(d)
      if (rec.reference === pay.id && rec.amountCents === BigInt(pay.amount_cents) && rec.status === 'completed') {
        await db.from('payments').update({ status: 'completed', provider_id: rec.id }).eq('id', pay.id)
        await settleCompleted(db, { ...pay, status: 'completed' })
        status = 'processed'
      }
    } else if (env.eventType === 'pix.sent' && pay.kind === 'withdrawal') {
      const rec = parseCharge(d)
      if (rec.reference === pay.id && rec.id === pay.provider_id) {
        const st = rec.status === 'completed' ? 'completed' : ['failed', 'cancelled', 'rejected'].includes(rec.status) ? 'failed' : null
        if (st) {
          await db.rpc('wallet_withdraw_finalize', { p_payment: pay.id, p_status: st, p_provider_id: rec.id, p_total_debit: rec.totalDebitCents ? Number(rec.totalDebitCents) : null, p_reason: null })
          status = 'processed'
        }
      }
    } else if (env.eventType === 'pix.refunded' && pay.kind !== 'withdrawal') {
      // estorno nunca altera saldo sozinho — vai para revisão do admin
      await db.from('payments').update({ status: 'review', reason: 'Estorno recebido — conciliação manual' }).eq('id', pay.id)
      status = 'processed'
    }

    await db.from('webhook_deliveries').update({ payment_id: pay.id, status }).eq('delivery_id', env.deliveryId)
    return json({ ok: true })
  } catch (e) { return errorResponse(e) }
})
