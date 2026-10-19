import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { requireAdmin, requireUser, serviceClient } from '../_shared/db.ts'
import { createInstance, setWebhook, connectInstance, connectionState, logoutInstance, sendText } from '../_shared/evolution.ts'
import { chat, type ChatMessage } from '../_shared/nvidia.ts'
import { getSecret } from '../_shared/secrets.ts'

// Painel administrativo da plataforma IAstetic
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')

    // bootstrap: promove o primeiro admin via segredo de setup
    if (action === 'bootstrap_admin') {
      const { user } = await requireUser(req)
      const secret = await getSecret('ADMIN_BOOTSTRAP_SECRET')
      if (!secret || body.secret !== secret) throw new ApiError(403, 'FORBIDDEN', 'Segredo inválido.')
      await serviceClient().from('profiles').update({ is_admin: true }).eq('id', user.id)
      return json({ ok: true })
    }

    await requireAdmin(req)
    const db = serviceClient()

    switch (action) {
      case 'stats': {
        const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
        const [
          { count: companies }, { count: companies30 },
          { data: subs }, { data: payments30 }, { data: msgs },
          { data: niches },
        ] = await Promise.all([
          db.from('companies').select('id', { count: 'exact', head: true }).eq('is_demo', false),
          db.from('companies').select('id', { count: 'exact', head: true }).eq('is_demo', false).gte('created_at', since30),
          db.from('companies').select('subscription_status').eq('is_demo', false),
          db.from('payments').select('amount_cents,kind,status').gte('created_at', since30).eq('status', 'completed'),
          db.from('ai_usage').select('prompt_tokens,completion_tokens').gte('created_at', since30),
          db.from('companies').select('niche').eq('is_demo', false),
        ])
        const mrr = (subs ?? []).reduce((acc: number, s: any) => acc + (s.subscription_status === 'active' ? 1 : 0), 0)
        const revenue = (payments30 ?? []).reduce((a: number, p: any) => a + Number(p.amount_cents ?? 0), 0)
        const tokens = (msgs ?? []).reduce((a: number, u: any) => a + (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0), 0)
        const byNiche: Record<string, number> = {}
        for (const n of niches ?? []) byNiche[n.niche] = (byNiche[n.niche] ?? 0) + 1
        return json({ ok: true, data: { companies, companies30, active_subscriptions: mrr, revenue_cents_30d: revenue, ai_tokens_30d: tokens, niches: byNiche } })
      }

      case 'list_companies': {
        const { data } = await db.from('companies')
          .select('id,name,niche,slug,subscription_status,subscription_until,trial_until,created_at,owner_id,plans(name,slug),instances(instance_name,status,phone)')
          .eq('is_demo', false).order('created_at', { ascending: false }).limit(200)
        return json({ ok: true, data })
      }

      case 'get_company': {
        const id = str(body.company_id, 64)
        const [{ data: company }, { data: stats }] = await Promise.all([
          db.from('companies').select('*, plans(name,price_cents), instances(instance_name,status,phone)').eq('id', id).single(),
          db.rpc('dashboard_stats', { p_company: id }),
        ])
        const [
          { data: contacts }, { data: services }, { data: appointments },
          { data: payments }, { data: professionals }, { data: followups },
        ] = await Promise.all([
          db.from('contacts').select('id,name,phone,stage,total_spent_cents,created_at,ai_paused').eq('company_id', id).order('created_at', { ascending: false }).limit(30),
          db.from('services').select('id,name,price_cents,duration_min,category,active').eq('company_id', id).order('name').limit(50),
          db.from('appointments').select('id,service_name,professional_name,customer_name,starts_at,status,created_by').eq('company_id', id).order('starts_at', { ascending: false }).limit(20),
          db.from('payments').select('kind,status,amount_cents,provider,created_at,description').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
          db.from('professionals').select('id,name,specialties,active').eq('company_id', id).limit(20),
          db.from('followup_rules').select('id,name,trigger,delay_minutes,active').eq('company_id', id).limit(20),
        ])
        return json({ ok: true, data: { company, stats, contacts, services, appointments, payments, professionals, followups } })
      }

      case 'set_subscription': {
        // approve | reject | extend_trial | set_plan
        const id = str(body.company_id, 64)
        const mode = str(body.mode, 20)
        const patch: Record<string, unknown> = {}
        if (mode === 'approve') {
          const until = body.days ? new Date(Date.now() + Number(body.days) * 86_400_000).toISOString()
            : new Date(Date.now() + 30 * 86_400_000).toISOString()
          Object.assign(patch, { subscription_status: 'active', subscription_until: until })
          if (body.plan_id) patch.plan_id = str(body.plan_id, 64)
        } else if (mode === 'reject') {
          Object.assign(patch, { subscription_status: 'cancelled', subscription_until: null })
        } else if (mode === 'extend_trial') {
          Object.assign(patch, {
            subscription_status: 'trial',
            trial_until: new Date(Date.now() + (Number(body.days) || 7) * 86_400_000).toISOString(),
          })
        } else if (mode === 'past_due') {
          patch.subscription_status = 'past_due'
        } else throw new ApiError(400, 'BAD_MODE', 'Modo inválido.')
        await db.from('companies').update(patch).eq('id', id)
        return json({ ok: true })
      }

      case 'list_plans': {
        const { data } = await db.from('plans').select('id,name,slug,price_cents,niche').eq('active', true).order('price_cents')
        return json({ ok: true, data })
      }

      case 'suspend_company': {
        await db.from('companies').update({ subscription_status: body.suspend ? 'cancelled' : 'active' }).eq('id', str(body.company_id, 64))
        return json({ ok: true })
      }

      case 'update_fees': {
        const pct = Number(body.withdrawal_percent), min = Number(body.min_withdrawal_cents)
        await db.from('platform_settings').upsert({ key: 'fees', value: { withdrawal_percent: pct, min_withdrawal_cents: min } })
        return json({ ok: true })
      }

      case 'update_settings': {
        const key = str(body.key, 40)
        if (!['fees', 'trial', 'branding'].includes(key)) throw new ApiError(400, 'BAD_KEY', 'Chave inválida.')
        await db.from('platform_settings').upsert({ key, value: body.value ?? {} })
        return json({ ok: true })
      }

      case 'list_payments': {
        const { data } = await db.from('payments').select('*, companies(name)').order('created_at', { ascending: false }).limit(100)
        return json({ ok: true, data })
      }

      // ---------- instância WhatsApp do admin (vendas/suporte da plataforma) ----------
      case 'admin_instance_status': {
        const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').maybeSingle()
        const name = cfg?.value?.instance_name
        if (!name) return json({ ok: true, data: { instance: null } })
        let state: any = null
        try { state = await connectionState(name) } catch { /* instância removida */ }
        return json({ ok: true, data: { instance: { name, phone: cfg.value.phone ?? null, state: state?.instance?.state ?? state?.state ?? 'unknown' } } })
      }

      case 'admin_instance_create': {
        const name = `iastetic-admin-${crypto.randomUUID().slice(0, 8)}`
        await createInstance(name)
        const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
        const hookUrl = `https://${req.headers.get('host') ?? ''}/functions/v1/admin-bot`
        await setWebhook(name, hookUrl, (await getSecret('WEBHOOK_INGRESS_SECRET')) ?? undefined)
        await db.from('platform_settings').upsert({ key: 'admin_whatsapp', value: { instance_name: name, created_at: new Date().toISOString() } })
        const conn = await connectInstance(name).catch(() => null)
        return json({ ok: true, data: { instance_name: name, connect: conn } })
      }

      case 'admin_instance_qr': {
        const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
        if (!cfg?.value?.instance_name) throw new ApiError(404, 'NO_INSTANCE', 'Instância não criada.')
        const conn = await connectInstance(cfg.value.instance_name)
        return json({ ok: true, data: conn })
      }

      case 'admin_instance_logout': {
        const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
        if (cfg?.value?.instance_name) await logoutInstance(cfg.value.instance_name).catch(() => {})
        return json({ ok: true })
      }

      case 'send_company_whatsapp': {
        const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
        if (!cfg?.value?.instance_name) throw new ApiError(400, 'NO_INSTANCE', 'Conecte a instância do admin primeiro.')
        const { data: company } = await db.from('companies').select('name,whatsapp_public,phone').eq('id', str(body.company_id, 64)).single()
        const phone = company?.whatsapp_public ?? company?.phone
        if (!phone) throw new ApiError(400, 'NO_PHONE', 'Empresa sem WhatsApp cadastrado.')
        await sendText(cfg.value.instance_name, phone, str(body.message, 4000))
        return json({ ok: true })
      }

      // ---------- secrets / integrações (valores nunca voltam; só status) ----------
      case 'list_secrets': {
        const known = [
          'NVIDIA_API_KEY', 'NVIDIA_ASR_KEY', 'NVIDIA_VISION_KEY', 'GROQ_API_KEY',
          'AI_MODEL', 'ASR_MODEL', 'VISION_MODEL', 'IMAGE_MODEL',
          'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE',
          'MERCOSULPAY_API_KEY', 'MERCOSULPAY_WEBHOOK_SECRET',
          'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
          'EVOLUTION_URL', 'EVOLUTION_APIKEY',
          'WEBHOOK_INGRESS_SECRET', 'CRON_SECRET', 'ADMIN_BOOTSTRAP_SECRET', 'PUBLIC_SITE_URL',
        ]
        const { data: row } = await db.from('platform_settings').select('value').eq('key', 'secrets').maybeSingle()
        const dbSecrets = row?.value ?? {}
        return json({ ok: true, data: known.map(name => ({
          name,
          configured: !!(Deno.env.get(name) || dbSecrets[name]),
          source: Deno.env.get(name) ? 'env' : dbSecrets[name] ? 'painel' : null,
        })) })
      }

      case 'set_secret': {
        const name = str(body.name, 64).toUpperCase()
        if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(name)) throw new ApiError(400, 'BAD_NAME', 'Nome inválido.')
        const value = str(body.value, 4000)
        const { data: row } = await db.from('platform_settings').select('value').eq('key', 'secrets').maybeSingle()
        const cur = row?.value ?? {}
        if (value) cur[name] = value; else delete cur[name]
        await db.from('platform_settings').upsert({ key: 'secrets', value: cur })
        return json({ ok: true })
      }

      // ---------- assistente IA do admin ----------
      case 'admin_assistant': {
        const msg = str(body.message ?? body.question, 2000)
        if (!msg) throw new ApiError(400, 'EMPTY', 'Mensagem vazia.')
        const reply = await runAdminAssistant(db, msg, body.history ?? [])
        return json({ ok: true, data: { reply } })
      }

      default: throw new ApiError(400, 'BAD_ACTION', 'Ação desconhecida.')
    }
  } catch (e) { return errorResponse(e) }
})

// ---------- assistente IA do admin ----------
const ADMIN_TOOLS = [
  { type: 'function', function: { name: 'platform_stats', description: 'Métricas gerais da plataforma (empresas, assinaturas, receita, tokens)', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_companies', description: 'Lista empresas com plano, status e WhatsApp. Filtro opcional por status/nicho.', parameters: { type: 'object', properties: { status: { type: 'string' }, niche: { type: 'string' }, limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'company_detail', description: 'Detalhes de uma empresa: contatos, serviços, agendamentos, pagamentos', parameters: { type: 'object', properties: { company_id: { type: 'string' }, name: { type: 'string', description: 'busca por nome se não souber o id' } } } } },
  { type: 'function', function: { name: 'send_company_whatsapp', description: 'Envia mensagem WhatsApp do admin para uma empresa (follow-up, cobrança, aviso)', parameters: { type: 'object', properties: { company_id: { type: 'string' }, message: { type: 'string' } }, required: ['company_id', 'message'] } } },
  { type: 'function', function: { name: 'set_subscription', description: 'Aprovar/rejeitar/estender assinatura de empresa', parameters: { type: 'object', properties: { company_id: { type: 'string' }, mode: { type: 'string', enum: ['approve', 'reject', 'extend_trial', 'past_due'] }, days: { type: 'number' } }, required: ['company_id', 'mode'] } } },
]

const ADMIN_PROMPT = `Você é a assistente interna do administrador da plataforma IAstetic — um SaaS de IA para estabelecimentos de beleza (salões, manicure, olhar/cílios).
Você ajuda o dono da plataforma a: ver relatórios e resumos, encontrar empresas, aprovar/rejeitar assinaturas, e enviar mensagens WhatsApp às empresas (cobrança, follow-up, suporte).
Regras:
- Português brasileiro, direto e executivo. Markdown leve (**negrito**, listas com -).
- Valores sempre em R$ formatado. Datas em formato brasileiro.
- NUNCA invente números — use as ferramentas para consultar dados reais.
- Para enviar WhatsApp, a empresa precisa ter whatsapp_public/phone — se falhar, avise.
- Não exponha ids técnicos, JSON ou nomes de campos crus.`

async function runAdminAssistant(db: any, question: string, history: { role: string; content: string }[]): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ADMIN_PROMPT },
    ...history.slice(-10).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: question },
  ]
  for (let round = 0; round < 6; round++) {
    const { message } = await chat({ messages, tools: ADMIN_TOOLS, maxTokens: 900 })
    messages.push(message)
    const calls = message.tool_calls ?? []
    if (!calls.length) return (message.content ?? '').trim() || 'Sem resposta — tenta de novo?'
    for (const tc of calls) {
      const args = JSON.parse(tc.function.arguments || '{}')
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(await runAdminTool(db, tc.function.name, args)).slice(0, 4000) })
    }
  }
  return 'Processamento longo demais — resume a pergunta?'
}

async function runAdminTool(db: any, name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'platform_stats': {
      const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const [{ count: companies }, { data: subs }, { data: pays }] = await Promise.all([
        db.from('companies').select('id', { count: 'exact', head: true }).eq('is_demo', false),
        db.from('companies').select('subscription_status').eq('is_demo', false),
        db.from('payments').select('amount_cents').gte('created_at', since30).eq('status', 'completed'),
      ])
      const byStatus: Record<string, number> = {}
      for (const s of subs ?? []) byStatus[s.subscription_status] = (byStatus[s.subscription_status] ?? 0) + 1
      return { total_empresas: companies, assinaturas_por_status: byStatus, receita_30d: `R$ ${((pays ?? []).reduce((a: number, p: any) => a + Number(p.amount_cents), 0) / 100).toFixed(2)}` }
    }
    case 'list_companies': {
      let q = db.from('companies').select('id,name,niche,slug,subscription_status,trial_until,whatsapp_public,phone,created_at,plans(name)').eq('is_demo', false).order('created_at', { ascending: false }).limit(Math.min(args.limit ?? 20, 50))
      if (args.status) q = q.eq('subscription_status', args.status)
      if (args.niche) q = q.eq('niche', args.niche)
      const { data } = await q
      return (data ?? []).map((c: any) => ({ id: c.id, empresa: c.name, nicho: c.niche, status: c.subscription_status, plano: c.plans?.name ?? 'sem plano', whatsapp: c.whatsapp_public ?? c.phone ?? 'sem número', criada: new Date(c.created_at).toLocaleDateString('pt-BR') }))
    }
    case 'company_detail': {
      let id = args.company_id
      if (!id && args.name) {
        const { data: found } = await db.from('companies').select('id').ilike('name', `%${args.name}%`).limit(1)
        id = found?.[0]?.id
      }
      if (!id) return { erro: 'empresa não encontrada' }
      const [{ data: c }, { data: svcs }, { data: appts }, { count: contacts }] = await Promise.all([
        db.from('companies').select('name,niche,subscription_status,trial_until,whatsapp_public,plans(name,price_cents)').eq('id', id).single(),
        db.from('services').select('name,price_cents').eq('company_id', id).eq('active', true).limit(15),
        db.from('appointments').select('service_name,starts_at,status').eq('company_id', id).gte('starts_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(15),
        db.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', id),
      ])
      return {
        empresa: c?.name, id, nicho: c?.niche, status: c?.subscription_status, plano: c?.plans?.name,
        whatsapp: c?.whatsapp_public ?? 'sem número', contatos: contacts,
        servicos: (svcs ?? []).map((s: any) => `${s.name} (R$ ${(s.price_cents / 100).toFixed(2)})`),
        agendamentos_7d: (appts ?? []).map((a: any) => `${a.service_name} — ${a.status}`),
      }
    }
    case 'send_company_whatsapp': {
      const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
      if (!cfg?.value?.instance_name) return { erro: 'instância do admin não conectada — conecte em Admin > WhatsApp' }
      const { data: c } = await db.from('companies').select('whatsapp_public,phone,name').eq('id', args.company_id).single()
      const phone = c?.whatsapp_public ?? c?.phone
      if (!phone) return { erro: 'empresa sem WhatsApp cadastrado' }
      await sendText(cfg.value.instance_name, phone, args.message)
      return { enviado: true, para: c?.name }
    }
    case 'set_subscription': {
      const patch: Record<string, unknown> = {}
      if (args.mode === 'approve') Object.assign(patch, { subscription_status: 'active', subscription_until: new Date(Date.now() + (args.days || 30) * 86_400_000).toISOString() })
      else if (args.mode === 'reject') Object.assign(patch, { subscription_status: 'cancelled' })
      else if (args.mode === 'extend_trial') Object.assign(patch, { subscription_status: 'trial', trial_until: new Date(Date.now() + (args.days || 7) * 86_400_000).toISOString() })
      else if (args.mode === 'past_due') patch.subscription_status = 'past_due'
      await db.from('companies').update(patch).eq('id', args.company_id)
      return { atualizado: true, modo: args.mode }
    }
    default: return { erro: 'ferramenta desconhecida' }
  }
}
