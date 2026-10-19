import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { NICHE_LIST } from '@/lib/niches'
import Art from '@/components/ui/Art'
import clsx from 'clsx'

export default function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) { setError('E-mail ou senha inválidos.'); return }
    nav('/app/dashboard')
  }

  return (
    <AuthShell title="Bem-vinda de volta" subtitle="Entre para acompanhar sua IA trabalhando.">
      <form onSubmit={login} className="space-y-4">
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@estudio.com" />
        </div>
        <div>
          <label className="label">Senha</label>
          <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
        </button>
      </form>
      <p className="text-sm text-ink-muted text-center mt-6">
        Ainda não tem conta? <Link to="/cadastro" className="text-brand-600 font-semibold hover:underline">Criar grátis</Link>
      </p>
    </AuthShell>
  )
}

const AUTH_SLIDES = NICHE_LIST.map(n => ({ niche: n, img: `niche-${n.id}` }))
const AUTH_PHRASES = [
  'Ela atende, agenda e cobra enquanto você faz o que ama.',
  'Milhares de mensagens respondidas todos os dias — sem tocar no celular.',
  'Zero cliente esquecido: follow-ups e lembretes automáticos.',
  'Pix, cartão e sinal cobrados direto na conversa.',
  'Do “quanto custa?” ao horário marcado em segundos.',
]

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const [slide, setSlide] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % AUTH_SLIDES.length), 5200)
    return () => clearInterval(t)
  }, [])
  const current = AUTH_SLIDES[slide]
  const phrase = AUTH_PHRASES[slide % AUTH_PHRASES.length]

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] mesh-bg">
      {/* formulário */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12 relative overflow-hidden">
        <div className="orb bg-brand-200 h-64 w-64 -bottom-20 -left-20" />
        <Art name="hero-textura" className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-40" />
        <Link to="/" className="flex items-center gap-2.5 mb-10 relative">
          <Art name="logo" className="h-9 w-9 rounded-xl object-cover shadow-soft" placeholderClass="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl font-bold">IAstetic</span>
        </Link>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="w-full max-w-sm relative card-lux !bg-surface/85 backdrop-blur p-7 shadow-card">
          <h1 className="h-display text-3xl">{title}</h1>
          <p className="text-ink-muted mt-2 text-sm">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </motion.div>
      </div>

      {/* slideshow de nichos */}
      <div className="hidden lg:block relative overflow-hidden">
        <AnimatePresence mode="sync">
          <motion.img key={current.img} src={`/imagens/${current.img}.png`} alt={current.niche.name}
            initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="absolute inset-0 w-full h-full object-cover" />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/30 to-ink/20" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/25 to-transparent mix-blend-multiply" />

        {/* topo: marca */}
        <div className="absolute top-8 right-10 flex items-center gap-2 text-white/90">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs uppercase tracking-[0.2em] font-medium">IAstetic</span>
        </div>

        {/* rodapé: frase rotativa + nicho + dots */}
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <AnimatePresence mode="wait">
            <motion.div key={slide}
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45 }}>
              <span className="badge bg-white/15 backdrop-blur text-white text-[11px] ring-1 ring-white/25 mb-4 inline-flex">
                Feito para {current.niche.name}
              </span>
              <h2 className="font-display text-3xl font-semibold leading-tight max-w-md drop-shadow-md">{phrase}</h2>
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-1.5 mt-6">
            {AUTH_SLIDES.map((s, i) => (
              <button key={s.niche.id} onClick={() => setSlide(i)} aria-label={s.niche.name}
                className={clsx('h-1.5 rounded-full transition-all', i === slide ? 'w-8 bg-white' : 'w-3 bg-white/40 hover:bg-white/60')} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
