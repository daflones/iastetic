import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { requireCompany, serviceClient } from '../_shared/db.ts'
import { chat, synthesizeSpeech, transcribeAudio, logUsage, generateImage, type ChatMessage } from '../_shared/nvidia.ts'
import { tryConsume, quotaStatus } from '../_shared/quota.ts'

const ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'dashboard_stats',
      description: 'Métricas do estabelecimento num período: agendamentos, mensagens, receita, estágios dos leads, serviços mais vendidos.',
      parameters: { type: 'object', properties: { days: { type: 'number', description: 'quantos dias olhar para trás (ex.: 7, 30)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_today_appointments',
      description: 'Agendamentos de hoje ou de uma data específica.',
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, opcional (padrão hoje)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_contacts',
      description: 'Clientes/leads recentes ou por estágio do funil.',
      parameters: { type: 'object', properties: { stage: { type: 'string' }, limit: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wallet_info',
      description: 'Saldo da carteira, reservas e últimas movimentações.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_followups',
      description: 'Lista as regras de follow-up automático configuradas.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_followup',
      description: 'Cria uma regra de follow-up automático (mensagem enviada ao cliente depois de um evento/tempo). Use quando o dono pedir para criar/configurar follow-up.',
      parameters: { type: 'object', properties: {
        name: { type: 'string', description: 'nome curto da regra, ex.: "Reativar sumidas 30d"' },
        trigger: { type: 'string', enum: ['after_appointment', 'maintenance', 'no_show', 'inactive_days', 'abandoned_lead', 'birthday'] },
        delay_hours: { type: 'number', description: 'quantas horas depois do gatilho enviar (ex.: 24, 720 para 30 dias)' },
        template: { type: 'string', description: 'mensagem base, pode usar {nome} para o nome do cliente' },
        channel: { type: 'string', enum: ['text', 'audio'], description: 'padrão: text' },
      }, required: ['name', 'trigger', 'delay_hours', 'template'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'whatsapp_status',
      description: 'Status da(s) conexão(ões) WhatsApp: conectada ou não, número, se a IA está ativa.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pipeline_overview',
      description: 'Funil de clientes: quantos em cada estágio, conversas abertas, e quem está pedindo atendimento humano agora.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'subscription_info',
      description: 'Plano atual, status da assinatura, dias até renovação/fim do trial, recursos liberados.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'company_settings',
      description: 'Configuração atual do estabelecimento: dados, IA (nome, tom, regras), horários de funcionamento, sinal.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_conversations',
      description: 'Últimas conversas de clientes com a prévia da última mensagem, quem está no modo humano e quem pediu ajuda.',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_settings',
      description: 'ALTERA configurações do estabelecimento/IA. Use quando o dono pedir para mudar algo (nome da IA, tom, ativar áudio, número do atendente, dados do estabelecimento etc.). Campos permitidos em ai_config: name, tone, greeting, allowed, forbidden, send_audio, send_images, payments_enabled, auto_confirm, reply_delay_sec, handoff_to_attendant, handoff_phone, require_deposit, deposit_percent. Campos permitidos da empresa: name, whatsapp_public, instagram, address, city, state.',
      parameters: { type: 'object', properties: {
        ai_config: { type: 'object', description: 'campos de ai_config a alterar' },
        company: { type: 'object', description: 'campos da empresa a alterar (name, whatsapp_public, instagram, address, city, state)' },
      } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_service',
      description: 'Cria ou altera um serviço do catálogo: preço, duração, nome, descrição, ativar/desativar.',
      parameters: { type: 'object', properties: {
        service_name: { type: 'string', description: 'nome do serviço (obrigatório)' },
        new_name: { type: 'string' }, price_reais: { type: 'number' }, duration_min: { type: 'number' },
        category: { type: 'string' }, description: { type: 'string' }, active: { type: 'boolean' },
      }, required: ['service_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_business_hours',
      description: 'Altera o horário de funcionamento de um dia da semana.',
      parameters: { type: 'object', properties: {
        weekday: { type: 'string', enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
        closed: { type: 'boolean', description: 'true = fechado nesse dia' },
        open: { type: 'string', description: 'HH:mm abertura' }, close: { type: 'string', description: 'HH:mm fechamento' },
      }, required: ['weekday'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_ai_instance',
      description: 'Liga ou desliga a IA numa conexão WhatsApp.',
      parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Gera uma imagem com IA para marketing do estabelecimento (post Instagram, campanha, stories, promoção). Só use quando o dono pedir imagem explicitamente. Descreva a cena visual em detalhe (estilo, cores da marca, serviço). Limite mensal conforme o plano.',
      parameters: { type: 'object', properties: {
        prompt: { type: 'string', description: 'descrição visual detalhada da imagem' },
      }, required: ['prompt'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Cria uma campanha de marketing (rascunho) com mensagem de WhatsApp para disparar aos contatos. Não envia ainda — o dono revisa e manda disparar com send_campaign.',
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'nome interno da campanha' },
        message: { type: 'string', description: 'texto WhatsApp: pt-BR, tom do estabelecimento, emojis moderados, CTA claro' },
        audience: { type: 'string', enum: ['all', 'leads', 'customers', 'inactive_30d'], description: 'all=todos os contatos, leads=quem nunca gastou, customers=quem já gastou, inactive_30d=sem contato há 30+ dias' },
        image_url: { type: 'string', description: 'URL de imagem gerada para acompanhar (opcional)' },
        interval_minutes: { type: 'number', description: 'minutos entre cada envio (padrão 5) — o disparo é gradual, 1 contato por vez' },
      }, required: ['title', 'message'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_campaign',
      description: 'Dispara uma campanha criada para os contatos via WhatsApp do estabelecimento. Sempre confirme com o dono antes de chamar.',
      parameters: { type: 'object', properties: { campaign_id: { type: 'string', description: 'ID da campanha; se omitido usa a mais recente' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_campaigns',
      description: 'Lista campanhas criadas (rascunhos e enviadas).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_social_post',
      description: 'Cria um post completo para Instagram/Facebook: título, legenda, hashtags e opcionalmente gera a arte. Aparece no chat como preview realista da rede social, com botão de baixar.',
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'título/headline do post' },
        caption: { type: 'string', description: 'legenda pronta (pt-BR, com CTA e emojis moderados)' },
        hashtags: { type: 'string', description: 'hashtags separadas por espaço' },
        platform: { type: 'string', enum: ['instagram', 'facebook'], description: 'rede alvo (padrão instagram)' },
        format: { type: 'string', enum: ['feed', 'story'], description: 'post no feed ou story (padrão feed)' },
        image_prompt: { type: 'string', description: 'se quiser arte junto: descrição visual da imagem a gerar' },
      }, required: ['title', 'caption'] },
    },
  },
]

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const { companyId, name, user } = await requireCompany(req)
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))
    let message = (str(body.message, 1000) || str(body.question, 1000)).trim()
    const wantVoice = body.voice === true
    const threadId = str(body.thread_id, 64)
    let transcript: string | null = null
    if (!message && body.audio) {
      const raw = str(body.audio, 6_000_000)
      const b64 = raw.includes(',') ? raw.split(',')[1] : raw
      const mime = str(body.audio_mime ?? body.mime, 100) || 'audio/webm'
      transcript = (await transcribeAudio(b64, mime)).trim()
      message = transcript
      if (!message) throw new ApiError(400, 'EMPTY', 'Não consegui entender o áudio — tenta de novo ou escreva.')
    }
    if (!message) throw new ApiError(400, 'EMPTY', 'Pergunta vazia.')

    const { data: company } = await db.from('companies').select('name,niche,timezone').eq('id', companyId).single()
    const tz = company?.timezone || 'America/Sao_Paulo'

    let thread: any = null
    if (threadId) {
      const { data } = await db.from('assistant_threads').select('*').eq('id', threadId).eq('company_id', companyId).maybeSingle()
      thread = data
    }
    if (!thread) {
      const { data } = await db.from('assistant_threads').insert({ company_id: companyId, user_id: user.id, title: message.slice(0, 60) }).select().single()
      thread = data
    }

    const history: ChatMessage[] = (thread?.messages ?? []).slice(-10)
    const system = `Você é a assistente de gestão da IAstetic, falando com ${name ?? 'o dono'} do estabelecimento "${company?.name}" (nicho: ${company?.niche}).
Responda em pt-BR, tom executivo-amigável: direto, com números formatados em R$, e sugira ações práticas.
Use as ferramentas para buscar dados reais — nunca invente números. Quando não houver dado, diga e sugira como melhorar.
Você ENXERGA tudo do negócio: métricas, agenda, clientes/pipeline, conversas e quem pede ajuda humana, carteira, assinatura/plano e dias até renovar, conexões WhatsApp, e as configurações atuais — consulte antes de responder sobre qualquer um desses temas.
Você também EXECUTA ações quando pedido: criar follow-ups, criar/alterar serviços e preços, mudar horários, ajustar a IA (nome, tom, áudio, regras, número do atendente para escalada), ligar/desligar a IA no WhatsApp e alterar dados do estabelecimento. Após alterar algo, confirme o que mudou em uma frase. Para ações irreversíveis (ex.: desligar a IA), confirme com o dono antes.
Se pedirem para criar follow-up, use a ferramenta create_followup já com um modelo de mensagem adequado ao nicho (${company?.niche}).

MARKETING & CAMPANHAS — você é também a assistente de marketing do estabelecimento:
- Cria conteúdo pronto para usar: títulos/legendas de Instagram, descrições de fotos, hashtags, ideias de posts, textos de promoção e mensagens de WhatsApp — sempre adequados ao nicho (${company?.niche}) e ao tom do estabelecimento.
- Quando o dono pedir campanha, proponha primeiro a mensagem (curta, com emoji moderado e CTA claro). Se aprovar, crie com create_campaign; para disparar aos clientes use send_campaign — SEMPRE confirme antes de disparar.
- ANTES de gerar qualquer imagem (generate_image ou create_social_post com image_prompt): se o dono não descreveu a arte em detalhe, PERGUNTE primeiro 2-3 coisas rápidas — ex.: "o que deve aparecer na imagem? quer foto realista de procedimento/ambiente, ou arte com texto promocional? alguma cor ou elemento da marca?". Não gaste geração com pedido vago. Exceção: se ele disser "surpreenda", "você escolhe", "cria aí" — aí sim monte VOCÊ um prompt rico usando o nicho e o estilo do estabelecimento, e diga qual conceito escolheu.
- Para criar imagem (post, banner de promoção, arte de stories) use generate_image com descrição visual detalhada (cena, estilo, cores, texto que deve aparecer). A imagem aparece pronta na resposta — avise o dono e, se ele quiser, sugira usá-la numa campanha (create_campaign com image_url) ou como post.
- Para posts de Instagram/Facebook use create_social_post: título + legenda + hashtags + plataforma (instagram/facebook) + formato (feed/story) + opcionalmente arte gerada. Vira um preview realista da rede social no chat (como o post vai aparecer) — mostre o resultado organizado, não repita a legenda toda no texto. Se pedirem "story"/"stories", use format=story.
- Exemplos de campanhas que você pode sugerir: reativação de clientes sumidas ("Faz tempo que não te vejo!"), promoção de dia fraco, lançamento de serviço novo, dia das mães/datas comemorativas, programa de indicação, preenchimento de horários vagos da semana.
- Para sugerir campanhas INTELIGENTES, consulte antes os dados (pipeline_overview, recent_contacts, dashboard_stats) e proponha algo concreto: ex., "você tem 12 clientes sumidas há 30+ dias — bora reativar com um desconto?" ou "15 leads travados no funil — que tal uma mensagem de primeiro contato?". Sempre embasada em número real.
- Limite de imagens: geração mensal e espaço na galeria são definidos pelo plano; se a ferramenta avisar que acabou, explique com jeito (apagar em "Arquivos da IA" ou upgrade).

FORMATAÇÃO (muito importante):
- Escreva como uma pessoa, NUNCA como programador. Proibido: JSON, chaves {}, colchetes [], nomes de campos em inglês (ex.: total_spent_cents), códigos, timestamps ISO.
- Horários/datas sempre em formato brasileiro ("terça, 14h", "22/10 às 15:30"). Os dados das ferramentas já chegam no fuso do estabelecimento — não converta.
- Valores sempre como "R$ 1.250" — nunca centavos.
- Use **negrito** só para destacar números/nomes importantes e listas com "-" quando houver vários itens. Nada de cabeçalhos, tabelas ou código.
- Parágrafos curtos, máx. 150 palavras salvo se pedirem detalhe.`

    const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }]
    let usage = { prompt_tokens: 0, completion_tokens: 0 }
    let reply = ''
    const collect: Collect = { images: [], posts: [] }

    for (let round = 0; round < 4; round++) {
      const { message: m, usage: u } = await chat({ messages, tools: ASSISTANT_TOOLS, maxTokens: 900 })
      usage.prompt_tokens += u.prompt_tokens ?? 0
      usage.completion_tokens += u.completion_tokens ?? 0
      messages.push(m)
      if (!m.tool_calls?.length) { reply = (m.content ?? (m as any).reasoning_content ?? '').trim(); break }
      for (const call of m.tool_calls) {
        let content = ''
        try {
          content = await execAssistantTool(call.function.name, JSON.parse(call.function.arguments || '{}'), db, companyId, tz, collect)
        } catch (e) { content = `Erro: ${(e as Error).message}` }
        messages.push({ role: 'tool', tool_call_id: call.id, content })
      }
    }

    // fallback: modelo gastou a resposta em raciocínio/ferramentas — pergunta de novo sem tools
    if (!reply) {
      const { message: m, usage: u } = await chat({ messages, maxTokens: 600 })
      usage.prompt_tokens += u.prompt_tokens ?? 0
      usage.completion_tokens += u.completion_tokens ?? 0
      reply = ((m.content ?? '') || (m as any).reasoning_content || '').trim()
    }
    await logUsage(companyId, 'assistant', 'glm', usage)

    if (thread) {
      const msgs = [...(thread.messages ?? []), { role: 'user', content: message }, { role: 'assistant', content: reply }]
      await db.from('assistant_threads').update({ messages: msgs, updated_at: new Date().toISOString() }).eq('id', thread.id)
    }

    let audio: string | null = null
    let audioBlocked = false
    if (wantVoice && reply) {
      const gate = await tryConsume(db, companyId, 'assistant_audio')
      if (!gate.ok) audioBlocked = true
      else try {
        const tts = await synthesizeSpeech(reply.replace(/[*_#]/g, ''), 'pt-BR')
        audio = `data:${tts.mime};base64,${tts.base64}`
        await logUsage(companyId, 'tts_assistant', 'elevenlabs/openrouter', { prompt_tokens: reply.length })
      } catch (e) { console.error('tts assistant', e) }
    }

    return json({ ok: true, data: { reply, thread_id: thread?.id ?? null, audio, transcript, images: collect.images, posts: collect.posts, audio_blocked: audioBlocked } })
  } catch (e) { return errorResponse(e) }
})

function fmtWhen(iso: string, tz: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

type Collect = { images: { url: string; prompt: string }[]; posts: { id?: string; title: string; caption: string; hashtags: string; image_url?: string; platform?: string; format?: string }[] }

/** Gera imagem realista de marketing, salva em files/ + company_files, aplica cota. */
async function genAndStoreImage(db: any, companyId: string, prompt: string, collect: Collect): Promise<string> {
  const { data: c } = await db.from('companies').select('name,niche,plans(image_quota,image_storage_limit)').eq('id', companyId).single()
  const storageLimit = c?.plans?.image_storage_limit ?? 10
  const { count: stored } = await db.from('company_files').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('kind', 'image').contains('tags', ['gerada-ia'])
  const gate = await tryConsume(db, companyId, 'images')
  if (!gate.ok) return `Limite de ${gate.limit} imagens/mês do plano atingido e sem créditos de recarga. Sugira recarregar em "Meu Plano" (30% do valor do plano = +25% de imagens) ou upgrade.`
  if ((stored ?? 0) >= storageLimit) return `Galeria cheia: ${storageLimit} imagens salvas (limite do plano). Oriente o dono a apagar alguma em "Arquivos da IA" e tentar de novo.`
  const nicheLabel = ({ salao: 'salão de beleza', unhas: 'estúdio de unhas', olhar: 'estúdio de sobrancelhas e cílios', barbearia: 'barbearia', clinica: 'clínica de estética' } as Record<string, string>)[c?.niche] ?? 'estabelecimento de beleza'
  const enriched = `Photorealistic premium marketing image for "${c?.name ?? 'the studio'}", a Brazilian ${nicheLabel}. Scene: ${prompt}. Style: high-end beauty editorial photography, soft warm natural lighting, shallow depth of field, luxurious elegant aesthetic. If any text appears, use beautiful elegant serif typography in gold/dark tones matching a beauty brand. Square format, Instagram-ready, no watermarks, no distorted faces or hands.`
  const img = await generateImage(enriched)
  const bytes = Uint8Array.from(atob(img.base64), (ch) => ch.charCodeAt(0))
  const ext = img.mime.includes('png') ? 'png' : 'jpg'
  const path = `${companyId}/gen/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await db.storage.from('files').upload(path, bytes, { contentType: img.mime })
  if (upErr) return `Gerei a imagem mas falhou ao salvar: ${upErr.message}`
  const { data: pub } = db.storage.from('files').getPublicUrl(path)
  await db.from('company_files').insert({ company_id: companyId, kind: 'image', title: prompt.slice(0, 80), url: pub.publicUrl, description: `Gerada por IA • ${prompt}`, tags: ['gerada-ia', 'marketing'] })
  await logUsage(companyId, 'image_gen', 'image', { prompt_tokens: prompt.length })
  collect.images.push({ url: pub.publicUrl, prompt })
  return `Imagem gerada e salva em "Arquivos da IA" (${gate.via === 'credits' ? `via créditos de recarga, restam ${gate.credits}` : `${gate.used + 1}/${gate.limit} do mês`}, ${(stored ?? 0) + 1}/${storageLimit} salvas). Ela já aparece na resposta ao dono — confirme o recebimento e pergunte se quer usar numa campanha ou como post.`
}

async function execAssistantTool(name: string, args: any, db: any, companyId: string, tz: string, collect: Collect): Promise<string> {
  switch (name) {
    case 'dashboard_stats': {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 365)
      const { data, error } = await db.rpc('dashboard_stats', {
        p_company: companyId,
        p_from: new Date(Date.now() - days * 86_400_000).toISOString(),
        p_to: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      return JSON.stringify(data)
    }
    case 'list_today_appointments': {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(args.date ?? '') ? args.date : new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
      const { data } = await db.from('appointments')
        .select('service_name,starts_at,ends_at,status,price_cents,contacts(name,phone),professionals(name)')
        .eq('company_id', companyId).gte('starts_at', `${day}T00:00:00Z`).lt('starts_at', `${day}T23:59:59.999Z`)
        .neq('status', 'cancelled').order('starts_at')
      return JSON.stringify((data ?? []).map((a: any) => ({
        servico: a.service_name,
        quando: fmtWhen(a.starts_at, tz),
        cliente: a.contacts?.name ?? a.contacts?.phone,
        profissional: a.professionals?.name,
        status: a.status,
        preco: `R$ ${((a.price_cents ?? 0) / 100).toFixed(2)}`,
      })))
    }
    case 'list_followups': {
      const { data } = await db.from('followup_rules').select('name,trigger,delay_hours,channel,template,active').eq('company_id', companyId).order('created_at')
      return JSON.stringify((data ?? []).map((r: any) => ({ nome: r.name, gatilho: r.trigger, espera_horas: r.delay_hours, canal: r.channel, mensagem: r.template, ativa: r.active })))
    }
    case 'create_followup': {
      const { data, error } = await db.from('followup_rules').insert({
        company_id: companyId,
        name: String(args.name ?? 'Follow-up').slice(0, 80),
        trigger: args.trigger,
        delay_hours: Math.min(Math.max(Number(args.delay_hours) || 24, 1), 8760),
        channel: args.channel === 'audio' ? 'audio' : 'text',
        template: String(args.template ?? '').slice(0, 500),
        use_ai_variation: true,
        send_window: { from: '09:00', to: '20:00' },
        active: true,
      }).select('id,name').single()
      if (error) return `Não consegui criar: ${error.message}`
      return `Follow-up "${data.name}" criado e ativado. Já vai rodar nos próximos ciclos (a cada hora).`
    }
    case 'recent_contacts': {
      let q = db.from('contacts').select('name,phone,stage,tags,total_spent_cents,last_message_at').eq('company_id', companyId)
      if (args.stage) q = q.eq('stage', args.stage)
      const { data } = await q.order('last_message_at', { ascending: false }).limit(Math.min(Number(args.limit) || 10, 30))
      return JSON.stringify((data ?? []).map((ct: any) => ({
        nome: ct.name, telefone: ct.phone, estagio: ct.stage, tags: ct.tags,
        total_gasto: `R$ ${((ct.total_spent_cents ?? 0) / 100).toFixed(2)}`,
        ultima_msg: ct.last_message_at ? fmtWhen(ct.last_message_at, tz) : null,
      })))
    }
    case 'wallet_info': {
      const [{ data: w }, { data: entries }] = await Promise.all([
        db.from('wallets').select('balance_cents,reserved_cents').eq('company_id', companyId).single(),
        db.from('wallet_entries').select('kind,amount_cents,description,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(10),
      ])
      return JSON.stringify({ wallet: w, last_entries: entries })
    }
    case 'whatsapp_status': {
      const { data } = await db.from('instances').select('instance_name,phone,status,ai_enabled,created_at').eq('company_id', companyId)
      if (!data?.length) return 'Nenhuma conexão WhatsApp criada ainda — oriente a pessoa a conectar em WhatsApp no menu.'
      return JSON.stringify(data.map((i: any) => ({
        instancia: i.instance_name, numero: i.phone,
        status: i.status === 'connected' ? 'conectada 🟢' : i.status === 'connecting' ? 'aguardando QR 🟡' : 'desconectada 🔴',
        ia_ativa: i.ai_enabled ? 'sim' : 'não (modo manual)',
      })))
    }
    case 'pipeline_overview': {
      const [{ data: contacts }, { data: convs }, { data: handoffs }] = await Promise.all([
        db.from('contacts').select('stage').eq('company_id', companyId),
        db.from('conversations').select('id,mode,unread_count,status').eq('company_id', companyId).eq('status', 'open'),
        db.from('conversations').select('id,contacts(name,phone),ai_state').eq('company_id', companyId).eq('mode', 'human').eq('status', 'open'),
      ])
      const stages: Record<string, number> = {}
      for (const c of contacts ?? []) stages[c.stage] = (stages[c.stage] ?? 0) + 1
      const pendingHelp = (handoffs ?? []).filter((cv: any) => cv.ai_state?.handoff_at && !cv.ai_state?.handoff_answered)
      return JSON.stringify({
        funil: stages,
        conversas_abertas: (convs ?? []).length,
        mensagens_nao_lidas: (convs ?? []).reduce((a: number, cv: any) => a + (cv.unread_count ?? 0), 0),
        pedindo_ajuda_humana: pendingHelp.map((cv: any) => ({ cliente: cv.contacts?.name ?? cv.contacts?.phone, desde: cv.ai_state?.handoff_at ? fmtWhen(cv.ai_state.handoff_at, tz) : null })),
      })
    }
    case 'subscription_info': {
      const { data: c } = await db.from('companies').select('subscription_status,subscription_until,trial_until,plans(name,price_cents,features)').eq('id', companyId).single()
      if (!c) return 'Sem dados de assinatura.'
      const until = c.subscription_status === 'trial' ? c.trial_until : c.subscription_until
      const days = until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000)) : null
      const quotas: Record<string, string> = {}
      for (const res of ['messages', 'assistant_audio', 'customer_audio', 'images']) {
        const st = await quotaStatus(db, companyId, res)
        quotas[st.label] = `${st.used}/${st.limit} este mês${st.credits ? ` + ${st.credits} créditos de recarga` : ''}`
      }
      return JSON.stringify({
        plano: c.plans?.name ?? 'nenhum',
        preco: c.plans?.price_cents != null ? `R$ ${(c.plans.price_cents / 100).toFixed(2)}/mês` : null,
        status: c.subscription_status,
        renovacao_ou_fim: until ? `${fmtWhen(until, tz)} (${days} dia(s))` : 'sem data',
        recursos: c.plans?.features ?? 'trial libera os recursos por 7 dias com cotas reduzidas (ver uso_do_plano)',
        uso_do_plano: quotas,
        recarga: 'Se algo estourar, o dono recarrega em "Meu Plano": cada recarga custa 30% do valor do plano e adiciona +25% da quota do recurso escolhido (Pix ou cartão).',
      })
    }
    case 'company_settings': {
      const { data: c } = await db.from('companies').select('name,niche,address,city,state,instagram,whatsapp_public,phone,ai_config,business_hours,extra').eq('id', companyId).single()
      if (!c) return 'Empresa não encontrada.'
      const names: Record<string, string> = { sun: 'domingo', mon: 'segunda', tue: 'terça', wed: 'quarta', thu: 'quinta', fri: 'sexta', sat: 'sábado' }
      const hours = Object.entries(c.business_hours ?? {}).map(([k, v]) => `${names[k] ?? k}: ${(v as string[][]).length ? (v as string[][]).map(r => r.join('-')).join(' e ') : 'fechado'}`).join('; ')
      const ai = c.ai_config ?? {}
      return JSON.stringify({
        empresa: { nome: c.name, nicho: c.niche, endereco: c.address, cidade: c.city, uf: c.state, instagram: c.instagram, whatsapp_publico: c.whatsapp_public },
        ia: {
          nome: ai.name, tom: ai.tone, saudacao: ai.greeting, pode_falar: ai.allowed, nao_pode: ai.forbidden,
          responde_audio: !!ai.send_audio, envia_imagens: !!ai.send_images, cobrancas_chat: !!ai.payments_enabled,
          confirma_automatico: ai.auto_confirm !== false, delay_resposta_s: ai.reply_delay_sec,
          escala_para_atendente: !!ai.handoff_to_attendant, whatsapp_atendente: ai.handoff_phone ?? 'não configurado',
          sinal_obrigatorio: ai.require_deposit ? `${ai.deposit_percent ?? 30}%` : 'não',
        },
        horario_funcionamento: hours,
        detalhes_nicho: c.extra,
      })
    }
    case 'recent_conversations': {
      const { data } = await db.from('conversations')
        .select('mode,unread_count,last_message_preview,last_message_at,ai_state,contacts(name,push_name,phone)')
        .eq('company_id', companyId).eq('status', 'open')
        .order('last_message_at', { ascending: false }).limit(Math.min(Number(args.limit) || 10, 20))
      return JSON.stringify((data ?? []).map((cv: any) => ({
        cliente: cv.contacts?.name ?? cv.contacts?.push_name ?? cv.contacts?.phone,
        ultima_msg: cv.last_message_preview,
        quando: cv.last_message_at ? fmtWhen(cv.last_message_at, tz) : null,
        atendendo: cv.mode === 'ai' ? 'IA' : 'humano',
        nao_lidas: cv.unread_count,
        pediu_ajuda: !!(cv.ai_state?.handoff_at && !cv.ai_state?.handoff_answered),
      })))
    }
    case 'update_settings': {
      const AI_FIELDS = ['name', 'tone', 'greeting', 'allowed', 'forbidden', 'send_audio', 'send_images', 'payments_enabled', 'auto_confirm', 'reply_delay_sec', 'handoff_to_attendant', 'handoff_phone', 'require_deposit', 'deposit_percent']
      const CO_FIELDS = ['name', 'whatsapp_public', 'instagram', 'address', 'city', 'state']
      const patch: any = {}
      if (args.company && typeof args.company === 'object') {
        for (const k of CO_FIELDS) if (args.company[k] !== undefined) patch[k] = args.company[k] === '' ? null : String(args.company[k]).slice(0, 200)
      }
      if (args.ai_config && typeof args.ai_config === 'object') {
        const { data: cur } = await db.from('companies').select('ai_config').eq('id', companyId).single()
        const next = { ...(cur?.ai_config ?? {}) }
        for (const k of AI_FIELDS) if (args.ai_config[k] !== undefined) next[k] = args.ai_config[k]
        patch.ai_config = next
      }
      if (!Object.keys(patch).length) return 'Nenhum campo válido informado.'
      const { error } = await db.from('companies').update(patch).eq('id', companyId)
      if (error) return `Não consegui salvar: ${error.message}`
      const changed = [...Object.keys(patch.ai_config ? args.ai_config : {}), ...Object.keys(patch).filter(k => k !== 'ai_config')]
      return `Configuração atualizada: ${changed.join(', ')}.`
    }
    case 'manage_service': {
      const target = String(args.service_name ?? '').trim()
      if (!target) return 'Informe o nome do serviço.'
      const { data: list } = await db.from('services').select('*').eq('company_id', companyId).ilike('name', `%${target}%`).limit(5)
      const svc = list?.[0]
      if (!svc) {
        // cria novo
        const { error } = await db.from('services').insert({
          company_id: companyId, name: target,
          price_cents: Math.round((Number(args.price_reais) || 0) * 100),
          duration_min: Number(args.duration_min) || 60,
          category: args.category ?? null, description: args.description ?? null, active: args.active ?? true,
        })
        if (error) return `Não consegui criar: ${error.message}`
        return `Serviço "${target}" criado${args.price_reais ? ` por R$ ${Number(args.price_reais).toFixed(2)}` : ''}.`
      }
      const patch: any = {}
      if (args.new_name) patch.name = String(args.new_name).slice(0, 120)
      if (args.price_reais !== undefined) patch.price_cents = Math.round(Number(args.price_reais) * 100)
      if (args.duration_min !== undefined) patch.duration_min = Math.max(5, Number(args.duration_min))
      if (args.category !== undefined) patch.category = args.category || null
      if (args.description !== undefined) patch.description = args.description || null
      if (args.active !== undefined) patch.active = !!args.active
      if (!Object.keys(patch).length) return 'Nada para alterar.'
      const { error } = await db.from('services').update(patch).eq('id', svc.id)
      if (error) return `Não consegui atualizar: ${error.message}`
      return `Serviço "${svc.name}" atualizado${patch.price_cents !== undefined ? ` — novo preço R$ ${(patch.price_cents / 100).toFixed(2)}` : ''}.`
    }
    case 'update_business_hours': {
      const day = String(args.weekday)
      const { data: cur } = await db.from('companies').select('business_hours').eq('id', companyId).single()
      const hours = { ...(cur?.business_hours ?? {}) }
      if (args.closed) hours[day] = []
      else if (args.open && args.close) hours[day] = [[args.open, args.close]]
      else return 'Informe open+close (HH:mm) ou closed=true.'
      await db.from('companies').update({ business_hours: hours }).eq('id', companyId)
      const names: Record<string, string> = { sun: 'domingo', mon: 'segunda', tue: 'terça', wed: 'quarta', thu: 'quinta', fri: 'sexta', sat: 'sábado' }
      return `Horário de ${names[day] ?? day} atualizado${args.closed ? ' para fechado' : ` para ${args.open}–${args.close}`}.`
    }
    case 'toggle_ai_instance': {
      const { data: inst } = await db.from('instances').select('id,instance_name').eq('company_id', companyId).limit(1).maybeSingle()
      if (!inst) return 'Nenhuma instância WhatsApp cadastrada.'
      await db.from('instances').update({ ai_enabled: !!args.enabled }).eq('id', inst.id)
      return `IA ${args.enabled ? 'ativada' : 'desativada'} na instância ${inst.instance_name}.`
    }
    case 'generate_image': {
      const prompt = String(args.prompt ?? '').trim()
      if (!prompt) return 'Descreva a imagem.'
      if (prompt.split(/\s+/).length < 8) return 'NÃO gere ainda — descrição muito vaga gasta a quota do dono à toa. Pergunte antes: o que deve aparecer na imagem? estilo (foto realista do procedimento/ambiente ou arte promocional com texto)? cores/elementos da marca? Depois chame generate_image com a descrição completa.'
      const r = await genAndStoreImage(db, companyId, prompt, collect)
      return r
    }
    case 'create_social_post': {
      const title = String(args.title ?? '').slice(0, 90)
      const caption = String(args.caption ?? '').slice(0, 2200)
      const hashtags = String(args.hashtags ?? '').slice(0, 300)
      if (!title || !caption) return 'Preciso de título e legenda.'
      const post: any = {
        title, caption, hashtags,
        platform: args.platform === 'facebook' ? 'facebook' : 'instagram',
        format: args.format === 'story' ? 'story' : 'feed',
      }
      let vagueArt = false
      if (args.image_prompt) {
        const ip = String(args.image_prompt).trim()
        if (ip.split(/\s+/).length < 8) {
          post.image_error = 'arte não gerada: descrição vaga'
          vagueArt = true
        } else {
          const r = await genAndStoreImage(db, companyId, ip, collect)
          if (r.startsWith('Imagem gerada')) {
            post.image_url = collect.images[collect.images.length - 1]?.url
          } else post.image_error = r
        }
      }
      // salva na biblioteca Social (menu do painel) — aparece com preview e marcação de "usado"
      const { data: saved } = await db.from('social_posts').insert({
        company_id: companyId, title: post.title, caption: post.caption, hashtags: post.hashtags || null,
        image_url: post.image_url ?? null, platform: post.platform, format: post.format,
      }).select('id').single()
      post.id = saved?.id
      collect.posts.push(post)
      if (vagueArt) return `Post "${title}" salvo em "Social" SEM arte — a descrição da imagem ficou vaga demais pra gastar geração. Pergunte ao dono como ele imagina a arte (cena, estilo, cores, texto na imagem) e depois gere com generate_image.`
      return `Post pronto "${title}"${post.image_url ? ' com arte gerada' : post.image_error ? ` (sem arte: ${post.image_error})` : ''} — preview no chat + salvo no menu "Social" do painel. Confirme e pergunte se quer ajustar ou criar campanha com ele.`
    }
    case 'create_campaign': {
      const interval = Math.min(Math.max(Math.round(Number(args.interval_minutes) || 5), 1), 1440)
      const { data, error } = await db.from('campaigns').insert({
        company_id: companyId,
        title: String(args.title ?? 'Campanha').slice(0, 80),
        message: String(args.message ?? '').slice(0, 1500),
        audience: ['all', 'leads', 'customers', 'inactive_30d'].includes(args.audience) ? args.audience : 'all',
        image_url: args.image_url ? String(args.image_url) : null,
        interval_minutes: interval,
      }).select('id,title,audience,interval_minutes').single()
      if (error) return `Não consegui criar: ${error.message}`
      const aud = { all: 'todos os contatos', leads: 'leads (nunca gastaram)', customers: 'clientes que já gastaram', inactive_30d: 'contatos sumidos há 30+ dias' } as Record<string, string>
      return `Campanha "${data.title}" criada como rascunho, público: ${aud[data.audience] ?? data.audience}, envio espaçado a cada ${interval} min. Para disparar use send_campaign — confirme com o dono antes.`
    }
    case 'send_campaign': {
      let q = db.from('campaigns').select('*').eq('company_id', companyId)
      if (args.campaign_id) q = q.eq('id', args.campaign_id)
      const { data: camps } = await q.order('created_at', { ascending: false }).limit(1)
      const camp = camps?.[0]
      if (!camp) return 'Nenhuma campanha encontrada — crie com create_campaign primeiro.'
      if (camp.status === 'sent') return `A campanha "${camp.title}" já foi disparada (${camp.sent_count} envios). Crie uma nova.`
      const { data: inst } = await db.from('instances').select('instance_name,status').eq('company_id', companyId).order('created_at').limit(1).maybeSingle()
      if (!inst || inst.status !== 'connected') return 'O WhatsApp do estabelecimento não está conectado — não consigo disparar.'
      let cq = db.from('contacts').select('id,name,phone').eq('company_id', companyId)
      if (camp.audience === 'leads') cq = cq.or('total_spent_cents.is.null,total_spent_cents.eq.0')
      else if (camp.audience === 'customers') cq = cq.gt('total_spent_cents', 0)
      else if (camp.audience === 'inactive_30d') cq = cq.lt('last_message_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      const { data: targets } = await cq.limit(200)
      if (!targets?.length) return 'Nenhum contato nesse público.'

      // agenda envios espaçados: 1 contato por vez, a cada interval_minutes
      const step = Math.max(1, camp.interval_minutes ?? 5) * 60_000
      const jobs = targets.map((t: any, i: number) => ({
        campaign_id: camp.id, company_id: companyId, contact_id: t.id, phone: String(t.phone).replace(/\D/g, ''),
        scheduled_at: new Date(Date.now() + i * step).toISOString(),
      }))
      const { error: jErr } = await db.from('campaign_jobs').insert(jobs)
      if (jErr) return `Não consegui agendar os envios: ${jErr.message}`
      const totalMin = Math.round((targets.length * step) / 60_000)
      await db.from('campaigns').update({ status: 'sending', total_targets: targets.length }).eq('id', camp.id)
      return `Campanha "${camp.title}" agendada: ${targets.length} contatos recebendo **1 por vez a cada ${camp.interval_minutes ?? 5} min** — duração total ~${totalMin >= 60 ? `${Math.floor(totalMin / 60)}h${totalMin % 60 ? `${totalMin % 60}min` : ''}` : `${totalMin}min`}${camp.image_url ? ' (com imagem)' : ''}. Se o limite de mensagens acabar no meio, o envio pausa e retoma quando recarregar.`
    }
    case 'list_campaigns': {
      const { data } = await db.from('campaigns').select('id,title,audience,status,sent_count,image_url,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(20)
      if (!data?.length) return 'Nenhuma campanha criada ainda.'
      return JSON.stringify(data.map((cp: any) => ({
        id: cp.id, nome: cp.title, publico: cp.audience, status: cp.status === 'sent' ? `enviada (${cp.sent_count})` : 'rascunho',
        com_imagem: !!cp.image_url, criada: fmtWhen(cp.created_at, tz),
      })))
    }
    default: return 'Ferramenta desconhecida.'
  }
}
