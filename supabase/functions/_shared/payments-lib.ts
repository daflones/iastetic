export function publicPayment(p: any) {
  return {
    id: p.id, kind: p.kind, provider: p.provider, status: p.status,
    amount_cents: Number(p.amount_cents), fee_cents: Number(p.fee_cents ?? 0), net_cents: p.net_cents == null ? null : Number(p.net_cents),
    qr_code: p.qr_code, qr_code_image: p.qr_code_image, checkout_url: p.checkout_url,
    description: p.description, created_at: p.created_at, reason: p.reason,
  }
}

/** Credita carteira / ativa assinatura após pagamento confirmado. */
export async function settleCompleted(db: any, pay: any) {
  if (pay.kind === 'wallet_deposit' || pay.kind === 'customer_charge') {
    if (pay.appointment_id) await db.from('appointments').update({ status: 'confirmed' }).eq('id', pay.appointment_id).in('status', ['awaiting_payment', 'scheduled'])
    await db.rpc('wallet_credit', {
      p_company: pay.company_id, p_amount: pay.amount_cents,
      p_ref_type: pay.kind, p_ref_id: pay.id,
      p_desc: pay.kind === 'wallet_deposit' ? 'Depósito na carteira' : `Pagamento recebido: ${pay.description ?? ''}`,
    })
  } else if (pay.kind === 'subscription' && pay.plan_id) {
    await db.rpc('activate_subscription', { p_company: pay.company_id, p_plan: pay.plan_id, p_period: pay.period ?? 'monthly' })
  } else if (pay.kind === 'quota_topup') {
    const { data: topups } = await db.from('quota_topups').select('*').eq('payment_id', pay.id).eq('applied', false)
    for (const t of topups ?? []) {
      const { data: c } = await db.from('companies').select('quota_credits').eq('id', pay.company_id).single()
      const next = { ...(c?.quota_credits ?? {}), [t.resource]: Number(c?.quota_credits?.[t.resource] ?? 0) + t.credits_added }
      await db.from('companies').update({ quota_credits: next }).eq('id', pay.company_id)
      await db.from('quota_topups').update({ applied: true }).eq('id', t.id)
      await db.from('notifications').insert({
        company_id: pay.company_id, kind: 'quota',
        title: 'Recarga creditada ✓',
        body: `+${t.credits_added} créditos de ${t.resource === 'images' ? 'imagens' : t.resource === 'messages' ? 'mensagens' : 'áudios'} adicionados à sua conta.`,
        link: '/app/planos',
      })
    }
  }
}
