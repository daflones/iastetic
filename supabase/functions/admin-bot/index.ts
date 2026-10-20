// Bot de vendas/onboarding do IAstetic no WhatsApp do admin.
// - Número já cadastrado como empresa -> modo suporte (dúvidas sobre sistema/planos)
// - Número novo -> funil de vendas: nome -> negócio -> nicho -> trial/plano -> email -> conta criada -> link/QR de pagamento
import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { parseIncoming, sendText, sendMedia, sendPresence, fetchMessageMedia } from '../_shared/evolution.ts'
import { chatText, transcribeAudio, describeImage } from '../_shared/nvidia.ts'
import { createCharge } from '../_shared/mercosulpay.ts'
import { createCheckout } from '../_shared/stripe.ts'
import { getSecret } from '../_shared/secrets.ts'

const NICHE_OPTS: Record<string, { id: string; name: string; emoji: string; defaultServices: { name: string; price: number; dur: number }[] }> = {
  '1': { id: 'salao', name: 'Salão de beleza', emoji: '💇‍♀️', defaultServices: [
    { name: 'Corte feminino', price: 80, dur: 60 }, { name: 'Corte masculino', price: 50, dur: 40 },
    { name: 'Escova', price: 60, dur: 45 }, { name: 'Coloração', price: 180, dur: 120 }, { name: 'Hidratação', price: 90, dur: 60 }] },
  '2': { id: 'unhas', name: 'Manicure / Nail designer', emoji: '💅', defaultServices: [
    { name: 'Manicure', price: 35, dur: 45 }, { name: 'Pedicure', price: 40, dur: 50 },
    { name: 'Alongamento em gel', price: 150, dur: 120 }, { name: 'Esmaltação em gel', price: 60, dur: 60 }] },
  '3': { id: 'olhar', name: 'Sobrancelhas & cílios', emoji: '👁️', defaultServices: [
    { name: 'Design de sobrancelhas', price: 50, dur: 40 }, { name: 'Extensão de cílios', price: 180, dur: 120 },
    { name: 'Lash lifting', price: 120, dur: 60 }, { name: 'Brow lamination', price: 130, dur: 60 }] },
  '4': { id: 'barbearia', name: 'Barbearia', emoji: '💈', defaultServices: [
    { name: 'Corte masculino', price: 50, dur: 40 }, { name: 'Corte + barba', price: 80, dur: 60 },
    { name: 'Barba completa (toalha quente)', price: 45, dur: 35 }, { name: 'Degradê / fade', price: 60, dur: 45 }] },
  '5': { id: 'clinica', name: 'Clínica de estética', emoji: '✨', defaultServices: [
    { name: 'Avaliação estética', price: 0, dur: 30 }, { name: 'Limpeza de pele profunda', price: 180, dur: 60 },
    { name: 'Massagem relaxante', price: 150, dur: 60 }, { name: 'Depilação a laser (sessão)', price: 250, dur: 40 }] },
}
const NICHE_BY_ID = Object.fromEntries(Object.entries(NICHE_OPTS).map(([k, v]) => [v.id, { key: k, ...v }]))

async function logMsg(db: any, jid: string, direction: 'in' | 'out', content: string | null, kind = 'text', source = 'bot', media_url?: string) {
  try {
    await db.from('admin_messages').insert({ remote_jid: jid, phone: jid.split('@')[0].replace(/\D/g, ''), direction, kind, content, media_url, source })
  } catch { /* tabela pode não existir ainda */ }
}
async function sendAndLog(db: any, instance: string, jid: string, text: string) {
  await sendText(instance, jid, text)
  await logMsg(db, jid, 'out', text)
}

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    if (req.headers.get('x-iastetic-hook') !== (await getSecret('WEBHOOK_INGRESS_SECRET')))
      throw new ApiError(401, 'UNAUTHORIZED', 'Secret inválido.')
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))

    // confirma que veio da instância do admin
    const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
    const instanceName = cfg?.value?.instance_name
    const msg = parseIncoming(body)
    if (!instanceName || !msg || msg.instanceName !== instanceName || msg.fromMe) return json({ ok: true, ignored: true })
    let text = (msg.text ?? '').trim()

    // áudio → transcreve; imagem → descreve pra IA; outros → recusa gentil
    if (msg.type === 'audio') {
      const media = await fetchMessageMedia(instanceName, msg.raw).catch(() => null)
      const b64 = media?.base64 ?? media?.data
      if (b64) {
        try { text = (await transcribeAudio(String(b64), media?.mimetype ?? 'audio/ogg')).trim() } catch { text = '' }
      }
      await logMsg(db, msg.remoteJid, 'in', text ? `🎙 ${text}` : '[áudio não entendido]', 'audio')
      if (!text) {
        await sendAndLog(db, instanceName, msg.remoteJid, 'Não consegui entender o áudio 😕 manda de novo ou escreve rapidinho?')
        return json({ ok: true })
      }
    } else if (msg.type === 'image') {
      const media = await fetchMessageMedia(instanceName, msg.raw).catch(() => null)
      const b64 = media?.base64 ?? media?.data
      let desc = ''
      if (b64) {
        try { desc = await describeImage(`data:${media?.mimetype ?? 'image/jpeg'};base64,${b64}`, 'Descreva a imagem em uma frase objetiva em pt-BR.') } catch { /* segue sem descrição */ }
      }
      await logMsg(db, msg.remoteJid, 'in', `${msg.text ?? ''} [imagem${desc ? `: ${desc}` : ''}]`, 'image')
      text = `[O cliente mandou uma imagem${desc ? `: ${desc}` : ''}${msg.text ? ` com a legenda: ${msg.text}` : ''}]`
      if (!desc) {
        await sendAndLog(db, instanceName, msg.remoteJid, 'Recebi sua imagem! 📸 Me conta o que precisa?')
        return json({ ok: true })
      }
    } else if (msg.type !== 'text' || !text) {
      await logMsg(db, msg.remoteJid, 'in', `[${msg.type}]`, msg.type)
      await sendAndLog(db, instanceName, msg.remoteJid, 'Por aqui consigo ler texto, áudio e imagem 🙂 me conta em palavras ou manda um áudio?')
      return json({ ok: true })
    } else {
      await logMsg(db, msg.remoteJid, 'in', text)
    }

    const phone = msg.remoteJid.split('@')[0].replace(/\D/g, '')

    // empresa existente? -> modo suporte
    const { data: companies } = await db.from('companies')
      .select('id,name,niche,subscription_status,trial_until,subscription_until,whatsapp_public,phone,plans(name)')
      .eq('is_demo', false)
    const company = (companies ?? []).find((c: any) => {
      const nums = [c.whatsapp_public, c.phone].filter(Boolean).map((p: string) => p.replace(/\D/g, ''))
      return nums.some((p: string) => p === phone || p.endsWith(phone.slice(-9)) || phone.endsWith(p.slice(-9)))
    })

    await sendPresence(instanceName, msg.remoteJid, 'composing').catch(() => {})

    if (company) {
      await supportReply(db, instanceName, msg.remoteJid, company, text)
      return json({ ok: true, mode: 'support' })
    }

    // lead prospectado respondeu → atualiza status/tags no painel de prospecção
    try {
      const { data: leads } = await db.from('prospect_leads').select('id,name,status,tags,phone').not('phone', 'is', null).limit(1000)
      const found = (leads ?? []).find((l: { phone?: string }) => {
        const p = (l.phone ?? '').replace(/\D/g, '')
        return p === phone || p.endsWith(phone.slice(-9)) || phone.endsWith(p.slice(-9))
      })
      if (found && ['contatado', 'novo'].includes(found.status)) {
        const tags = Array.from(new Set([...(found.tags ?? []), 'respondeu-campanha']))
        await db.from('prospect_leads').update({ status: 'respondeu', tags, updated_at: new Date().toISOString() }).eq('id', found.id)
      }
    } catch { /* tabela pode não existir ainda */ }

    // ---------- funil de vendas ----------
    const sessKey = `bot_${phone}`
    const { data: sessRow } = await db.from('platform_settings').select('value').eq('key', sessKey).maybeSingle()
    const sess = sessRow?.value ?? { stage: 'start', data: {} }
    const reply = await salesStep(db, sess, text, phone)
    await db.from('platform_settings').upsert({ key: sessKey, value: sess })

    for (const part of reply) {
      await sendAndLog(db, instanceName, msg.remoteJid, String(part))
      if (part.qr) {
        await sendMedia(instanceName, msg.remoteJid, part.qr, 'QR Pix — pague escaneando ou use o código acima 👆').catch(() => {})
        await logMsg(db, msg.remoteJid, 'out', 'QR Pix — pague escaneando ou use o código acima 👆', 'image', 'bot', part.qr)
      }
    }
    return json({ ok: true, mode: 'sales' })
  } catch (e) { return errorResponse(e) }
})

// ---------- suporte a empresas cadastradas ----------
async function supportReply(db: any, instance: string, jid: string, company: any, text: string) {
  const statusMap: Record<string, string> = {
    trial: `em teste grátis até ${new Date(company.trial_until).toLocaleDateString('pt-BR')}`,
    active: `ativa no plano ${company.plans?.name ?? ''}`,
    past_due: 'com pagamento pendente', cancelled: 'cancelada', expired: 'expirada',
  }
  const answer = await chatText([
    { role: 'system', content: `Você é o suporte do IAstetic pelo WhatsApp — SaaS de IA para estabelecimentos de beleza (agendamento automático, respostas a clientes, follow-ups, página de agendamento própria).
Falando com: ${company.name} (${company.niche}) — assinatura ${statusMap[company.subscription_status] ?? company.subscription_status}.
Responda dúvidas sobre como usar a plataforma, planos, pagamentos, configuração. Seja humano, breve (máx. ~120 palavras), pt-BR, com 1-2 emojis.
Se pedirem algo que exige ação no painel, oriente o caminho (ex.: "no app, em Configurar IA"). Se não souber, diga que vai chamar a equipe.` },
    { role: 'user', content: text },
  ], 500)
  await sendText(instance, jid, answer)
  await logMsg(db, jid, 'out', answer)
}

// ---------- funil de vendas (máquina de estados) ----------
async function salesStep(db: any, sess: any, text: string, phone: string): Promise<any[]> {
  const s = sess.data ?? {}
  const lower = text.toLowerCase()

  const looksLikeQuestion = /\?|quanto|preço|preco|valor|como funciona|o que é|oq é|funciona|segur|confi|onde|quando|por ?que|cancel|testar|grátis|gratis|demo/i.test(lower)
  const answerDoubt = async (q: string) => chatText([
    { role: 'system', content: `Você é o assistente de vendas do IAstetic no WhatsApp — SaaS de IA pra estabelecimentos de beleza que atende clientes, agenda, remarca, cobra e faz follow-up sozinho no WhatsApp.
Responde a dúvida em pt-BR, breve (2-3 frases), simpático com 1 emoji. Planos: Start R$97, Pro R$197, Studio R$397/mês — 7 dias grátis pra testar tudo. Não invente nada fora disso.` },
    { role: 'user', content: q },
  ], 280)

  const aiExtract = async (field: string, instruction: string): Promise<string | null> => {
    const out = await chatText([
      { role: 'system', content: `Extraia APENAS o valor pedido da mensagem. Responda só o valor ou "NADA".\n${instruction}` },
      { role: 'user', content: text },
    ], 60)
    const v = out.trim().replace(/^["']|["']$/g, '')
    return (!v || v.toUpperCase() === 'NADA' || v.length > 200) ? null : v
  }

  switch (sess.stage) {
    case 'start': {
      sess.stage = 'name'
      return [`Oiê! 👋 Aqui é da *IAstetic* — a recepcionista com IA que atende seus clientes no WhatsApp, agenda, cobra e faz follow-up sozinha.\n\nPra começar, qual o seu nome?`]
    }

    case 'name': {
      const name = await aiExtract('name', 'O nome da pessoa (pode ser nome próprio, apelido, ou primeiro nome). Se não houver nome claro, responda NADA.')
      if (!name) {
        if (looksLikeQuestion) return [await answerDoubt(text), 'E me diz seu nome pra eu te chamar direitinho? 🙂']
        return ['Me diz seu nome pra eu te chamar direitinho? 🙂']
      }
      s.name = name.split(' ')[0]
      sess.stage = 'business'
      return [`Prazer, *${s.name}*! ✨\n\nQual o nome do seu estabelecimento?`]
    }

    case 'business': {
      if (text.length < 2) return ['Qual o nome do seu estabelecimento?']
      s.business = str(text, 80)
      sess.stage = 'niche'
      return [`Perfeito! O que é *${s.business}*?\n\n1️⃣ 💇‍♀️ Salão de beleza\n2️⃣ 💅 Manicure / nail designer\n3️⃣ 👁️ Sobrancelhas & cílios\n4️⃣ 💈 Barbearia\n5️⃣ ✨ Clínica de estética\n\nResponde com o número ou o nome.`]
    }

    case 'niche': {
      let nicheKey = ''
      if (NICHE_OPTS[text.trim()]) nicheKey = text.trim()
      else if (lower.includes('barbearia') || lower.includes('barber') || lower.includes('barbeiro')) nicheKey = '4'
      else if (lower.includes('clínica') || lower.includes('clinica') || lower.includes('estética') || lower.includes('estetica')) nicheKey = '5'
      else if (lower.includes('sal') || lower.includes('cabel')) nicheKey = '1'
      else if (lower.includes('unha') || lower.includes('manicure') || lower.includes('nail')) nicheKey = '2'
      else if (lower.includes('sobrancelha') || lower.includes('cílio') || lower.includes('cilio') || lower.includes('lash') || lower.includes('olhar')) nicheKey = '3'
      if (!nicheKey) {
        if (looksLikeQuestion) return [await answerDoubt(text), 'E o seu negócio é qual?\n\n1️⃣ Salão\n2️⃣ Manicure\n3️⃣ Sobrancelhas & cílios\n4️⃣ Barbearia\n5️⃣ Clínica de estética']
        return ['Escolhe uma opção:\n\n1️⃣ Salão de beleza\n2️⃣ Manicure / nail designer\n3️⃣ Sobrancelhas & cílios\n4️⃣ Barbearia\n5️⃣ Clínica de estética']
      }
      s.niche = NICHE_OPTS[nicheKey].id
      sess.stage = 'plan_choice'
      const { data: plans } = await db.from('plans').select('id,name,price_cents,features').eq('active', true).order('price_cents')
      const list = (plans ?? []).map((p: any, i: number) => `${i + 1}️⃣ *${p.name}* — R$ ${(p.price_cents / 100).toFixed(0)}/mês`).join('\n')
      s.planOptions = (plans ?? []).map((p: any) => p.id)
      return [`${NICHE_OPTS[nicheKey].emoji} Anotado!\n\nAgora, como prefere começar?\n\n🎁 *Teste grátis por 7 dias* — todas as funções liberadas\n\nOu já assina um plano:\n${list}\n\nResponde "teste" ou o número do plano.`]
    }

    case 'plan_choice': {
      if (lower.includes('test') || lower.includes('grátis') || lower.includes('gratis') || lower.includes('trial')) {
        s.mode = 'trial'; s.planId = null
      } else {
        const n = parseInt(text.trim())
        if (!n || !s.planOptions?.[n - 1]) return ['Responde "teste" pra 7 dias grátis, ou o número do plano (1, 2, 3…).']
        s.mode = 'paid'; s.planId = s.planOptions[n - 1]
      }
      sess.stage = 'email'
      return [`Show! Última coisa: qual seu *e-mail*? É com ele que você entra no painel.`]
    }

    case 'email': {
      const email = await aiExtract('email', 'Um endereço de e-mail válido. Se não houver, responda NADA.')
      if (!email || !email.includes('@')) {
        if (looksLikeQuestion) return [await answerDoubt(text), 'E qual e-mail posso usar pra criar sua conta?']
        return ['Me passa um e-mail válido pra criar sua conta? (ex.: voce@gmail.com)']
      }
      s.email = email.toLowerCase()
      // cria conta + empresa
      const created = await createAccountAndCompany(db, s, phone)
      if (!created.ok) {
        if (created.error === 'email_taken') {
          sess.stage = 'done'
          return [`Esse e-mail já tem conta 🙂 entra em ${await siteUrl()}/login — se esqueceu a senha, dá pra recuperar lá.\n\nQualquer coisa chama aqui!`]
        }
        sess.stage = 'email'
        return ['Hmm, deu um probleminha pra criar a conta — me manda outro e-mail?']
      }
      s.companyId = created.companyId; s.userId = created.userId
      if (s.mode === 'trial') {
        sess.stage = 'done'
        const link = await magicLink(db, s.email)
        return [
          `🎉 Tudo certo, *${s.name}*! Criei sua conta e o *${s.business}* já tá no ar com *7 dias grátis de tudo liberado*.`,
          `Entra por aqui pra terminar a configuração:\n${link}`,
          `Depois é só conectar o WhatsApp do estabelecimento e a IA começa a trabalhar. Bem-vinda(o)! 💜`,
        ]
      }
      sess.stage = 'payment_method'
      return [`Conta criada! ✅\n\nComo prefere pagar?\n\n1️⃣ Pix (QR + copia e cola, libera na hora)\n2️⃣ Cartão (link seguro)`]
    }

    case 'payment_method': {
      const wantCard = lower.includes('cart') || text.trim() === '2' || lower.includes('cred')
      const { data: plan } = await db.from('plans').select('*').eq('id', s.planId).single()
      if (!plan) { sess.stage = 'plan_choice'; return ['Plano sumiu — escolhe de novo?'] }
      if (wantCard) {
        try {
          const session = await createCheckout({
            companyId: s.companyId, description: `IAstetic ${plan.name}`, amountCents: BigInt(plan.price_cents),
            successUrl: `${await siteUrl()}/pagamento/sucesso`, cancelUrl: `${await siteUrl()}/pagamento/cancelado`,
            metadata: { kind: 'subscription', plan_id: plan.id, period: 'monthly' }, priceId: plan.stripe_price_id ?? undefined, planId: plan.id, period: 'monthly',
          })
          await db.from('payments').insert({ company_id: s.companyId, kind: 'subscription', provider: 'stripe', status: 'pending', amount_cents: plan.price_cents, plan_id: plan.id, period: 'monthly', provider_id: session.id, checkout_url: session.url, description: `Assinatura ${plan.name} — via WhatsApp` })
          sess.stage = 'await_payment'
          return [`💳 Aqui está seu link de pagamento do plano *${plan.name}*:\n\n${session.url}\n\nAssim que o pagamento confirmar, sua conta libera automaticamente e te aviso aqui! 💜`]
        } catch { return ['Cartão indisponível agora 😕 quer pagar via Pix? Responde "pix".'] }
      }
      try {
        const { data: pay } = await db.from('payments').insert({ company_id: s.companyId, kind: 'subscription', provider: 'mercosulpay', status: 'created', amount_cents: plan.price_cents, plan_id: plan.id, period: 'monthly', description: `Assinatura ${plan.name} — via WhatsApp` }).select().single()
        const charge = await createCharge(BigInt(plan.price_cents), pay.id, `IAstetic ${plan.name}`)
        await db.from('payments').update({ status: 'pending', provider_id: charge.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage }).eq('id', pay.id)
        sess.stage = 'await_payment'; s.paymentId = pay.id
        const parts: any[] = [
          `Pix gerado! 💠 Plano *${plan.name}* — *R$ ${(plan.price_cents / 100).toFixed(2).replace('.', ',')}*\n\nCopia e cola:\n${charge.qrCode ?? '—'}`,
          'Assim que o Pix cair, sua conta libera sozinha e eu te aviso aqui. 🚀',
        ]
        return parts
      } catch { return ['O Pix deu uma engasgada 😕 tenta de novo em instantes ou responde "cartão".'] }
    }

    case 'await_payment': {
      if (s.paymentId) {
        const { data: pay } = await db.from('payments').select('status').eq('id', s.paymentId).single()
        if (pay?.status === 'completed') {
          sess.stage = 'done'
          const link = await magicLink(db, s.email)
          return [`Pagamento confirmado! 🎉 Sua assinatura tá ativa.\n\nEntra aqui:\n${link}`, `Bem-vinda(o) à IAstetic! 💜`]
        }
      }
      return ['Ainda tô aguardando a confirmação do pagamento — assim que cair, libero tudo e te aviso. Se já pagou, pode ser só uns segundinhos 🙂']
    }

    case 'done': {
      return [`Sua conta já tá pronta! Entra em ${await siteUrl()}/login 🙂 qualquer dúvida chama aqui.`]
    }

    default: { sess.stage = 'start'; return salesStep(db, sess, text, phone) }
  }
}

async function siteUrl() { return ((await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br').replace(/\/$/, '') }

async function createAccountAndCompany(db: any, s: any, phone: string): Promise<{ ok: boolean; error?: string; userId?: string; companyId?: string }> {
  // usuário com senha aleatória (entra por magic link)
  const password = crypto.randomUUID() + 'Aa1!'
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: s.email, password, email_confirm: true,
    user_metadata: { name: s.name, via: 'whatsapp_onboarding' },
  })
  if (createErr) {
    if (/already|exists|duplicate/i.test(createErr.message)) return { ok: false, error: 'email_taken' }
    return { ok: false }
  }
  const userId = created.user.id
  const niche = s.niche ?? 'estetica'
  const { data: comp, error: compErr } = await db.from('companies').insert({
    name: s.business, niche, owner_id: userId, email: s.email, whatsapp_public: phone,
    business_hours: { sun: null, mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [['09:00', '14:00']] },
    ai_config: { name: 'Íris', tone: 'Acolhedora e profissional', send_images: false, send_audio: false, payments_enabled: false, language: 'pt-BR', reply_delay_sec: 10, auto_confirm: true },
    onboarding_done: false, onboarding_step: 1,
    subscription_status: s.mode === 'trial' ? 'trial' : 'expired',
  }).select().single()
  if (compErr) { await db.auth.admin.deleteUser(userId).catch(() => {}); return { ok: false } }
  // serviços iniciais do nicho
  const nicheDef = NICHE_BY_ID[niche]
  if (nicheDef?.defaultServices) {
    await db.from('services').insert(nicheDef.defaultServices.map((sv: any, i: number) => ({
      company_id: comp.id, name: sv.name, price_cents: Math.round(sv.price * 100), duration_min: sv.dur, sort: i, active: true,
    })))
  }
  return { ok: true, userId, companyId: comp.id }
}

async function magicLink(db: any, email: string): Promise<string> {
  try {
    const { data } = await db.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${await siteUrl()}/app/dashboard` } })
    return data?.properties?.action_link ?? `${await siteUrl()}/login`
  } catch { return `${await siteUrl()}/login` }
}
