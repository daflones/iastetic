import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, CalendarCheck, MessageCircle, CreditCard, Bell, BrainCircuit,
  Check, ArrowRight, Send, Loader2, Bot, QrCode, ShieldCheck, Play, Pause, Volume2,
} from 'lucide-react'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY, brl } from '@/lib/supabase'
import { NICHES, NICHE_LIST, applyNicheTheme, type NicheId } from '@/lib/niches'
import Art from '@/components/ui/Art'
import NicheArt from '@/components/ui/NicheArt'
import SupportContact from '@/components/ui/SupportContact'
import { supabase } from '@/lib/supabase'
import type { Plan } from '@/lib/types'
import clsx from 'clsx'

const FEATURES = [
  { icon: MessageCircle, title: 'Atendimento 24/7', text: 'Responde texto, áudio e imagem no WhatsApp como uma recepcionista de verdade — no tom que você definir.' },
  { icon: CalendarCheck, title: 'Agenda sozinha', text: 'Marca, remarca e cancela consultando seus horários reais. Sem overbooking, sem telefone ocupado.' },
  { icon: CreditCard, title: 'Cobra no chat', text: 'Gera Pix copia-e-cola e links de cartão na conversa. Cai direto na sua carteira IAstetic.' },
  { icon: Bell, title: 'Follow-ups inteligentes', text: 'Lembra da manutenção, reativa clientes sumidas e confirma agendamentos — com variações escritas pela IA.' },
  { icon: BrainCircuit, title: 'Assistente de gestão', text: 'Pergunte por áudio ou texto: “como foi o mês?” e receba análise com números reais do seu negócio.' },
  { icon: ShieldCheck, title: 'Você no controle', text: 'Acompanhe tudo em tempo real, assuma qualquer conversa com um clique e defina o que a IA pode ou não falar.' },
]

const FAQS = [
  { q: 'Preciso trocar de número de WhatsApp?', a: 'Não. Você conecta seu WhatsApp escaneando um QR Code — como o WhatsApp Web. Suas conversas continuam no seu aparelho.' },
  { q: 'É difícil configurar meus serviços e regras?', a: 'Não — você pode simplesmente conversar com a assistente de configuração: ela pergunta sobre seu negócio e preenche serviços, equipe, horários e regras sozinha. Prefere fazer manual? Também dá, em poucos minutos.' },
  { q: 'A IA erra horários ou inventa informação?', a: 'A IA só oferece horários lidos da sua agenda real e só fala preços cadastrados. O que ela pode ou não pode dizer fica nas suas regras.' },
  { q: 'Posso assumir uma conversa?', a: 'Sim. No painel você vê cada conversa ao vivo e assume o atendimento quando quiser — a IA pausa naquela conversa.' },
  { q: 'Como recebo os pagamentos?', a: 'Cobranças Pix e cartão caem na sua carteira dentro da plataforma. Saque via Pix a qualquer momento (taxa de 5%) ou use o saldo para pagar a mensalidade.' },
]

export default function LandingPage() {
  const [niche, setNiche] = useState<NicheId>('olhar')
  const [plans, setPlans] = useState<Plan[]>([])
  const [yearly, setYearly] = useState(false)
  const [spotlight, setSpotlight] = useState(false)
  const n = NICHES[niche]

  function highlightDemo() {
    setSpotlight(true)
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => setSpotlight(false), 1900)
  }

  useEffect(() => { applyNicheTheme(niche) }, [niche])
  useEffect(() => {
    supabase.from('plans').select('*').eq('active', true).order('sort').then(({ data }) => setPlans((data as Plan[]) ?? []))
  }, [])

  return (
    <div className="min-h-screen mesh-bg texture-noise relative overflow-x-clip">
      {/* orbes decorativos */}
      <div className="orb bg-brand-300 h-96 w-96 -top-32 -left-32 fixed" />
      <div className="orb bg-accent-300 h-80 w-80 top-24 -right-24 fixed" style={{ animationDelay: '-5s' }} />
      <div className="orb bg-brand-200 h-72 w-72 bottom-40 left-1/3 fixed" style={{ animationDelay: '-9s' }} />

      {/* Nav */}
      <header className="sticky top-0 z-30 glass border-b border-line/60">
        <div className="container h-16 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Art name="logo" className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl object-cover shadow-soft" placeholderClass="h-8 w-8 sm:h-9 sm:w-9 rounded-xl" />
            <span className="font-display text-lg sm:text-xl font-bold">IAstetic</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 ml-8 text-sm text-ink-soft">
            <button onClick={highlightDemo} className="link-underline hover:text-brand-600 transition">Teste ao vivo</button>
            <a href="#funcoes" className="link-underline hover:text-brand-600 transition">Funções</a>
            <a href="#planos" className="link-underline hover:text-brand-600 transition">Planos</a>
            <a href="#faq" className="link-underline hover:text-brand-600 transition">Dúvidas</a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link to="/login" className="btn-ghost !px-3 !py-2 text-sm">Entrar</Link>
            <Link to="/cadastro" className="btn-primary !px-3.5 !py-2 text-sm whitespace-nowrap">Começar grátis <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </header>

      {/* spotlight: escurece a tela e recorta o chat da demo */}
      <AnimatePresence>
        {spotlight && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-[2px] pointer-events-none" />
        )}
      </AnimatePresence>

      {/* Hero */}
      <section className="container relative pt-8 sm:pt-14 pb-10 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        <Art name="hero-textura" className="pointer-events-none absolute inset-x-0 -top-24 w-full h-[46rem] object-cover opacity-60 -z-10" />
        <Art name="hero-glow" className="pointer-events-none absolute -top-20 -left-24 w-[38rem] opacity-50 blur-2xl -z-10" />
        <div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
            <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
              className="badge bg-brand-100/80 backdrop-blur text-brand-700 mb-4 ring-1 ring-brand-200"><Sparkles className="h-3.5 w-3.5" /> Recepcionista com IA para o seu WhatsApp</motion.span>
            <h1 className="h-display text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.08]">
              Sua agenda cheia.<br />
              <span className="gradient-text">Zero mensagem perdida.</span>
            </h1>
            <p className="mt-5 text-lg text-ink-soft max-w-xl">
              A IAstetic atende suas clientes no WhatsApp, agenda, remarca, cobra no Pix e faz follow-up —
              enquanto você cuida do que ama. Feita para salões, manicures, olhar, barbearias e clínicas de estética.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro" className="btn-primary text-base px-6 py-3">Teste grátis por 7 dias</Link>
              <button onClick={highlightDemo} className="btn-outline text-base px-6 py-3"><Bot className="h-5 w-5" /> Converse com a IA agora</button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-ink-muted">
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-brand-500" /> Sem cartão</span>
              <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand-500" /> A IA configura pra você</span>
              <span className="flex items-center gap-1.5"><QrCode className="h-4 w-4 text-brand-500" /> QR Code em 2 min</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-brand-500" /> Cancele quando quiser</span>
            </div>
          </motion.div>
        </div>

        {/* Demo ao vivo */}
        <motion.div id="demo" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .15 }}
          className={clsx('relative rounded-3xl transition-all duration-500', spotlight && 'z-50 ring-4 ring-brand-400/70 shadow-glow scale-[1.02]')}>
          <Art name="hero-landing" className="pointer-events-none absolute -top-16 -right-10 w-64 lg:w-80 opacity-90 blur-[1px] -z-10 rotate-3 animate-float hidden md:block" />
          <LiveDemo niche={niche} onNicheChange={setNiche} />
        </motion.div>
      </section>

      {/* Niche strip */}
      <section className="border-y border-line/60 bg-surface/60 backdrop-blur">
        <div className="container py-6 sm:py-8 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {NICHE_LIST.map((x, i) => (
            <motion.button key={x.id} onClick={() => setNiche(x.id)}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              whileHover={{ y: -3 }}
              className={clsx('text-left rounded-2xl border transition-all relative overflow-hidden group/card flex sm:block items-stretch',
                niche === x.id ? 'border-brand-400 bg-brand-50 shadow-glow' : 'border-line bg-surface/80 hover:border-brand-200 hover:shadow-card')}>
              {niche === x.id && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-accent-500 to-brand-400 z-10" />}
              <div className="relative w-20 min-h-[72px] sm:w-full sm:h-24 sm:min-h-0 shrink-0 overflow-hidden bg-brand-50/60">
                <Art name={`niche-${x.id}`} alt={x.name}
                  className={clsx('w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105', niche !== x.id && 'opacity-80 saturate-[.85]')}
                  placeholderClass="w-full h-full" />
              </div>
              <div className="p-3 sm:p-4 flex-1">
                <p className="font-semibold text-sm">{x.name}</p>
                <p className="text-[11px] text-ink-muted mt-1 leading-snug">{x.tagline}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="container py-10 sm:py-16">
        <h2 className="h-display text-3xl sm:text-4xl text-center">Funciona em <span className="gradient-text">3 passos</span></h2>
        <p className="text-center text-ink-muted mt-3">Do QR Code à agenda cheia — sem instalar nada, sem trocar de número.</p>
        <div className="mt-8 sm:mt-12 grid sm:grid-cols-3 gap-4 sm:gap-6">
          {[
            { img: 'passo-1', step: '01', title: 'Conecta o WhatsApp', text: 'Escaneia um QR Code como o WhatsApp Web. Suas conversas continuam no seu aparelho.' },
            { img: 'passo-2', step: '02', title: 'A IA aprende seu negócio', text: 'Prefere não preencher nada? Uma assistente conversa com você e configura serviços, equipe, horários e regras sozinha. Ou cadastre manualmente em 3 min.' },
            { img: 'passo-3', step: '03', title: 'Agenda e cobra sozinha', text: 'Marca horários reais, manda Pix, confirma e faz follow-up — 24h por dia.' },
          ].map((s, i) => (
            <motion.div key={s.step}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className="card-lux overflow-hidden group">
              <div className="relative h-32 sm:h-44 bg-gradient-to-br from-brand-50 to-accent-100 overflow-hidden">
                <Art name={s.img} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" placeholderClass="w-full h-full" />
                <span className="absolute top-3 left-3 font-display font-bold text-brand-600/30 text-2xl">{s.step}</span>
              </div>
              <div className="p-5">
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{s.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="funcoes" className="container py-10 sm:py-20">
        <h2 className="h-display text-3xl sm:text-4xl text-center">Tudo que uma <span className="gradient-text">super recepcionista</span> faria</h2>
        <p className="text-center text-ink-muted mt-3 max-w-2xl mx-auto">E mais um pouco. Configurada para o seu nicho, com as suas regras.</p>
        <div className="mt-8 sm:mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: (i % 3) * 0.08, duration: 0.45 }}
              whileHover={{ y: -4 }}
              className="card-lux p-5 sm:p-6 hover:shadow-glow transition-shadow group">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-100 to-accent-100 grid place-items-center ring-1 ring-brand-200 group-hover:scale-110 transition-transform">
                <f.icon className="h-5 w-5 text-brand-600" />
              </div>
              <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
              <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{f.text}</p>
            </motion.div>
          ))}
        </div>
        {/* niche benefits */}
        <div className="mt-8 sm:mt-12 rounded-3xl bg-gradient-to-br from-brand-600 to-accent-700 text-white p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute inset-0 texture-grid opacity-30" />
          <div className="orb bg-white/20 h-48 w-48 -top-10 -right-10" />
          <div className="relative flex items-center gap-4">
            <Art name={`niche-${niche}`} alt={n.name} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/30 shrink-0" placeholderClass="h-16 w-16 rounded-2xl" />
            <p className="text-sm uppercase tracking-widest opacity-80">Feito para {n.name}</p>
          </div>
          <div className="mt-4 grid sm:grid-cols-3 gap-6 relative">
            {n.landingBenefits.map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <h4 className="font-display font-semibold text-lg">{b.title}</h4>
                <p className="text-sm text-white/80 mt-1.5 leading-relaxed">{b.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="border-t border-line bg-surface/60">
        <div className="container py-12 sm:py-20">
          <h2 className="h-display text-3xl sm:text-4xl text-center">Planos que cabem no seu <span className="gradient-text">negócio</span></h2>
          <p className="text-center text-ink-muted mt-3">Pague no Pix (MercosulPay) ou cartão (Stripe). Saldo da carteira também paga a mensalidade.</p>
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center rounded-full bg-brand-50 p-1 ring-1 ring-brand-200">
              {(['Mensal', 'Anual'] as const).map(l => {
                const active = yearly === (l === 'Anual')
                return (
                  <button key={l} onClick={() => setYearly(l === 'Anual')}
                    className={clsx('px-5 py-1.5 rounded-full text-xs font-semibold transition-all', active ? 'bg-brand-600 text-white shadow-soft' : 'text-ink-muted hover:text-ink')}>
                    {l}{l === 'Anual' && <span className={clsx('ml-1.5 text-[9px]', active ? 'text-white/90' : 'text-emerald-600')}>2 meses grátis</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((p, i) => (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.1, duration: 0.45 }}
                whileHover={{ y: -4 }}
                className={clsx('card-lux p-5 sm:p-7 flex flex-col relative', p.highlight && 'border-brand-400 ring-2 ring-brand-400/60 shadow-glow md:-translate-y-2')}>
                {p.highlight && <span className="badge bg-gradient-to-r from-brand-500 to-accent-500 text-white absolute -top-3 left-1/2 -translate-x-1/2 shadow-soft"><Sparkles className="h-3 w-3" /> Mais escolhido</span>}
                <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                <p className="text-sm text-ink-muted mt-1 min-h-[40px]">{p.description}</p>
                {(() => {
                  const yearlyPrice = p.yearly_price_cents ?? p.price_cents * 12
                  const monthlyEq = Math.round(yearlyPrice / 12)
                  const pctOff = Math.round((1 - yearlyPrice / (p.price_cents * 12)) * 100)
                  return (
                    <p className="mt-4">
                      <span className="text-4xl font-bold">{brl(yearly ? monthlyEq : p.price_cents)}</span>
                      <span className="text-ink-muted text-sm">/mês</span>
                      {yearly && <span className="block text-[11px] text-ink-muted">cobrado {brl(yearlyPrice)}/ano{pctOff > 0 && <b className="text-emerald-600"> · economize {pctOff}%</b>}</span>}
                      {!yearly && p.yearly_price_cents && <span className="block text-xs text-accent-700 font-medium mt-1">ou {brl(p.yearly_price_cents)}/ano ({pctOff}% off)</span>}
                    </p>
                  )
                })()}
                <ul className="mt-5 space-y-2.5 text-sm text-ink-soft flex-1">
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />{p.instances_limit} número(s) de WhatsApp</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />Até {p.professionals_limit} profissionais</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />{p.monthly_messages_limit.toLocaleString('pt-BR')} mensagens/mês</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />Agenda + CRM + Follow-ups</li>
                  {p.features?.audio && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />Responde com áudios (voz própria)</li>}
                  {p.features?.images && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />Envia suas fotos e catálogo</li>}
                  {p.features?.payments && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />Cobra Pix e cartão no chat</li>}
                  {p.features?.assistant && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />Assistente de gestão com voz</li>}
                </ul>
                <Link to="/cadastro" className={clsx('mt-6 w-full', p.highlight ? 'btn-primary' : 'btn-outline')}>Começar agora</Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-12 sm:py-20 max-w-3xl">
        <h2 className="h-display text-3xl text-center">Perguntas frequentes</h2>
        <div className="mt-6 sm:mt-10 space-y-3">
          {FAQS.map(f => (
            <details key={f.q} className="card-lux p-4 sm:p-5 group">
              <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
                {f.q}
                <ArrowRight className="h-4 w-4 text-brand-500 transition-transform group-open:rotate-90" />
              </summary>
              <p className="text-sm text-ink-soft mt-3 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <SupportContact className="mt-10" />
      </section>

      {/* CTA final */}
      <section className="container pb-12 sm:pb-20">
        <div className="rounded-3xl text-white p-7 sm:p-14 text-center relative overflow-hidden">
          <Art name="cta-fundo" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-700/85 via-brand-600/80 to-accent-700/85" />
          <div className="absolute inset-0 texture-dots opacity-20" />
          <div className="orb bg-white/25 h-56 w-56 -bottom-20 -left-16" />
          <div className="orb bg-accent-300/40 h-44 w-44 -top-14 -right-10" style={{ animationDelay: '-4s' }} />
          <h2 className="h-display text-3xl sm:text-4xl relative">Pronto para nunca mais perder um cliente?</h2>
          <p className="mt-3 text-white/85 relative">7 dias grátis. Configure em minutos, sem trocar de número.</p>
          <Link to="/cadastro" className="relative inline-flex items-center gap-2 mt-7 bg-white text-brand-700 font-semibold rounded-xl px-7 py-3.5 hover:-translate-y-0.5 transition-transform shadow-lg">
            Criar minha IA agora <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink-muted">
          <div className="flex items-center gap-2">
            <Art name="logo" className="h-7 w-7 rounded-lg object-cover" placeholderClass="h-7 w-7 rounded-lg" />
            IAstetic © 2026
          </div>
          <p>Atendimento com IA para a beleza que você constrói todos os dias.</p>
        </div>
      </footer>
    </div>
  )
}

// ===================== Demo ao vivo =====================
function LiveDemo({ niche, onNicheChange }: { niche: NicheId; onNicheChange: (n: NicheId) => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<{ role: 'user' | 'ai'; text: string; audio?: string }[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const n = NICHES[niche]

  useEffect(() => {
    const aiName = n.aiNameSuggestions[0] ?? 'Íris'
    const role = niche === 'barbearia' ? `o ${aiName}, atendente virtual` : `a ${aiName}, recepcionista virtual`
    setMsgs([{ role: 'ai', text: `Oi! Eu sou ${role} da demonstração de ${n.name}. Pergunte preços, peça horários ou mande "quero agendar". É um teste à vontade!` }])
    setSessionId(null); setDone(false)
  }, [niche])

  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || busy || done) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: msg }])
    setBusy(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai-demo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ session_id: sessionId, niche, message: msg }),
      })
      const data = await res.json()
      const reply = data?.data?.reply ?? data?.error?.message ?? 'Ops, tente de novo.'
      setSessionId(data?.data?.session_id ?? sessionId)
      setDone(!!data?.data?.done)
      const audio = data?.data?.audio_b64 ? `data:${data.data.audio_mime ?? 'audio/mpeg'};base64,${data.data.audio_b64}` : undefined
      setMsgs(m => [...m, { role: 'ai', text: reply, audio }])
    } catch {
      setMsgs(m => [...m, { role: 'ai', text: 'Conexão falhou — tente de novo em instantes.' }])
    } finally { setBusy(false) }
  }

  return (
    <div className="card-lux overflow-hidden shadow-glow ring-1 ring-brand-200/60 flex flex-col h-[76dvh] max-h-[640px] sm:h-auto sm:max-h-none">
      {/* phone header */}
      <div className="bg-gradient-to-r from-brand-600 to-accent-700 text-white px-4 py-3 sm:px-5 sm:py-3.5 flex items-center gap-2.5 sm:gap-3 shrink-0">
        <NicheArt id={niche} className="h-8 w-8 sm:h-9 sm:w-9 rounded-full ring-1 ring-white/30" />
        <div className="flex-1 leading-tight">
          <p className="font-semibold text-sm">Recepção {n.short} (demo)</p>
          <p className="text-[11px] text-white/75 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 inline-block" /> online agora</p>
        </div>
        <span className="badge bg-white/15 text-white text-[10px]">TESTE AO VIVO</span>
      </div>
      {/* niche switch */}
      <div className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-1 flex gap-2 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }}>
        {NICHE_LIST.map(x => (
          <button key={x.id} onClick={() => onNicheChange(x.id)}
            className={clsx('text-xs rounded-full px-3 py-1.5 font-medium transition inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap',
              niche === x.id ? 'bg-brand-500 text-white' : 'bg-brand-50 text-ink-soft hover:bg-brand-100')}>
            <NicheArt id={x.id} className="h-4 w-4 rounded-full inline-block" /> {x.short}
          </button>
        ))}
      </div>
      {/* messages */}
      <div ref={boxRef} className="flex-1 min-h-0 sm:flex-none sm:h-[340px] overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-2.5 bg-canvas/60 overscroll-contain">
        {msgs.map((m, i) => (
          <div key={i} className={clsx('max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed animate-fade-up whitespace-pre-wrap',
            m.role === 'user' ? 'ml-auto bg-brand-500 text-white rounded-br-sm' : 'bg-surface border border-line rounded-bl-sm')}>
            {m.audio && <DemoAudioBubble src={m.audio} autoplay />}
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="bg-surface border border-line rounded-2xl rounded-bl-sm px-4 py-2.5 w-16 flex gap-1">
            {[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-brand-300 animate-typing" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
        {done && (
          <div className="text-center py-3">
            <Link to="/cadastro" className="btn-primary text-xs">Criar conta e conectar meu WhatsApp <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        )}
      </div>
      {/* input */}
      <div className="p-2.5 sm:p-3 border-t border-line flex gap-2 bg-surface shrink-0">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Digite como se fosse uma cliente…" className="input !rounded-full text-sm" disabled={done} />
        <button onClick={() => send()} disabled={busy || done} className="btn-primary !rounded-full h-10 w-10 !p-0 shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {/* sugestões */}
      <div className="px-3 pb-2.5 sm:pb-3 flex flex-wrap gap-1.5 bg-surface shrink-0">
        {n.demoScript.map(s => s.from === 'client' ? s.text : '').filter(Boolean).map(t => (
          <button key={t} onClick={() => send(t)} disabled={busy || done}
            className="text-[11px] rounded-full border border-line px-2.5 py-1 text-ink-soft hover:border-brand-300 hover:text-brand-600 transition disabled:opacity-40">
            {t}
          </button>
        ))}
        <button onClick={() => send('quero agendar')} disabled={busy || done} className="text-[11px] rounded-full border border-line px-2.5 py-1 text-ink-soft hover:border-brand-300 hover:text-brand-600 transition disabled:opacity-40">quero agendar</button>
        <button onClick={() => send('quanto custa?')} disabled={busy || done} className="text-[11px] rounded-full border border-line px-2.5 py-1 text-ink-soft hover:border-brand-300 hover:text-brand-600 transition disabled:opacity-40">quanto custa?</button>
        {!done && <span className="ml-auto self-center text-[10px] text-ink-muted">demo: {Math.max(0, 3 - msgs.filter(m => m.role === 'user').length)}/3 interações</span>}
      </div>
    </div>
  )
}

// ===================== Bolha de áudio da demo =====================
function DemoAudioBubble({ src, autoplay }: { src: string; autoplay?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [dur, setDur] = useState(0)
  const [pos, setPos] = useState(0)

  useEffect(() => {
    const a = new Audio(src)
    audioRef.current = a
    a.onloadedmetadata = () => setDur(a.duration)
    a.ontimeupdate = () => setPos(a.currentTime)
    a.onended = () => setPlaying(false)
    if (autoplay) a.play().then(() => setPlaying(true)).catch(() => {})
    return () => { a.pause(); audioRef.current = null }
  }, [src])

  const toggle = () => {
    const a = audioRef.current; if (!a) return
    if (playing) { a.pause(); setPlaying(false) } else { a.play().then(() => setPlaying(true)).catch(() => {}) }
  }
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const bars = [40, 70, 55, 90, 65, 80, 45, 75, 60, 85, 50, 70, 40, 65, 55]

  return (
    <div className="flex items-center gap-2.5 mb-1.5 -mx-0.5 rounded-xl bg-brand-50/80 border border-brand-100 px-3 py-2">
      <button onClick={toggle} className="h-8 w-8 rounded-full bg-brand-500 text-white grid place-items-center shrink-0 hover:bg-brand-600 transition">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex items-end gap-[2px] h-6 flex-1">
        {bars.map((h, i) => (
          <span key={i} className={clsx('w-[3px] rounded-full transition-colors', playing && i <= (pos / (dur || 1)) * bars.length ? 'bg-brand-500' : 'bg-brand-200')}
            style={{ height: `${h}%`, ...(playing ? { animation: `pulse 0.8s ease-in-out ${i * 0.07}s infinite alternate` } : {}) }} />
        ))}
      </div>
      <span className="text-[10px] text-ink-muted shrink-0 flex items-center gap-1"><Volume2 className="h-3 w-3" /> {dur ? fmt(pos) + ' / ' + fmt(dur) : 'voz da IA'}</span>
    </div>
  )
}
