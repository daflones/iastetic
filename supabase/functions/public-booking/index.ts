import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { availability, fmtSlot, parseLocalDateTime, type AgentContext } from '../_shared/agent.ts'
import { createCharge } from '../_shared/mercosulpay.ts'
import { createCheckout } from '../_shared/stripe.ts'
import { getSecret } from '../_shared/secrets.ts'

// Página pública de agendamento — sem JWT (cliente final)
// company info leitura via RPC public_company (frontend chama direto);
// aqui só as ações que precisam de service role: horários e agendar.
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const slug = str(body.slug, 80)
    if (!slug) throw new ApiError(400, 'BAD_REQUEST', 'Slug obrigatório.')

    const { data: company } = await db.from('companies').select('*').eq('slug', slug).maybeSingle()
    if (!company) throw new ApiError(404, 'NOT_FOUND', 'Estabelecimento não encontrado.')
    const tz = company.timezone || 'America/Sao_Paulo'
    const ctx: AgentContext = { company, contact: null, conversation: null, supabase: db }

    switch (action) {
      case 'availability': {
        const serviceId = str(body.service_id, 64)
        if (!serviceId) throw new ApiError(400, 'BAD_REQUEST', 'service_id obrigatório.')
        const { slots } = await availability(ctx, serviceId, str(body.date, 10) || undefined, str(body.professional_name, 60) || undefined)
        return json({ ok: true, data: slots.map(s => ({ start: s.start.toISOString(), end: s.end.toISOString(), professional_id: s.professional_id, professional_name: s.professional_name, label: fmtSlot(s, tz) })) })
      }

      case 'book': {
        const serviceId = str(body.service_id, 64)
        const name = str(body.name, 80)
        const phone = str(body.phone, 20).replace(/\D/g, '')
        if (!serviceId || !name || phone.length < 10) throw new ApiError(400, 'BAD_REQUEST', 'Serviço, nome e WhatsApp são obrigatórios.')
        const start = parseLocalDateTime(str(body.start, 20), tz)
        const { data: service } = await db.from('services').select('*').eq('id', serviceId).eq('company_id', company.id).eq('active', true).single()
        if (!service) throw new ApiError(404, 'NO_SERVICE', 'Serviço não encontrado.')

        // contato: acha ou cria pelo telefone
        let { data: contact } = await db.from('contacts').select('*').eq('company_id', company.id).eq('phone', phone).maybeSingle()
        if (!contact) {
          const { data: nc } = await db.from('contacts').insert({ company_id: company.id, phone, name, source: 'link_agendamento' }).select().single()
          contact = nc
        } else if (!contact.name) {
          await db.from('contacts').update({ name }).eq('id', contact.id)
        }

        // profissional
        let professionalId: string | null = null
        const profName = str(body.professional_name, 60)
        if (profName) {
          const { data: p } = await db.from('professionals').select('id').eq('company_id', company.id).eq('active', true).ilike('name', `%${profName}%`).limit(1).maybeSingle()
          professionalId = p?.id ?? null
        } else if (service.professional_ids?.length) {
          professionalId = service.professional_ids[0]
        }

        const end = new Date(start.getTime() + service.duration_min * 60_000)
        let confQ = db.from('appointments').select('id')
          .eq('company_id', company.id).in('status', ['scheduled', 'confirmed', 'awaiting_payment'])
          .lt('starts_at', end.toISOString()).gt('ends_at', start.toISOString())
        confQ = professionalId ? confQ.eq('professional_id', professionalId) : confQ.is('professional_id', null)
        const { data: conflict } = await confQ.limit(1)
        if (conflict?.length) throw new ApiError(409, 'SLOT_TAKEN', 'Esse horário acabou de ser ocupado. Escolha outro.')

        // sinal configurado na página?
        const depPct = Number(company.booking_config?.deposit_percent ?? 0)
        const payMethod = company.booking_config?.deposit_method === 'card' ? 'card' : 'pix'
        const needsDeposit = depPct > 0 && company.booking_config?.payments_on_page === true

        const { data: appt, error } = await db.from('appointments').insert({
          company_id: company.id, contact_id: contact.id, professional_id: professionalId,
          service_id: service.id, service_name: service.name,
          starts_at: start.toISOString(), ends_at: end.toISOString(),
          price_cents: service.price_cents, notes: str(body.notes, 300) || null,
          created_by: 'client', status: needsDeposit ? 'awaiting_payment' : (company.ai_config?.auto_confirm === false ? 'scheduled' : 'confirmed'),
        }).select().single()
        if (error) throw new ApiError(500, 'BOOK_FAILED', `Falha ao agendar: ${error.message}`)
        await db.from('contacts').update({ stage: 'agendado' }).eq('id', contact.id)
        await db.from('notifications').insert({ company_id: company.id, kind: 'appointment', title: 'Novo agendamento pelo link', body: `${name} • ${service.name} • ${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(start)}`, link: '/app/agenda' })

        // sinal
        if (needsDeposit) {
          const cents = Math.round(service.price_cents * depPct / 100)
          const { data: pay } = await db.from('payments').insert({
            company_id: company.id, kind: 'customer_charge', provider: payMethod === 'card' ? 'stripe' : 'mercosulpay',
            status: 'created', amount_cents: cents, contact_id: contact.id, appointment_id: appt.id,
            description: `Sinal ${depPct}% — ${service.name}`,
          }).select().single()
          if (payMethod === 'card') {
            const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
            const session = await createCheckout({
              companyId: company.id, description: `Sinal — ${service.name} em ${company.name}`, amountCents: BigInt(cents),
              successUrl: `${site}/agendar/${slug}?paid=1`, cancelUrl: `${site}/agendar/${slug}`,
              metadata: { payment_id: pay.id, kind: 'customer_charge' },
            })
            await db.from('payments').update({ status: 'pending', provider_id: session.id, checkout_url: session.url }).eq('id', pay.id)
            return json({ ok: true, data: { appointment_id: appt.id, status: appt.status, deposit: { amount_cents: cents, checkout_url: session.url } } })
          }
          const charge = await createCharge(BigInt(cents), pay.id, `Sinal ${company.name}`)
          await db.from('payments').update({ status: 'pending', provider_id: charge.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage }).eq('id', pay.id)
          return json({ ok: true, data: { appointment_id: appt.id, status: appt.status, deposit: { amount_cents: cents, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage, payment_id: pay.id } } })
        }

        return json({ ok: true, data: { appointment_id: appt.id, status: appt.status } })
      }

      case 'deposit_status': {
        const id = str(body.payment_id, 64)
        const { data: pay } = await db.from('payments').select('id,status,appointment_id').eq('id', id).eq('company_id', company.id).maybeSingle()
        if (!pay) throw new ApiError(404, 'NOT_FOUND', 'Pagamento não encontrado.')
        return json({ ok: true, data: { status: pay.status, appointment_id: pay.appointment_id } })
      }

      default: throw new ApiError(400, 'BAD_ACTION', 'Ação desconhecida.')
    }
  } catch (e) { return errorResponse(e) }
})
