import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { requireCompany, serviceClient } from '../_shared/db.ts'
import { createCharge, getCharge, createWithdrawal, validatePixDestination, parseCharge } from '../_shared/mercosulpay.ts'
import { createCheckout } from '../_shared/stripe.ts'
import { publicPayment, settleCompleted } from '../_shared/payments-lib.ts'
import { getSecret } from '../_shared/secrets.ts'
import { QUOTA_RESOURCES, quotaStatus } from '../_shared/quota.ts'

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const { companyId } = await requireCompany(req)
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')

    switch (action) {
      // ---------- assinatura de plano ----------
      case 'subscribe': {
        const planId = str(body.plan_id, 64)
        const period = body.period === 'yearly' ? 'yearly' : 'monthly'
        const method = ['pix', 'card', 'wallet'].includes(body.method) ? body.method : 'pix'
        const { data: plan } = await db.from('plans').select('*').eq('id', planId).eq('active', true).single()
        if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado.')
        const amount = period === 'yearly' ? (plan.yearly_price_cents ?? plan.price_cents * 12) : plan.price_cents

        if (method === 'wallet') {
          try {
            const p = await db.rpc('pay_subscription_with_wallet', { p_company: companyId, p_plan: plan.id, p_period: period })
            if (p.error) throw new ApiError(400, 'WALLET_FAILED', mapRpcError(p.error.message))
            return json({ ok: true, data: { paid: true } })
          } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, 'WALLET_FAILED', mapRpcError((e as Error).message)) }
        }

        if (method === 'pix') {
          const { data: pay } = await db.from('payments').insert({
            company_id: companyId, kind: 'subscription', provider: 'mercosulpay', status: 'created',
            amount_cents: amount, plan_id: plan.id, period, description: `Assinatura ${plan.name} (${period === 'yearly' ? 'anual' : 'mensal'})`,
          }).select().single()
          const charge = await createCharge(BigInt(amount), pay.id, `IAstetic ${plan.name}`)
          await db.from('payments').update({ status: 'pending', provider_id: charge.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage }).eq('id', pay.id)
          return json({ ok: true, data: { paid: false, payment_id: pay.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage } })
        }

        // cartão — Stripe Checkout (assinatura com price_id quando configurado)
        const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
        const priceId = period === 'yearly' ? plan.stripe_yearly_price_id : plan.stripe_price_id
        const session = await createCheckout({
          companyId, description: `IAstetic ${plan.name}`, amountCents: BigInt(amount),
          successUrl: `${site}/app/planos?paid=1`, cancelUrl: `${site}/app/planos`,
          metadata: { kind: 'subscription', plan_id: plan.id, period },
          priceId: priceId ?? undefined, planId: plan.id, period,
        })
        const { data: pay } = await db.from('payments').insert({
          company_id: companyId, kind: 'subscription', provider: 'stripe', status: 'pending',
          amount_cents: amount, plan_id: plan.id, period, provider_id: session.id, checkout_url: session.url,
          description: `Assinatura ${plan.name} (cartão)`,
        }).select().single()
        return json({ ok: true, data: { paid: false, payment_id: pay.id, checkout_url: session.url } })
      }

      // ---------- status de uso/cotas + recarga ----------
      case 'quota_status': {
        const { data: c } = await db.from('companies').select('plan_id, plans(name,price_cents)').eq('id', companyId).single()
        const resources: Record<string, any> = {}
        for (const res of Object.keys(QUOTA_RESOURCES)) {
          const st = await quotaStatus(db, companyId, res)
          resources[res] = { label: st.label, used: st.used, limit: st.limit, credits: st.credits, per_unit_credits: Math.max(1, Math.ceil(st.limit * 0.25)) }
        }
        return json({
          ok: true,
          data: {
            plan: c?.plans ? { name: c.plans.name, price_cents: c.plans.price_cents } : null,
            unit_price_cents: c?.plans?.price_cents ? Math.ceil(c.plans.price_cents * 0.30) : null,
            resources,
          },
        })
      }

      case 'quota_topup': {
        const resource = String(body.resource ?? '')
        const r = QUOTA_RESOURCES[resource]
        if (!r) throw new ApiError(400, 'BAD_RESOURCE', 'Recurso inválido.')
        const units = Math.min(Math.max(Math.round(Number(body.units) || 1), 1), 10)
        const method = body.method === 'card' ? 'card' : 'pix'
        const { data: c } = await db.from('companies').select('plan_id, plans(name,price_cents,monthly_messages_limit,assistant_audio_quota,customer_audio_quota,image_quota)').eq('id', companyId).single()
        if (!c?.plans?.price_cents) throw new ApiError(400, 'NO_PLAN', 'Você precisa de um plano ativo para recarregar.')
        const limit = (c.plans as any)[r.planCol] as number ?? r.def
        const creditsPerUnit = Math.max(1, Math.ceil(limit * 0.25))
        const credits = creditsPerUnit * units
        const amount = Math.ceil(c.plans.price_cents * 0.30) * units
        const desc = `Recarga ${r.label} (+${credits})`

        const { data: pay } = await db.from('payments').insert({
          company_id: companyId, kind: 'quota_topup', provider: method === 'card' ? 'stripe' : 'mercosulpay',
          status: 'created', amount_cents: amount, description: desc,
        }).select().single()
        const { data: topup } = await db.from('quota_topups').insert({
          company_id: companyId, resource, units, credits_added: credits, payment_id: pay.id,
        }).select().single()

        if (method === 'pix') {
          const charge = await createCharge(BigInt(amount), pay.id, `IAstetic recarga ${r.label}`)
          await db.from('payments').update({ status: 'pending', provider_id: charge.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage }).eq('id', pay.id)
          return json({ ok: true, data: { paid: false, payment_id: pay.id, topup_id: topup.id, credits, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage } })
        }
        const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
        const session = await createCheckout({
          companyId, description: `IAstetic — ${desc}`, amountCents: BigInt(amount),
          successUrl: `${site}/app/planos?topup=1`, cancelUrl: `${site}/app/planos`,
          metadata: { payment_id: pay.id, kind: 'quota_topup' },
        })
        await db.from('payments').update({ status: 'pending', provider_id: session.id, checkout_url: session.url }).eq('id', pay.id)
        return json({ ok: true, data: { paid: false, payment_id: pay.id, topup_id: topup.id, credits, checkout_url: session.url } })
      }

      // ---------- depósito na carteira (Pix ou cartão) ----------
      case 'wallet_deposit': {
        const cents = Number(body.amount_cents)
        if (!Number.isSafeInteger(cents) || cents < 500 || cents > 5_000_000) throw new ApiError(400, 'INVALID_AMOUNT', 'Valor mínimo R$ 5,00.')
        const method = body.method === 'card' ? 'card' : 'pix'
        const { data: pay } = await db.from('payments').insert({
          company_id: companyId, kind: 'wallet_deposit', provider: method === 'card' ? 'stripe' : 'mercosulpay', status: 'created',
          amount_cents: cents, description: 'Depósito na carteira',
        }).select().single()
        if (method === 'card') {
          const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
          const session = await createCheckout({
            companyId, description: 'IAstetic — recarga de carteira', amountCents: BigInt(cents),
            successUrl: `${site}/app/carteira?paid=1`, cancelUrl: `${site}/app/carteira`,
            metadata: { payment_id: pay.id, kind: 'wallet_deposit' },
          })
          await db.from('payments').update({ status: 'pending', provider_id: session.id, checkout_url: session.url }).eq('id', pay.id)
          return json({ ok: true, data: { payment_id: pay.id, checkout_url: session.url } })
        }
        const charge = await createCharge(BigInt(cents), pay.id, 'IAstetic carteira')
        await db.from('payments').update({ status: 'pending', provider_id: charge.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage }).eq('id', pay.id)
        return json({ ok: true, data: { payment_id: pay.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage } })
      }

      // ---------- saque ----------
      case 'withdraw': {
        const cents = Number(body.amount_cents)
        if (!Number.isSafeInteger(cents) || cents < 1) throw new ApiError(400, 'INVALID_AMOUNT', 'Valor inválido.')
        const key = str(body.idempotency_key, 80) || crypto.randomUUID()
        const dest = validatePixDestination(body)
        const { data: op, error } = await db.rpc('wallet_withdraw_prepare', { p_company: companyId, p_amount: cents, p_destination: dest, p_key: `wd-${companyId}-${key}` })
        if (error) throw new ApiError(400, 'WITHDRAW_FAILED', mapRpcError(error.message))
        if (op.status !== 'created') return json({ ok: true, data: publicPayment(op) })
        const dispatched = await dispatchWithdrawal(db, op)
        return json({ ok: true, data: publicPayment(dispatched) })
      }

      // ---------- status / reconciliação ----------
      case 'status': {
        const id = str(body.payment_id, 64)
        const { data: pay } = await db.from('payments').select('*').eq('id', id).eq('company_id', companyId).single()
        if (!pay) throw new ApiError(404, 'NOT_FOUND', 'Pagamento não encontrado.')
        let op = pay
        if (op.provider === 'mercosulpay' && op.provider_id && ['pending', 'uncertain', 'created'].includes(op.status)) {
          try {
            const rec = await getCharge(op.provider_id)
            if (rec.status === 'completed') {
              const { data: updated } = await db.from('payments').update({ status: 'completed' }).eq('id', op.id).select().single()
              op = updated
              await settleCompleted(db, op)
            } else if (['failed', 'cancelled', 'expired'].includes(rec.status)) {
              await db.from('payments').update({ status: 'failed' }).eq('id', op.id)
              op.status = 'failed'
            } else {
              await db.from('payments').update({ qr_code: rec.qrCode ?? op.qr_code, qr_code_image: rec.qrCodeImage ?? op.qr_code_image }).eq('id', op.id)
            }
          } catch { /* mantém estado */ }
        }
        return json({ ok: true, data: publicPayment(op) })
      }

      case 'list': {
        const { data } = await db.from('payments').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50)
        return json({ ok: true, data: (data ?? []).map(publicPayment) })
      }

      default: throw new ApiError(400, 'BAD_ACTION', 'Ação desconhecida.')
    }
  } catch (e) { return errorResponse(e) }
})

function mapRpcError(msg: string) {
  if (msg.includes('INSUFFICIENT_FUNDS')) return 'Saldo insuficiente.'
  if (msg.includes('BELOW_MINIMUM')) return 'Valor abaixo do mínimo de saque.'
  if (msg.includes('WALLET_NOT_FOUND')) return 'Carteira não encontrada.'
  return 'Não foi possível concluir a operação.'
}

async function dispatchWithdrawal(db: any, op: any) {
  try {
    const rec = await createWithdrawal(BigInt(op.net_cents ?? op.amount_cents), op.destination, op.id)
    const st = rec.status === 'completed' ? 'completed' : ['failed', 'cancelled', 'rejected'].includes(rec.status) ? 'failed' : 'pending'
    const { data } = await db.rpc('wallet_withdraw_finalize', {
      p_payment: op.id, p_status: st === 'pending' ? 'pending' : st,
      p_provider_id: rec.id, p_total_debit: rec.totalDebitCents ? Number(rec.totalDebitCents) : null, p_reason: null,
    })
    // saque pendente continua 'pending' com provider_id (finalize aplica quando webhook confirmar)
    return data ?? op
  } catch (e) {
    const definitive = e instanceof ApiError && e.code === 'GATEWAY_REJECTED'
    const { data } = await db.rpc('wallet_withdraw_finalize', {
      p_payment: op.id, p_status: definitive ? 'failed' : 'uncertain',
      p_provider_id: null, p_total_debit: null,
      p_reason: definitive ? (e as Error).message : 'Conciliação necessária: não reenvie.',
    })
    return data ?? op
  }
}
