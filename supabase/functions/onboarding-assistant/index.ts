import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { chat } from '../_shared/nvidia.ts'

// Assistente de configuração (onboarding) — entrevista o dono e devolve patches JSON
// que preenchem o formulário de cadastro do estabelecimento.
const NICHES_DOC = `Nichos válidos:
- salao (Salão de cabelo)
- unhas (Manicure & pedicure / nail designer)
- olhar (Sobrancelhas & cílios)
- barbearia (Barbearia)
- clinica (Clínica de estética)

Perguntas extras por nicho (campo "extra", chaves livres em português):
- salao: técnicas oferecidas, se atende por ordem de chegada, tempo médio de retorno
- unhas: tipos de alongamento, materiais/marcas, manutenção em dias
- olhar: procedimentos (design, lash, micropigmentação), contraindicações, cuidados pós
- barbearia: estilo da casa, diferenciais (cerveja, sinuca…), produtos à venda, intervalo médio entre cortes
- clinica: especialidades, política de avaliação primeiro, contraindicações, cuidados pós-sessão`

const PROMPT = `Você é a assistente de configuração do IAstetic — uma recepcionista-amiga que entrevista o DONO do estabelecimento (pouco técnico) e preenche o cadastro fazendo UMA pergunta por vez.

${NICHES_DOC}

REGRAS DE SAÍDA — responda SEMPRE em JSON PURO (sem markdown, sem \`\`\`):
{"say": "sua mensagem pro usuário", "patch": {...}}

"patch" só inclui o que aprendeu NESTA resposta:
- niche: salao|unhas|olhar|barbearia|clinica
- name: nome do estabelecimento
- whatsapp: telefone (pode vir "(11) 99999-9999")
- instagram / address / city / state (UF 2 letras)
- extra: objeto {chave: resposta} das perguntas do nicho
- services: [{name, duration_min, price, category}] — se o usuário aceitar as sugestões do nicho, devolva a lista inteira ajustada
- professionals: [{name, color: "#hex", pin: "1234"(opcional 4-8 dígitos)}]
- hours: {sun:null, mon:[["09:00","18:00"]], ...} — null = fechado
- ai: {name: "nome da recepcionista IA", tone: "tom de voz", forbidden: "o que não pode fazer"}
- done: true — SÓ depois do usuário confirmar o resumo final

FLUXO (pode pular etapas se o usuário já respondeu):
1. nicho → 2. nome + whatsapp → 3. instagram/endereço/cidade (resuma numa pergunta) → 4. perguntas extras do nicho (max 2) → 5. serviços (sugira os típicos do nicho com preços) → 6. equipe (nomes; cor e senha são opcionais — pergunte se quer) → 7. horários (pergunte dias fechados e horário padrão) → 8. nome e tom da IA (sugira nomes) → 9. RESUMO de tudo → confirmação → done:true

- Seja calorosa e breve (máx ~80 palavras por mensagem), pt-BR, 1-2 emojis ok.
- Se o usuário despejar muita informação, preencha tudo que couber e só pergunte o que falta.
- O "say" deve reconhecer o que foi salvo ("Anotei: 6 serviços ✔️") antes de perguntar o próximo.
- Nunca devolva campos que o usuário não informou nesta resposta.`

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const body = await req.json().catch(() => ({}))
    const history: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.history) ? body.history.slice(-16) : []
    const current = body.current ?? {}

    const messages: any[] = [
      { role: 'system', content: PROMPT },
      { role: 'system', content: `ESTADO JÁ PREENCHIDO (não pergunte de novo, a menos que o usuário queira mudar): ${JSON.stringify(current).slice(0, 3000)}` },
      ...history.map(h => ({ role: h.role, content: h.content })),
    ]
    const { message } = await chat({ messages, maxTokens: 900, temperature: 0.5 })
    const raw = (message.content ?? '').trim().replace(/^```(?:json)?|```$/g, '').trim()
    let parsed: any
    try { parsed = JSON.parse(raw) }
    catch {
      // modelo não devolveu JSON — embrulha como texto
      parsed = { say: raw || 'Pode repetir? Não entendi direitinho.', patch: {} }
    }
    return json({ ok: true, data: { say: str(parsed.say ?? '', 1500), patch: parsed.patch ?? {} } })
  } catch (e) { return errorResponse(e) }
})
