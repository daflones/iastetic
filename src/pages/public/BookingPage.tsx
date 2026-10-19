import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, CalendarDays, Check, ChevronRight, Clock, Camera, Loader2,
  MapPin, Phone, Search, Scissors, Sparkles, Star, User, Wifi, Car,
  Accessibility, Baby, CreditCard, Coffee, Tv, Cigarette,
} from 'lucide-react'
import { supabase, callFn, brl } from '@/lib/supabase'
import { applyNicheTheme, NICHES, isNiche } from '@/lib/niches'
import NicheArt from '@/components/ui/NicheArt'
import { QRCodeSVG } from 'qrcode.react'
import { maskPhoneBR } from '@/lib/validators'
import clsx from 'clsx'

const AMENITIES: [string, string, typeof Wifi][] = [
  ['wifi', 'Wi-Fi', Wifi], ['parking', 'Estacionamento', Car], ['accessibility', 'Acessibilidade', Accessibility],
  ['kids', 'Atende crianças', Baby], ['reception', 'Recepção', Star], ['drinks', 'Bebidas', Coffee],
  ['entertainment', 'Entretenimento', Tv], ['smoking_area', 'Fumodromo', Cigarette],
]
const PAY_METHODS: [string, string][] = [
  ['cash', 'Dinheiro'], ['debit', 'Débito'], ['credit', 'Crédito'], ['pix', 'Pix'],
  ['paylink', 'Link de pagamento'], ['check', 'Cheque'], ['boleto', 'Boleto'], ['transfer', 'Transferência'],
]
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

type PubCompany = any
type Step = 'service' | 'professional' | 'datetime' | 'form' | 'payment' | 'done'

export default function BookingPage() {
  const { slug } = useParams()
  const [company, setCompany] = useState<PubCompany | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'servicos' | 'detalhes' | 'equipe'>('servicos')
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<Step>('service')
  const [service, setService] = useState<any>(null)
  const [prof, setProf] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState<any>(null)
  const [slots, setSlots] = useState<any[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    supabase.rpc('public_company', { p_slug: slug }).then(({ data }) => {
      if (!data) { setNotFound(true); return }
      setCompany(data)
      applyNicheTheme(data.niche)
      document.title = `${data.name} — Agendamento`
    })
    return () => { applyNicheTheme('estetica'); document.title = 'IAstetic' }
  }, [slug])

  useEffect(() => {
    if (!date || !service) return
    setSlotsLoading(true); setSlot(null)
    callFn<any[]>('public-booking', { action: 'availability', slug, service_id: service.id, date, professional_name: prof })
      .then(setSlots).catch(() => setSlots([])).finally(() => setSlotsLoading(false))
  }, [date, prof, service?.id])

  const days = useMemo(() => {
    const out: { key: string; label: string; num: string; open: boolean }[] = []
    const hours = company?.business_hours ?? {}
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() + i * 86400000)
      const iso = d.toISOString().slice(0, 10)
      const ranges = hours[WEEKDAY_KEYS[d.getDay()]] ?? []
      out.push({ key: iso, label: DAY_NAMES[d.getDay()], num: String(d.getDate()), open: ranges.length > 0 })
    }
    return out
  }, [company])

  const services = useMemo(() => {
    const list = company?.services ?? []
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((s: any) => s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q))
  }, [company, query])

  const categories = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const s of services) {
      const c = s.category || 'Serviços'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(s)
    }
    return [...map.entries()]
  }, [services])

  const cfg = company?.booking_config ?? {}
  const niche = company && isNiche(company.niche) ? NICHES[company.niche as keyof typeof NICHES] : null

  async function confirm() {
    setBusy(true); setError('')
    try {
      const r = await callFn<any>('public-booking', {
        action: 'book', slug, service_id: service.id, start: slot.start.slice(0, 16).replace('T', ' '),
        professional_name: prof, name: form.name, phone: form.phone, notes: form.notes,
      })
      setResult(r)
      setStep(r.deposit ? 'payment' : 'done')
      if (r.deposit?.checkout_url) window.location.href = r.deposit.checkout_url
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  if (notFound) return (
    <div className="min-h-screen bg-canvas grid place-items-center p-6 text-center">
      <div>
        <Scissors className="h-10 w-10 text-brand-400 mx-auto mb-3" />
        <h1 className="font-display text-2xl font-bold">Página não encontrada</h1>
        <p className="text-sm text-ink-muted mt-2">Verifique o link de agendamento.</p>
      </div>
    </div>
  )
  if (!company) return (
    <div className="min-h-screen bg-canvas grid place-items-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
    </div>
  )

  const amenitiesOn = AMENITIES.filter(([k]) => cfg.amenities?.[k])
  const payOn = PAY_METHODS.filter(([k]) => cfg.payment_methods?.[k])

  return (
    <div className="min-h-screen bg-canvas pb-28 sm:pb-10">
      {/* hero */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        {company.cover_url
          ? <img src={company.cover_url} className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />
        {cfg.banner_text && <p className="absolute top-4 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-white/70">{cfg.banner_text}</p>}
      </div>

      {/* card identidade */}
      <div className="max-w-2xl mx-auto px-4 -mt-16 relative z-10">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="card-lux p-5 shadow-glow">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 border-4 border-surface shadow-soft overflow-hidden grid place-items-center shrink-0">
              {company.logo_url ? <img src={company.logo_url} className="h-full w-full object-cover" /> : <span className="font-display font-bold text-2xl text-brand-600">{company.name[0]}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl font-bold truncate">{company.name}</h1>
              <p className="text-xs text-ink-muted flex items-center gap-1 mt-0.5">
                {niche && <NicheArt id={niche.id} className="h-4 w-4 rounded-full" />} {niche?.name}
                {company.city && <> • <MapPin className="h-3 w-3" /> {company.city}{company.state ? `/${company.state}` : ''}</>}
              </p>
              <div className="flex gap-2 mt-2">
                {company.whatsapp_public && <a href={`https://wa.me/55${company.whatsapp_public.replace(/\D/g, '')}`} target="_blank" className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center hover:scale-110 transition"><Phone className="h-3.5 w-3.5" /></a>}
                {company.instagram && <a href={`https://instagram.com/${company.instagram.replace('@', '')}`} target="_blank" className="h-8 w-8 rounded-full bg-pink-50 text-pink-600 grid place-items-center hover:scale-110 transition"><Camera className="h-3.5 w-3.5" /></a>}
                {(cfg.socials?.facebook || cfg.socials?.tiktok) && <span className="text-[10px] text-ink-muted self-center">{[cfg.socials?.facebook && 'Facebook', cfg.socials?.tiktok && 'TikTok'].filter(Boolean).join(' • ')}</span>}
              </div>
            </div>
          </div>
        </motion.div>

        {/* tabs */}
        <div className="flex gap-1 mt-5 border-b border-line">
          {([['servicos', 'Serviços'], ['detalhes', 'Detalhes'], ['equipe', 'Profissionais']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={clsx('px-4 py-2.5 text-sm font-medium relative transition', tab === k ? 'text-brand-600' : 'text-ink-muted hover:text-ink')}>
              {l}
              {tab === k && <motion.span layoutId="tabline" className="absolute inset-x-2 -bottom-px h-0.5 bg-brand-500 rounded-full" />}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'servicos' && (
            <motion.div key="sv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-6">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input className="input pl-10 !rounded-full" placeholder="Pesquisar serviços" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              {categories.map(([cat, list]) => (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2.5">{cat}</p>
                  <div className="space-y-2.5">
                    {list.map((s: any, i: number) => (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="card-lux p-4 flex items-center gap-4 hover:shadow-soft transition-shadow">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{s.name}</p>
                          {s.description && <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{s.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-muted">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.duration_min} min</span>
                            <span className="font-semibold text-brand-600 text-sm">{brl(s.price_cents)}</span>
                          </div>
                        </div>
                        <button className="btn-primary !py-2 text-xs shrink-0" onClick={() => { setService(s); setStep('professional'); setProf(null); setDate(''); setSlot(null) }}>
                          Agendar
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
              {services.length === 0 && <p className="text-center text-sm text-ink-muted py-10">Nenhum serviço encontrado.</p>}
            </motion.div>
          )}

          {tab === 'detalhes' && (
            <motion.div key="dt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
              {company.address && (
                <div className="card-lux p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Endereço</p>
                  <p className="text-sm">{company.address}{company.city ? ` — ${company.city}${company.state ? `/${company.state}` : ''}` : ''}</p>
                  {cfg.maps_url && <a href={cfg.maps_url} target="_blank" className="text-xs text-brand-600 hover:underline mt-1.5 inline-block">Ver no Google Maps →</a>}
                </div>
              )}
              <div className="card-lux p-4">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Horário de atendimento</p>
                <div className="space-y-1 text-sm">
                  {WEEKDAY_KEYS.map((k, i) => {
                    const ranges = company.business_hours?.[k] ?? []
                    return (
                      <div key={k} className="flex justify-between">
                        <span className="text-ink-muted">{DAY_NAMES[i]}</span>
                        <span className={ranges.length ? '' : 'text-ink-muted/60'}>{ranges.length ? ranges.map((r: string[]) => `${r[0]}–${r[1]}`).join(' e ') : 'fechado'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {amenitiesOn.length > 0 && (
                <div className="card-lux p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Comodidades</p>
                  <div className="grid grid-cols-2 gap-2">
                    {amenitiesOn.map(([k, label, Icon]) => (
                      <div key={k} className="flex items-center gap-2 text-sm text-ink-soft"><Icon className="h-4 w-4 text-brand-500" /> {label}</div>
                    ))}
                  </div>
                </div>
              )}
              {payOn.length > 0 && (
                <div className="card-lux p-4">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3 flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Formas de pagamento</p>
                  <div className="flex flex-wrap gap-1.5">
                    {payOn.map(([k, label]) => <span key={k} className="badge bg-brand-50 text-brand-700 text-xs">{label}</span>)}
                  </div>
                </div>
              )}
              {company.extra && Object.entries(company.extra).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="card-lux p-4"><p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">{k}</p><p className="text-sm whitespace-pre-wrap">{String(v)}</p></div>
              ))}
            </motion.div>
          )}

          {tab === 'equipe' && (
            <motion.div key="eq" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 grid sm:grid-cols-2 gap-3">
              {(company.professionals ?? []).map((p: any) => (
                <div key={p.id} className="card-lux p-4 flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-200 to-accent-200 grid place-items-center font-display font-bold text-brand-700">{p.name[0]}</div>
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    {p.specialties?.length > 0 && <p className="text-xs text-ink-muted">{p.specialties.join(' • ')}</p>}
                  </div>
                </div>
              ))}
              {(company.professionals ?? []).length === 0 && <p className="text-sm text-ink-muted col-span-2 text-center py-8">Equipe ainda não cadastrada.</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---------- fluxo de agendamento ---------- */}
      <AnimatePresence>
        {step !== 'service' && service && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setStep('service')}>
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', damping: 26 }}
              className="bg-surface w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[88vh] overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>

              {step !== 'done' && step !== 'payment' && (
                <div className="flex items-center gap-2 mb-4">
                  <button className="btn-ghost !p-1.5" onClick={() => setStep(step === 'form' ? 'datetime' : step === 'datetime' ? 'professional' : 'service')}><ArrowLeft className="h-4 w-4" /></button>
                  <div className="flex-1">
                    <p className="font-display font-semibold">{service.name}</p>
                    <p className="text-xs text-ink-muted">{brl(service.price_cents)} • {service.duration_min} min</p>
                  </div>
                  <Sparkles className="h-4 w-4 text-brand-400" />
                </div>
              )}

              {step === 'professional' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-3">Com quem prefere?</p>
                  <button className={clsx('w-full card p-3.5 text-left flex items-center gap-3 transition', !prof ? 'ring-2 ring-brand-500' : 'hover:border-brand-300')} onClick={() => { setProf(null); setStep('datetime') }}>
                    <User className="h-4 w-4 text-brand-500" /> <span className="text-sm font-medium">Sem preferência</span>
                    {!prof && <Check className="h-4 w-4 text-brand-500 ml-auto" />}
                  </button>
                  {(company.professionals ?? []).filter((p: any) => !service.professional_ids?.length || service.professional_ids.includes(p.id)).map((p: any) => (
                    <button key={p.id} className={clsx('w-full card p-3.5 text-left flex items-center gap-3 transition', prof === p.name ? 'ring-2 ring-brand-500' : 'hover:border-brand-300')}
                      onClick={() => { setProf(p.name); setStep('datetime') }}>
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-200 to-accent-200 grid place-items-center text-sm font-bold text-brand-700">{p.name[0]}</div>
                      <div><p className="text-sm font-medium">{p.name}</p>{p.specialties?.length > 0 && <p className="text-[11px] text-ink-muted">{p.specialties.join(', ')}</p>}</div>
                      {prof === p.name && <Check className="h-4 w-4 text-brand-500 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}

              {step === 'datetime' && (
                <div>
                  <p className="text-sm font-medium mb-3">Escolha o dia</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                    {days.map(d => (
                      <button key={d.key} disabled={!d.open} onClick={() => setDate(d.key)}
                        className={clsx('shrink-0 w-14 rounded-2xl border py-2.5 text-center transition',
                          date === d.key ? 'bg-brand-500 text-white border-brand-500 shadow-soft' : d.open ? 'border-line hover:border-brand-400' : 'border-line/50 opacity-40')}>
                        <p className="text-[10px] uppercase">{d.label}</p>
                        <p className="font-display font-bold text-lg leading-none mt-0.5">{d.num}</p>
                      </button>
                    ))}
                  </div>
                  {date && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-3">Horários {prof ? `com ${prof}` : 'disponíveis'}</p>
                      {slotsLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-brand-500" /></div>
                        : slots.length === 0 ? <p className="text-xs text-ink-muted text-center py-4">Sem horários livres nesse dia — tenta outro?</p>
                        : (
                          <div className="grid grid-cols-4 gap-1.5">
                            {slots.map(s => {
                              const t = new Date(s.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                              return (
                                <button key={s.start} onClick={() => setSlot(s)}
                                  className={clsx('rounded-xl border py-2 text-xs font-medium transition', slot?.start === s.start ? 'bg-brand-500 text-white border-brand-500' : 'border-line hover:border-brand-400')}>
                                  {t}
                                </button>
                              )
                            })}
                          </div>
                        )}
                    </div>
                  )}
                  <button className="btn-primary w-full mt-5" disabled={!slot} onClick={() => setStep('form')}>Continuar <ChevronRight className="h-4 w-4" /></button>
                </div>
              )}

              {step === 'form' && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-800 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    {slot && new Date(slot.start).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {prof && ` • ${prof}`}
                  </div>
                  <div><label className="label">Seu nome *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Como te chamamos?" /></div>
                  <div><label className="label">WhatsApp *</label><input className="input" value={form.phone} inputMode="numeric" maxLength={15} onChange={e => setForm({ ...form, phone: maskPhoneBR(e.target.value) })} placeholder="(21) 99999-0000" /></div>
                  <div><label className="label">Observação (opcional)</label><textarea className="input min-h-[60px]" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Alergias, preferências…" /></div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <button className="btn-primary w-full" onClick={confirm} disabled={busy || !form.name.trim() || form.phone.replace(/\D/g, '').length < 10}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar agendamento
                  </button>
                </div>
              )}

              {step === 'payment' && result?.deposit && (
                <div className="text-center space-y-4">
                  <p className="font-display font-semibold text-lg">Quase lá! Falta o sinal</p>
                  <p className="text-sm text-ink-muted">Para garantir seu horário, pague o sinal de <b>{brl(result.deposit.amount_cents)}</b>. Seu horário fica reservado e confirma sozinho quando o pagamento cair.</p>
                  {result.deposit.qr_code && (
                    <>
                      <div className="rounded-2xl border border-line bg-white p-4 inline-block"><QRCodeSVG value={result.deposit.qr_code} size={180} /></div>
                      <textarea readOnly className="input text-[10px] h-16 font-mono" value={result.deposit.qr_code} onClick={e => (e.target as HTMLTextAreaElement).select()} />
                    </>
                  )}
                  <button className="btn-outline w-full" onClick={() => setStep('done')}>Já paguei / pagar depois</button>
                </div>
              )}

              {step === 'done' && (
                <div className="text-center space-y-4 py-4">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }}
                    className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center mx-auto"><Check className="h-8 w-8" /></motion.div>
                  <p className="font-display font-bold text-xl">{result?.status === 'confirmed' ? 'Agendado!' : 'Agendamento solicitado!'}</p>
                  <p className="text-sm text-ink-muted">
                    {service.name} • {slot && new Date(slot.start).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {prof && ` • ${prof}`}
                    {result?.status !== 'confirmed' && <><br />O estabelecimento confirma em breve pelo seu WhatsApp.</>}
                  </p>
                  {company.whatsapp_public && <a className="btn-primary w-full inline-flex justify-center" href={`https://wa.me/55${company.whatsapp_public.replace(/\D/g, '')}`} target="_blank">Falar no WhatsApp</a>}
                  <button className="btn-ghost w-full" onClick={() => setStep('service')}>Voltar aos serviços</button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-center text-[10px] text-ink-muted/60 mt-10">Agendamento online por <b>IAstetic</b></p>
    </div>
  )
}
