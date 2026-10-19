import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, CreditCard, Loader2, Lock, RefreshCw, Shield, X,
  CheckCircle2, XCircle, QrCode, MessageSquareText, Send, Users, Sparkle,
  CalendarDays, Wallet, ChevronRight, Power, BrainCircuit, KeyRound, Crown, Plus, Pencil,
  LayoutDashboard, TrendingUp, TrendingDown, Menu, Activity, Mic, Square, Bot, Image, Volume2,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
} from 'recharts'
import { callFn, brl, fmtDate } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { NICHES } from '@/lib/niches'
import NicheArt from '@/components/ui/NicheArt'
import { useDraft } from '@/hooks/useDraft'
import { useRecorder } from '@/hooks/useRecorder'
import { QRCodeSVG } from 'qrcode.react'
import clsx from 'clsx'

type Tab = 'overview' | 'companies' | 'plans' | 'payments' | 'whatsapp' | 'assistant' | 'integrations' | 'settings'

const NAV: { title: string; items: { id: Tab; label: string; icon: any }[] }[] = [
  {
    title: 'Plataforma',
    items: [
      { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
      { id: 'companies', label: 'Empresas', icon: Building2 },
      { id: 'plans', label: 'Planos', icon: Crown },
      { id: 'payments', label: 'Pagamentos', icon: Wallet },
    ],
  },
  {
    title: 'Operação',
    items: [
      { id: 'whatsapp', label: 'WhatsApp do admin', icon: QrCode },
      { id: 'assistant', label: 'Assistente', icon: BrainCircuit },
      { id: 'integrations', label: 'Integrações', icon: KeyRound },
      { id: 'settings', label: 'Taxas', icon: CreditCard },
    ],
  },
]

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981', trial: '#f59e0b', past_due: '#f97316',
  cancelled: '#ef4444', expired: '#94a3b8', none: '#cbd5e1',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Ativas', trial: 'Trial', past_due: 'Pendentes', cancelled: 'Canceladas', expired: 'Expiradas', none: 'Sem plano',
}

function Trend({ cur, prev }: { cur: number; prev?: number }) {
  if (prev === undefined) return null
  const pct = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0
  const up = pct >= 0
  return (
    <span className={clsx('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
      up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

const CHART_TIP = {
  contentStyle: { borderRadius: 12, border: '1px solid rgb(var(--line))', fontSize: 12, background: 'rgb(var(--surface))', color: 'rgb(var(--ink))' },
  labelStyle: { color: 'rgb(var(--ink-muted))' },
} as const

export default function AdminPage() {
  const { isAdmin, loading, session } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<any>(null)
  const [series, setSeries] = useState<any>(null)
  const [companies, setCompanies] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [bootstrap, setBootstrap] = useState('')
  const [bootError, setBootError] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    reload()
  }, [isAdmin])

  async function reload() {
    callFn<any>('admin', { action: 'stats' }).then(setStats).catch(() => {})
    callFn<any>('admin', { action: 'series' }).then(setSeries).catch(() => {})
    callFn<any[]>('admin', { action: 'list_companies' }).then(r => setCompanies(r ?? [])).catch(() => {})
    callFn<any[]>('admin', { action: 'list_payments' }).then(r => setPayments(r ?? [])).catch(() => {})
  }

  async function openCompany(id: string) {
    setDetail({ loading: true, id })
    const r = await callFn<any>('admin', { action: 'get_company', company_id: id })
    setDetail({ loading: false, ...r })
  }

  async function doBootstrap() {
    setBusy(true); setBootError('')
    try {
      await callFn('admin', { action: 'bootstrap_admin', secret: bootstrap })
      window.location.reload()
    } catch (e) { setBootError((e as Error).message) }
    setBusy(false)
  }

  if (loading) return null
  if (!session) return null

  if (!isAdmin) {
    return (
      <div className="min-h-screen mesh-bg grid place-items-center p-6">
        <div className="card-lux anim-pop w-full max-w-sm p-8 text-center">
          <Lock className="h-10 w-10 text-ink-muted mx-auto mb-3" />
          <h1 className="h-display text-xl">Painel administrativo</h1>
          <p className="text-sm text-ink-muted mt-2">Sua conta não é administradora. Se esta é a primeira configuração, insira o segredo de bootstrap.</p>
          <input className="input mt-4" type="password" placeholder="ADMIN_BOOTSTRAP_SECRET" value={bootstrap} onChange={e => setBootstrap(e.target.value)} />
          {bootError && <p className="text-xs text-red-500 mt-2">{bootError}</p>}
          <button className="btn-primary w-full mt-3" onClick={doBootstrap} disabled={busy || !bootstrap}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Promover a admin
          </button>
          <Link to="/app/dashboard" className="block text-xs text-ink-muted mt-4 hover:text-brand-600">← voltar ao app</Link>
        </div>
      </div>
    )
  }

  const allTabs = NAV.flatMap(g => g.items)
  const statusData = Object.entries(series?.status ?? {}).map(([k, v]) => ({ name: STATUS_LABEL[k] ?? k, value: v as number, color: STATUS_COLORS[k] ?? '#cbd5e1' }))
  const statusTotal = statusData.reduce((a, s) => a + s.value, 0)

  const NavItem = ({ t, onPick }: { t: any; onPick?: () => void }) => (
    <button onClick={() => { setTab(t.id); onPick?.() }}
      className={clsx('group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all',
        tab === t.id ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-soft' : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700')}>
      <span className={clsx('grid h-7 w-7 place-items-center rounded-lg transition-all shrink-0',
        tab === t.id ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-500 group-hover:bg-brand-100')}>
        <t.icon className="h-[15px] w-[15px]" />
      </span>
      <span className="flex-1 text-left truncate">{t.label}</span>
      {t.id === 'companies' && companies.length > 0 && <span className={clsx('badge text-[10px]', tab === t.id ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700')}>{companies.length}</span>}
    </button>
  )

  return (
    <div className="min-h-screen mesh-bg texture-noise lg:flex">
      {/* ===== sidebar (desktop) ===== */}
      <aside className={clsx(
        'fixed lg:sticky inset-y-0 left-0 top-0 z-40 w-[248px] shrink-0 bg-surface/95 backdrop-blur-xl border-r border-line flex-col transition-transform lg:translate-x-0 h-screen lg:h-auto lg:max-h-screen overflow-hidden flex',
        navOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="orb bg-brand-200 h-40 w-40 -top-10 -right-10 opacity-40" />
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line/70 relative">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-400 to-accent-500 grid place-items-center text-white font-display font-bold shadow-glow">IA</div>
          <div className="leading-tight">
            <p className="font-display font-bold text-ink">IAstetic</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-500">Admin console</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 relative">
          {NAV.map(g => (
            <div key={g.title} className="mb-5">
              <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted/80">{g.title}</p>
              <div className="space-y-0.5">{g.items.map(t => <NavItem key={t.id} t={t} onPick={() => setNavOpen(false)} />)}</div>
            </div>
          ))}
        </nav>
        <div className="p-3.5 border-t border-line/70 relative">
          <Link to="/app/dashboard" className="btn-ghost w-full justify-start text-xs">← Voltar ao app</Link>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 bg-ink/30 z-30 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* ===== conteúdo ===== */}
      <div className="flex-1 min-w-0">
        {/* mobile header */}
        <header className="lg:hidden sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 h-14">
            <button className="btn-ghost !p-2" onClick={() => setNavOpen(true)}><Menu className="h-5 w-5" /></button>
            <p className="font-display font-bold">IAstetic <span className="text-[10px] font-sans font-semibold uppercase tracking-widest text-brand-500">admin</span></p>
          </div>
          <nav className="flex gap-1 px-3 pb-2 overflow-x-auto">
            {allTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={clsx('rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition',
                  tab === t.id ? 'bg-brand-100 text-brand-700' : 'text-ink-soft')}>
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1240px] mx-auto space-y-6 relative">
          <div className="orb h-64 w-64 bg-brand-200 -top-20 right-0 opacity-40" />

          {/* ===== VISÃO GERAL ===== */}
          {tab === 'overview' && (
            <>
              <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                  <h1 className="h-display text-2xl sm:text-3xl">Visão geral</h1>
                  <p className="text-sm text-ink-muted">Saúde da plataforma em tempo real.</p>
                </div>
                <button className="btn-outline text-xs" onClick={reload}><RefreshCw className="h-3.5 w-3.5" /> Atualizar</button>
              </div>

              {!stats ? <p className="text-center py-20"><Loader2 className="h-6 w-6 animate-spin inline text-brand-500" /></p> : (
                <>
                  {/* stat cards */}
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                      { label: 'Empresas', value: stats.companies, icon: Building2, trend: <Trend cur={stats.companies30 ?? 0} prev={series?.prev?.companies30} />, sub: `+${stats.companies30 ?? 0} em 30d` },
                      { label: 'Assinaturas ativas', value: stats.active_subscriptions, icon: CheckCircle2, sub: `${statusData.find(s => s.name === 'Trial')?.value ?? 0} em trial` },
                      { label: 'Receita 30d', value: brl(stats.revenue_cents_30d ?? 0), icon: Wallet, trend: <Trend cur={stats.revenue_cents_30d ?? 0} prev={series?.prev?.revenue_cents_30d} /> },
                      { label: 'Tokens IA 30d', value: (stats.ai_tokens_30d ?? 0).toLocaleString('pt-BR'), icon: Activity, trend: <Trend cur={stats.ai_tokens_30d ?? 0} prev={series?.prev?.ai_tokens_30d} /> },
                    ].map((c, i) => (
                      <motion.div key={c.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className="card-lux p-5">
                        <div className="flex items-start justify-between">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-50 to-accent-100 grid place-items-center text-brand-600">
                            <c.icon className="h-5 w-5" />
                          </div>
                          {c.trend}
                        </div>
                        <p className="font-display text-2xl font-bold mt-3">{c.value}</p>
                        <p className="text-xs text-ink-muted mt-0.5">{c.label}{c.sub ? ` • ${c.sub}` : ''}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="grid xl:grid-cols-3 gap-4">
                    {/* receita x empresas — 12 meses */}
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card-lux p-5 xl:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-sm">Receita mensal</h3>
                          <p className="text-[11px] text-ink-muted">últimos 12 meses • pagamentos confirmados</p>
                        </div>
                        <div className="flex gap-3 text-[11px] text-ink-muted">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'rgb(var(--brand-500))' }} /> Receita</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'rgb(var(--accent-500))' }} /> Empresas novas</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={(series?.revenue ?? []).map((r: any, i: number) => ({ ...r, novas: series?.companies?.[i]?.value ?? 0 }))}>
                            <defs>
                              <linearGradient id="admRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="admNew" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgb(var(--accent-500))" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="rgb(var(--accent-500))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--ink-muted))' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--ink-muted))' }} axisLine={false} tickLine={false} width={48} tickFormatter={v => `R$${v}`} />
                            <Tooltip {...CHART_TIP} formatter={(v: any, n: any) => [n === 'value' ? brl(Math.round(v * 100)) : v, n === 'value' ? 'Receita' : 'Empresas novas']} />
                            <Area type="monotone" dataKey="value" stroke="rgb(var(--brand-500))" fill="url(#admRev)" strokeWidth={2.5} dot={false} />
                            <Area type="monotone" dataKey="novas" stroke="rgb(var(--accent-500))" fill="url(#admNew)" strokeWidth={2} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    {/* status das assinaturas — donut */}
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="card-lux p-5">
                      <h3 className="font-semibold text-sm">Assinaturas</h3>
                      <p className="text-[11px] text-ink-muted mb-2">status atual das empresas</p>
                      <div className="h-44 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={statusData} dataKey="value" innerRadius={52} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                              {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                            </Pie>
                            <Tooltip {...CHART_TIP} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 grid place-items-center pointer-events-none">
                          <div className="text-center"><p className="font-display text-2xl font-bold">{statusTotal}</p><p className="text-[10px] text-ink-muted">empresas</p></div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {statusData.filter(s => s.value > 0).map(s => (
                          <div key={s.name} className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                            <span className="text-ink-soft flex-1">{s.name}</span>
                            <span className="font-semibold">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </div>

                  <div className="grid xl:grid-cols-3 gap-4">
                    {/* agendamentos/mês */}
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="card-lux p-5 xl:col-span-2">
                      <h3 className="font-semibold text-sm mb-1">Agendamentos criados</h3>
                      <p className="text-[11px] text-ink-muted mb-4">por mês, todas as empresas (IA + manual)</p>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={series?.appointments ?? []}>
                            <defs>
                              <linearGradient id="admBar" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgb(var(--brand-500))" />
                                <stop offset="100%" stopColor="rgb(var(--accent-500))" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'rgb(var(--ink-muted))' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--ink-muted))' }} axisLine={false} tickLine={false} width={34} />
                            <Tooltip {...CHART_TIP} formatter={(v: any) => [v, 'Agendamentos']} />
                            <Bar dataKey="value" fill="url(#admBar)" radius={[6, 6, 0, 0]} barSize={22} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    {/* nichos */}
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }} className="card-lux p-5">
                      <h3 className="font-semibold text-sm mb-4">Empresas por nicho</h3>
                      <div className="space-y-3">
                        {Object.entries(stats.niches ?? {}).map(([k, v]) => {
                          const max = Math.max(...Object.values(stats.niches ?? {}).map(Number), 1)
                          const nn = NICHES[k as keyof typeof NICHES]
                          return (
                            <div key={k}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-medium inline-flex items-center gap-1.5"><NicheArt id={k} className="h-4 w-4 rounded" /> {nn?.name ?? k}</span>
                                <span className="font-semibold">{v as number}</span>
                              </div>
                              <div className="h-2 rounded-full bg-canvas overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${((v as number) / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.4 }}
                                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ===== EMPRESAS ===== */}
          {tab === 'companies' && (
            <>
              <div>
                <h1 className="h-display text-2xl sm:text-3xl">Empresas</h1>
                <p className="text-sm text-ink-muted">Clique para ver detalhes, assinatura e operação.</p>
              </div>
              <div className="card-lux overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-canvas/60 text-left text-xs text-ink-muted">
                      <tr>
                        <th className="px-5 py-3 font-medium">Empresa</th>
                        <th className="px-5 py-3 font-medium">Nicho</th>
                        <th className="px-5 py-3 font-medium">Plano</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">WhatsApp</th>
                        <th className="px-5 py-3 font-medium">Criada</th>
                        <th className="px-5 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {companies.map(c => (
                        <tr key={c.id} className="hover:bg-brand-50/40 cursor-pointer transition" onClick={() => openCompany(c.id)}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-200 to-accent-300 grid place-items-center text-white text-xs font-bold shrink-0">{(c.name ?? '?')[0].toUpperCase()}</div>
                              <div><p className="font-medium">{c.name}</p><p className="text-[10px] text-ink-muted">{c.slug}</p></div>
                            </div>
                          </td>
                          <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><NicheArt id={c.niche} className="h-5 w-5 rounded-md" /> {NICHES[c.niche as keyof typeof NICHES]?.short}</span></td>
                          <td className="px-5 py-3 text-xs">{(c.plans as any)?.name ?? '—'}</td>
                          <td className="px-5 py-3"><StatusBadge s={c.subscription_status} /></td>
                          <td className="px-5 py-3 text-xs">
                            {(c.instances ?? []).map((i: any) => (
                              <span key={i.instance_name} className="mr-2 inline-flex items-center gap-1"><span className={clsx('h-2 w-2 rounded-full inline-block', i.status === 'connected' ? 'bg-emerald-500' : i.status === 'connecting' ? 'bg-amber-400' : 'bg-red-400')} />{i.phone ?? ''}</span>
                            ))}
                          </td>
                          <td className="px-5 py-3 text-xs text-ink-muted">{fmtDate(c.created_at)}</td>
                          <td className="px-5 py-3"><ChevronRight className="h-4 w-4 text-ink-muted" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {companies.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-muted">Nenhuma empresa ainda.</p>}
                </div>
              </div>
            </>
          )}

          {/* ===== PAGAMENTOS ===== */}
          {tab === 'payments' && (
            <>
              <div>
                <h1 className="h-display text-2xl sm:text-3xl">Pagamentos</h1>
                <p className="text-sm text-ink-muted">Assinaturas, sinais e cobranças das empresas.</p>
              </div>
              <div className="card-lux overflow-hidden">
                <div className="divide-y divide-line/60">
                  {payments.map(p => (
                    <div key={p.id} className="px-5 py-3.5 flex items-center gap-4 text-sm">
                      <span className={clsx('badge text-[10px]', p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : p.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700')}>{p.status}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{(p.companies as any)?.name ?? '—'} <span className="text-xs text-ink-muted font-normal">• {p.kind} via {p.provider}</span></p>
                        <p className="text-[11px] text-ink-muted">{fmtDate(p.created_at)}{p.description ? ` • ${p.description}` : ''}</p>
                      </div>
                      <span className="font-semibold whitespace-nowrap">{brl(p.amount_cents)}</span>
                    </div>
                  ))}
                  {payments.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-muted">Sem pagamentos.</p>}
                </div>
              </div>
            </>
          )}

          {tab === 'plans' && <PlansCard />}
          {tab === 'whatsapp' && <AdminWhatsappCard />}
          {tab === 'assistant' && <AdminAssistantCard />}
          {tab === 'integrations' && <SecretsCard />}
          {tab === 'settings' && <FeesCard />}
        </main>
      </div>

      {/* drawer de detalhes da empresa */}
      <AnimatePresence>
        {detail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex justify-end" onClick={() => setDetail(null)}>
            <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} transition={{ type: 'spring', damping: 30 }}
              className="w-full max-w-xl bg-surface h-full overflow-y-auto p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              {detail.loading ? <div className="grid place-items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-brand-500" /></div> : (
                <CompanyDetail data={detail} onClose={() => setDetail(null)} onChanged={() => { reload(); openCompany(detail.company.id) }} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700', trial: 'bg-amber-100 text-amber-700',
    past_due: 'bg-orange-100 text-orange-700', cancelled: 'bg-red-100 text-red-600', expired: 'bg-slate-100 text-slate-600',
  }
  return <span className={clsx('badge text-[10px]', map[s] ?? 'bg-slate-100 text-slate-600')}>{s}</span>
}

function CompanyDetail({ data, onClose, onChanged }: { data: any; onClose: () => void; onChanged: () => void }) {
  const c = data.company ?? {}
  const [tab, setTab] = useState<'dados' | 'contatos' | 'servicos' | 'agenda' | 'financeiro'>('dados')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [plans, setPlans] = useState<any[]>([])
  const niche = NICHES[c.niche as keyof typeof NICHES]

  useEffect(() => { callFn<any[]>('admin', { action: 'list_plans' }).then(r => setPlans(r ?? [])).catch(() => {}) }, [])

  async function sub(mode: string, days?: number) {
    setBusy(mode)
    await callFn('admin', { action: 'set_subscription', company_id: c.id, mode, days })
    setBusy(''); onChanged()
  }
  async function assignPlan(planId: string) {
    setBusy('plan')
    await callFn('admin', { action: 'assign_plan', company_id: c.id, plan_id: planId }).catch(e => alert((e as Error).message))
    setBusy(''); onChanged()
  }
  async function sendWa() {
    if (!msg.trim()) return
    setBusy('wa')
    try { await callFn('admin', { action: 'send_company_whatsapp', company_id: c.id, message: msg }); setMsg('') }
    catch (e) { alert((e as Error).message) }
    setBusy('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="h-display text-xl">{c.name}</h2>
          <p className="text-xs text-ink-muted flex items-center gap-1.5">{niche && <NicheArt id={c.niche} className="h-4 w-4 rounded" />} {niche?.name} • {c.slug} • criada {fmtDate(c.created_at)}</p>
        </div>
        <button className="btn-ghost !p-2" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>

      {/* assinatura */}
      <div className="card-lux p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Assinatura</p>
          <StatusBadge s={c.subscription_status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-ink-muted">Plano:</p>
          <select className="input !w-auto !py-1 !px-2 text-xs" value={c.plan_id ?? ''} disabled={busy === 'plan'}
            onChange={e => assignPlan(e.target.value)}>
            <option value="">nenhum</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)}</option>)}
          </select>
          {busy === 'plan' && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />}
          <p className="text-xs text-ink-muted">
            {c.subscription_status === 'trial' && c.trial_until && `trial até ${fmtDate(c.trial_until)}`}
            {c.subscription_until && ` até ${fmtDate(c.subscription_until)}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary !py-1.5 text-xs" onClick={() => sub('approve', 30)} disabled={!!busy}>
            {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Aprovar 30d
          </button>
          <button className="btn-outline !py-1.5 text-xs" onClick={() => sub('extend_trial', 7)} disabled={!!busy}>+7d trial</button>
          <button className="btn-outline !py-1.5 text-xs" onClick={() => sub('past_due')} disabled={!!busy}>Marcar pendente</button>
          <button className="btn-danger !py-1.5 text-xs" onClick={() => sub('reject')} disabled={!!busy}>
            <XCircle className="h-3.5 w-3.5" /> Rejeitar
          </button>
        </div>
      </div>

      {/* whatsapp direto */}
      <div className="card-lux p-4 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><MessageSquareText className="h-4 w-4 text-emerald-500" /> Mensagem via WhatsApp do admin</p>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Ex.: sua assinatura vence amanhã…" value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendWa()} />
          <button className="btn-primary !px-3" onClick={sendWa} disabled={!!busy || !msg.trim()}>{busy === 'wa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        </div>
        <p className="text-[11px] text-ink-muted">Vai para {c.whatsapp_public ?? c.phone ?? '—'} pela instância do admin.</p>
      </div>

      {/* tabs internas */}
      <div className="flex gap-1 border-b border-line">
        {([['dados', 'Resumo'], ['contatos', `Clientes (${data.contacts?.length ?? 0})`], ['servicos', `Serviços (${data.services?.length ?? 0})`], ['agenda', 'Agenda'], ['financeiro', 'Pagamentos']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={clsx('px-3 py-2 text-xs font-medium', tab === k ? 'text-brand-600 border-b-2 border-brand-500' : 'text-ink-muted')}>{l}</button>
        ))}
      </div>

      {tab === 'dados' && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3">
            {[['Contatos', data.stats?.contacts_total], ['Agendamentos 30d', data.stats?.appointments], ['Receita 30d', brl(data.stats?.revenue_cents ?? 0)]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-canvas p-3 text-center"><p className="font-bold text-lg">{v ?? '—'}</p><p className="text-[10px] text-ink-muted">{l}</p></div>
            ))}
          </div>
          <div className="card-lux p-3.5 text-xs space-y-1.5">
            <p><span className="text-ink-muted">WhatsApp público:</span> {c.whatsapp_public ?? '—'}</p>
            <p><span className="text-ink-muted">Instagram:</span> {c.instagram ?? '—'}</p>
            <p><span className="text-ink-muted">Cidade:</span> {c.city ?? '—'}{c.state ? `/${c.state}` : ''}</p>
            <p><span className="text-ink-muted">Instâncias:</span> {(c.instances ?? []).length ? (c.instances ?? []).map((i: any) => (
              <span key={i.instance_name} className="mr-2 inline-flex items-center gap-1"><span className={clsx('h-2 w-2 rounded-full inline-block', i.status === 'connected' ? 'bg-emerald-500' : 'bg-red-400')} />{i.phone ?? i.instance_name}</span>
            )) : 'nenhuma'}</p>
            <p><span className="text-ink-muted">Profissionais:</span> {(data.professionals ?? []).map((p: any) => p.name).join(', ') || 'nenhum'}</p>
            <p><span className="text-ink-muted">Follow-ups:</span> {(data.followups ?? []).filter((f: any) => f.active).map((f: any) => f.name).join(', ') || 'nenhum ativo'}</p>
          </div>
        </div>
      )}

      {tab === 'contatos' && (
        <div className="space-y-1.5">
          {(data.contacts ?? []).map((ct: any) => (
            <div key={ct.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-xs">
              <Users className="h-3.5 w-3.5 text-brand-400 shrink-0" />
              <div className="flex-1 min-w-0"><p className="font-medium truncate">{ct.name ?? ct.phone}</p><p className="text-ink-muted">{ct.phone}</p></div>
              <span className="badge bg-brand-50 text-brand-700">{ct.stage}</span>
              <span className="font-semibold">{brl(ct.total_spent_cents ?? 0)}</span>
            </div>
          ))}
          {!(data.contacts ?? []).length && <p className="text-center text-xs text-ink-muted py-8">Nenhum contato ainda.</p>}
        </div>
      )}

      {tab === 'servicos' && (
        <div className="space-y-1.5">
          {(data.services ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-xs">
              <Sparkle className="h-3.5 w-3.5 text-brand-400 shrink-0" />
              <div className="flex-1"><p className="font-medium">{s.name}</p><p className="text-ink-muted">{s.duration_min} min {s.category ? `• ${s.category}` : ''}</p></div>
              <span className="font-semibold">{brl(s.price_cents)}</span>
              {!s.active && <span className="badge bg-slate-100 text-slate-500">inativo</span>}
            </div>
          ))}
          {!(data.services ?? []).length && <p className="text-center text-xs text-ink-muted py-8">Nenhum serviço.</p>}
        </div>
      )}

      {tab === 'agenda' && (
        <div className="space-y-1.5">
          {(data.appointments ?? []).map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5 text-brand-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{a.service_name} — {a.customer_name}</p>
                <p className="text-ink-muted">{new Date(a.starts_at).toLocaleString('pt-BR')} {a.professional_name ? `• ${a.professional_name}` : ''}</p>
              </div>
              <span className={clsx('badge', a.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : a.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700')}>{a.status}</span>
              {a.created_by === 'ai' && <span title="agendado pela IA"><Bot className="h-3.5 w-3.5 text-brand-500" /></span>}
            </div>
          ))}
          {!(data.appointments ?? []).length && <p className="text-center text-xs text-ink-muted py-8">Agenda vazia.</p>}
        </div>
      )}

      {tab === 'financeiro' && (
        <div className="space-y-1.5">
          {(data.payments ?? []).map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-xs">
              <span className={clsx('badge', p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{p.status}</span>
              <div className="flex-1 min-w-0"><p className="truncate">{p.description ?? p.kind}</p><p className="text-ink-muted">{fmtDate(p.created_at)} • {p.provider}</p></div>
              <span className="font-semibold">{brl(p.amount_cents)}</span>
            </div>
          ))}
          {!(data.payments ?? []).length && <p className="text-center text-xs text-ink-muted py-8">Sem pagamentos.</p>}
        </div>
      )}
    </div>
  )
}

function AdminWhatsappCard() {
  const [inst, setInst] = useState<any>(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { refresh() }, [])
  async function refresh() {
    setLoading(true)
    const r = await callFn<any>('admin', { action: 'admin_instance_status' }).catch(() => null)
    setInst(r?.instance ?? null); setLoading(false)
  }
  async function create() {
    setBusy(true)
    const r = await callFn<any>('admin', { action: 'admin_instance_create' })
    const code = r?.connect?.qrcode?.base64 ?? r?.connect?.base64 ?? r?.connect?.code ?? ''
    setQr(code); await refresh(); setBusy(false)
  }
  async function getQr() {
    setBusy(true)
    const r = await callFn<any>('admin', { action: 'admin_instance_qr' })
    setQr(r?.qrcode?.base64 ?? r?.base64 ?? r?.code ?? '')
    setBusy(false)
  }

  const connected = inst?.state === 'open' || inst?.state === 'connected'

  return (
    <div className="card-lux p-6 max-w-lg space-y-4">
      <h3 className="font-semibold flex items-center gap-2"><QrCode className="h-4 w-4 text-brand-500" /> WhatsApp da plataforma (vendas + suporte)</h3>
      <p className="text-xs text-ink-muted">Instância própria do IAstetic: faz onboarding de novos clientes por WhatsApp (cadastro → empresa → plano → pagamento) e atende dúvidas de empresas já cadastradas.</p>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" /> : (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-canvas p-3.5">
            <span className={clsx('h-2.5 w-2.5 rounded-full', connected ? 'bg-emerald-500 anim-pulse-dot' : inst ? 'bg-amber-500' : 'bg-slate-300')} />
            <div className="text-sm">
              {!inst ? 'Nenhuma instância criada' : connected ? `Conectada — ${inst.phone ?? inst.name}` : `Criada, aguardando conexão (${inst.state})`}
            </div>
          </div>
          <div className="flex gap-2">
            {!inst && <button className="btn-primary" onClick={create} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Criar instância</button>}
            {inst && !connected && <button className="btn-primary" onClick={getQr} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Gerar QR Code</button>}
            {inst && <button className="btn-ghost text-xs" onClick={async () => { await callFn('admin', { action: 'admin_instance_logout' }); refresh() }}>Desconectar</button>}
            <button className="btn-outline text-xs" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          {qr && (
            <div className="rounded-2xl border border-line bg-white p-4 grid place-items-center">
              {qr.startsWith('data:image') || qr.length > 300 ? <img src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} className="w-56 h-56" /> : <QRCodeSVG value={qr} size={200} />}
              <p className="text-[11px] text-ink-muted mt-2">Escaneie no WhatsApp → Aparelhos conectados</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AdminAssistantCard() {
  const [messages, setMessages] = useDraft<{ role: 'user' | 'assistant'; content: string }[]>('admin-assistant:msgs', [])
  const [input, setInput] = useDraft('admin-assistant:input', '')
  const [busy, setBusy] = useState(false)
  const { recording, start: startRec, stop: stopRec } = useRecorder()

  async function send() {
    if (!input.trim() || busy) return
    const q = input; setInput('')
    const next = [...messages, { role: 'user' as const, content: q }]
    setMessages(next); setBusy(true)
    try {
      const r = await callFn<{ reply: string; transcript?: string | null }>('admin', { action: 'admin_assistant', message: q, history: next.slice(-10) })
      setMessages([...next, { role: 'assistant', content: r.reply || '…' }])
    } catch (e) { setMessages([...next, { role: 'assistant', content: `Erro: ${(e as Error).message}` }]) }
    setBusy(false)
  }

  async function toggleMic() {
    if (busy) return
    if (!recording) {
      try { await startRec() } catch {
        setMessages([...messages, { role: 'assistant' as const, content: 'Sem acesso ao microfone — libera a permissão no navegador.' }])
      }
      return
    }
    const rec = await stopRec()
    if (!rec) return
    setBusy(true)
    try {
      const r = await callFn<{ reply: string; transcript?: string | null }>('admin', { action: 'admin_assistant', audio: rec.base64, audio_mime: rec.mime, history: messages.slice(-10) })
      setMessages([...messages, { role: 'user' as const, content: `Áudio: ${r.transcript || '(transcrição indisponível)'}` }, { role: 'assistant', content: r.reply || '…' }])
    } catch (e) { setMessages([...messages, { role: 'assistant', content: `Erro no áudio: ${(e as Error).message}` }]) }
    setBusy(false)
  }

  return (
    <div className="card-lux max-w-2xl flex flex-col h-[560px]">
      <div className="p-4 border-b border-line flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-brand-500" />
        <p className="font-semibold text-sm">Assistente do admin</p>
        <p className="text-[11px] text-ink-muted ml-auto">relatórios • empresas • assinaturas • disparos</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center pt-10">
            <BrainCircuit className="h-10 w-10 text-brand-300 mx-auto" />
            <p className="text-sm text-ink-muted mt-3">Pergunte qualquer coisa sobre a plataforma:</p>
            <div className="flex gap-2 flex-wrap justify-center mt-3">
              {['Resumo do mês', 'Empresas em trial', 'Aprove a assinatura do Studio X', 'Envie follow-up de cobrança pra quem tá pendente'].map(s => (
                <button key={s} className="badge bg-brand-50 text-brand-700 hover:bg-brand-100 text-xs" onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap', m.role === 'user' ? 'bg-brand-500 text-white ml-auto' : 'bg-canvas border border-line')}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bg-canvas border border-line rounded-2xl px-4 py-2.5 text-sm w-fit"><Loader2 className="h-4 w-4 animate-spin text-brand-500" /></div>}
      </div>
      <div className="p-3 border-t border-line flex gap-2">
        <input className="input flex-1" placeholder={recording ? 'Ouvindo… clique no ⬛ para enviar' : 'Pergunte ou mande executar…'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={recording} />
        <button onClick={toggleMic} disabled={busy} title={recording ? 'Parar e enviar' : 'Falar'}
          className={clsx('!px-3.5 rounded-xl transition-all', recording ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' : 'btn-outline')}>
          {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
        </button>
        <button className="btn-primary !px-4" onClick={send} disabled={busy || !input.trim() || recording}><Send className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

type SecretRow = { name: string; configured: boolean; source: 'env' | 'painel' | null }

const SECRET_GROUPS: { group: string; hint: string; secrets: { name: string; label: string; placeholder?: string }[] }[] = [
  {
    group: 'Provedor de IA',
    hint: 'AI_PROVIDER: "openrouter" usa a conta OpenRouter p/ texto+visão+imagem · "nvidia" força NVIDIA · "auto" usa OpenRouter se houver key',
    secrets: [
      { name: 'AI_PROVIDER', label: 'Provedor ativo', placeholder: 'auto | openrouter | nvidia' },
      { name: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key (uma key p/ todos os modelos)' },
      { name: 'AI_MODEL', label: 'Modelo de chat', placeholder: 'openrouter: google/gemini-2.5-flash · nvidia: z-ai/glm-5.3-flash' },
      { name: 'VISION_MODEL', label: 'Modelo de visão (imagem→texto)', placeholder: 'openrouter: google/gemini-2.5-flash' },
      { name: 'IMAGE_MODEL', label: 'Modelo de geração de imagem', placeholder: 'openrouter: google/gemini-2.5-flash-image' },
    ],
  },
  {
    group: 'IA — NVIDIA + Groq (fallback)',
    hint: 'NVIDIA é o fallback se OpenRouter desligado · Groq Whisper transcreve áudios (sempre)',
    secrets: [
      { name: 'NVIDIA_API_KEY', label: 'NVIDIA API Key (texto + imagem FLUX)' },
      { name: 'NVIDIA_VISION_KEY', label: 'NVIDIA Vision Key (opcional, imagem→texto)' },
      { name: 'NVIDIA_ASR_KEY', label: 'NVIDIA ASR Key (opcional)' },
      { name: 'GROQ_API_KEY', label: 'Groq API Key — transcrição de áudios (whisper-large-v3-turbo)' },
    ],
  },
  {
    group: 'Voz (TTS)',
    hint: 'Cadeia automática: ElevenLabs → OpenRouter (gpt-audio) → Google TTS. TTS_PROVIDER força um.',
    secrets: [
      { name: 'TTS_PROVIDER', label: 'Provedor de voz', placeholder: 'auto | elevenlabs | openrouter | google' },
      { name: 'TTS_MODEL', label: 'Modelo de voz (OpenRouter)', placeholder: 'openai/gpt-audio-mini' },
      { name: 'TTS_VOICE', label: 'Voz OpenRouter', placeholder: 'coral, marin, sage, shimmer…' },
      { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key (opcional)' },
      { name: 'ELEVENLABS_VOICE', label: 'ElevenLabs Voice ID', placeholder: 'cgSgspJ2msm6clMCkdW9' },
    ],
  },
  {
    group: 'Evolution / WhatsApp',
    hint: 'Servidor Evolution usado por TODAS as instâncias (empresas + admin)',
    secrets: [
      { name: 'EVOLUTION_URL', label: 'URL da Evolution API', placeholder: 'https://evo.seudominio.com' },
      { name: 'EVOLUTION_APIKEY', label: 'API Key global da Evolution' },
      { name: 'WEBHOOK_INGRESS_SECRET', label: 'Segredo dos webhooks (ingress + admin-bot)' },
    ],
  },
  {
    group: 'Pagamentos',
    hint: 'MercosulPay (Pix) e Stripe (cartão) + segredos de webhook',
    secrets: [
      { name: 'MERCOSULPAY_API_KEY', label: 'MercosulPay API Key (Pix)' },
      { name: 'MERCOSULPAY_WEBHOOK_SECRET', label: 'MercosulPay Webhook Secret' },
      { name: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key (cartão)' },
      { name: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Signing Secret' },
    ],
  },
  {
    group: 'Plataforma',
    hint: 'Segredos internos e URL pública do site',
    secrets: [
      { name: 'ADMIN_BOOTSTRAP_SECRET', label: 'Segredo de bootstrap admin' },
      { name: 'CRON_SECRET', label: 'Segredo do cron de follow-ups' },
      { name: 'PUBLIC_SITE_URL', label: 'URL pública do site', placeholder: 'https://iastetic.com.br' },
    ],
  },
]

function SecretsCard() {
  const [rows, setRows] = useState<SecretRow[]>([])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const refresh = async () => {
    try { const d = await callFn<SecretRow[]>('admin', { action: 'list_secrets' }); setRows(d ?? []) } catch { /* ignora */ }
  }
  useEffect(() => { refresh() }, [])
  const statusOf = (n: string) => rows.find(r => r.name === n)

  const save = async (name: string, value: string) => {
    setSaving(name); setMsg('')
    try {
      await callFn('admin', { action: 'set_secret', name, value })
      setMsg(`${name} ${value ? 'salvo' : 'removido'}!`)
      setVals(v => ({ ...v, [name]: '' }))
    } catch (e) { setMsg(`Erro: ${(e as Error).message}`) }
    setSaving(null); refresh()
  }

  return (
    <div className="card-lux p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1"><KeyRound size={18} className="text-primary" /><h3 className="font-semibold">Integrações & API keys</h3></div>
      <p className="text-xs text-muted-foreground mb-5">Chaves salvas aqui valem pra <b>todas</b> as funções — webhook, assistentes, pagamentos, WhatsApp e cron — sem precisar redeploy. Se vazio, a função usa a env var configurada no Supabase. Valores <b>nunca</b> são exibidos de volta.</p>
      <div className="space-y-6">
        {SECRET_GROUPS.map(g => (
          <div key={g.group}>
            <h4 className="text-sm font-semibold">{g.group}</h4>
            <p className="text-[11px] text-muted-foreground mb-2.5">{g.hint}</p>
            <div className="space-y-2">
              {g.secrets.map(s => {
                const st = statusOf(s.name)
                return (
                  <div key={s.name} className="rounded-xl border p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs font-medium">{s.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${st?.configured ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                        {st?.configured ? (st.source === 'env' ? '✓ via env' : '✓ via painel') : 'não configurado'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input type="password" placeholder={st?.configured ? '••• (digite pra substituir)' : (s.placeholder ?? 'cole a chave aqui')}
                        className="input flex-1 !py-1.5 text-xs font-mono" value={vals[s.name] ?? ''} onChange={e => setVals(v => ({ ...v, [s.name]: e.target.value }))} />
                      <button className="btn-secondary text-xs px-3 py-1.5" disabled={saving === s.name || !vals[s.name]} onClick={() => save(s.name, vals[s.name])}>
                        {saving === s.name ? 'Salvando…' : 'Salvar'}
                      </button>
                      {st?.source === 'painel' && <button className="btn-ghost text-xs px-2" onClick={() => save(s.name, '')}>✕</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs text-green-400 mt-4">{msg}</p>}
    </div>
  )
}

function FeesCard() {
  const [pct, setPct] = useState(5)
  const [minCents, setMinCents] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setBusy(true)
    await callFn('admin', { action: 'update_fees', withdrawal_percent: pct, min_withdrawal_cents: minCents })
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="card-lux p-6 max-w-md space-y-4">
      <h3 className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-brand-500" /> Taxas da plataforma</h3>
      <div>
        <label className="label">Taxa de saque (%)</label>
        <input type="number" min={0} max={30} step={0.5} className="input" value={pct} onChange={e => setPct(+e.target.value)} />
      </div>
      <div>
        <label className="label">Saque mínimo (centavos)</label>
        <input type="number" min={100} step={100} className="input" value={minCents} onChange={e => setMinCents(+e.target.value)} />
      </div>
      <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{saved ? 'Salvo ✓' : 'Salvar'}</button>
    </div>
  )
}

// ---------- Planos ----------
const FEATURE_KEYS: { key: string; label: string }[] = [
  { key: 'assistant', label: 'Assistente IA do painel' },
  { key: 'images', label: 'Arquivos/imagens da IA' },
  { key: 'followups', label: 'Follow-ups automáticos' },
]

const EMPTY_PLAN: any = {
  name: '', slug: '', niche: null, description: '', price_cents: 0, yearly_price_cents: null,
  instances_limit: 1, professionals_limit: 3, monthly_messages_limit: 2000,
  image_quota: 4, image_storage_limit: 10, assistant_audio_quota: 20, customer_audio_quota: 30,
  features: {}, highlight: false, active: true, sort: 0,
}

function PlansCard() {
  const [plans, setPlans] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const r = await callFn<any[]>('admin', { action: 'list_plans' }).catch(() => [])
    setPlans(r ?? [])
  }
  useEffect(() => { load() }, [])

  async function save() {
    setBusy(true)
    try {
      await callFn('admin', { action: 'save_plan', plan: editing })
      setEditing(null); load()
    } catch (e) { alert((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="h-display text-xl flex items-center gap-2"><Crown className="h-5 w-5 text-brand-500" /> Planos</h2>
          <p className="text-sm text-ink-muted mt-0.5">Crie e edite planos — preços, limites, quota de imagens IA e recursos.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_PLAN })}><Plus className="h-4 w-4" /> Novo plano</button>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map(p => (
          <div key={p.id} className={clsx('card-lux p-5 relative', !p.active && 'opacity-60')}>
            {p.highlight && <span className="absolute top-4 right-4 badge bg-gradient-to-r from-brand-500 to-accent-500 text-white">destaque</span>}
            <p className="font-display font-bold text-lg">{p.name}</p>
            <p className="text-xs text-ink-muted">{p.slug} {p.niche && `· ${NICHES[p.niche as keyof typeof NICHES]?.name ?? p.niche}`} {!p.active && '· inativo'}</p>
            <p className="mt-2 text-2xl font-display font-bold text-brand-700">{brl(p.price_cents)}<span className="text-xs font-normal text-ink-muted">/mês</span></p>
            <ul className="mt-3 space-y-1 text-xs text-ink-soft">
              <li>{p.instances_limit} conexão(ões) · {p.professionals_limit} profissionais</li>
              <li>{Number(p.monthly_messages_limit).toLocaleString('pt-BR')} msgs/mês</li>
              <li className="flex items-center gap-1.5"><Image className="h-3 w-3 text-ink-muted" /> {p.image_quota ?? 0} gerações de imagem/mês · {p.image_storage_limit ?? 0} salvas</li>
              <li className="flex items-center gap-1.5"><Volume2 className="h-3 w-3 text-ink-muted" /> {p.assistant_audio_quota ?? 0} áudios assistente/mês · {p.customer_audio_quota ?? 0} áudios p/ clientes</li>
              <li className="flex flex-wrap gap-1 pt-1">
                {FEATURE_KEYS.filter(f => p.features?.[f.key]).map(f => <span key={f.key} className="badge bg-brand-50 text-brand-700">{f.label}</span>)}
              </li>
            </ul>
            <button className="btn-outline w-full mt-4 !py-2 text-xs" onClick={() => setEditing({ ...p })}><Pencil className="h-3.5 w-3.5" /> Editar</button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
              className="card-lux w-full max-w-lg max-h-[88vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold">{editing.id ? 'Editar plano' : 'Novo plano'}</h3>
                <button onClick={() => setEditing(null)} className="text-ink-muted hover:text-ink"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Nome</label><input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><label className="label">Slug</label><input className="input" placeholder="ex.: pro" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })} /></div>
                <div><label className="label">Preço mensal (R$)</label><input type="number" step="0.01" className="input" value={(editing.price_cents ?? 0) / 100} onChange={e => setEditing({ ...editing, price_cents: Math.round(+e.target.value * 100) })} /></div>
                <div><label className="label">Preço anual (R$, opcional)</label><input type="number" step="0.01" className="input" value={editing.yearly_price_cents != null ? editing.yearly_price_cents / 100 : ''} onChange={e => setEditing({ ...editing, yearly_price_cents: e.target.value === '' ? null : Math.round(+e.target.value * 100) })} /></div>
                <div><label className="label">Nicho (opcional)</label>
                  <select className="input" value={editing.niche ?? ''} onChange={e => setEditing({ ...editing, niche: e.target.value || null })}>
                    <option value="">Todos</option>
                    {Object.entries(NICHES).map(([k, n]) => <option key={k} value={k}>{n.name}</option>)}
                  </select>
                </div>
                <div><label className="label">Ordem</label><input type="number" className="input" value={editing.sort ?? 0} onChange={e => setEditing({ ...editing, sort: +e.target.value })} /></div>
                <div><label className="label">Conexões WhatsApp</label><input type="number" min={1} className="input" value={editing.instances_limit} onChange={e => setEditing({ ...editing, instances_limit: +e.target.value })} /></div>
                <div><label className="label">Profissionais</label><input type="number" min={1} className="input" value={editing.professionals_limit} onChange={e => setEditing({ ...editing, professionals_limit: +e.target.value })} /></div>
                <div><label className="label">Msgs/mês</label><input type="number" min={0} className="input" value={editing.monthly_messages_limit} onChange={e => setEditing({ ...editing, monthly_messages_limit: +e.target.value })} /></div>
                <div><label className="label">Gerações de imagem/mês</label><input type="number" min={0} className="input" value={editing.image_quota ?? 0} onChange={e => setEditing({ ...editing, image_quota: +e.target.value })} /></div>
                <div><label className="label">Imagens salvas (máx)</label><input type="number" min={0} className="input" value={editing.image_storage_limit ?? 0} onChange={e => setEditing({ ...editing, image_storage_limit: +e.target.value })} /></div>
                <div><label className="label">Áudios assistente/mês</label><input type="number" min={0} className="input" value={editing.assistant_audio_quota ?? 0} onChange={e => setEditing({ ...editing, assistant_audio_quota: +e.target.value })} /></div>
                <div><label className="label">Áudios p/ clientes/mês</label><input type="number" min={0} className="input" value={editing.customer_audio_quota ?? 0} onChange={e => setEditing({ ...editing, customer_audio_quota: +e.target.value })} /></div>
                <div><label className="label">Stripe price ID</label><input className="input" value={editing.stripe_price_id ?? ''} onChange={e => setEditing({ ...editing, stripe_price_id: e.target.value || null })} /></div>
              </div>
              <div><label className="label">Descrição</label><textarea className="input" rows={2} value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
              <div>
                <label className="label">Recursos liberados</label>
                <div className="flex flex-wrap gap-2">
                  {FEATURE_KEYS.map(f => (
                    <button key={f.key} type="button"
                      onClick={() => setEditing({ ...editing, features: { ...(editing.features ?? {}), [f.key]: !editing.features?.[f.key] } })}
                      className={clsx('text-xs rounded-full border px-3 py-1.5 transition',
                        editing.features?.[f.key] ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-muted')}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-5 text-sm">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!editing.highlight} onChange={e => setEditing({ ...editing, highlight: e.target.checked })} /> Destaque na landing</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editing.active !== false} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Ativo</label>
              </div>
              <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar plano</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
