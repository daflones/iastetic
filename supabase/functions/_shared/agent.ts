import { serviceClient } from './db.ts'
import { chat, type ChatMessage, type ToolCall } from './nvidia.ts'
import { ApiError } from './http.ts'
import { createCharge } from './mercosulpay.ts'
import { createCheckout } from './stripe.ts'
import { getSecret } from './secrets.ts'

// ---------- helpers de fuso horário ----------
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  const hour = +parts.hour === 24 ? 0 : +parts.hour
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second) - date.getTime()
}
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  let t = Date.UTC(y, mo - 1, d, h, mi)
  for (let i = 0; i < 3; i++) t = Date.UTC(y, mo - 1, d, h, mi) - tzOffsetMs(new Date(t), tz)
  return new Date(t)
}
export function nowInTz(tz: string) {
  const now = new Date()
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const [y, m, d] = date.split('-').map(Number)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).format(now)
  const [hh, mm] = time.split(':').map(Number)
  return { year: y, month: m, day: d, hour: hh, minute: mm, dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
}

// ---------- contexto ----------
export interface AgentContext {
  company: any
  instance?: any
  contact: any
  conversation: any
  supabase: ReturnType<typeof serviceClient>
}

const NICHE_LABEL: Record<string, string> = { salao: 'salão de beleza', unhas: 'estúdio de manicure/pedicure', olhar: 'estúdio de sobrancelha e cílios', barbearia: 'barbearia', clinica: 'clínica de estética' }
const NICHE_SCOPE: Record<string, string> = {
  salao: 'Este estabelecimento trabalha APENAS com serviços de cabelo (corte, escova, coloração, mechas, progressiva, barba etc.). NUNCA mencione, sugira ou recomende serviços de unhas, sobrancelhas ou cílios.',
  unhas: 'Este estabelecimento trabalha APENAS com serviços de unhas (manicure, pedicure, alongamento, esmaltação em gel etc.). NUNCA mencione, sugira ou recomende serviços de cabelo, sobrancelhas ou cílios.',
  olhar: 'Este estabelecimento trabalha APENAS com serviços de olhar (sobrancelhas, cílios, lash lifting, brow lamination, henna etc.). NUNCA mencione, sugira ou recomende serviços de cabelo ou unhas.',
  barbearia: 'Este estabelecimento trabalha APENAS com serviços de barbearia (corte masculino, barba, degradê, navalha, pigmentação, sobrancelha masculina etc.). NUNCA mencione, sugira ou recomende serviços de salão feminino, unhas ou estética. Trate os profissionais como "barbeiros". O intervalo típico entre cortes é de 15-20 dias — sugerir retorno/manutenção é natural.',
  clinica: 'Este estabelecimento trabalha APENAS com procedimentos estéticos do catálogo (faciais, corporais, depilação, injetáveis se listados). NUNCA mencione serviços de salão, barbearia ou unhas. IMPORTANTE: nunca prometa resultados, nunca dê diagnóstico — se o procedimento exigir avaliação ou tiver contraindicação, oriente a cliente a fazer a avaliação primeiro. Após procedimento, relembre os cuidados pós-sessão configurados.',
}

export async function buildSystemPrompt(ctx: AgentContext): Promise<string> {
  const c = ctx.company
  const ai = c.ai_config ?? {}
  const tz = c.timezone || 'America/Sao_Paulo'
  const now = nowInTz(tz)
  const hours = c.business_hours ?? {}
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const hoursTxt = WEEKDAYS.map((d, i) => {
    const ranges = hours[d] ?? []
    return `${names[i]}: ${ranges.length ? ranges.map((r: string[]) => r.join(' às ')).join(' e ') : 'fechado'}`
  }).join('; ')
  const extra = Object.entries(c.extra ?? {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  const forbidden = ai.forbidden ? `\nJAMAIS fale sobre:\n${ai.forbidden}` : ''
  const allowed = ai.allowed ? `\nTemas/observações permitidas:\n${ai.allowed}` : ''

  const [{ data: services }, { data: profs }] = await Promise.all([
    ctx.supabase.from('services').select('id,name,category,description,duration_min,price_cents,professional_ids')
      .eq('company_id', c.id).eq('active', true).order('sort').limit(60),
    ctx.supabase.from('professionals').select('id,name,specialties')
      .eq('company_id', c.id).eq('active', true).limit(30),
  ])
  const profName = (id: string) => (profs ?? []).find((p: any) => p.id === id)?.name
  const catalog = (services ?? []).map((s: any) => {
    const who = s.professional_ids?.length ? ` • com ${s.professional_ids.map(profName).filter(Boolean).join(' ou ')}` : ''
    return `- ${s.name}${s.category ? ` (${s.category})` : ''}: R$ ${(s.price_cents / 100).toFixed(2)} • ${s.duration_min} min${who}${s.description ? ` — ${s.description}` : ''}`
  }).join('\n')
  const profsTxt = (profs ?? []).map((p: any) => `- ${p.name}${p.specialties?.length ? ` (${p.specialties.join(', ')})` : ''}`).join('\n')

  const deposit = ai.require_deposit
    ? `- Sinal para confirmar agendamento: ${ai.deposit_percent ?? 30}% do valor. FLUXO OBRIGATÓRIO: ao fechar o horário, o agendamento fica "aguardando pagamento" — avise a cliente que a vaga fica reservada e, na MESMA resposta, gere a cobrança (create_payment_charge com o appointment_id retornado) e envie o Pix/link. Só vira "confirmado" quando o pagamento compensar (automático).`
    : '- Agendamento não exige sinal — confirme direto.'
  const handoff = ai.handoff_to_attendant
    ? '- Atendimento humano: a empresa TEM atendente humano. Se a cliente pedir, avise que vai chamar a equipe e use handoff_to_human.'
    : '- Não existe atendimento humano imediato; se pedirem, use handoff_to_human (o painel recebe o aviso) e diga que a equipe retorna em breve.'
  const greeting = ai.greeting ? `- Saudação configurada pelo dono: "${ai.greeting}" — use-a ou varie naturalmente ao recepcionar.` : ''
  const contactName = ctx.contact?.name ?? ctx.contact?.push_name
  const contactTxt = `- Cliente atual: ${contactName ?? 'nome desconhecido'}${ctx.contact?.stage ? ` • estágio no funil: ${ctx.contact.stage}` : ''}${ctx.contact?.total_spent_cents ? ` • já gastou R$ ${(ctx.contact.total_spent_cents / 100).toFixed(0)}` : ''}`

  return `Você é ${ai.name || 'Íris'}, a recepcionista virtual de "${c.name}", um ${NICHE_LABEL[c.niche] ?? 'estabelecimento de estética'}.
Tom de voz: ${ai.tone || 'acolhedora e profissional'}. Responda SEMPRE em ${ai.language || 'pt-BR'}, de forma natural, humana, com emojis moderados.
Agora é ${now.dateStr} ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')} (${tz}).

SOBRE O ESTABELECIMENTO:
- Endereço: ${c.address ?? 'não informado'} ${c.city ? `— ${c.city}/${c.state ?? ''}` : ''}
- WhatsApp público: ${c.whatsapp_public ?? c.phone ?? 'não informado'}
- Instagram: ${c.instagram ?? 'não informado'}
- Horário de atendimento: ${hoursTxt}
${contactName ? contactTxt + '\n' : ''}${extra}

CONFIGURAÇÃO DA SUA ATUAÇÃO (definida pelo dono — siga à risca):
${greeting}
- ${ai.send_audio ? 'A empresa responde por ÁUDIO quando a cliente fala por voz — escreva SEMPRE como quem fala: frases curtas, sem listas nem formatação.' : 'A empresa responde apenas em texto.'}
${deposit}
- ${ai.auto_confirm === false ? 'Agendamentos ficam "aguardando confirmação" do estabelecimento — avise isso à cliente.' : 'Agendamentos entram confirmados automaticamente.'}
${handoff}
${ai.payments_enabled ? '- A empresa aceita pagamentos pelo chat: use create_payment_charge quando combinado (sinal, total ou produto).' : '- Não cobre nem prometa pagamentos pelo chat.'}

CATÁLOGO DE SERVIÇOS (a única fonte verdadeira de serviços, preços e durações — use-a sempre que falar de serviços ou preços):
${catalog || '(nenhum serviço cadastrado — informe que o estabelecimento ainda está configurando e ofereça transferir para um humano)'}
${profsTxt ? `\nEQUIPE:\n${profsTxt}` : ''}

REGRAS:
- Seja breve (mensagens de WhatsApp: 1-4 linhas). Não liste tudo de uma vez; converse. Se o cliente pedir "o que vocês fazem" ou "quais serviços", cite 2-4 opções populares do catálogo e pergunte o que ela procura.
- ${NICHE_SCOPE[c.niche] ?? 'Ofereça apenas os serviços deste estabelecimento.'}
- Use SEMPRE os nomes, preços e durações exatamente como estão no catálogo acima. NUNCA invente serviço, preço ou duração — se o cliente pedir algo fora do catálogo, explique com simpatia que não oferece e sugira o serviço mais próximo do catálogo.
- Quando o cliente descrever uma necessidade (ex.: "quero sair bonita pra festa", "minha unha quebrou"), interprete e recomende o serviço adequado do catálogo, já com preço.
- Ao responder sobre preço, responda direto ("O corte feminino sai por R$ 80,00 e leva 1h"). Não precisa chamar ferramenta para isso — a ferramenta list_services existe só como backup.
- Se o serviço pode ser feito por mais de um profissional, pergunte a preferência; se só um faz, não pergunte.
- Só ofereça horários retornados pela ferramenta get_availability. NUNCA invente horários.
- Para agendar, confirme: serviço, profissional (se houver preferência), data e horário antes de chamar create_appointment. Confirme o valor também ("Fecha por R$ X, tudo certo?").
- Se o cliente pedir foto/imagem e houver material cadastrado, use send_file.
- Se não souber responder ou o cliente pedir um humano, use handoff_to_human.
- Nunca dê descontos ou altere preços por conta própria.
${allowed}${forbidden}`
}

// ---------- ferramentas ----------
const J = { type: 'object' as const }
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'Lista os serviços/procedimentos ativos com preço e duração.',
      parameters: { ...J, properties: { query: { type: 'string', description: 'termo para filtrar (opcional)' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_availability',
      description: 'Retorna horários livres para um serviço em uma data (YYYY-MM-DD) ou nos próximos dias. Sempre consulte antes de oferecer horário.',
      parameters: { ...J, properties: {
        service_name: { type: 'string', description: 'nome do serviço, ex.: "Corte Feminino" (preferível)' },
        service_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD; omita para próximos dias' },
        professional_name: { type: 'string', description: 'preferência de profissional (opcional)' },
      } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description: 'Cria agendamento após o cliente confirmar serviço, data e horário.',
      parameters: { ...J, properties: {
        service_name: { type: 'string', description: 'nome do serviço, ex.: "Corte Feminino" (preferível)' },
        service_id: { type: 'string' },
        start: { type: 'string', description: 'YYYY-MM-DD HH:mm no horário local' },
        professional_name: { type: 'string' },
        notes: { type: 'string' },
      }, required: ['start'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_appointments',
      description: 'Lista os próximos agendamentos deste cliente.',
      parameters: { ...J, properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela um agendamento do cliente.',
      parameters: { ...J, properties: { appointment_id: { type: 'string' }, reason: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: 'Remarca um agendamento para novo horário.',
      parameters: { ...J, properties: {
        appointment_id: { type: 'string' },
        new_start: { type: 'string', description: 'YYYY-MM-DD HH:mm no horário local' },
      }, required: ['new_start'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_business_info',
      description: 'Informações do estabelecimento (endereço, horários, contatos, instagram).',
      parameters: { ...J, properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_file',
      description: 'Envia imagem, link ou arquivo cadastrado pela empresa (fotos de resultados, catálogo, políticas).',
      parameters: { ...J, properties: {
        query: { type: 'string', description: 'o que procurar, ex.: "foto de alongamento", "link do catálogo"' },
      }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payment_charge',
      description: 'Gera cobrança para o cliente: Pix (QR/copia-e-cola) ou cartão (link). Use somente se a empresa habilitou cobranças.',
      parameters: { ...J, properties: {
        amount_reais: { type: 'number', description: 'valor em reais, ex.: 50.00' },
        method: { type: 'string', enum: ['pix', 'card'] },
        description: { type: 'string' },
        appointment_id: { type: 'string' },
      }, required: ['amount_reais', 'method', 'description'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_contact',
      description: 'Atualiza dados do cliente (nome, aniversário, observações).',
      parameters: { ...J, properties: {
        name: { type: 'string' }, birthday: { type: 'string' }, notes: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
      } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: 'Transfere o atendimento para um humano (pausa a IA nesta conversa).',
      parameters: { ...J, properties: { reason: { type: 'string' } } },
    },
  },
]

export interface Slot { start: Date; end: Date; professional_id: string | null; professional_name: string | null }

export async function availability(ctx: AgentContext, serviceId: string, dateStr: string | undefined, profName?: string): Promise<{ slots: Slot[]; service: any }> {
  const db = ctx.supabase, c = ctx.company, tz = c.timezone || 'America/Sao_Paulo'
  const { data: service } = await db.from('services').select('*').eq('id', serviceId).eq('company_id', c.id).eq('active', true).single()
  if (!service) throw new ApiError(404, 'NO_SERVICE', 'Serviço não encontrado.')
  const { data: profs } = await db.from('professionals').select('*').eq('company_id', c.id).eq('active', true)
  let candidates = (profs ?? []).filter(p => !service.professional_ids?.length || service.professional_ids.includes(p.id))
  if (profName) {
    const n = String(profName).toLowerCase()
    const exact = candidates.filter(p => p.name.toLowerCase().includes(n))
    if (exact.length) candidates = exact
  }
  if (!candidates.length) candidates = [{ id: null, name: null, working_hours: null }]
  const dur = (service.duration_min + (service.buffer_min || 0)) * 60_000
  const { dateStr: today } = nowInTz(tz)
  const start = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T12:00:00Z`) : new Date(`${today}T12:00:00Z`)
  const maxDays = dateStr ? 1 : 7
  const days: string[] = []
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(start.getTime() + i * 86_400_000)
    days.push(d.toISOString().slice(0, 10))
  }
  const slots: Slot[] = []
  for (const day of days) {
    const [y, mo, dd] = day.split('-').map(Number)
    const dow = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]
    for (const p of candidates) {
      const hours = (p.working_hours ?? c.business_hours ?? {})[dow] ?? []
      const dayStart = zonedToUtc(y, mo, dd, 0, 0, tz)
      const dayEnd = dayStart.getTime() + 86_400_000
      let busyQ = db.from('appointments').select('starts_at,ends_at')
        .eq('company_id', c.id).in('status', ['scheduled', 'confirmed', 'awaiting_payment'])
        .lt('starts_at', new Date(dayEnd).toISOString()).gt('ends_at', dayStart.toISOString())
      if (p.id) busyQ = busyQ.eq('professional_id', p.id)
      const { data: busy } = await busyQ
      const busyRanges = (busy ?? []).map((b: any) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()])
      for (const range of hours as string[][]) {
        const [fh, fm] = range[0].split(':').map(Number); const [th, tm] = range[1].split(':').map(Number)
        let s = zonedToUtc(y, mo, dd, fh, fm, tz).getTime()
        const limit = zonedToUtc(y, mo, dd, th, tm, tz).getTime() - dur
        const minStart = Math.max(s, Date.now() + 15 * 60_000)
        while (s <= limit) {
          if (s >= minStart && !busyRanges.some(([bs, be]: number[]) => s < be && s + dur > bs)) {
            slots.push({ start: new Date(s), end: new Date(s + dur), professional_id: p.id, professional_name: p.name })
          }
          s += 30 * 60_000
        }
      }
    }
  }
  slots.sort((a, b) => a.start.getTime() - b.start.getTime())
  const seen = new Set<string>()
  const uniq = slots.filter(s => { const k = s.start.toISOString(); if (seen.has(k)) return false; seen.add(k); return true })
  return { slots: uniq.slice(0, 10), service }
}

export function fmtSlot(s: Slot, tz: string) {
  const d = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit' }).format(s.start)
  const t = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(s.start)
  return `${d} às ${t}${s.professional_name ? ` com ${s.professional_name}` : ''}`
}

export function parseLocalDateTime(input: string, tz: string): Date {
  const m = input.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) throw new ApiError(400, 'BAD_DATE', 'Data/hora inválida.')
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz)
}

// ---------- execução das ferramentas ----------
export interface ToolResult { content: string; sendFiles?: { url: string; title: string; kind: string }[]; charge?: { pix?: string; url?: string } }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

async function resolveService(db: ReturnType<typeof serviceClient>, companyId: string, args: any): Promise<any | null> {
  if (args.service_id) {
    const { data } = await db.from('services').select('*').eq('id', args.service_id).eq('company_id', companyId).eq('active', true).maybeSingle()
    if (data) return data
  }
  if (args.service_name) {
    const { data } = await db.from('services').select('*').eq('company_id', companyId).eq('active', true).order('sort').limit(80)
    const target = norm(String(args.service_name))
    const list = data ?? []
    return list.find((s: any) => norm(s.name) === target)
      ?? list.find((s: any) => norm(s.name).includes(target) || target.includes(norm(s.name)))
      ?? list.find((s: any) => target.split(/\s+/).some((w: string) => w.length > 3 && norm(s.name).includes(w)))
      ?? null
  }
  return null
}

export async function executeTool(name: string, args: any, ctx: AgentContext): Promise<ToolResult> {
  const db = ctx.supabase, c = ctx.company, tz = c.timezone || 'America/Sao_Paulo'
  const ai = c.ai_config ?? {}
  const demo = !ctx.contact?.id // modo demo (landing)
  switch (name) {
    case 'list_services': {
      let q = db.from('services').select('id,name,category,description,duration_min,price_cents').eq('company_id', c.id).eq('active', true).order('sort').limit(40)
      if (args.query) q = q.ilike('name', `%${args.query}%`)
      const { data } = await q
      if (!data?.length) return { content: 'Nenhum serviço encontrado com esse termo.' }
      return { content: data.map((s: any) => `- ${s.name}${s.category ? ` (${s.category})` : ''}: R$ ${(s.price_cents / 100).toFixed(2)} • ${s.duration_min} min${s.description ? ` — ${s.description}` : ''}`).join('\n') }
    }
    case 'get_availability': {
      const svc = await resolveService(db, c.id, args)
      if (!svc) return { content: 'Não encontrei esse serviço no cadastro. Verifique o nome exato no catálogo.' }
      const { slots, service } = await availability(ctx, svc.id, args.date, args.professional_name)
      if (!slots.length) return { content: 'Nenhum horário livre encontrado nesse período. Sugira outra data.' }
      return { content: 'Horários livres:\n' + slots.map(s => `- ${fmtSlot(s, tz)} | ${s.start.toISOString()}`).join('\n') + `\nDuração: ${service.duration_min} min.` }
    }
    case 'create_appointment': {
      const start = parseLocalDateTime(String(args.start), tz)
      const service = await resolveService(db, c.id, args)
      if (!service) return { content: 'Serviço não encontrado no cadastro. Confira o nome no catálogo.' }
      let professionalId: string | null = null
      if (args.professional_name) {
        const { data: p } = await db.from('professionals').select('id,name').eq('company_id', c.id).eq('active', true).ilike('name', `%${args.professional_name}%`).limit(1).maybeSingle()
        professionalId = p?.id ?? null
      }
      if (!professionalId && service.professional_ids?.length) professionalId = service.professional_ids[0]
      const end = new Date(start.getTime() + service.duration_min * 60_000)
      let confQ = db.from('appointments').select('id')
        .eq('company_id', c.id).in('status', ['scheduled', 'confirmed', 'awaiting_payment'])
        .lt('starts_at', end.toISOString()).gt('ends_at', start.toISOString())
      confQ = professionalId ? confQ.eq('professional_id', professionalId) : confQ.is('professional_id', null)
      const { data: conflict } = await confQ.limit(1)
      if (conflict?.length) return { content: 'Esse horário acabou de ser ocupado. Consulte novamente os horários livres.' }
      const needsDeposit = !!ai.require_deposit && !!c.ai_config?.payments_enabled
      const status = needsDeposit ? 'awaiting_payment' : (c.ai_config?.auto_confirm === false ? 'scheduled' : 'confirmed')
      const { data: appt, error } = await db.from('appointments').insert({
        company_id: c.id, contact_id: ctx.contact?.id ?? null, professional_id: professionalId,
        service_id: service.id, service_name: service.name,
        starts_at: start.toISOString(), ends_at: end.toISOString(),
        price_cents: service.price_cents, notes: args.notes ?? null,
        created_by: 'ai', status,
      }).select().single()
      if (error) return { content: `Falha ao agendar: ${error.message}` }
      if (ctx.contact?.id) await db.from('contacts').update({ stage: 'agendado' }).eq('id', ctx.contact.id)
      const when = fmtSlot({ start, end, professional_id: null, professional_name: null }, tz)
      if (!demo) await db.from('notifications').insert({ company_id: c.id, kind: 'appointment', title: 'Novo agendamento pela IA', body: `${ctx.contact.name ?? ctx.contact.phone} • ${service.name} • ${when}${status === 'awaiting_payment' ? ' • aguardando sinal' : ''}`, link: '/app/agenda' })
      if (needsDeposit) {
        const depCents = Math.round(service.price_cents * Number(ai.deposit_percent ?? 30) / 100)
        return { content: `Agendamento criado como AGUARDANDO PAGAMENTO (vaga reservada): ${service.name}, ${when}. appointment_id=${appt.id}. AGORA chame create_payment_charge com amount_reais=${(depCents / 100).toFixed(2)}, appointment_id=${appt.id} e description "Sinal ${ai.deposit_percent ?? 30}% — ${service.name}" e envie a cobrança à cliente. Só confirma quando ela pagar.` }
      }
      return { content: `Agendado com sucesso: ${service.name}, ${when}. appointment_id=${appt.id}` }
    }
    case 'list_appointments': {
      if (demo) return { content: 'Modo demonstração: sem agendamentos reais do cliente.' }
      const { data } = await db.from('appointments').select('id,service_name,starts_at,status')
        .eq('contact_id', ctx.contact.id).in('status', ['scheduled', 'confirmed', 'awaiting_payment']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(10)
      if (!data?.length) return { content: 'Cliente não tem agendamentos futuros.' }
      const label = (s: string) => s === 'awaiting_payment' ? 'aguardando pagamento do sinal' : s === 'confirmed' ? 'confirmado' : 'agendado'
      return { content: data.map((a: any) => `- ${a.service_name}: ${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.starts_at))} (${label(a.status)}) id=${a.id}`).join('\n') }
    }
    case 'cancel_appointment': {
      if (demo) return { content: 'Modo demonstração: nada a cancelar.' }
      let id = args.appointment_id
      if (!id) {
        const { data } = await db.from('appointments').select('id').eq('contact_id', ctx.contact.id).in('status', ['scheduled', 'confirmed', 'awaiting_payment']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(1)
        id = data?.[0]?.id
      }
      if (!id) return { content: 'Nenhum agendamento futuro encontrado.' }
      const { data: a } = await db.from('appointments').update({ status: 'cancelled', notes: args.reason ?? null }).eq('id', id).eq('contact_id', ctx.contact.id).select().single()
      if (!a) return { content: 'Agendamento não encontrado.' }
      await db.from('notifications').insert({ company_id: c.id, kind: 'cancelled', title: 'Agendamento cancelado', body: `${ctx.contact.name ?? ctx.contact.phone} • ${a.service_name}`, link: '/app/agenda' })
      return { content: `Cancelado: ${a.service_name} em ${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.starts_at))}.` }
    }
    case 'reschedule_appointment': {
      if (demo) return { content: 'Modo demonstração: nada a remarcar.' }
      const start = parseLocalDateTime(String(args.new_start), tz)
      let appt: any
      if (args.appointment_id) {
        const { data } = await db.from('appointments').select('*').eq('id', args.appointment_id).eq('contact_id', ctx.contact.id).single()
        appt = data
      } else {
        const { data } = await db.from('appointments').select('*').eq('contact_id', ctx.contact.id).in('status', ['scheduled', 'confirmed', 'awaiting_payment']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(1)
        appt = data?.[0]
      }
      if (!appt) return { content: 'Nenhum agendamento futuro para remarcar.' }
      const dur = new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()
      const nextStatus = ['confirmed', 'awaiting_payment'].includes(appt.status) ? appt.status : 'scheduled'
      await db.from('appointments').update({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + dur).toISOString(), status: nextStatus }).eq('id', appt.id)
      return { content: `Remarcado para ${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(start)}.` }
    }
    case 'get_business_info': {
      return { content: JSON.stringify({ nome: c.name, endereco: c.address, cidade: c.city, instagram: c.instagram, whatsapp: c.whatsapp_public, horarios: c.business_hours, extra: c.extra }) }
    }
    case 'send_file': {
      const q = String(args.query ?? '')
      const { data } = await db.from('company_files').select('*').eq('company_id', c.id).limit(50)
      const words = q.toLowerCase().split(/\s+/)
      const found = (data ?? []).filter((f: any) =>
        words.some(w => f.title.toLowerCase().includes(w) || (f.description ?? '').toLowerCase().includes(w) || (f.tags ?? []).includes(w)))
      const file = found[0] ?? data?.[0]
      if (!file) return { content: 'Nenhum material cadastrado disponível.' }
      if (demo) return { content: `Aqui o cliente receberia: "${file.title}". Na demo, descreva o que enviaria.` }
      return { content: `Arquivo enviado ao cliente: ${file.title}`, sendFiles: [{ url: file.url, title: file.title, kind: file.kind }] }
    }
    case 'create_payment_charge': {
      if (!c.ai_config?.payments_enabled) return { content: 'A empresa não habilitou cobranças pelo chat.' }
      if (demo) return { content: `Demonstração: cobrança de R$ ${Number(args.amount_reais).toFixed(2)} via ${args.method} seria gerada aqui. Avise que é uma simulação.` }
      const cents = BigInt(Math.round(Number(args.amount_reais) * 100))
      if (cents <= 0n) return { content: 'Valor inválido.' }
      const desc = String(args.description ?? 'Serviço').slice(0, 200)
      if (args.method === 'pix') {
        const { data: pay } = await db.from('payments').insert({
          company_id: c.id, kind: 'customer_charge', provider: 'mercosulpay', status: 'created',
          amount_cents: Number(cents), contact_id: ctx.contact.id, appointment_id: args.appointment_id ?? null,
          conversation_id: ctx.conversation.id, description: desc,
        }).select().single()
        const charge = await createCharge(cents, pay.id, desc)
        await db.from('payments').update({ status: 'pending', provider_id: charge.id, qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage }).eq('id', pay.id)
        return { content: `Cobrança Pix criada: R$ ${(Number(cents) / 100).toFixed(2)}. Envie o código copia-e-cola ao cliente.`, charge: { pix: charge.qrCode } }
      }
      const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
      const { data: pay } = await db.from('payments').insert({
        company_id: c.id, kind: 'customer_charge', provider: 'stripe', status: 'created',
        amount_cents: Number(cents), contact_id: ctx.contact.id, appointment_id: args.appointment_id ?? null,
        conversation_id: ctx.conversation.id, description: desc,
      }).select().single()
      const session = await createCheckout({
        companyId: c.id, description: desc, amountCents: cents,
        successUrl: `${site}/pagamento/obrigado`, cancelUrl: `${site}/pagamento/cancelado`,
        metadata: { payment_id: pay.id, kind: 'customer_charge' },
      })
      await db.from('payments').update({ status: 'pending', provider_id: session.id, checkout_url: session.url }).eq('id', pay.id)
      return { content: `Link de pagamento por cartão criado: ${session.url}`, charge: { url: session.url } }
    }
    case 'update_contact': {
      if (demo) return { content: 'Demonstração: dados do visitante não são salvos.' }
      const patch: any = {}
      if (args.name) patch.name = args.name
      if (args.birthday) patch.birthday = args.birthday
      if (args.notes) patch.notes = ctx.contact.notes ? `${ctx.contact.notes}\n${args.notes}` : args.notes
      if (args.tags?.length) patch.tags = [...new Set([...(ctx.contact.tags ?? []), ...args.tags])]
      if (Object.keys(patch).length) await db.from('contacts').update(patch).eq('id', ctx.contact.id)
      return { content: 'Dados do cliente atualizados.' }
    }
    case 'handoff_to_human': {
      if (demo) return { content: 'Demonstração: aqui a conversa seria transferida para um atendente humano.' }
      const aiState = { ...(ctx.conversation.ai_state ?? {}), handoff_at: new Date().toISOString(), handoff_escalated: false, handoff_reason: args.reason ?? null }
      await db.from('conversations').update({ mode: 'human', ai_state: aiState }).eq('id', ctx.conversation.id)
      const who = ctx.contact.name ?? ctx.contact.push_name ?? ctx.contact.phone
      await db.from('notifications').insert({
        company_id: c.id, kind: 'handoff', title: '🆘 Cliente pediu atendimento humano',
        body: `${who} (${ctx.contact.phone})${args.reason ? ` — ${args.reason}` : ''}. Assuma a conversa no Chat.`,
        link: `/app/chat?c=${ctx.conversation.id}`,
      })
      const escalate = c.ai_config?.handoff_to_attendant && c.ai_config?.handoff_phone
      return { content: escalate
        ? 'Conversa transferida. Um atendente foi notificado no painel e, se ninguém responder em ~2 min, os dados do cliente serão enviados por WhatsApp para o atendente cadastrado. Avise o cliente que um humano já vai atendê-lo.'
        : 'Conversa transferida. A equipe foi notificada no painel. Avise o cliente que um humano já vai atendê-lo.' }
    }
    default:
      return { content: `Ferramenta desconhecida: ${name}` }
  }
}

// ---------- loop do agente ----------
export interface AgentResult {
  text: string
  files: { url: string; title: string; kind: string }[]
  chargeExtras: string[]
  usage: { prompt_tokens: number; completion_tokens: number }
}

export async function runAgent(ctx: AgentContext, history: ChatMessage[], userText: string, mediaNote?: string): Promise<AgentResult> {
  const system = await buildSystemPrompt(ctx)
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history]
  messages.push({ role: 'user', content: mediaNote ? `[${mediaNote}] ${userText || ''}`.trim() : userText })
  const files: { url: string; title: string; kind: string }[] = []
  const chargeExtras: string[] = []
  const usage = { prompt_tokens: 0, completion_tokens: 0 }
  for (let round = 0; round < 5; round++) {
    const { message, usage: u } = await chat({ messages, tools: TOOLS, maxTokens: 600 })
    usage.prompt_tokens += u.prompt_tokens ?? 0
    usage.completion_tokens += u.completion_tokens ?? 0
    messages.push(message)
    if (!message.tool_calls?.length) {
      return { text: (message.content ?? '').trim(), files, chargeExtras, usage }
    }
    for (const call of message.tool_calls as ToolCall[]) {
      let result: ToolResult
      try {
        result = await executeTool(call.function.name, JSON.parse(call.function.arguments || '{}'), ctx)
      } catch (e) {
        result = { content: `Erro na ferramenta: ${(e as Error).message}` }
      }
      if (result.sendFiles) files.push(...result.sendFiles)
      if (result.charge?.pix) chargeExtras.push(`PIX_COPIAECOLA:${result.charge.pix}`)
      if (result.charge?.url) chargeExtras.push(`LINK_PAGAMENTO:${result.charge.url}`)
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.content })
    }
  }
  return { text: 'Desculpa, tive um probleminha aqui 😅 Pode repetir?', files, chargeExtras, usage }
}
