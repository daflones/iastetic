import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BatteryCharging, Check, CreditCard, Crown, Loader2, Sparkles, TrendingUp, Wallet, X, Zap } from 'lucide-react'
import { supabase, callFn, brl } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Plan } from '@/lib/types'
import { QRCodeSVG } from 'qrcode.react'
import clsx from 'clsx'

function planGains(p: Plan): string[] {
  const out: string[] = []
  const f = p.features ?? {}
  if (f.followups) out.push('Follow-ups automáticos')
  if (f.payments) out.push('Cobranças no chat')
  if (f.audio) out.push('IA responde com áudio')
  if (f.images) out.push('IA envia imagens')
  if (f.assistant) out.push('Assistente de negócio')
  return out
}

/** O que o plano `p` tem a mais que `cur` — pra mostrar "upgrade vale a pena". */
function upgradeGains(p: Plan, cur: Plan | null): string[] {
  if (!cur) return []
  const gains: string[] = []
  if ((p.instances_limit ?? 0) > (cur.instances_limit ?? 0)) gains.push(`+${p.instances_limit - (cur.instances_limit ?? 0)} número(s) de WhatsApp`)
  if ((p.professionals_limit ?? 0) > (cur.professionals_limit ?? 0)) gains.push(`+${p.professionals_limit - (cur.professionals_limit ?? 0)} profissionais`)
  if ((p.monthly_messages_limit ?? 0) > (cur.monthly_messages_limit ?? 0)) gains.push(`+${(((p.monthly_messages_limit ?? 0) - (cur.monthly_messages_limit ?? 0)) / 1000).toFixed(0)}k mensagens/mês`)
  if ((p.image_quota ?? 0) > (cur.image_quota ?? 0)) gains.push(`+${(p.image_quota ?? 0) - (cur.image_quota ?? 0)} imagens IA/mês`)
  if ((p.assistant_audio_quota ?? 0) > (cur.assistant_audio_quota ?? 0)) gains.push(`+${(p.assistant_audio_quota ?? 0) - (cur.assistant_audio_quota ?? 0)} áudios assistente/mês`)
  if ((p.customer_audio_quota ?? 0) > (cur.customer_audio_quota ?? 0)) gains.push(`+${(p.customer_audio_quota ?? 0) - (cur.customer_audio_quota ?? 0)} áudios p/ clientes/mês`)
  const curF = new Set(planGains(cur))
  for (const g of planGains(p)) if (!curF.has(g)) gains.push(g)
  return gains
}

export default function PlansPage() {
  const { company, plan } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [yearly, setYearly] = useState(false)
  const [paying, setPaying] = useState<{ plan: Plan; period: 'monthly' | 'yearly' } | null>(null)
  const [quota, setQuota] = useState<any>(null)
  const [recharge, setRecharge] = useState<string | null>(null)

  async function loadQuota() {
    const r = await callFn<any>('payments', { action: 'quota_status' }).catch(() => null)
    setQuota(r)
  }

  useEffect(() => {
    if (!company) return
    supabase.from('plans').select('*').eq('active', true).or(`niche.is.null,niche.eq.${company.niche}`).order('sort')
      .then(({ data }) => setPlans((data as Plan[]) ?? []))
    loadQuota()
  }, [company?.id])

  if (!company) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-display text-2xl sm:text-3xl">Meu Plano</h1>
      </div>

      {/* Seu plano atual */}
      {plan ? (() => {
        const until = company.subscription_until ? new Date(company.subscription_until) : null
        const daysLeft = until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000)) : null
        const expired = until ? until.getTime() < Date.now() : false
        return (
          <div className="card-lux p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-brand-50 via-transparent to-accent-100/50 pointer-events-none" />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-400 to-accent-500 grid place-items-center text-white shrink-0">
                {plan.slug === 'premium' ? <Crown className="h-6 w-6" /> : plan.slug === 'pro' ? <Zap className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs text-ink-muted uppercase tracking-wider">Seu plano</p>
                <p className="font-display font-bold text-xl">{plan.name} <span className="text-sm font-normal text-ink-muted">{brl(plan.price_cents)}/mês</span></p>
              </div>
              <div className="text-right">
                <span className={clsx('badge', expired ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700')}>
                  {expired ? 'expirado' : company.subscription_status === 'trial' ? 'teste grátis' : 'ativo'}
                </span>
                {until && (
                  <p className={clsx('text-xs mt-1.5', expired ? 'text-red-500 font-semibold' : daysLeft! <= 5 ? 'text-amber-600 font-semibold' : 'text-ink-muted')}>
                    {expired ? `expirou em ${until.toLocaleDateString('pt-BR')}` : `renova em ${until.toLocaleDateString('pt-BR')} — faltam ${daysLeft} dias`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })() : (
        <div className="card-lux p-5 text-sm text-ink-soft">Você ainda não tem plano — escolha abaixo pra ativar o atendimento da IA.</div>
      )}

      {/* uso do plano + recargas */}
      {quota?.plan && (
        <div className="card-lux p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold flex items-center gap-2"><BatteryCharging className="h-4 w-4 text-brand-500" /> Uso do plano este mês</p>
              <p className="text-xs text-ink-muted mt-0.5">Estourou? Recarregue sem trocar de plano — 30% do valor do plano = +25% do recurso.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {Object.entries(quota.resources ?? {}).map(([key, r]: [string, any]) => {
              const pct = r.limit > 0 ? Math.min(100, (r.used / r.limit) * 100) : 0
              const out = r.used >= r.limit && r.credits <= 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-ink-soft">{r.label}</span>
                      <span className={clsx('font-semibold', out ? 'text-red-500' : 'text-ink')}>
                        {r.used}/{r.limit}{r.credits > 0 && <span className="text-brand-600"> +{r.credits} créd.</span>}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-brand-50 overflow-hidden">
                      <div className={clsx('h-full rounded-full transition-all', out ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-gradient-to-r from-brand-400 to-brand-600')} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button className="btn-outline !py-1 !px-2.5 text-[11px] shrink-0" onClick={() => setRecharge(key)}>+ recarga</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display font-semibold text-lg">Conheça outros planos</h2>
        <div className="inline-flex items-center rounded-full bg-brand-50 p-1 ring-1 ring-brand-200">
          {(['Mensal', 'Anual'] as const).map(l => {
            const active = yearly === (l === 'Anual')
            return (
              <button key={l} onClick={() => setYearly(l === 'Anual')}
                className={clsx('px-4 py-1.5 rounded-full text-xs font-semibold transition-all', active ? 'bg-brand-600 text-white shadow-soft' : 'text-ink-muted hover:text-ink')}>
                {l}{l === 'Anual' && <span className={clsx('ml-1.5 text-[9px]', active ? 'text-white/90' : 'text-emerald-600')}>economize</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {plans.map((p, i) => {
          const current = p.id === plan?.id
          const hot = p.slug === 'pro'
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.09, duration: 0.4 }}
              whileHover={!current ? { y: -4 } : undefined}
              className={clsx('card-lux p-6 flex flex-col relative', hot && 'ring-2 ring-brand-500 shadow-glow overflow-visible', current && 'ring-1 ring-brand-300')}>
              {hot && <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[10px] px-3 py-1 shadow-soft z-10"><Sparkles className="h-3 w-3" /> Mais popular</span>}
              {hot && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-brand-50/60 to-transparent pointer-events-none" />}
              <div className="flex items-center gap-2 relative">
                {p.slug === 'premium' ? <Crown className="h-5 w-5 text-accent-500" /> : hot ? <Zap className="h-5 w-5 text-brand-500" /> : <Sparkles className="h-5 w-5 text-ink-muted" />}
                <h3 className="font-display font-semibold text-lg">{p.name}</h3>
              </div>
              <div className="mt-3 relative">
                {(() => {
                  const yearlyPrice = p.yearly_price_cents ?? p.price_cents * 12
                  const monthlyEq = Math.round(yearlyPrice / 12)
                  const pctOff = Math.round((1 - yearlyPrice / (p.price_cents * 12)) * 100)
                  return (
                    <>
                      <span className="font-display text-4xl font-bold">{brl(yearly ? monthlyEq : p.price_cents)}</span>
                      <span className="text-sm text-ink-muted">/mês</span>
                      {yearly && <span className="block text-[11px] text-ink-muted">cobrado {brl(yearlyPrice)}/ano{pctOff > 0 && <b className="text-emerald-600"> · economize {pctOff}%</b>}</span>}
                      {!yearly && p.yearly_price_cents && <span className="block text-[11px] text-accent-700 font-medium">ou {brl(p.yearly_price_cents)}/ano ({pctOff}% off)</span>}
                    </>
                  )
                })()}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-ink-soft flex-1">
                <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> {p.instances_limit} número(s) de WhatsApp</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> Chat em tempo real + agenda</li>
                {p.features?.followups && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> Follow-ups automáticos</li>}
                {p.features?.payments && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> Cobranças no chat (Pix/cartão)</li>}
                {p.features?.audio && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> IA responde com áudio</li>}
                {p.features?.images && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> IA envia imagens</li>}
                {p.features?.assistant && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> Assistente de negócio</li>}
                {(p.monthly_messages_limit ?? 0) > 0 && <li className="flex gap-2"><Check className="h-4 w-4 text-brand-500 shrink-0" /> Até {(p.monthly_messages_limit / 1000).toFixed(0)}k mensagens/mês</li>}
              </ul>
              {!current && (() => {
                const gains = upgradeGains(p, plan)
                if (!gains.length) return null
                return (
                  <div className="mt-4 rounded-xl bg-accent-100/60 ring-1 ring-accent-300/50 p-3">
                    <p className="text-[11px] font-semibold text-accent-700">
                      {plan && p.price_cents > plan.price_cents ? `Vindo do ${plan.name}, você ganha:` : 'Diferenciais deste plano:'}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {gains.slice(0, 5).map(g => (
                        <li key={g} className="text-[11px] text-accent-700 flex items-center gap-1.5"><TrendingUp className="h-3 w-3 shrink-0" /> {g}</li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
              {current ? (
                <div className="mt-5 rounded-xl bg-gradient-to-r from-brand-50 to-accent-100 text-brand-700 text-center text-sm font-semibold py-2.5 ring-1 ring-brand-200 flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Seu plano atual</div>
              ) : (
                <button className={clsx('mt-5', hot ? 'btn-primary' : 'btn-outline')} onClick={() => setPaying({ plan: p, period: yearly ? 'yearly' : 'monthly' })}>
                  {plan && p.price_cents < plan.price_cents ? `Trocar para ${p.name}` : `Assinar ${p.name}`}
                </button>
              )}
            </motion.div>
          )
        })}
      </div>

      <div className="card-lux p-5 text-xs text-ink-muted space-y-1.5">
        <p className="font-semibold text-ink text-sm">Como funciona o pagamento</p>
        <p>• Pix: QR na hora, ativa automaticamente quando confirmar.</p>
        <p>• Cartão: checkout seguro Stripe (mensalidade recorrente).</p>
        <p>• Carteira: se você já tem saldo na carteira iastetic, pode pagar com ele.</p>
      </div>

      {paying && <PayModal plan={paying.plan} period={paying.period} companyId={company.id} onClose={() => setPaying(null)} />}
      {recharge && quota && (
        <RechargeModal resource={recharge} info={quota.resources[recharge]} unitPrice={quota.unit_price_cents}
          onClose={(done) => { setRecharge(null); if (done) loadQuota() }} />
      )}
    </div>
  )
}

function RechargeModal({ resource, info, unitPrice, onClose }: { resource: string; info: any; unitPrice: number | null; onClose: (done: boolean) => void }) {
  const [units, setUnits] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pix, setPix] = useState<{ qr: string; total: number } | null>(null)

  const credits = (info?.per_unit_credits ?? 0) * units
  const total = (unitPrice ?? 0) * units

  async function pay(m: 'pix' | 'card') {
    setBusy(true); setError('')
    try {
      const r = await callFn<{ checkout_url?: string; qr_code?: string; credits: number }>('payments', {
        action: 'quota_topup', resource, units, method: m,
      })
      if (m === 'card') { window.location.href = r.checkout_url!; return }
      setPix({ qr: r.qr_code!, total })
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(false)}>
      <div className="card-lux w-full max-w-sm p-6 anim-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg">Recarregar {info?.label}</h3>
            <p className="text-xs text-ink-muted">cada unidade = +{info?.per_unit_credits} créditos por {unitPrice != null ? brl(unitPrice) : '—'} (30% do plano)</p>
          </div>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>

        {!pix ? (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1.5"><span className="text-ink-soft">Unidades</span><b>{units}× → +{credits} créditos</b></div>
              <input type="range" min={1} max={10} value={units} onChange={e => setUnits(+e.target.value)} className="w-full accent-brand-600" />
            </div>
            <p className="text-center font-display text-2xl font-bold">{total ? brl(total) : '—'}</p>
            <button className="w-full card !border-brand-300 hover:!border-brand-500 p-4 flex items-center gap-3 text-left transition" disabled={busy || !total} onClick={() => pay('pix')}>
              <span className="h-9 w-9 rounded-lg bg-emerald-100 grid place-items-center text-emerald-600 font-bold text-xs">PIX</span>
              <div><p className="font-semibold text-sm">Pix — créditos na hora</p><p className="text-xs text-ink-muted">QR Code, aplica automaticamente</p></div>
            </button>
            <button className="w-full card !border-line hover:!border-brand-400 p-4 flex items-center gap-3 text-left transition" disabled={busy || !total} onClick={() => pay('card')}>
              <span className="h-9 w-9 rounded-lg bg-indigo-100 grid place-items-center text-indigo-600"><CreditCard className="h-4 w-4" /></span>
              <div><p className="font-semibold text-sm">Cartão de crédito</p><p className="text-xs text-ink-muted">checkout seguro Stripe</p></div>
            </button>
            {busy && <p className="text-center text-xs text-ink-muted flex items-center justify-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> gerando cobrança…</p>}
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-2xl border border-line bg-white p-4"><QRCodeSVG value={pix.qr} size={200} /></div>
            <p className="font-display font-bold text-xl">{brl(pix.total)}</p>
            <textarea readOnly className="input text-[10px] h-20 font-mono" value={pix.qr} onClick={e => (e.target as HTMLTextAreaElement).select()} />
            <p className="text-xs text-ink-muted">Pague no app do banco — os <b>+{credits} créditos</b> entram automaticamente.</p>
            <button className="btn-outline w-full" onClick={() => onClose(true)}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

function PayModal({ plan, period, companyId, onClose }: { plan: Plan; period: 'monthly' | 'yearly'; companyId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pix, setPix] = useState<{ qr: string } | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const amount = period === 'yearly' ? (plan.yearly_price_cents ?? plan.price_cents * 12) : plan.price_cents

  useEffect(() => {
    supabase.from('wallets').select('balance_cents').eq('company_id', companyId).single().then(({ data }) => setWalletBalance(data?.balance_cents ?? 0))
  }, [companyId])

  async function pay(m: 'pix' | 'card' | 'wallet') {
    setBusy(true); setError('')
    try {
      const r = await callFn<{ checkout_url?: string; qr_code?: string }>('payments', { action: 'subscribe', plan_id: plan.id, method: m, period })
      if (m === 'card') { window.location.href = r.checkout_url!; return }
      if (m === 'pix') setPix({ qr: r.qr_code! })
      if (m === 'wallet') onClose()
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="card-lux w-full max-w-sm p-6 anim-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-semibold text-lg">Assinar {plan.name}</h3>
            <p className="text-sm text-ink-muted">{period === 'yearly' ? `${brl(amount)}/ano` : `${brl(amount)}/mês`}</p>
          </div>
          <button className="btn-ghost !p-1.5" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        {!pix ? (
          <div className="space-y-2.5">
            <button className="w-full card !border-brand-300 hover:!border-brand-500 p-4 flex items-center gap-3 text-left transition" disabled={busy} onClick={() => pay('pix')}>
              <span className="h-9 w-9 rounded-lg bg-emerald-100 grid place-items-center text-emerald-600 font-bold text-xs">PIX</span>
              <div><p className="font-semibold text-sm">Pix — ativação imediata</p><p className="text-xs text-ink-muted">QR Code, cai na hora</p></div>
            </button>
            <button className="w-full card !border-line hover:!border-brand-400 p-4 flex items-center gap-3 text-left transition" disabled={busy} onClick={() => pay('card')}>
              <span className="h-9 w-9 rounded-lg bg-indigo-100 grid place-items-center text-indigo-600"><CreditCard className="h-4 w-4" /></span>
              <div><p className="font-semibold text-sm">Cartão de crédito</p><p className="text-xs text-ink-muted">Renova todo mês sozinho (Stripe)</p></div>
            </button>
            <button className="w-full card !border-line hover:!border-brand-400 p-4 flex items-center gap-3 text-left transition disabled:opacity-50" disabled={busy || (walletBalance ?? 0) < amount} onClick={() => pay('wallet')}>
              <span className="h-9 w-9 rounded-lg bg-brand-100 grid place-items-center text-brand-600"><Wallet className="h-4 w-4" /></span>
              <div>
                <p className="font-semibold text-sm">Saldo da carteira</p>
                <p className="text-xs text-ink-muted">
                  {(walletBalance ?? 0) >= amount ? `você tem ${brl(walletBalance ?? 0)}` : `faltam ${brl(amount - (walletBalance ?? 0))} — deposite por Pix`}
                </p>
              </div>
            </button>
            {busy && <p className="text-center text-xs text-ink-muted flex items-center justify-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> processando…</p>}
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-2xl border border-line bg-white p-4"><QRCodeSVG value={pix.qr} size={200} /></div>
            <p className="font-display font-bold text-xl">{brl(amount)}</p>
            <textarea readOnly className="input text-[10px] h-20 font-mono" value={pix.qr} onClick={e => (e.target as HTMLTextAreaElement).select()} />
            <p className="text-xs text-ink-muted">Pague no app do banco — seu plano ativa automaticamente.</p>
            <button className="btn-outline w-full" onClick={onClose}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}
