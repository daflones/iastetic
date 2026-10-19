import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Bot, Check, Clock, Loader2, Lock, Mail, Pencil, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import { supabase, callFn } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { NICHES, NICHE_LIST, applyNicheTheme, type NicheId } from '@/lib/niches'
import Art from '@/components/ui/Art'
import PasswordInput from '@/components/ui/PasswordInput'
import { maskPhoneBR, onlyDigits, isValidEmail } from '@/lib/validators'
import clsx from 'clsx'

const DAYS = [
  { key: 'sun', label: 'Dom' }, { key: 'mon', label: 'Seg' }, { key: 'tue', label: 'Ter' },
  { key: 'wed', label: 'Qua' }, { key: 'thu', label: 'Qui' }, { key: 'fri', label: 'Sex' }, { key: 'sat', label: 'Sáb' },
]
const HOUR_PRESETS = [
  { label: 'Comercial 9h–18h', apply: { mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'], thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: ['09:00', '14:00'], sun: null } },
  { label: 'Estendido 8h–20h', apply: { mon: ['08:00', '20:00'], tue: ['08:00', '20:00'], wed: ['08:00', '20:00'], thu: ['08:00', '20:00'], fri: ['08:00', '20:00'], sat: ['08:00', '18:00'], sun: null } },
  { label: 'Todos os dias', apply: { mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'], thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: ['09:00', '18:00'], sun: ['09:00', '13:00'] } },
]
const PROF_COLORS = ['#a78bfa', '#f472b6', '#fb923c', '#34d399', '#38bdf8', '#facc15', '#f87171', '#94a3b8']

interface Svc { name: string; duration_min: number; price: number; category: string }
interface Pro { name: string; color: string; pin: string }

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function OnboardingPage() {
  const nav = useNavigate()
  const { refresh, company: existingCompany, session } = useAuth() as any
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'choose' | 'manual' | 'ai'>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [account, setAccount] = useState({ email: '', password: '', confirm: '' })
  const [needsConfirm, setNeedsConfirm] = useState(false)

  const [niche, setNiche] = useState<NicheId | null>(null)
  const [company, setCompany] = useState({ name: '', whatsapp_public: '', address: '', city: '', state: '', instagram: '' })
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [services, setServices] = useState<Svc[]>([])
  const [professionals, setProfessionals] = useState<Pro[]>([{ name: '', color: PROF_COLORS[0], pin: '' }])
  const [hours, setHours] = useState<Record<string, [string, string][] | null>>({
    sun: null, mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']],
    thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [['09:00', '14:00']],
  })
  const [ai, setAi] = useState({ name: 'Íris', tone: '', allowed: '', forbidden: '' })

  // chat IA
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)

  const n = niche ? NICHES[niche] : null

  // quem já tem estabelecimento não passa pelo onboarding de novo
  useEffect(() => {
    if (existingCompany) nav('/app', { replace: true })
  }, [existingCompany?.id])

  // volta da confirmação de e-mail: restaura tudo e cai direto na etapa da conta
  useEffect(() => {
    if (!session || existingCompany) return
    try {
      const d = JSON.parse(localStorage.getItem('onboarding_draft') || '')
      if (!d?.niche) return
      pickNiche(d.niche)
      if (d.company) setCompany(d.company)
      if (d.extra) setExtra(d.extra)
      if (d.services?.length) setServices(d.services)
      if (d.professionals?.length) setProfessionals(d.professionals)
      if (d.hours) setHours(d.hours)
      if (d.ai) setAi(d.ai)
      setMode('manual'); setStep(6)
    } catch { /* rascunho inválido — segue o fluxo normal */ }
  }, [session, existingCompany])

  const steps = useMemo(() => [
    { id: 'niche', title: 'Seu negócio' }, { id: 'company', title: 'Dados' }, { id: 'extra', title: 'Detalhes' },
    { id: 'services', title: 'Serviços' }, { id: 'pros', title: 'Equipe' }, { id: 'hours', title: 'Horários' }, { id: 'ai', title: 'Sua IA' },
    ...(session ? [] : [{ id: 'account', title: 'Sua conta' }]),
  ], [session])

  function pickNiche(id: NicheId) {
    setNiche(id); applyNicheTheme(id)
    setServices(NICHES[id].starterServices.map(s => ({ ...s })))
    setAi(a => ({ ...a, name: NICHES[id].aiNameSuggestions[0], tone: NICHES[id].toneSuggestions[0] }))
  }

  /** Aplica patch vindo da IA nos estados do formulário. */
  function applyPatch(p: any) {
    if (!p || typeof p !== 'object') return
    if (p.niche && NICHES[p.niche as NicheId]) pickNiche(p.niche as NicheId)
    setCompany(c => ({ ...c,
      name: p.name ?? c.name,
      whatsapp_public: p.whatsapp ? maskPhoneBR(p.whatsapp) : c.whatsapp_public,
      instagram: p.instagram ?? c.instagram, address: p.address ?? c.address,
      city: p.city ?? c.city, state: p.state ? String(p.state).toUpperCase().slice(0, 2) : c.state }))
    if (p.extra) setExtra(e => ({ ...e, ...p.extra }))
    if (Array.isArray(p.services) && p.services.length) setServices(p.services.map((s: any) => ({
      name: String(s.name ?? '').slice(0, 80), duration_min: Math.max(5, +s.duration_min || 60),
      price: Math.max(0, +s.price || 0), category: String(s.category ?? '').slice(0, 40),
    })).filter((s: Svc) => s.name))
    if (Array.isArray(p.professionals) && p.professionals.length) setProfessionals(p.professionals.map((pr: any, i: number) => ({
      name: String(pr.name ?? '').slice(0, 60), color: /^#[0-9a-f]{6}$/i.test(pr.color) ? pr.color : PROF_COLORS[i % PROF_COLORS.length],
      pin: pr.pin ? onlyDigits(String(pr.pin), 8) : '',
    })).filter((pr: Pro) => pr.name))
    if (p.hours && typeof p.hours === 'object') setHours(h => ({ ...h, ...p.hours }))
    if (p.ai) setAi(a => ({ ...a, name: p.ai.name ?? a.name, tone: p.ai.tone ?? a.tone, forbidden: p.ai.forbidden ?? a.forbidden }))
  }

  const currentState = () => ({
    niche, ...company, extra,
    services: services.map(s => `${s.name} ${s.duration_min}min R$${s.price}`),
    professionals: professionals.map(p => p.name).filter(Boolean),
    hours, ai,
  })

  /** Vai pro chat da IA carregando contexto do que já foi preenchido. */
  function goToAI() {
    setMode('ai')
    if (chat.length) return // conversa já em andamento — mantém
    const filled = niche || company.name
    sendChat(filled
      ? 'Oi! Já preenchi parte do cadastro manualmente — continua de onde parei e me pergunta só o que falta.'
      : 'Oi! Quero configurar meu estabelecimento.')
  }

  /** Volta pro formulário na etapa mais útil pro que ainda falta. */
  function goToManual() {
    setMode('manual')
    if (!niche) setStep(0)
    else if (!company.name.trim()) setStep(1)
    else setStep(3)
  }

  async function sendChat(text: string) {
    const t = text.trim(); if (!t || chatBusy) return
    const history = [...chat, { role: 'user' as const, text: t }]
    setChat(history); setChatInput(''); setChatBusy(true)
    try {
      const r = await callFn<{ say: string; patch: any }>('onboarding-assistant', {
        history: history.map(m => ({ role: m.role, content: m.text })),
        current: currentState(),
      })
      applyPatch(r.patch)
      setChat([...history, { role: 'assistant', text: r.say }])
      if (r.patch?.done) {
        if (!session) {
          setChat([...history, { role: 'assistant', text: `${r.say}

Última etapa: crie seu acesso ao painel — é só e-mail e senha. 👇` }])
          setMode('manual'); setStep(steps.length - 1); setChatBusy(false)
          return
        }
        finish(); return
      }
    } catch (e) {
      setChat([...history, { role: 'assistant', text: `Ops — ${(e as Error).message}. Tenta de novo?` }])
    }
    setChatBusy(false)
    setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  function next() {
    if (step === 0 && !niche) { setError('Escolha o tipo do seu estabelecimento.'); return }
    if (step === 1 && !company.name.trim()) { setError('Informe o nome do estabelecimento.'); return }
    setError('')
    if (step === steps.length - 1) { finish(); return }
    setStep(s => s + 1)
  }

  async function finish() {
    if (!niche) return
    setBusy(true); setError('')
    try {
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // cadastro acontece aqui, no fim do wizard — só e-mail + senha
        if (!isValidEmail(account.email)) throw new Error('Informe um e-mail válido (gmail, outlook, icloud…).')
        if (account.password.length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.')
        if (account.password !== account.confirm) throw new Error('As senhas não conferem.')
        const { data, error: eSign } = await supabase.auth.signUp({ email: account.email.trim(), password: account.password })
        if (eSign) throw new Error(eSign.message.includes('already') ? 'Este e-mail já tem conta — faça login pra continuar.' : eSign.message)
        ;(window as any).fbq?.('track', 'CompleteRegistration')
        if (!data.session) {
          // confirmação de e-mail ativa: guarda o rascunho e retoma depois do login
          localStorage.setItem('onboarding_draft', JSON.stringify({ niche, company, extra, services, professionals, hours, ai }))
          setNeedsConfirm(true); setBusy(false); return
        }
        user = data.user ?? data.session.user
      }
      const { data: comp, error: e1 } = await supabase.from('companies').insert({
        name: company.name.trim(), niche, owner_id: user.id,
        whatsapp_public: company.whatsapp_public || null,
        address: company.address || null, city: company.city || null, state: company.state || null,
        instagram: company.instagram || null, email: user.email,
        extra, business_hours: hours,
        ai_config: {
          name: ai.name || 'Íris', tone: ai.tone || 'Acolhedora e profissional',
          allowed: ai.allowed, forbidden: ai.forbidden,
          send_images: false, send_audio: false, payments_enabled: false,
          language: 'pt-BR', reply_delay_sec: 2, auto_confirm: true,
        },
        onboarding_done: true, onboarding_step: steps.length,
      }).select().single()
      if (e1) throw e1
      if (services.length) {
        await supabase.from('services').insert(services.map((s, i) => ({
          company_id: comp.id, name: s.name, category: s.category, duration_min: s.duration_min,
          price_cents: Math.round(s.price * 100), sort: i, active: true,
        })))
      }
      const pros = professionals.filter(p => p.name.trim())
      if (pros.length) {
        const rows = await Promise.all(pros.map(async p => ({
          company_id: comp.id, name: p.name.trim(), active: true, color: p.color,
          pin_hash: p.pin ? await sha256(p.pin) : null,
        })))
        await supabase.from('professionals').insert(rows)
      }
      localStorage.removeItem('onboarding_draft')
      await refresh()
      nav('/app/whatsapp?onboarding=1')
    } catch (e) {
      const msg = (e as Error).message
      setError(msg.includes('row-level security')
        ? 'Esta conta já tem um estabelecimento cadastrado. Entrando no painel…'
        : msg)
      if (msg.includes('row-level security')) setTimeout(() => { refresh(); nav('/app') }, 1200)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center px-4 py-10">
      {/* fundo vivo — muda com o nicho */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-canvas">
        <AnimatePresence mode="sync">
          <motion.img key={niche ?? 'base'} src={niche ? `/imagens/niche-${niche}.png` : '/imagens/hero-textura.png'}
            initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="absolute inset-0 w-full h-full object-cover" alt="" />
        </AnimatePresence>
        <div className={clsx('absolute inset-0 transition-colors duration-700',
          niche ? 'bg-gradient-to-b from-canvas/60 via-canvas/80 to-canvas/95 backdrop-blur-[2px]' : 'bg-canvas/80 backdrop-blur-sm')} />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-200/30 via-transparent to-accent-200/30" />
      </div>

      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <Art name="logo" className="h-9 w-9 rounded-xl object-cover shadow-soft" placeholderClass="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl font-bold">IAstetic</span>
        </div>

        {/* progress */}
        <div className="flex items-center gap-1.5 mb-6 justify-center">
          {steps.map((s, i) => (
            <button key={s.id} onClick={() => i <= step && setStep(i)} title={s.title}
              className={clsx('h-1.5 rounded-full transition-all', i <= step ? 'bg-brand-500' : 'bg-ink/15', i === step ? 'w-8' : 'w-4')} />
          ))}
        </div>

        {/* confirmação de e-mail — rascunho salvo, volta depois do login */}
        {needsConfirm && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card-lux p-8 sm:p-10 shadow-glow text-center">
            <span className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow"><Mail className="h-6 w-6" /></span>
            <h1 className="h-display text-2xl mt-4">Confirme seu e-mail</h1>
            <p className="text-sm text-ink-muted mt-2 leading-relaxed max-w-sm mx-auto">
              Enviamos um link para <b className="text-ink">{account.email}</b>. Confirme e entre —
              <b className="text-ink"> tudo que você preencheu está salvo</b> e a configuração continua de onde parou.
            </p>
            <Link to="/login" className="btn-primary mt-6 inline-flex">Ir para o login <ArrowRight className="h-4 w-4" /></Link>
            <button onClick={() => setNeedsConfirm(false)} className="block mx-auto mt-3 text-xs text-ink-muted hover:text-ink underline">voltar e corrigir algo</button>
          </motion.div>
        )}

        {/* escolha do modo */}
        {mode === 'choose' && !needsConfirm && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card-lux p-6 sm:p-8 shadow-glow">
            <h1 className="h-display text-2xl text-center">Vamos configurar seu negócio</h1>
            <p className="text-sm text-ink-muted text-center mt-2">Duas formas de fazer isso — escolhe a sua:</p>
            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <button onClick={goToAI}
                className="card-lux p-6 text-left border-2 border-brand-300 hover:border-brand-500 hover:-translate-y-0.5 transition-all group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-50 to-accent-100/50 opacity-70" />
                <div className="relative">
                  <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white grid place-items-center shadow-glow"><Bot className="h-5 w-5" /></span>
                  <p className="font-display font-semibold mt-3">Configurar com a IA</p>
                  <p className="text-xs text-ink-muted mt-1 leading-relaxed">Uma assistente conversa com você e preenche tudo sozinha — nicho, serviços, equipe, horários.</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">recomendado <Sparkles className="h-3.5 w-3.5" /></span>
                </div>
              </button>
              <button onClick={() => setMode('manual')}
                className="card-lux p-6 text-left border-2 border-line hover:border-brand-300 hover:-translate-y-0.5 transition-all">
                <span className="h-11 w-11 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center"><Pencil className="h-5 w-5" /></span>
                <p className="font-display font-semibold mt-3">Preencher manualmente</p>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">Passo a passo com formulários — você controla cada detalhe.</p>
              </button>
            </div>
          </motion.div>
        )}

        {/* modo IA — chat */}
        {mode === 'ai' && !needsConfirm && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card-lux shadow-glow overflow-hidden flex flex-col" style={{ height: '70vh' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink/10 bg-surface/70 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-white grid place-items-center"><Bot className="h-4 w-4" /></span>
                <div>
                  <p className="text-sm font-semibold">{niche ? NICHES[niche].aiNameSuggestions[0] : 'Íris'} · assistente de configuração</p>
                  <p className="text-[10px] text-ink-muted">ela preenche o formulário enquanto conversa</p>
                </div>
              </div>
              <button className="btn-ghost text-xs" onClick={goToManual}><Pencil className="h-3.5 w-3.5" /> preencher manual</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chat.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                    m.role === 'user' ? 'ml-auto bg-brand-600 text-white rounded-br-md' : 'bg-ink/5 rounded-bl-md')}>
                  {m.text}
                </motion.div>
              ))}
              {chatBusy && (
                <div className="flex gap-1 px-4 py-2 bg-ink/5 rounded-2xl rounded-bl-md w-16">
                  {[0, 1, 2].map(i => <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-ink/40" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />)}
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            {/* resumo do que já foi capturado */}
            <div className="px-4 py-2 border-t border-ink/10 flex flex-wrap gap-1.5 bg-surface/60">
              {niche && <span className="badge bg-brand-100 text-brand-700 text-[10px]">{NICHES[niche].name}</span>}
              {company.name && <span className="badge bg-brand-100 text-brand-700 text-[10px]">{company.name}</span>}
              {services.length > 0 && <span className="badge bg-ink/5 text-ink-soft text-[10px]">{services.length} serviços</span>}
              {professionals.filter(p => p.name).length > 0 && <span className="badge bg-ink/5 text-ink-soft text-[10px]">{professionals.filter(p => p.name).length} prof.</span>}
            </div>
            <div className="p-3 border-t border-ink/10 flex gap-2 bg-surface">
              <input className="input flex-1" placeholder="Responde por aqui…" value={chatInput} disabled={busy}
                onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat(chatInput)} />
              <button className="btn-primary !px-4" onClick={() => sendChat(chatInput)} disabled={chatBusy || !chatInput.trim() || busy}>
                {chatBusy || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 text-center pb-2">{error}</p>}
          </motion.div>
        )}

        {/* modo manual — etapas */}
        {mode === 'manual' && !needsConfirm && (
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: .25 }}
              className="card-lux p-6 sm:p-8 shadow-glow">
              <div className="flex items-center justify-between">
                <h1 className="h-display text-2xl">{steps[step].title}</h1>
                <button className="btn-ghost text-xs" onClick={goToAI}><Bot className="h-3.5 w-3.5" /> configurar com IA</button>
              </div>

              {step === 0 && (
                <div className="mt-6 grid sm:grid-cols-2 gap-4">
                  {NICHE_LIST.map(x => (
                    <button key={x.id} onClick={() => pickNiche(x.id)}
                      className={clsx('rounded-2xl border-2 text-left transition-all hover:-translate-y-0.5 overflow-hidden relative',
                        niche === x.id ? 'border-brand-500 shadow-glow' : 'border-line hover:border-brand-300')}>
                      {niche === x.id && (
                        <span className="absolute top-2.5 right-2.5 z-10 h-6 w-6 rounded-full bg-brand-500 text-white grid place-items-center shadow-soft">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <div className="h-28 overflow-hidden">
                        <Art name={`niche-${x.id}`} alt={x.name}
                          className={clsx('w-full h-full object-cover transition-transform duration-500', niche !== x.id && 'opacity-80 saturate-[.85]')}
                          placeholderClass="w-full h-full" />
                      </div>
                      <div className="p-4">
                        <p className="font-semibold">{x.name}</p>
                        <p className="text-xs text-ink-muted mt-1 leading-relaxed line-clamp-2">{x.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 1 && (
                <div className="mt-6 grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className="label">Nome do estabelecimento *</label>
                    <input className="input" value={company.name} onChange={e => setCompany({ ...company, name: e.target.value })} placeholder={`Ex.: Studio ${n?.short ?? 'Beleza'}`} /></div>
                  <div><label className="label">WhatsApp público</label>
                    <input className="input" value={company.whatsapp_public} inputMode="numeric" maxLength={15} onChange={e => setCompany({ ...company, whatsapp_public: maskPhoneBR(e.target.value) })} placeholder="(11) 99999-9999" /></div>
                  <div><label className="label">Instagram</label>
                    <input className="input" value={company.instagram} onChange={e => setCompany({ ...company, instagram: e.target.value })} placeholder="@seu.studio" /></div>
                  <div className="sm:col-span-2"><label className="label">Endereço</label>
                    <input className="input" value={company.address} onChange={e => setCompany({ ...company, address: e.target.value })} placeholder="Rua, número, bairro" /></div>
                  <div><label className="label">Cidade</label>
                    <input className="input" value={company.city} onChange={e => setCompany({ ...company, city: e.target.value })} /></div>
                  <div><label className="label">UF</label>
                    <input className="input" maxLength={2} value={company.state} onChange={e => setCompany({ ...company, state: e.target.value.toUpperCase() })} placeholder="SP" /></div>
                </div>
              )}

              {step === 2 && n && (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-ink-muted">Essas respostas entram no cérebro da sua IA — ela usa para responder clientes com precisão.</p>
                  {n.extraFields.map(f => (
                    <div key={f.key}>
                      <label className="label">{f.label}</label>
                      {f.type === 'textarea'
                        ? <textarea className="input min-h-[90px]" placeholder={f.placeholder} value={extra[f.key] ?? ''} onChange={e => setExtra({ ...extra, [f.key]: e.target.value })} />
                        : f.type === 'select'
                          ? <select className="input" value={extra[f.key] ?? ''} onChange={e => setExtra({ ...extra, [f.key]: e.target.value })}>
                              <option value="">Selecione…</option>
                              {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input className="input" placeholder={f.placeholder} value={extra[f.key] ?? ''} onChange={e => setExtra({ ...extra, [f.key]: e.target.value })} />}
                      {f.hint && <p className="text-[11px] text-ink-muted mt-1">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              )}

              {step === 3 && (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-ink-muted">Sugestões do seu nicho — ajuste preços/duração, remova ou adicione. A IA usa isso para responder “quanto custa?”.</p>
                  {services.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className="input flex-1" value={s.name} onChange={e => setServices(services.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <input className="input w-24" type="number" min={10} step={5} value={s.duration_min} title="min"
                        onChange={e => setServices(services.map((x, j) => j === i ? { ...x, duration_min: +e.target.value } : x))} />
                      <div className="relative w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">R$</span>
                        <input className="input pl-8" type="number" min={0} value={s.price}
                          onChange={e => setServices(services.map((x, j) => j === i ? { ...x, price: +e.target.value } : x))} />
                      </div>
                      <button className="btn-ghost !p-2" onClick={() => setServices(services.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button className="btn-secondary text-xs" onClick={() => setServices([...services, { name: '', duration_min: 60, price: 100, category: '' }])}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar serviço
                  </button>
                </div>
              )}

              {step === 4 && (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-ink-muted">Quem atende no local? A IA agenda considerando a agenda de cada {n?.professionalLabel.toLowerCase() ?? 'profissional'}. Cor e senha são opcionais (senha = assumir conversas no chat).</p>
                  {professionals.map((p, i) => (
                    <div key={i} className="rounded-2xl border border-line p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-9 w-9 rounded-full grid place-items-center text-white text-sm font-semibold shrink-0 shadow-sm" style={{ background: p.color }}>
                          {p.name?.[0]?.toUpperCase() ?? '?'}
                        </span>
                        <input className="input flex-1" placeholder={`Nome do(a) ${n?.professionalLabel.toLowerCase() ?? 'profissional'}`} value={p.name}
                          onChange={e => setProfessionals(professionals.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                        <button className="btn-ghost !p-2" onClick={() => setProfessionals(professionals.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap pl-11">
                        <div className="flex gap-1.5">
                          {PROF_COLORS.map(c => (
                            <button key={c} type="button" onClick={() => setProfessionals(professionals.map((x, j) => j === i ? { ...x, color: c } : x))}
                              className={clsx('h-6 w-6 rounded-full transition-all', p.color === c ? 'ring-2 ring-offset-1 ring-ink scale-110' : 'hover:scale-105')}
                              style={{ background: c }} />
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                          <Lock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          <PasswordInput className="input !py-1.5 text-xs" placeholder="Senha p/ assumir chats (4-8 dígitos, opcional)" inputMode="numeric" maxLength={8}
                            value={p.pin} onChange={e => setProfessionals(professionals.map((x, j) => j === i ? { ...x, pin: onlyDigits(e.target.value, 8) } : x))} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {professionals.length < 3 ? (
                    <button className="btn-secondary text-xs" onClick={() => setProfessionals([...professionals, { name: '', color: PROF_COLORS[professionals.length % PROF_COLORS.length], pin: '' }])}>
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                  ) : (
                    <p className="text-[10px] text-ink-muted">No trial dá pra cadastrar até 3 — nos planos, até 20.</p>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-ink-muted">A IA só oferece horários dentro do seu expediente.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {HOUR_PRESETS.map(p => (
                      <button key={p.label} className="text-xs rounded-full px-3 py-1.5 border border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-400 transition"
                        onClick={() => setHours(Object.fromEntries(Object.entries(p.apply).map(([k, v]) => [k, v ? [v as [string, string]] : null])))}>
                        <Clock className="h-3 w-3 inline mr-1" />{p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-2">
                    {DAYS.map(d => {
                      const ranges = hours[d.key]
                      const open = !!ranges
                      return (
                        <div key={d.key} className={clsx('flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors', open ? 'border-brand-300 bg-brand-50/50' : 'border-line bg-transparent')}>
                          <button onClick={() => setHours({ ...hours, [d.key]: open ? null : [['09:00', '18:00']] })}
                            className={clsx('w-14 text-left text-sm font-semibold rounded-full px-3 py-1 transition-colors', open ? 'bg-brand-500 text-white' : 'bg-ink/5 text-ink-muted')}>
                            {d.label}
                          </button>
                          {open ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              <input type="time" className="input !w-[110px] !py-1.5" value={ranges![0][0]} onChange={e => setHours({ ...hours, [d.key]: [[e.target.value, ranges![0][1]]] })} />
                              <span className="text-ink-muted">–</span>
                              <input type="time" className="input !w-[110px] !py-1.5" value={ranges![0][1]} onChange={e => setHours({ ...hours, [d.key]: [[ranges![0][0], e.target.value]] })} />
                            </div>
                          ) : <span className="text-xs text-ink-muted italic">fechado</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {step === 6 && n && (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-ink-muted">Dê uma personalidade à sua recepcionista. Você pode refinar tudo depois em “Configurar IA”.</p>
                  <div>
                    <label className="label">Nome da IA</label>
                    <input className="input" value={ai.name} onChange={e => setAi({ ...ai, name: e.target.value })} />
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {n.aiNameSuggestions.map(s => (
                        <button key={s} onClick={() => setAi({ ...ai, name: s })}
                          className={clsx('text-xs rounded-full px-3 py-1 border transition', ai.name === s ? 'bg-brand-500 text-white border-brand-500' : 'border-line text-ink-soft hover:border-brand-300')}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label">Tom de voz</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {n.toneSuggestions.map(t => (
                        <button key={t} onClick={() => setAi({ ...ai, tone: t })}
                          className={clsx('text-xs rounded-full px-3 py-1.5 border transition', ai.tone === t ? 'bg-brand-500 text-white border-brand-500' : 'border-line text-ink-soft hover:border-brand-300')}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <input className="input mt-2" value={ai.tone} onChange={e => setAi({ ...ai, tone: e.target.value })} placeholder="Ou descreva: ex. 'educada, usa poucos emojis'" />
                  </div>
                  <div>
                    <label className="label">O que ela NÃO pode falar/fazer</label>
                    <textarea className="input min-h-[70px]" value={ai.forbidden} onChange={e => setAi({ ...ai, forbidden: e.target.value })}
                      placeholder="Ex.: dar descontos, falar de concorrentes, marcar fora do horário…" />
                  </div>
                </div>
              )}

              {steps[step]?.id === 'account' && (
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl bg-brand-50 border border-brand-200/70 p-4 flex gap-3">
                    <Check className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-ink-soft leading-relaxed">
                      <b>Quase lá!</b> Nome e WhatsApp do negócio já foram — aqui é só o <b>seu acesso ao painel</b>: e-mail e senha.
                    </p>
                  </div>
                  <div><label className="label">E-mail *</label>
                    <input type="email" className="input" placeholder="voce@email.com" value={account.email}
                      onChange={e => setAccount({ ...account, email: e.target.value })} /></div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><label className="label">Senha *</label>
                      <PasswordInput value={account.password} onChange={e => setAccount({ ...account, password: e.target.value })} placeholder="mínimo 6 caracteres" /></div>
                    <div><label className="label">Confirmar senha *</label>
                      <PasswordInput value={account.confirm} onChange={e => setAccount({ ...account, confirm: e.target.value })} placeholder="repita a senha" />
                      {account.confirm && account.password !== account.confirm && (
                        <p className="mt-1.5 text-xs text-red-500">As senhas não conferem.</p>)}
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-muted">Ao concluir, criamos sua conta e já configuramos seu estabelecimento com tudo que você respondeu.</p>
                </div>
              )}

              {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

              <div className="mt-8 flex items-center justify-between">
                <button className="btn-ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || busy}>
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <button className="btn-primary" onClick={next} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {step === steps.length - 1
                    ? (session ? <>Concluir e conectar WhatsApp <Check className="h-4 w-4" /></> : <>Criar conta e concluir <Check className="h-4 w-4" /></>)
                    : <>Continuar <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
