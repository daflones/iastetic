import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { NICHES, NICHE_LIST, applyNicheTheme, type NicheId } from '@/lib/niches'
import Art from '@/components/ui/Art'
import clsx from 'clsx'

const DAYS = [
  { key: 'sun', label: 'Dom' }, { key: 'mon', label: 'Seg' }, { key: 'tue', label: 'Ter' },
  { key: 'wed', label: 'Qua' }, { key: 'thu', label: 'Qui' }, { key: 'fri', label: 'Sex' }, { key: 'sat', label: 'Sáb' },
]

interface Svc { name: string; duration_min: number; price: number; category: string }

export default function OnboardingPage() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [niche, setNiche] = useState<NicheId | null>(null)
  const [company, setCompany] = useState({ name: '', whatsapp_public: '', address: '', city: '', state: '', instagram: '' })
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [services, setServices] = useState<Svc[]>([])
  const [professionals, setProfessionals] = useState<string[]>([''])
  const [hours, setHours] = useState<Record<string, [string, string][] | null>>({
    sun: null, mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']],
    thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [['09:00', '14:00']],
  })
  const [ai, setAi] = useState({ name: 'Íris', tone: '', allowed: '', forbidden: '' })

  const n = niche ? NICHES[niche] : null

  const steps = useMemo(() => {
    const list = [
      { id: 'niche', title: 'Seu negócio' },
      { id: 'company', title: 'Dados' },
      { id: 'extra', title: 'Detalhes' },
      { id: 'services', title: 'Serviços' },
      { id: 'pros', title: 'Equipe' },
      { id: 'hours', title: 'Horários' },
      { id: 'ai', title: 'Sua IA' },
    ]
    return list
  }, [])

  function pickNiche(id: NicheId) {
    setNiche(id); applyNicheTheme(id)
    setServices(NICHES[id].starterServices.map(s => ({ ...s })))
    setAi(a => ({ ...a, name: NICHES[id].aiNameSuggestions[0], tone: NICHES[id].toneSuggestions[0] }))
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada. Faça login novamente.')
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
      const pros = professionals.map(p => p.trim()).filter(Boolean)
      if (pros.length) {
        await supabase.from('professionals').insert(pros.map(name => ({ company_id: comp.id, name, active: true })))
      }
      await refresh()
      nav('/app/whatsapp?onboarding=1')
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <Art name="logo" className="h-9 w-9 rounded-xl object-cover shadow-soft" placeholderClass="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl font-bold">IAstetic</span>
        </div>

        {/* progress */}
        <div className="flex items-center gap-1.5 mb-8 justify-center">
          {steps.map((s, i) => (
            <div key={s.id} className={clsx('h-1.5 rounded-full transition-all', i <= step ? 'bg-brand-500' : 'bg-line', i === step ? 'w-8' : 'w-4')} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: .25 }}
            className="card-lux p-6 sm:p-8">
            <h1 className="h-display text-2xl">{steps[step].title}</h1>

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
                  <input className="input" value={company.whatsapp_public} onChange={e => setCompany({ ...company, whatsapp_public: e.target.value })} placeholder="(11) 99999-9999" /></div>
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
                <p className="text-sm text-ink-muted">Quem atende no local? A IA agenda considerando a agenda de cada {n?.professionalLabel.toLowerCase() ?? 'profissional'}.</p>
                {professionals.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input" placeholder={`Nome do(a) ${n?.professionalLabel.toLowerCase() ?? 'profissional'}`} value={p}
                      onChange={e => setProfessionals(professionals.map((x, j) => j === i ? e.target.value : x))} />
                    <button className="btn-ghost !p-2" onClick={() => setProfessionals(professionals.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button className="btn-secondary text-xs" onClick={() => setProfessionals([...professionals, ''])}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>
            )}

            {step === 5 && (
              <div className="mt-6 space-y-2.5">
                <p className="text-sm text-ink-muted">A IA só oferece horários dentro do seu expediente.</p>
                {DAYS.map(d => {
                  const ranges = hours[d.key]
                  return (
                    <div key={d.key} className="flex items-center gap-3 rounded-xl border border-line px-4 py-2.5">
                      <label className="flex items-center gap-2 text-sm font-medium w-16">
                        <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={!!ranges}
                          onChange={e => setHours({ ...hours, [d.key]: e.target.checked ? [['09:00', '18:00']] : null })} />
                        {d.label}
                      </label>
                      {ranges ? ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-sm">
                          <input type="time" className="input !w-[110px] !py-1.5" value={r[0]} onChange={e => setHours({ ...hours, [d.key]: ranges.map((x, j) => j === i ? [e.target.value, x[1]] as [string, string] : x) })} />
                          <span className="text-ink-muted">–</span>
                          <input type="time" className="input !w-[110px] !py-1.5" value={r[1]} onChange={e => setHours({ ...hours, [d.key]: ranges.map((x, j) => j === i ? [x[0], e.target.value] as [string, string] : x) })} />
                        </div>
                      )) : <span className="text-xs text-ink-muted">fechado</span>}
                    </div>
                  )
                })}
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

            {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

            <div className="mt-8 flex items-center justify-between">
              <button className="btn-ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || busy}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <button className="btn-primary" onClick={next} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === steps.length - 1 ? <>Concluir e conectar WhatsApp <Check className="h-4 w-4" /></> : <>Continuar <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
