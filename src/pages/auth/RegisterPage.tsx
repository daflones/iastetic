import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AuthShell } from './LoginPage'
import { isValidEmail, isValidPhoneBR, maskPhoneBR } from '@/lib/validators'
import PasswordInput from '@/components/ui/PasswordInput'

export default function RegisterPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  async function register(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(form.email)) { setError('Use um e-mail de provedor conhecido (gmail, outlook, icloud, yahoo…).'); return }
    if (form.phone && !isValidPhoneBR(form.phone)) { setError('WhatsApp inválido — use DDD + número, ex.: (11) 99999-9999.'); return }
    if (form.password !== form.confirm) { setError('As senhas não conferem — digite a mesma nos dois campos.'); return }
    setBusy(true); setError('')
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name, phone: form.phone } },
    })
    if (error) {
      setBusy(false)
      setError(error.message.includes('already') ? 'Este e-mail já está cadastrado. Faça login.' : error.message)
      return
    }
    if (data.session) { nav('/onboarding'); return }
    setEmailSent(true)
  }

  if (emailSent) {
    return (
      <AuthShell title="Confirme seu e-mail" subtitle="Enviamos um link de confirmação. Clique nele e depois entre para continuar.">
        <Link to="/login" className="btn-primary w-full">Ir para o login</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Crie sua conta grátis" subtitle="7 dias de teste, sem cartão. Em 5 minutos sua IA está atendendo.">
      <form onSubmit={register} className="space-y-4">
        <div>
          <label className="label">Seu nome</label>
          <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ana Souza" />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="voce@estudio.com" />
        </div>
        <div>
          <label className="label">WhatsApp</label>
          <input className="input" inputMode="numeric" required value={form.phone} onChange={e => setForm({ ...form, phone: maskPhoneBR(e.target.value) })} placeholder="(11) 99999-9999" maxLength={15} />
        </div>
        <div>
          <label className="label">Senha</label>
          <PasswordInput className="input" required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="mínimo 6 caracteres" autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Confirmar senha</label>
          <PasswordInput className="input" required minLength={6} value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} placeholder="repita a senha" autoComplete="new-password" />
          {form.confirm && form.password !== form.confirm && <p className="text-[11px] text-red-500 mt-1">As senhas não conferem.</p>}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Criar conta e configurar minha IA
        </button>
        <p className="text-[11px] text-ink-muted text-center">Ao criar a conta você concorda com os termos de uso.</p>
      </form>
      <p className="text-sm text-ink-muted text-center mt-6">
        Já tem conta? <Link to="/login" className="text-brand-600 font-semibold hover:underline">Entrar</Link>
      </p>
    </AuthShell>
  )
}
