import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { requireAdmin, requireUser, serviceClient } from '../_shared/db.ts'
import { createInstance, setWebhook, connectInstance, connectionState, logoutInstance, sendText, sendMedia, checkWhatsAppNumbers } from '../_shared/evolution.ts'
import { chat, generateImage, synthesizeSpeech, transcribeAudio, type ChatMessage } from '../_shared/nvidia.ts'
import { getSecret } from '../_shared/secrets.ts'
import { igConfig, igFetch, publishCarousel } from '../_shared/instagram.ts'

// Painel administrativo da plataforma IAstetic

const SOCIAL_PROMPT = `Você é a "Marqueteira", diretora de conteúdo do IAstetic — especialista em Instagram para negócios de beleza.

O PRODUTO: IAstetic é uma recepcionista com IA no WhatsApp de salões de cabelo, manicure/pedicure, studios de sobrancelha & cílios, barbearias e clínicas de estética. Ela atende 24h, agenda de verdade, remarca, cobra sinal no Pix, manda lembretes e faz follow-up — com voz humana. Site: iastetic.com.br. Oferta: 7 dias grátis.

SEU TRABALHO: criar CARROSSÉIS de 3 slides (9:16) na estrutura DOR → SOLUÇÃO → CTA + legenda + hashtags. Tom: brasileiro, direto, emocional, fala com a dona/dono do estabelecimento como amiga — nunca corporativo.

Responda SEMPRE em JSON válido:
- Se faltar contexto (tema, público, oferta): {"say": "pergunta curta"}
- Quando pronto pra gerar UM post: {"say": "resumo da ideia em 1-2 linhas", "draft": {...}}
- Quando pedirem PROGRAMAÇÃO/CRONOGRAMA (ex.: "programa posts pra semana", "agenda do mês", "série de promoções"): {"say": "resumo do plano", "plan": [{"title","slides","caption","hashtags","scheduled_at"}, ...]} — cada item é um draft completo + scheduled_at em ISO 8601 (horário de Brasília, ex.: 2026-10-20T19:00:00-03:00). Distribua nos melhores horários (12h e 19h), varie nichos e temas, máx 7 posts por plano.

draft = {
  "title": "nome interno curto do post",
  "slides": [
    {"role": "dor",     "headline": "máx 7 palavras, soco na ferida", "sub": "1 linha de apoio", "image_prompt": "..."},
    {"role": "solucao", "headline": "a virada — o que a IA resolve",  "sub": "1 linha",           "image_prompt": "..."},
    {"role": "cta",     "headline": "chamada direta",                 "sub": "ex.: link na bio · 7 dias grátis", "image_prompt": "..."}
  ],
  "caption": "legenda completa com emojis e quebras de linha, terminando em CTA pro site",
  "hashtags": ["#salao", "#barbearia", "...até 12"]
}

FORMATO REEL (vídeo viral): quando pedirem vídeo/reel/conteúdo viral, responda {"say": "resumo do conceito", "draft": {"type": "reel", "title", "caption", "hashtags", "slides": [{"role": "cena", "headline": "nome da cena (ex.: HOOK, VIRADA, CTA)", "sub": "a fala ou ação em pt-BR", "video_prompt": "..."}]}} — 1 a 3 cenas de ~8s cada. Escreva ROTEIRO VIRAL: hook forte nos 2 primeiros segundos; situações engraçadas, emotivas ou impactantes do dia a dia dos nichos (cliente que some, dona sobrecarregada atendendo madrugada, barbeiro cobrando no-show, cliente que vira fã); histórias curtas com virada emocional quando fizer sentido; CTA sempre pro IAstetic.

video_prompt (sempre em INGLÊS, direção profissional): "vertical 9:16 video, photorealistic, shot on smartphone, handheld cinematic feel, real Brazilian person with natural skin and authentic expression, premium salon/nail/barbershop/clinic setting, professional color grade, shallow depth of field" + AÇÃO e FALA da personagem entre aspas em Brazilian Portuguese (ex.: She says in Brazilian Portuguese with a tired tone: "…"). Inclua direção de arte (clima engraçado/triste/impactante), gestos e expressão. NENHUM texto, legenda ou letra na imagem — texto é sobreposto depois.

image_prompt (sempre em INGLÊS, pra qualidade máxima): "vertical 9:16 portrait photo, photorealistic, cinematic editorial photography, Brazilian real person with natural skin and authentic expression, premium beauty-business setting, shallow depth of field, warm professional lighting" + cena que REPRESENTA a emoção do slide (ex.: tired manicurist looking at phone full of unread messages at night / happy salon owner showing a fully-booked schedule / client's POV of WhatsApp chat on phone). REGRAS: (a) pessoas brasileiras realistas e diversas — nunca manequins/stock genérico; (b) profundidade e composição editorial premium; (c) ABSOLUTAMENTE NENHUM texto, letra, número, logo ou interface escrita na imagem — o texto é sobreposto depois em pt-BR correto; (d) varie nichos/cenas entre slides e entre posts (salão, unha, olhar/cílios, barbearia, clínica).

Headline/sub/legenda: português brasileiro impecável — gramática e ortografia revisadas, tom de amiga experiente.`

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
        return json({ ok: true, data: { instance: { name, phone: cfg.value.phone ?? null, paused: !!cfg.value.paused, state: state?.instance?.state ?? state?.state ?? 'unknown' } } })
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

      // pausa/despausa o bot: desliga o webhook na Evolution (mensagens param de chegar)
      case 'admin_instance_toggle': {
        const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
        const name = cfg?.value?.instance_name
        if (!name) throw new ApiError(404, 'NO_INSTANCE', 'Instância não criada.')
        const paused = !cfg.value.paused
        const hookUrl = `https://${req.headers.get('host') ?? ''}/functions/v1/admin-bot`
        await setWebhook(name, hookUrl, (await getSecret('WEBHOOK_INGRESS_SECRET')) ?? undefined, !paused)
        await db.from('platform_settings').upsert({ key: 'admin_whatsapp', value: { ...cfg.value, paused } })
        return json({ ok: true, data: { paused } })
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
          'WEBHOOK_INGRESS_SECRET', 'CRON_SECRET', 'ADMIN_BOOTSTRAP_SECRET', 'PUBLIC_SITE_URL', 'SERPER_API_KEY',
          'META_APP_ID', 'META_APP_SECRET', 'IG_APP_ID', 'IG_APP_SECRET',
          'VIDEO_PROVIDER', 'VIDEO_MODEL', 'NVIDIA_API_KEY',
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
        let msg = str(body.message ?? body.question, 2000)
        let transcript: string | null = null
        if (!msg && body.audio) {
          transcript = await transcribeAudio(String(body.audio), str(body.audio_mime, 100) || 'audio/webm')
          msg = transcript.slice(0, 2000)
        }
        if (!msg) throw new ApiError(400, 'EMPTY', 'Não entendi o áudio — tenta falar de novo ou escreve.')
        const reply = await runAdminAssistant(db, msg, body.history ?? [])
        return json({ ok: true, data: { reply, transcript } })
      }

      // ================= PROSPECÇÃO =================
      case 'prospect_scan': {
        const niche = str(body.niche, 20) || 'todos'
        const city = str(body.city, 80)
        const uf = str(body.uf, 4).toUpperCase()
        const radius = Math.min(Math.max(Number(body.radius_km) || 5, 1), 30) * 1000
        if (!city) throw new ApiError(400, 'NO_CITY', 'Informe a cidade.')
        const result = await runProspectScan(db, { niche, city, uf, radius })
        return json({ ok: true, data: result })
      }

      case 'prospect_scans': {
        const { data } = await db.from('prospect_scans').select('*').order('created_at', { ascending: false }).limit(30)
        return json({ ok: true, data })
      }

      case 'prospect_leads': {
        let q = db.from('prospect_leads').select('*').order('created_at', { ascending: false }).limit(400)
        if (body.niche) q = q.eq('niche', str(body.niche, 20))
        if (body.city) q = q.ilike('city', `%${str(body.city, 60)}%`)
        if (body.status) q = q.eq('status', str(body.status, 20))
        if (body.only_no_site) q = q.eq('has_site', false)
        if (body.only_valid_whatsapp) q = q.eq('whatsapp_valid', true)
        if (body.search) q = q.or(`name.ilike.%${str(body.search, 60)}%,phone.ilike.%${str(body.search, 20)}%`)
        const { data } = await q
        return json({ ok: true, data })
      }

      case 'prospect_stats': {
        const [{ count: total }, { count: valid }, { count: noSite }, { count: hot },
          { count: contacted }, { count: replied }, { count: converted }, { data: byNiche }] = await Promise.all([
          db.from('prospect_leads').select('id', { count: 'exact', head: true }),
          db.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('whatsapp_valid', true),
          db.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('has_site', false),
          db.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('has_site', false).eq('whatsapp_valid', true),
          db.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('status', 'contatado'),
          db.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('status', 'respondeu'),
          db.from('prospect_leads').select('id', { count: 'exact', head: true }).eq('status', 'convertido'),
          db.from('prospect_leads').select('niche'),
        ])
        const niches: Record<string, number> = {}
        for (const l of byNiche ?? []) niches[l.niche ?? '?'] = (niches[l.niche ?? '?'] ?? 0) + 1
        return json({ ok: true, data: { total, valid_whatsapp: valid, without_site: noSite, hot, contacted, replied, converted, niches } })
      }

      case 'prospect_lead_update': {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (body.status !== undefined) patch.status = str(body.status, 20)
        if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.slice(0, 10).map((t: any) => str(t, 30)) : []
        if (body.notes !== undefined) patch.notes = str(body.notes, 500)
        if (body.niche !== undefined) patch.niche = str(body.niche, 20)
        await db.from('prospect_leads').update(patch).eq('id', str(body.id, 64))
        return json({ ok: true })
      }

      case 'prospect_lead_delete': {
        await db.from('prospect_leads').delete().eq('id', str(body.id, 64))
        return json({ ok: true })
      }

      case 'prospect_check_whatsapp': {
        const inst = await adminInstance(db)
        let q = db.from('prospect_leads').select('id,phone').not('phone', 'is', null).order('created_at').limit(400)
        if (!body.recheck) q = q.is('whatsapp_valid', null)
        const { data: leads } = await q
        let checked = 0, valid = 0
        for (let i = 0; i < (leads ?? []).length; i += 50) {
          const chunk = (leads ?? []).slice(i, i + 50)
          try {
            const res = await checkWhatsAppNumbers(inst, chunk.map((l: any) => l.phone))
            const byNum = new Map(res.map(r => [r.number.slice(-9), r.exists]))
            for (const l of chunk) {
              const v = byNum.get(l.phone.slice(-9))
              if (v !== undefined) {
                await db.from('prospect_leads').update({ whatsapp_valid: v }).eq('id', l.id)
                checked++; if (v) valid++
              }
            }
          } catch { /* próximo lote */ }
        }
        return json({ ok: true, data: { checked, valid } })
      }

      case 'prospect_gen_image': {
        const prompt = str(body.prompt, 1000)
        const base = str(body.edit_of, 1000) // prompt anterior — modo edição
        if (prompt.length < 4) throw new ApiError(400, 'SHORT_PROMPT', 'Descreva a imagem.')
        const brief = base
          ? `Regenere a arte descrita a seguir mantendo o conceito e o estilo, aplicando este ajuste: "${prompt}". Arte base: "${base}".`
          : prompt
        const img = await generateImage(
          `Peça gráfica promocional para WhatsApp de um SaaS chamado IAstetic (recepcionista com IA para salões, barbearias e clínicas de estética). Estilo moderno, gradiente rosa/lilás premium, limpo, SEM texto na imagem. ${brief}`,
          { width: 1024, height: 1024 })
        const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0))
        const path = `campanha/${crypto.randomUUID()}.png`
        const { error: upErr } = await db.storage.from('prospect').upload(path, bytes, { contentType: img.mime })
        if (upErr) throw new ApiError(500, 'UPLOAD_FAILED', upErr.message)
        const { data: pub } = db.storage.from('prospect').getPublicUrl(path)
        const fullPrompt = base ? `${base} | ajuste: ${prompt}` : prompt
        return json({ ok: true, data: { url: pub.publicUrl, prompt: fullPrompt } })
      }

      case 'prospect_campaign_save': {
        const row = {
          name: str(body.name, 80),
          message: str(body.message, 2000),
          image_url: str(body.image_url, 500) || null,
          image_prompt: str(body.image_prompt, 1000) || null,
          audience: ['no_site_whatsapp', 'all_valid', 'custom'].includes(body.audience) ? body.audience : 'no_site_whatsapp',
          interval_sec: Math.min(Math.max(Number(body.interval_sec) || 45, 15), 600),
          vary_messages: body.vary_messages !== false,
        }
        if (!row.name || !row.message) throw new ApiError(400, 'EMPTY', 'Nome e mensagem são obrigatórios.')
        if (body.id) await db.from('prospect_campaigns').update(row).eq('id', str(body.id, 64))
        else await db.from('prospect_campaigns').insert(row)
        return json({ ok: true })
      }

      case 'prospect_campaigns': {
        const { data: camps } = await db.from('prospect_campaigns').select('*').order('created_at', { ascending: false }).limit(50)
        const out = []
        for (const c of camps ?? []) {
          const [{ count: pending }, { count: failed }, { count: total }] = await Promise.all([
            db.from('prospect_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'pending'),
            db.from('prospect_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'failed'),
            db.from('prospect_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id),
          ])
          out.push({ ...c, pending: pending ?? 0, failed: failed ?? 0, total: total ?? 0 })
        }
        return json({ ok: true, data: out })
      }

      // ================= POSTS DE INSTAGRAM (Marqueteira) =================
      case 'social_posts': {
        const { data } = await db.from('social_posts').select('*').order('created_at', { ascending: false }).limit(60)
        return json({ ok: true, data: data ?? [] })
      }

      case 'social_post_save': {
        const row = {
          title: str(body.title, 120) || 'Post sem título',
          slides: Array.isArray(body.slides) ? body.slides.slice(0, 8) : [],
          caption: str(body.caption, 4000),
          hashtags: Array.isArray(body.hashtags) ? body.hashtags.map((h: unknown) => String(h).slice(0, 40)) : [],
          status: ['rascunho', 'pronto', 'publicado'].includes(body.status) ? body.status : 'rascunho',
          scheduled_at: body.scheduled_at ? new Date(String(body.scheduled_at)).toISOString() : null,
        }
        if (body.id) {
          await db.from('social_posts').update(row).eq('id', str(body.id, 64))
          return json({ ok: true, data: { id: body.id } })
        }
        const { data: post } = await db.from('social_posts').insert({ ...row }).select('id').single()
        return json({ ok: true, data: { id: post?.id } })
      }

      case 'social_post_delete': {
        await db.from('social_posts').delete().eq('id', str(body.id, 64))
        return json({ ok: true })
      }

      case 'social_gen_slide': {
        const postId = str(body.post_id, 64), idx = Math.max(0, Number(body.index) | 0)
        const { data: post } = await db.from('social_posts').select('id,slides').eq('id', postId).single()
        if (!post) throw new ApiError(404, 'NOT_FOUND', 'Post não encontrado.')
        const slides = Array.isArray(post.slides) ? [...post.slides] : []
        const slide = slides[idx]; if (!slide) throw new ApiError(400, 'BAD_INDEX', 'Slide inválido.')
        const img = await generateImage(slide.image_prompt ?? body.image_prompt ?? '', { width: 576, height: 1024 })
        const bytes = Uint8Array.from(atob(img.base64), c => c.charCodeAt(0))
        const path = `posts/${postId}/${idx}-${crypto.randomUUID().slice(0, 8)}.png`
        const { error: upErr } = await db.storage.from('prospect').upload(path, bytes, { contentType: img.mime })
        if (upErr) throw new ApiError(500, 'UPLOAD_FAILED', upErr.message)
        const { data: pub } = db.storage.from('prospect').getPublicUrl(path)
        slides[idx] = { ...slide, image_url: pub.publicUrl }
        await db.from('social_posts').update({ slides }).eq('id', postId)
        return json({ ok: true, data: { image_url: pub.publicUrl } })
      }

      case 'social_gen_scene': {
        const postId = str(body.post_id, 64), idx = Math.max(0, Number(body.index) | 0)
        const { data: post } = await db.from('social_posts').select('id,slides').eq('id', postId).single()
        const slide = post?.slides?.[idx]
        if (!slide) throw new ApiError(400, 'BAD_INDEX', 'Cena inválida.')

        // provedor: 'nvidia' = Cosmos3 Nano (endpoint grátis, vídeo mudo) | 'openrouter' = Veo (com áudio/fala)
        const provider = (str(body.provider, 12) || (await getSecret('VIDEO_PROVIDER')) || 'openrouter').toLowerCase()

        if (provider === 'nvidia') {
          const nvKey = await getSecret('NVIDIA_API_KEY')
          if (!nvKey) throw new ApiError(400, 'NO_KEY', 'Configure NVIDIA_API_KEY em Integrações.')
          const res = await fetch('https://ai.api.nvidia.com/v1/cosmos/nvidia/cosmos3-nano', {
            method: 'POST',
            headers: { Authorization: `Bearer ${nvKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_mode: 'text2video', prompt: slide.video_prompt ?? '' }),
            signal: AbortSignal.timeout(240_000),
          })
          const data = await res.json().catch(() => ({}))
          const b64 = data.b64_video ?? data.video ?? ''
          if (!res.ok || !b64) throw new ApiError(502, 'VIDEO_FAILED', `NVIDIA vídeo falhou: ${JSON.stringify(data).slice(0, 200)}`)
          const bytes = Uint8Array.from(atob(b64.replace(/^data:[^,]+,/, '')), c => c.charCodeAt(0))
          const path = `reels/${postId}/${idx}-${crypto.randomUUID().slice(0, 8)}.mp4`
          const { error: upErr } = await db.storage.from('prospect').upload(path, bytes, { contentType: 'video/mp4' })
          if (upErr) throw new ApiError(500, 'UPLOAD_FAILED', upErr.message)
          const { data: pub } = db.storage.from('prospect').getPublicUrl(path)
          const slides = [...post.slides]; slides[idx] = { ...slide, video_url: pub.publicUrl, job_url: null }
          await db.from('social_posts').update({ slides }).eq('id', postId)
          return json({ ok: true, data: { status: 'done', video_url: pub.publicUrl } })
        }

        const orKey = await getSecret('OPENROUTER_API_KEY')
        if (!orKey) throw new ApiError(400, 'NO_KEY', 'Configure OPENROUTER_API_KEY em Integrações.')
        const res = await fetch('https://openrouter.ai/api/v1/videos', {
          method: 'POST',
          headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: (await getSecret('VIDEO_MODEL')) ?? 'google/veo-3.1-fast',
            prompt: slide.video_prompt ?? '', aspect_ratio: '9:16', duration: 8, resolution: '720p', generate_audio: true,
          }),
        })
        const job = await res.json().catch(() => ({}))
        const jobUrl = job.polling_url ?? (job.id ? `/api/v1/videos/${job.id}` : null)
        if (!res.ok || !jobUrl) throw new ApiError(502, 'VIDEO_FAILED', `Geração de vídeo falhou: ${JSON.stringify(job).slice(0, 200)}`)
        const slides = [...post.slides]; slides[idx] = { ...slide, job_url: jobUrl }
        await db.from('social_posts').update({ slides }).eq('id', postId)
        return json({ ok: true, data: { status: 'generating' } })
      }
      case 'social_scene_tts': {
        const postId = str(body.post_id, 64), idx = Math.max(0, Number(body.index) | 0)
        const { data: post } = await db.from('social_posts').select('id,slides').eq('id', postId).single()
        const slide = post?.slides?.[idx]
        const fala = String(slide?.sub ?? '').trim()
        if (!fala) throw new ApiError(400, 'NO_SPEECH', 'Cena sem fala para narrar.')
        const audio = await synthesizeSpeech(fala)
        return json({ ok: true, data: { audio: `data:${audio.mime};base64,${audio.base64}` } })
      }

      case 'social_upload_scene': {
        const postId = str(body.post_id, 64), idx = Math.max(0, Number(body.index) | 0)
        const m = /^data:video\/(\w+);base64,(.+)$/.exec(String(body.data_url ?? ''))
        if (!m) throw new ApiError(400, 'BAD_VIDEO', 'Vídeo inválido.')
        const { data: post } = await db.from('social_posts').select('id,slides').eq('id', postId).single()
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0))
        if (bytes.length > 40_000_000) throw new ApiError(400, 'TOO_BIG', 'Vídeo acima de 40MB.')
        const path = `reels/${postId}/${idx}-mux-${crypto.randomUUID().slice(0, 8)}.mp4`
        await db.storage.from('prospect').upload(path, bytes, { contentType: 'video/mp4', upsert: true })
        const { data: pub } = db.storage.from('prospect').getPublicUrl(path)
        const slides = [...(post.slides ?? [])]
        if (slides[idx]) slides[idx] = { ...slides[idx], video_url: pub.publicUrl, job_url: null }
        await db.from('social_posts').update({ slides }).eq('id', postId)
        return json({ ok: true, data: { video_url: pub.publicUrl } })
      }

      case 'social_scene_status': {
        const postId = str(body.post_id, 64), idx = Math.max(0, Number(body.index) | 0)
        const { data: post } = await db.from('social_posts').select('id,slides').eq('id', postId).single()
        const slide = post?.slides?.[idx]
        if (!slide) throw new ApiError(400, 'BAD_INDEX', 'Cena inválida.')
        if (slide.video_url) return json({ ok: true, data: { status: 'done', video_url: slide.video_url } })
        if (!slide.job_url) return json({ ok: true, data: { status: 'idle' } })
        const orKey = await getSecret('OPENROUTER_API_KEY')
        const url = slide.job_url.startsWith('http') ? slide.job_url : `https://openrouter.ai${slide.job_url}`
        const job = await fetch(url, { headers: { Authorization: `Bearer ${orKey}` } }).then(r => r.json()).catch(() => ({}))
        if (job.status === 'completed') {
          const vurl = job.urls?.[0] ?? job.unsigned_urls?.[0]
          if (!vurl) throw new ApiError(502, 'NO_URL', 'Vídeo pronto sem URL.')
          const buf = new Uint8Array(await (await fetch(vurl, { headers: { Authorization: `Bearer ${orKey}` } })).arrayBuffer())
          const path = `reels/${postId}/${idx}-${crypto.randomUUID().slice(0, 8)}.mp4`
          const { error: upErr } = await db.storage.from('prospect').upload(path, buf, { contentType: 'video/mp4' })
          if (upErr) throw new ApiError(500, 'UPLOAD_FAILED', upErr.message)
          const { data: pub } = db.storage.from('prospect').getPublicUrl(path)
          const slides = [...post.slides]; slides[idx] = { ...slide, video_url: pub.publicUrl, job_url: null }
          await db.from('social_posts').update({ slides }).eq('id', postId)
          return json({ ok: true, data: { status: 'done', video_url: pub.publicUrl } })
        }
        if (['failed', 'cancelled', 'expired'].includes(job.status)) {
          const slides = [...post.slides]; slides[idx] = { ...slide, job_url: null }
          await db.from('social_posts').update({ slides }).eq('id', postId)
          throw new ApiError(502, 'VIDEO_FAILED', `Geração falhou (${job.status}) — tenta de novo.`)
        }
        return json({ ok: true, data: { status: 'generating' } })
      }

      case 'social_assistant': {
        const history: ChatMessage[] = Array.isArray(body.history) ? body.history.slice(-14) : []
        const { message } = await chat({
          messages: [
            { role: 'system', content: SOCIAL_PROMPT },
            ...history.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '').slice(0, 2000) })),
          ], temperature: 0.85, maxTokens: 14000,
        })
        const raw = message.content ?? ''
        const cleaned = raw.replace(/```json|```/g, '').trim()
        // extrai um valor JSON balanceado a partir da chave — tolera aninhamento e truncamento
        const extract = (key: string): any => {
          const ki = cleaned.indexOf(`"${key}"`)
          if (ki < 0) return null
          let i = cleaned.indexOf(':', ki) + 1
          while (i < cleaned.length && /\s/.test(cleaned[i])) i++
          const open = cleaned[i]
          if (open !== '{' && open !== '[') return null
          const close = open === '{' ? '}' : ']'
          let depth = 0, inStr = false, esc = false, lastEnd = -1, j = i
          for (; j < cleaned.length; j++) {
            const c = cleaned[j]
            if (esc) { esc = false; continue }
            if (c === '\\') { esc = true; continue }
            if (c === '"') inStr = !inStr
            if (inStr) continue
            if (c === open) depth++
            if (c === close) { depth--; if (depth === 0) { lastEnd = j; break } }
            if ((open === '[' && c === '}') && depth === 1) lastEnd = j // último objeto completo dentro do array
            if (depth === 1 && c === '}' && open === '{') lastEnd = j
          }
          const candidates: string[] = []
          if (j < cleaned.length && lastEnd === j) candidates.push(cleaned.slice(i, j + 1))
          if (lastEnd > i) candidates.push(open === '[' ? cleaned.slice(i, lastEnd + 1) + ']' : cleaned.slice(i, lastEnd + 1))
          for (const c of candidates) { try { return JSON.parse(c) } catch { /* tenta próximo */ } }
          return null
        }

        let say = '', draft: any = null, plan: any[] | null = null
        const sayMatch = cleaned.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/)
        if (sayMatch) { try { say = JSON.parse(`"${sayMatch[1]}"`) } catch { say = sayMatch[1] } }
        const root = extract('draft') ?? extract('reel') ?? extract('post')
        if (root && !Array.isArray(root)) draft = root
        const planArr = extract('plan')
        if (Array.isArray(planArr) && planArr.length) plan = planArr.slice(0, 7)
        console.log(`social_assistant parse: say=${!!say} draft=${!!draft} plan=${plan?.length ?? 0} rawLen=${raw.length}`)
        if (draft || plan) return json({ ok: true, data: { say: String(say ?? ''), draft, plan } })
        return json({ ok: true, data: { say: say || 'Quase consegui — a resposta veio quebrada. Tenta de novo (dica: pede em partes, ex. 3 posts por vez).', draft: null, plan: null } })
      }

      // ---------- Instagram conectado ----------
      case 'ig_status': {
        const appId = (await getSecret('IG_APP_ID')) ?? (await getSecret('META_APP_ID'))
        const ig = await igConfig(db)
        const base = { app_id: appId ?? null }
        if (!ig) return json({ ok: true, data: { ...base, connected: false } })
        try {
          const me = await igFetch(ig.access_token, 'me', { fields: 'user_id,username,name,profile_picture_url,biography,website,followers_count,follows_count,media_count' })
          const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'instagram').single()
          // renova o token se faltar menos de 7 dias pra expirar
          const exp = new Date(cfg.value.token_expires_at ?? 0).getTime()
          if (exp - Date.now() < 7 * 864e5) {
            const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${ig.access_token}`).then(r => r.json()).catch(() => ({}))
            if (r.access_token) {
              cfg.value.access_token = r.access_token
              cfg.value.token_expires_at = new Date(Date.now() + Number(r.expires_in ?? 5_184_000) * 1000).toISOString()
              await db.from('platform_settings').update({ value: cfg.value }).eq('key', 'instagram')
            }
          }
          if (me.username && me.username !== cfg.value.username) {
            cfg.value.username = me.username
            cfg.value.avatar = me.profile_picture_url ?? cfg.value.avatar
            await db.from('platform_settings').update({ value: cfg.value }).eq('key', 'instagram')
          }
          return json({ ok: true, data: { ...base, connected: true, username: me.username ?? cfg.value.username, avatar: me.profile_picture_url ?? cfg.value.avatar ?? null, expires_at: cfg.value.token_expires_at, profile: { name: me.name, bio: me.biography, website: me.website, followers: me.followers_count, following: me.follows_count, posts: me.media_count } } })
        } catch {
          return json({ ok: true, data: { ...base, connected: false, expired: true } })
        }
      }

      case 'ig_disconnect': {
        await db.from('platform_settings').delete().eq('key', 'instagram')
        return json({ ok: true })
      }

      case 'ig_media': {
        const ig = await igConfig(db)
        if (!ig) throw new ApiError(400, 'NO_IG', 'Instagram não conectado.')
        const r = await igFetch(ig.access_token, `${ig.ig_user_id}/media`, {
          fields: 'id,caption,media_url,thumbnail_url,like_count,comments_count,timestamp,permalink,media_type', limit: '24',
        })
        return json({ ok: true, data: r.data ?? [] })
      }

      case 'ig_comments': {
        const ig = await igConfig(db)
        if (!ig) throw new ApiError(400, 'NO_IG', 'Instagram não conectado.')
        const r = await igFetch(ig.access_token, `${str(body.media_id, 40)}/comments`, {
          fields: 'text,username,timestamp,like_count', limit: '50',
        })
        return json({ ok: true, data: r.data ?? [] })
      }

      case 'social_upload_slide': {
        const postId = str(body.post_id, 64)
        const idx = Math.min(Math.max(Number(body.index) || 0, 0), 9)
        const m = /^data:image\/(\w+);base64,(.+)$/.exec(String(body.data_url ?? ''))
        if (!m) throw new ApiError(400, 'BAD_IMAGE', 'Imagem inválida.')
        const { data: post } = await db.from('social_posts').select('id,slides').eq('id', postId).single()
        if (!post) throw new ApiError(404, 'NOT_FOUND', 'Post não encontrado.')
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0))
        if (bytes.length > 9_000_000) throw new ApiError(400, 'TOO_BIG', 'Imagem acima de 9MB.')
        const path = `social/${postId}/${idx}.png`
        await db.storage.from('prospect').upload(path, bytes, { contentType: 'image/png', upsert: true })
        const { data: pub } = db.storage.from('prospect').getPublicUrl(path)
        const slides = [...(post.slides ?? [])]
        if (slides[idx]) slides[idx] = { ...slides[idx], composed_url: pub.publicUrl }
        await db.from('social_posts').update({ slides }).eq('id', postId)
        return json({ ok: true, data: { url: pub.publicUrl } })
      }

      case 'social_publish': {
        const ig = await igConfig(db)
        if (!ig) throw new ApiError(400, 'NO_IG', 'Conecte o Instagram primeiro.')
        const { data: post } = await db.from('social_posts').select('*').eq('id', str(body.post_id, 64)).single()
        if (!post) throw new ApiError(404, 'NOT_FOUND', 'Post não encontrado.')
        const caption = `${post.caption ?? ''}

${(post.hashtags ?? []).join(' ')}`.trim()
        const mediaId = await publishCarousel(ig, post.slides ?? [], caption)
        await db.from('social_posts').update({ ig_media_id: mediaId, status: 'publicado', published_at: new Date().toISOString(), scheduled_at: null, publish_error: null }).eq('id', post.id)
        return json({ ok: true, data: { media_id: mediaId } })
      }

      case 'social_schedule': {
        await db.from('social_posts').update({
          scheduled_at: body.scheduled_at ? new Date(String(body.scheduled_at)).toISOString() : null,
          publish_error: null,
        }).eq('id', str(body.post_id, 64))
        return json({ ok: true })
      }

      case 'prospect_campaign_launch': {
        const campId = str(body.campaign_id, 64)
        const { data: camp } = await db.from('prospect_campaigns').select('*').eq('id', campId).single()
        if (!camp) throw new ApiError(404, 'NOT_FOUND', 'Campanha não encontrada.')
        await adminInstance(db) // precisa estar conectada
        let q = db.from('prospect_leads').select('id,phone').not('phone', 'is', null).eq('whatsapp_valid', true)
        if (camp.audience === 'no_site_whatsapp') q = q.eq('has_site', false)
        if (Array.isArray(body.lead_ids) && body.lead_ids.length) q = q.in('id', body.lead_ids.slice(0, 300))
        else q = q.in('status', ['novo', 'contatado']).limit(500)
        const { data: leads } = await q
        const intervalSec = Math.min(Math.max(Number(body.interval_sec ?? camp.interval_sec) || 45, 15), 600)
        const jobs = (leads ?? []).map((l: any, i: number) => ({
          campaign_id: campId, lead_id: l.id, phone: l.phone,
          scheduled_at: new Date(Date.now() + i * intervalSec * 1000).toISOString(),
        }))
        if (jobs.length) await db.from('prospect_jobs').upsert(jobs, { onConflict: 'campaign_id,phone', ignoreDuplicates: true })
        await db.from('prospect_campaigns').update({ status: 'sending' }).eq('id', campId)
        return json({ ok: true, data: { queued: jobs.length, interval_sec: intervalSec } })
      }

      // ================= SUPORTE (chamados das empresas) =================
      case 'support_list': {
        let q = db.from('support_tickets')
          .select('*, companies(name,niche,whatsapp_public), support_messages(count)')
          .order('status').order('updated_at', { ascending: false }).limit(200)
        if (body.status) q = q.eq('status', str(body.status, 20))
        const { data } = await q
        const open = (data ?? []).filter((t: any) => t.status === 'aberto').length
        return json({ ok: true, data: { tickets: data ?? [], open } })
      }

      case 'support_get': {
        const id = str(body.id, 64)
        const [{ data: t }, { data: msgs }] = await Promise.all([
          db.from('support_tickets').select('*, companies(name,niche,slug,whatsapp_public,instances(status,phone))').eq('id', id).single(),
          db.from('support_messages').select('*').eq('ticket_id', id).order('created_at'),
        ])
        // marca como em atendimento quando o admin abre um chamado "aberto"
        if (t && t.status === 'aberto') {
          await db.from('support_tickets').update({ status: 'em_atendimento' }).eq('id', id)
          t.status = 'em_atendimento'
        }
        return json({ ok: true, data: { ticket: t, messages: msgs ?? [] } })
      }

      case 'support_reply': {
        const id = str(body.ticket_id, 64)
        const text = str(body.message, 2000)
        if (!text) throw new ApiError(400, 'EMPTY', 'Resposta vazia.')
        await db.from('support_messages').insert({ ticket_id: id, sender: 'admin', body: text })
        await db.from('support_tickets').update({ status: 'aguardando_empresa', updated_at: new Date().toISOString() }).eq('id', id)
        return json({ ok: true })
      }

      case 'support_status': {
        const st = str(body.status, 20)
        if (!['aberto', 'em_atendimento', 'aguardando_empresa', 'resolvido'].includes(st)) throw new ApiError(400, 'BAD', 'Status inválido.')
        await db.from('support_tickets').update({ status: st, updated_at: new Date().toISOString() }).eq('id', str(body.id, 64))
        return json({ ok: true })
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

// ================= prospecção: helpers =================

async function adminInstance(db: any): Promise<string> {
  const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
  const name = cfg?.value?.instance_name
  if (!name) throw new ApiError(400, 'NO_INSTANCE', 'Conecte a instância do admin primeiro (Admin → WhatsApp do admin).')
  return name
}

const NICHE_KEYWORDS: Record<string, RegExp> = {
  barbearia: /barbeari|barber|barbeir/i,
  unhas: /unha|nail|manicur|pedicur|esmalt/i,
  olhar: /sobrancelh|c[íi]li|lash|olhar|brow/i,
  clinica: /cl[íi]nica|est[ée]tic|laser|massag|drenag|spa/i,
  salao: /sal[ãa]o|cabel|hair|coiffeur|beleza/i,
}
function guessNiche(name: string, tags: any): string {
  const n = `${name ?? ''} ${tags?.beauty ?? ''} ${tags?.hairdresser ?? ''}`
  for (const [niche, re] of Object.entries(NICHE_KEYWORDS)) if (re.test(n)) return niche
  return 'salao'
}

function normPhone(raw?: string): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0')) d = d.slice(1)
  if (!d.startsWith('55') && d.length >= 10 && d.length <= 11) d = '55' + d
  return d.length >= 12 && d.length <= 13 ? d : null
}

async function runProspectScan(db: any, opts: { niche: string; city: string; uf: string; radius: number }) {
  // 1) geocodifica a cidade (Nominatim, gratuito) — estruturada + fallback livre
  const nomHeaders = { 'User-Agent': 'IAstetic-prospector/1.0 (iastetic.com.br)', 'Accept-Language': 'pt-BR' }
  async function geocode(url: string) {
    try {
      const r = await fetch(url, { headers: nomHeaders, signal: AbortSignal.timeout(20_000) })
      if (!r.ok) return null
      return (await r.json().catch(() => []))?.[0] ?? null
    } catch { return null }
  }
  let place = await geocode(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&city=${encodeURIComponent(opts.city)}${opts.uf ? `&state=${encodeURIComponent(opts.uf)}` : ''}`)
  if (!place) {
    const q = [opts.city, opts.uf, 'Brasil'].filter(Boolean).join(', ')
    place = await geocode(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`)
  }
  if (!place) {
    // Nominatim bloqueia IP de cloud às vezes — Photon cobre geocode de cidade
    try {
      const q = encodeURIComponent([opts.city, opts.uf, 'Brasil'].filter(Boolean).join(', '))
      const r = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=8`, { signal: AbortSignal.timeout(20_000) })
      if (r.ok) {
        const feats = (await r.json().catch(() => ({})))?.features ?? []
        const UF_STATE: Record<string, string> = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' }
        const ufName = UF_STATE[(opts.uf || '').toUpperCase()]?.toLowerCase()
        const br = feats.filter((f: any) => /brasil|brazil/i.test(f.properties?.country ?? ''))
        const isPlace = (f: any) => ['city', 'district', 'borough', 'county', 'hamlet', 'locality'].includes(f.properties?.type ?? '') || ['city', 'town', 'municipality', 'village'].includes(f.properties?.osm_value ?? '')
        const match = br.find((f: any) => isPlace(f) && (!ufName || (f.properties?.state ?? '').toLowerCase() === ufName)) ?? br.find(isPlace) ?? br[0]
        if (match?.geometry?.coordinates) {
          place = { lat: String(match.geometry.coordinates[1]), lon: String(match.geometry.coordinates[0]) }
        }
      }
    } catch { /* segue pro erro */ }
  }
  if (!place) throw new ApiError(404, 'CITY_NOT_FOUND', `Cidade "${opts.city}" não encontrada. Confira o nome/UF.`)
  const lat = Number(place.lat), lon = Number(place.lon)

  // 2) POIs: Serper (Google Maps real, se chave configurada) -> Overpass (mirrors) -> Photon
  let elements: any[] = []

  const serperKey = await getSecret('SERPER_API_KEY')
  if (serperKey) {
    const TERMS: Record<string, string> = {
      salao: 'salão de beleza', barbearia: 'barbearia', unhas: 'manicure esmalteria',
      olhar: 'sobrancelha cílios', clinica: 'clínica de estética', todos: 'salão de beleza barbearia manicure estética',
    }
    try {
      const r = await fetch('https://google.serper.dev/maps', {
        method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `${TERMS[opts.niche] ?? TERMS.todos} em ${opts.city}${opts.uf ? ` ${opts.uf}` : ''}`, ll: `@${lat},${lon},13z`, gl: 'br', hl: 'pt-br', num: 100 }),
      })
      if (r.ok) {
        for (const pl of (await r.json())?.places ?? []) {
          if (!pl?.title) continue
          elements.push({ lat: pl.latitude, lon: pl.longitude, tags: {
            name: pl.title, phone: pl.phoneNumber, website: pl.website,
            'addr:street': pl.address, osm_value_hint: pl.type ?? pl.category,
          } })
        }
      }
    } catch { /* cai pro Overpass */ }
  }

  if (!elements.length) {
    const query = `[out:json][timeout:40];
(nwr["shop"~"hairdresser|beauty|massage|cosmetics"]["name"](around:${opts.radius},${lat},${lon});
 nwr["amenity"="spa"]["name"](around:${opts.radius},${lat},${lon});
 nwr["healthcare"="beauty"]["name"](around:${opts.radius},${lat},${lon});
 nwr["office"~"beauty|aesthetic"]["name"](around:${opts.radius},${lat},${lon}););
out tags center 300;`
    const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.nchc.org.tw/api/interpreter']
    for (const host of OVERPASS) {
      try {
        const ov = await fetch(host, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'IAstetic-prospector/1.0' },
          body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(45_000),
        })
        if (ov.ok) { elements = (await ov.json())?.elements ?? []; break }
      } catch { /* proximo mirror */ }
    }
  }

  if (!elements.length) {
    // fallback Photon (OSM): busca por termo com bias de coordenada, filtrado pelo raio
    const TERMS: Record<string, string[]> = {
      salao: ['salão', 'cabeleireiro'], barbearia: ['barbearia', 'barbeiro'],
      unhas: ['manicure', 'esmalteria', 'unhas'], olhar: ['sobrancelha', 'cílios'],
      clinica: ['estética', 'spa', 'depilação', 'massagem'],
      todos: ['salão', 'cabeleireiro', 'barbearia', 'manicure', 'sobrancelha', 'estética', 'spa', 'depilação'],
    }
    const seen = new Set<string>()
    const dist = (la: number, lo: number) => {
      const dLa = (la - lat) * 111, dLo = (lo - lon) * 111 * Math.cos(lat * Math.PI / 180)
      return Math.hypot(dLa, dLo) * 1000 // metros
    }
    for (const term of TERMS[opts.niche] ?? TERMS.todos) {
      try {
        const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=50&lat=${lat}&lon=${lon}`,
          { headers: nomHeaders, signal: AbortSignal.timeout(15_000) })
        if (!r.ok) continue
        for (const f of (await r.json())?.features ?? []) {
          const pr = f.properties ?? {}, [flo, fla] = f.geometry?.coordinates ?? []
          if (!pr.name || seen.has(pr.name.toLowerCase()) || dist(fla, flo) > opts.radius * 1.5) continue
          seen.add(pr.name.toLowerCase())
          elements.push({ lat: fla, lon: flo, tags: {
            name: pr.name, shop: pr.osm_key === 'shop' ? pr.osm_value : undefined, amenity: pr.osm_key === 'amenity' ? pr.osm_value : undefined,
            'addr:street': pr.street, 'addr:housenumber': pr.housenumber, 'addr:suburb': pr.district, 'addr:city': pr.city,
          } })
        }
      } catch { /* proximo termo */ }
    }
  }
  if (!elements.length) throw new ApiError(502, 'MAP_DATA', 'Fontes de dados de mapa indisponíveis agora. Tente de novo em instantes.')

  // 3) extrai + filtra leads
  const leads: any[] = []
  const seen = new Set<string>()
  for (const el of elements) {
    const t = el.tags ?? {}
    const name = String(t.name ?? '').trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const site = t.website ?? t['contact:website'] ?? t.url ?? null
    const phone = normPhone(t['contact:whatsapp'] ?? t['contact:phone'] ?? t.phone ?? t['contact:mobile'])
    const niche = guessNiche(name, t)
    if (opts.niche !== 'todos' && niche !== opts.niche) continue
    leads.push({
      name: name.slice(0, 120), phone,
      has_site: !!site, site_url: site ? String(site).slice(0, 300) : null,
      instagram: t['contact:instagram'] ?? null,
      facebook: t['contact:facebook'] ?? null,
      niche, city: opts.city, uf: opts.uf || null,
      address: [t['addr:street'], t['addr:housenumber'], t['addr:suburb'] ?? t['addr:neighbourhood'], t['addr:city']].filter(Boolean).join(', ') || null,
      lat: el.lat ?? el.center?.lat ?? null, lon: el.lon ?? el.center?.lon ?? null,
      source: 'osm',
    })
    if (leads.length >= 150) break
  }

  // 4) salva (dedup por telefone / nome+cidade)
  let saved = 0
  const { data: scan } = await db.from('prospect_scans').insert({
    niche: opts.niche, city: opts.city, uf: opts.uf || null, radius_m: opts.radius, found: leads.length, saved: 0,
  }).select().single()
  for (const l of leads) {
    l.scan_id = scan?.id ?? null
    try {
      if (l.phone) {
        const { error } = await db.from('prospect_leads').upsert({ ...l, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
        if (!error) saved++
      } else {
        const { data: exists } = await db.from('prospect_leads').select('id').ilike('name', l.name).eq('city', opts.city).limit(1).maybeSingle()
        if (!exists) { const { error } = await db.from('prospect_leads').insert(l); if (!error) saved++ }
      }
    } catch { /* pula duplicado */ }
  }

  // 5) valida WhatsApp em lote (se instância admin conectada)
  let waChecked = 0, waValid = 0
  try {
    const inst = await adminInstance(db)
    const withPhone = leads.filter(l => l.phone)
    for (let i = 0; i < withPhone.length; i += 50) {
      const chunk = withPhone.slice(i, i + 50)
      const res = await checkWhatsAppNumbers(inst, chunk.map(l => l.phone as string))
      const byNum = new Map(res.map(r => [r.number.slice(-9), r.exists]))
      for (const l of chunk) {
        const v = byNum.get(l.phone.slice(-9))
        if (v !== undefined) {
          await db.from('prospect_leads').update({ whatsapp_valid: v }).eq('phone', l.phone)
          waChecked++; if (v) waValid++
        }
      }
    }
  } catch { /* instância não conectada — valida depois pelo botão */ }

  const withoutSite = leads.filter(l => !l.has_site).length
  if (scan?.id) await db.from('prospect_scans').update({ saved, whatsapp_valid: waValid, without_site: withoutSite }).eq('id', scan.id)
  return { scan_id: scan?.id, found: leads.length, saved, whatsapp_checked: waChecked, whatsapp_valid: waValid, without_site: withoutSite, city: place.display_name?.split(',').slice(0, 3).join(',') }
}
