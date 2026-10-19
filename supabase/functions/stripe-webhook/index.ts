import { cors, json, errorResponse, ApiError } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { verifyStripeWebhook } from '../_shared/stripe.ts'
import { settleCompleted } from '../_shared/payments-lib.ts'

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const raw = await req.text()
    const sig = req.headers.get('stripe-signature') ?? ''
    const event = await verifyStripeWebhook(raw, sig)
    const db = serviceClient()
    const deliveryId = String(event.id ?? '')
    if (deliveryId) {
      const { data: existing } = await db.from('webhook_deliveries').select('status').eq('delivery_id', deliveryId).maybeSingle()
      if (existing?.status === 'processed') return json({ received: true })
      await db.from('webhook_deliveries').insert({ delivery_id: deliveryId, provider: 'stripe', event_type: event.type }).then(() => {}, () => {})
    }

    const obj = event.data?.object ?? {}
    const meta = obj.metadata ?? obj.subscription_details?.metadata ?? {}

    switch (event.type) {
      case 'checkout.session.completed': {
        const paymentId = meta.payment_id as string | undefined
        if (paymentId) {
          const { data: pay } = await db.from('payments').select('*').eq('id', paymentId).maybeSingle()
          if (pay && pay.status !== 'completed') {
            await db.from('payments').update({ status: 'completed' }).eq('id', pay.id)
            await settleCompleted(db, pay)
          }
        }
        // assinatura via Checkout subscription mode
        if (obj.mode === 'subscription' && meta.company_id && meta.plan_id) {
          await db.from('companies').update({ stripe_customer_id: obj.customer ?? null }).eq('id', meta.company_id)
          await db.rpc('activate_subscription', { p_company: meta.company_id, p_plan: meta.plan_id, p_period: meta.period ?? 'monthly' })
          const { data: pay } = await db.from('payments').select('id').eq('provider_id', obj.id).maybeSingle()
          if (pay) await db.from('payments').update({ status: 'completed' }).eq('id', pay.id)
        }
        break
      }
      case 'invoice.paid': {
        // renovação recorrente: estende a assinatura
        const sub = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id
        if (sub) {
          const { data: c } = await db.from('companies').select('id,plan_id').eq('stripe_customer_id', obj.customer).maybeSingle()
          if (c?.plan_id) await db.rpc('activate_subscription', { p_company: c.id, p_plan: c.plan_id, p_period: 'monthly' })
        }
        break
      }
      case 'customer.subscription.deleted': {
        const { data: c } = await db.from('companies').select('id').eq('stripe_customer_id', obj.customer).maybeSingle()
        if (c) await db.from('companies').update({ subscription_status: 'cancelled' }).eq('id', c.id)
        break
      }
      case 'charge.refunded': {
        const pi = obj.payment_intent
        if (pi) {
          const { data: pay } = await db.from('payments').select('*').eq('provider_id', pi).maybeSingle()
          if (pay) await db.from('payments').update({ status: 'refunded', reason: 'Estornado no Stripe' }).eq('id', pay.id)
        }
        break
      }
    }

    if (deliveryId) await db.from('webhook_deliveries').update({ status: 'processed' }).eq('delivery_id', deliveryId)
    return json({ received: true })
  } catch (e) { return errorResponse(e) }
})
