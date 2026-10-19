import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { NICHE_LIST } from '@/lib/niches'
import Art from '@/components/ui/Art'
import PasswordInput from '@/components/ui/PasswordInput'
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
          <PasswordInput className="input" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
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
    const t = setInterval(() => setSlide(s => (s + 1) % AUTH_SLIDES.length), 5600)
    return () => clearInterval(t)
  }, [])
  const current = AUTH_SLIDES[slide]
  const phrase = AUTH_PHRASES[slide % AUTH_PHRASES.length]

  return (
    <div className="min-h-screen relative overflow-hidden bg-ink flex flex-col">
      {/* slideshow ambiental em tela cheia */}
      <AnimatePresence mode="sync">
        <motion.img key={current.img} src={`/imagens/${current.img}.png`} alt=""
          initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
          className="absolute inset-0 w-full h-full object-cover" />
      </AnimatePresence>
      {/* véus: escurece nas bordas, respira no centro */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/75 via-ink/55 to-ink/85" />
      <div className="absolute inset-0 bg-gradient-to-br from-brand-700/30 via-transparent to-accent-700/25 mix-blend-multiply" />
      <div className="absolute inset-0 backdrop-blur-[2px]" style={{ maskImage: 'radial-gradient(ellipse 60% 50% at 50% 45%, transparent 40%, black 100%)' }} />

      {/* conteúdo central */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="flex items-center gap-2.5 mb-7">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="h-11 w-11 rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/25 grid place-items-center shadow-glow overflow-hidden">
              <Art name="logo" className="h-8 w-8 rounded-xl object-cover" placeholderClass="h-8 w-8 rounded-xl" />
            </span>
            <span className="font-display text-2xl font-bold text-white drop-shadow">IAstetic</span>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut', delay: 0.08 }}
          className="w-full max-w-sm card-lux !bg-surface/90 backdrop-blur-2xl ring-1 ring-white/40 rounded-3xl p-8 shadow-glow">
          <h1 className="h-display text-3xl">{title}</h1>
          <p className="text-ink-muted mt-2 text-sm">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </motion.div>

        {/* frase rotativa sob o card */}
        <div className="mt-8 text-center px-4 max-w-md">
          <AnimatePresence mode="wait">
            <motion.div key={slide}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}>
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-white/60 font-medium mb-2">
                <Sparkles className="h-3 w-3" /> Feito para {current.niche.name}
              </span>
              <p className="font-display text-lg text-white/90 leading-snug drop-shadow-sm">{phrase}</p>
            </motion.div>
          </AnimatePresence>
          <div className="flex gap-1.5 mt-4 justify-center">
            {AUTH_SLIDES.map((s, i) => (
              <button key={s.niche.id} onClick={() => setSlide(i)} aria-label={s.niche.name}
                className={clsx('h-1.5 rounded-full transition-all', i === slide ? 'w-7 bg-white' : 'w-2.5 bg-white/35 hover:bg-white/60')} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
