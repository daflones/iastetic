import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, CreditCard, Loader2, Lock, RefreshCw, Shield, X,
  CheckCircle2, XCircle, QrCode, MessageSquareText, Send, Users, Sparkle,
  CalendarDays, Wallet, ChevronRight, Power, BrainCircuit, KeyRound, Crown, Plus, Pencil,
  LayoutDashboard, TrendingUp, TrendingDown, Menu, Activity, Mic, Bot, Image, Volume2,
  Target, MapPin, Globe, PhoneOff, Search, Megaphone, Trash2, LifeBuoy, Pause, Play,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid,
} from 'recharts'
import { callFn, brl, fmtDate, supabase } from '@/lib/supabase'
import { maskPhoneBR } from '@/lib/validators'
import Pagination, { usePaged } from '@/components/ui/Pagination'
import SocialPostsTab from '@/pages/admin/SocialPostsTab'
import { useAuth } from '@/hooks/useAuth'
import { NICHES } from '@/lib/niches'
import NicheArt from '@/components/ui/NicheArt'
import { useDraft } from '@/hooks/useDraft'
import { useRecorder, unlockMicAudio } from '@/hooks/useRecorder'
import { QRCodeSVG } from 'qrcode.react'
import clsx from 'clsx'

type Tab = 'overview' | 'companies' | 'plans' | 'payments' | 'support' | 'prospect' | 'whatsapp' | 'assistant' | 'posts' | 'integrations' | 'settings'

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
      { id: 'prospect', label: 'Prospecção', icon: Target },
      { id: 'whatsapp', label: 'WhatsApp do admin', icon: QrCode },
      { id: 'support', label: 'Suporte', icon: LifeBuoy },
      { id: 'assistant', label: 'Assistente', icon: BrainCircuit },
      { id: 'posts', label: 'Posts', icon: Megaphone },
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
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('tab') as Tab) || 'overview')
  const [stats, setStats] = useState<any>(null)
  const [series, setSeries] = useState<any>(null)
  const [companies, setCompanies] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [bootstrap, setBootstrap] = useState('')
  const [bootError, setBootError] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [navOpen, setNavOpen] = useState(false)
  const pgComp = usePaged(companies, 15)
  const pgPay = usePaged(payments, 15)

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
                      {pgComp.slice.map(c => (
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
                  <div className="px-5 pb-4"><Pagination page={pgComp.page} pages={pgComp.pages} total={pgComp.total} onChange={pgComp.setPage} /></div>
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
                  {pgPay.slice.map(p => (
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
                  <div className="px-5 pb-4"><Pagination page={pgPay.page} pages={pgPay.pages} total={pgPay.total} onChange={pgPay.setPage} /></div>
                </div>
              </div>
            </>
          )}

          {tab === 'plans' && <PlansCard />}
          {tab === 'prospect' && <ProspectCard />}
          {tab === 'support' && <SupportCard />}
          {tab === 'whatsapp' && (
            <div className="space-y-4">
              <AdminWhatsappCard />
              <WaInboxCard />
            </div>
          )}
          {tab === 'assistant' && <AdminAssistantCard />}
          {tab === 'posts' && <SocialPostsTab />}
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
  async function togglePause() {
    setBusy(true)
    const r = await callFn<any>('admin', { action: 'admin_instance_toggle' }).catch(() => null)
    if (r) setInst((i: any) => i ? { ...i, paused: r.paused } : i)
    else await refresh()
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
            <span className={clsx('h-2.5 w-2.5 rounded-full', inst?.paused ? 'bg-red-400' : connected ? 'bg-emerald-500 anim-pulse-dot' : inst ? 'bg-amber-500' : 'bg-slate-300')} />
            <div className="text-sm">
              {!inst ? 'Nenhuma instância criada' : inst.paused ? `IA pausada — ${inst.phone ?? inst.name} (não responde mensagens)` : connected ? `Conectada — ${inst.phone ?? inst.name}` : `Criada, aguardando conexão (${inst.state})`}
            </div>
          </div>
          <div className="flex gap-2">
            {!inst && <button className="btn-primary" onClick={create} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Criar instância</button>}
            {inst && !connected && <button className="btn-primary" onClick={getQr} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Gerar QR Code</button>}
            {inst && (
              <button className={clsx('text-xs', inst.paused ? 'btn-primary' : 'btn-outline')} onClick={togglePause} disabled={busy}
                title={inst.paused ? 'Religa o webhook — a IA volta a responder' : 'Desliga o webhook na Evolution — a IA para de responder'}>
                {inst.paused ? <><Play className="h-3.5 w-3.5" /> Ativar IA</> : <><Pause className="h-3.5 w-3.5" /> Pausar IA</>}
              </button>
            )}
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

type WaThread = { jid: string; phone: string; last: string; kind: string; dir: string; at: string; count: number; inbound: number }
type WaMsg = { id: string; direction: 'in' | 'out'; content: string; kind: string; media_url?: string; source: string; created_at: string }
type FuJob = { id: string; status: string; scheduled_at: string; sent_at?: string; sent_content?: string; error?: string; contacts?: { name?: string; phone?: string }; companies?: { name?: string }; followup_rules?: { name?: string; trigger?: string } }
type FuRule = { id: string; name: string; trigger: string; active: boolean; delay_hours: number; companies?: { name?: string } }

function WaInboxCard() {
  const [sub, setSub] = useState<'chat' | 'campanhas' | 'followups'>('chat')
  const [threads, setThreads] = useState<WaThread[]>([])
  const [active, setActive] = useState<WaThread | null>(null)
  const [msgs, setMsgs] = useState<WaMsg[]>([])
  const [draft, setDraft] = useState('')
  const [camps, setCamps] = useState<any[]>([])
  const [fu, setFu] = useState<{ jobs: FuJob[]; rules: FuRule[] }>({ jobs: [], rules: [] })
  const [busy, setBusy] = useState(false)

  const loadThreads = async () => {
    const r = await callFn<WaThread[]>('admin', { action: 'wa_threads' }).catch(() => [])
    setThreads(r ?? [])
  }
  const loadMsgs = async (jid: string) => {
    const r = await callFn<WaMsg[]>('admin', { action: 'wa_messages', jid }).catch(() => [])
    setMsgs(r ?? [])
  }
  const loadCamps = async () => {
    const r = await callFn<any[]>('admin', { action: 'prospect_campaigns' }).catch(() => [])
    setCamps(r ?? [])
  }
  const loadFu = async () => {
    const r = await callFn<{ jobs: FuJob[]; rules: FuRule[] }>('admin', { action: 'followups_admin' }).catch(() => ({ jobs: [], rules: [] }))
    setFu(r)
  }

  useEffect(() => { loadThreads(); loadCamps(); loadFu() }, [])
  useEffect(() => { if (active) loadMsgs(active.jid) }, [active?.jid])
  // polling leve pra mensagens novas
  useEffect(() => {
    const t = setInterval(() => { loadThreads(); if (active) loadMsgs(active.jid) }, 15000)
    return () => clearInterval(t)
  }, [active?.jid])

  async function sendMsg() {
    const text = draft.trim()
    if (!text || !active || busy) return
    setBusy(true); setDraft('')
    try {
      await callFn('admin', { action: 'wa_send', jid: active.jid, text })
      await loadMsgs(active.jid); loadThreads()
    } catch (e) { alert((e as Error).message); setDraft(text) }
    setBusy(false)
  }

  const FU_STATUS: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', sent: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-600', cancelled: 'bg-slate-100 text-slate-500' }

  return (
    <div className="card-lux overflow-hidden">
      <div className="p-4 border-b border-line flex items-center gap-2 flex-wrap">
        <MessageSquareText className="h-4 w-4 text-brand-500" />
        <p className="font-semibold text-sm">Inbox IAstetic</p>
        <div className="ml-auto flex gap-1.5">
          {(['chat', 'campanhas', 'followups'] as const).map(k => (
            <button key={k} onClick={() => setSub(k)}
              className={clsx('text-[11px] font-medium rounded-full px-3 py-1 transition', sub === k ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-muted border border-line')}>
              {k === 'chat' ? 'Conversas' : k === 'campanhas' ? 'Campanhas' : 'Follow-ups'}
            </button>
          ))}
          <button className="btn-ghost !p-1.5" onClick={() => { loadThreads(); loadCamps(); loadFu(); if (active) loadMsgs(active.jid) }}><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {sub === 'chat' && (
        <div className="flex h-[460px]">
          {/* lista de conversas */}
          <div className={clsx('w-full sm:w-64 sm:min-w-64 border-r border-line overflow-y-auto', active && 'hidden sm:block')}>
            {threads.length === 0 && <p className="p-4 text-xs text-ink-muted">Nenhuma mensagem ainda — conversas do número do IAstetic aparecem aqui.</p>}
            {threads.map(t => (
              <button key={t.jid} onClick={() => setActive(t)}
                className={clsx('w-full text-left px-4 py-3 border-b border-line/60 hover:bg-canvas transition', active?.jid === t.jid && 'bg-brand-50')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{maskPhoneBR(t.phone ?? '') || t.jid.split('@')[0]}</p>
                  <span className="text-[10px] text-ink-muted shrink-0">{new Date(t.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-xs text-ink-muted truncate mt-0.5">{t.dir === 'out' ? 'Você: ' : ''}{t.last}</p>
              </button>
            ))}
          </div>
          {/* thread */}
          <div className={clsx('flex-1 flex flex-col', !active && 'hidden sm:flex')}>
            {!active ? (
              <div className="flex-1 grid place-items-center text-ink-muted text-xs">seleciona uma conversa</div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
                  <button className="sm:hidden btn-ghost !p-1" onClick={() => setActive(null)}><ChevronRight className="h-4 w-4 rotate-180" /></button>
                  <p className="text-sm font-medium">{maskPhoneBR(active.phone ?? '') || active.jid.split('@')[0]}</p>
                  <span className="text-[10px] text-ink-muted">{active.count} msgs</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-canvas/50">
                  {msgs.map(m => (
                    <div key={m.id} className={clsx('max-w-[80%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap',
                      m.direction === 'out' ? 'bg-brand-500 text-white ml-auto' : 'bg-white border border-line')}>
                      {m.kind !== 'text' && <span className="text-[9px] uppercase tracking-wide opacity-60 block">{m.kind}</span>}
                      {m.content}
                      <span className="block text-[9px] opacity-60 mt-1">{m.source === 'bot' ? '🤖 ' : m.source === 'campaign' ? '📣 ' : ''}{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
                <div className="p-2.5 border-t border-line flex gap-2">
                  <input className="input flex-1 !py-2 text-xs" placeholder="Responder como IAstetic…" value={draft}
                    onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} />
                  <button className="btn-primary !px-3.5 !py-2" onClick={sendMsg} disabled={busy || !draft.trim()}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {sub === 'campanhas' && (
        <div className="p-4 space-y-2 max-h-[460px] overflow-y-auto">
          {camps.length === 0 && <p className="text-xs text-ink-muted">Nenhuma campanha — cria uma na aba Prospecção ou pede pro assistente por voz.</p>}
          {camps.map(c => (
            <div key={c.id} className="rounded-xl border border-line p-3.5 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[11px] text-ink-muted truncate">{c.message}</p>
              </div>
              <span className={clsx('badge text-[10px]', c.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : c.status === 'sending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>{c.status}</span>
              <span className="text-[11px] text-ink-muted">{c.sent_count ?? 0} enviados · {c.failed ?? c.failed_count ?? 0} falhas · {c.pending ?? 0} na fila</span>
            </div>
          ))}
        </div>
      )}

      {sub === 'followups' && (
        <div className="p-4 space-y-4 max-h-[460px] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-ink-muted mb-2 uppercase tracking-wide">Regras ativas por empresa</p>
            {fu.rules.length === 0 && <p className="text-xs text-ink-muted">Nenhuma regra de follow-up criada.</p>}
            <div className="space-y-1.5">
              {fu.rules.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs rounded-lg bg-canvas px-3 py-2">
                  <span className={clsx('h-1.5 w-1.5 rounded-full', r.active ? 'bg-emerald-500' : 'bg-slate-300')} />
                  <span className="font-medium">{r.name}</span>
                  <span className="text-ink-muted">{r.companies?.name} · {r.trigger} · {r.delay_hours}h</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-muted mb-2 uppercase tracking-wide">Envios recentes</p>
            <div className="space-y-1.5">
              {fu.jobs.map(j => (
                <div key={j.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('badge text-[10px]', FU_STATUS[j.status] ?? 'bg-slate-100 text-slate-500')}>{j.status}</span>
                    <span className="font-medium">{j.contacts?.name ?? j.contacts?.phone ?? '—'}</span>
                    <span className="text-ink-muted">{j.companies?.name} · {j.followup_rules?.name}</span>
                    <span className="ml-auto text-ink-muted">{new Date(j.sent_at ?? j.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {j.sent_content && <p className="text-ink-muted mt-1 truncate">{j.sent_content}</p>}
                  {j.error && <p className="text-red-500 mt-1 truncate">{j.error}</p>}
                </div>
              ))}
              {fu.jobs.length === 0 && <p className="text-xs text-ink-muted">Nenhum envio ainda.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminAssistantCard() {
  type Msg = { role: 'user' | 'assistant'; content: string }
  const [messages, setMessages] = useDraft<Msg[]>('admin-assistant:msgs', [])
  const [input, setInput] = useDraft('admin-assistant:input', '')
  const [mode, setMode] = useDraft<'voice' | 'text'>('admin-assistant:mode', 'voice')
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  const [micError, setMicError] = useState(false)
  const [retry, setRetry] = useState(0)
  const { level, startAuto, cancel, ctxState } = useRecorder()
  const player = useRef<HTMLAudioElement | null>(null)
  const loopRef = useRef(0)
  const msgsRef = useRef(messages)
  msgsRef.current = messages

  const STATUS_TXT: Record<string, string> = {
    idle: 'toque no núcleo para falar',
    listening: 'ouvindo… fala comigo',
    thinking: 'processando…',
    speaking: 'falando…',
  }

  useEffect(() => () => { loopRef.current++; cancel(); player.current?.pause() }, [cancel])

  // loop de escuta contínua — modo voz. Recursivo via token: não depende de `status`
  // no effect (mudar pra 'listening' reexecutava o efeito e matava o onDone).
  const listenOnce = async (token: number) => {
    if (token !== loopRef.current) return
    try {
      setStatus('listening')
      await startAuto({
        silenceMs: 1400,
        onDone: async (rec) => {
          if (token !== loopRef.current) return
          if (!rec || !rec.base64.length) { setStatus('idle'); return }
          await handleVoice(rec.base64, rec.mime)
          if (token === loopRef.current) listenOnce(token) // volta a ouvir
        },
      })
    } catch { setMicError(true); setStatus('idle') }
  }

  useEffect(() => {
    if (mode !== 'voice') return
    const token = ++loopRef.current
    listenOnce(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, retry])

  // saindo do modo voz, solta o microfone
  useEffect(() => { if (mode === 'text') { loopRef.current++; cancel(); player.current?.pause(); setStatus('idle') } }, [mode, cancel])

  async function handleVoice(base64: string, mime: string) {
    setStatus('thinking')
    try {
      const r = await callFn<{ reply: string; transcript?: string | null; audio?: string | null }>('admin', {
        action: 'admin_assistant', audio: base64, audio_mime: mime, voice: true, history: msgsRef.current.slice(-20),
      })
      const t = (r.transcript ?? '').trim()
      if (/quero escrever|modo texto|prefiro digitar|vou digitar|quero digitar/i.test(t)) {
        setMessages([...msgsRef.current, { role: 'user', content: `🎙 ${t}` }, { role: 'assistant', content: 'Modo texto ativado — manda.' }])
        setMode('text'); return
      }
      setMessages([...msgsRef.current, { role: 'user', content: `🎙 ${t || '(áudio)'}` }, { role: 'assistant', content: r.reply || '…' }])
      if (r.audio) {
        setStatus('speaking')
        await new Promise<void>(res => {
          const a = new Audio(r.audio!)
          player.current = a
          a.onended = () => res(); a.onerror = () => res()
          a.play().catch(() => res())
        })
      }
    } catch (e) {
      setMessages([...msgsRef.current, { role: 'assistant', content: `Erro: ${(e as Error).message}` }])
    }
  }

  async function send() {
    const q = input.trim()
    if (!q) return
    setInput('')
    const next = [...messages, { role: 'user' as const, content: q }]
    setMessages(next); setStatus('thinking')
    try {
      const r = await callFn<{ reply: string; audio?: string | null }>('admin', { action: 'admin_assistant', message: q, voice: false, history: next.slice(-20) })
      setMessages([...next, { role: 'assistant', content: r.reply || '…' }])
    } catch (e) { setMessages([...next, { role: 'assistant', content: `Erro: ${(e as Error).message}` }]) }
    setStatus('idle')
  }

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')?.content

  return (
    <div className="card-lux max-w-2xl flex flex-col h-[560px] overflow-hidden">
      <div className="p-4 border-b border-line flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-brand-500" />
        <p className="font-semibold text-sm">Assistente executivo</p>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setMode('voice')}
            className={clsx('text-[10px] font-medium rounded-full px-2.5 py-1 transition flex items-center gap-1', mode === 'voice' ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-muted border border-line')}>
            <Mic className="h-3 w-3" /> voz
          </button>
          <button onClick={() => setMode('text')}
            className={clsx('text-[10px] font-medium rounded-full px-2.5 py-1 transition', mode === 'text' ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-muted border border-line')}>
            texto
          </button>
        </div>
      </div>

      {mode === 'voice' && (
        <div className="relative flex flex-col items-center justify-center py-6 px-4 border-b border-line bg-gradient-to-b from-brand-50/60 to-transparent">
          {/* anéis neurais */}
          <div className="relative grid place-items-center">
            {status === 'listening' && (
              <>
                <span className="absolute h-36 w-36 rounded-full bg-brand-400/20 animate-ping" style={{ animationDuration: '2.2s' }} />
                <span className="absolute h-28 w-28 rounded-full bg-brand-400/25 animate-ping" style={{ animationDuration: '1.6s' }} />
              </>
            )}
            {status === 'thinking' && <span className="absolute h-28 w-28 rounded-full border-2 border-brand-400/40 border-t-brand-500 animate-spin" />}
            {status === 'speaking' && <span className="absolute h-32 w-32 rounded-full bg-brand-500/15 animate-pulse" />}
            <button
              onClick={() => { unlockMicAudio(); setMicError(false); setRetry(r => r + 1) }}
              className="relative h-24 w-24 rounded-full grid place-items-center transition-transform shadow-xl shadow-brand-500/30"
              style={{
                background: 'radial-gradient(circle at 35% 30%, #c4b5fd, #8b5cf6 55%, #5b21b6)',
                transform: `scale(${1 + level * 0.25})`,
              }}>
              {status === 'listening'
                ? <Activity className="h-8 w-8 text-white" style={{ opacity: 0.5 + level * 0.5 }} />
                : status === 'thinking'
                  ? <Loader2 className="h-8 w-8 text-white animate-spin" />
                  : status === 'speaking'
                    ? <Volume2 className="h-8 w-8 text-white animate-pulse" />
                    : <Mic className="h-8 w-8 text-white" />}
            </button>
          </div>
          <p className="mt-5 text-xs font-medium text-ink-soft">{micError ? 'sem acesso ao microfone — toque pra tentar de novo' : STATUS_TXT[status]}</p>
          {lastAssistant && <p className="mt-2 text-[11px] text-ink-muted text-center max-w-sm line-clamp-2 italic">"{lastAssistant}"</p>}
          <p className="mt-3 text-[10px] text-ink-muted/70">diga “quero escrever com você” para mudar pro modo texto</p>
          {status === 'listening' && <p className="mt-1 text-[9px] font-mono text-ink-muted/50">mic {ctxState()} · vol {(level / 10).toFixed(3)}</p>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && mode === 'text' && (
          <div className="text-center pt-8">
            <BrainCircuit className="h-10 w-10 text-brand-300 mx-auto" />
            <p className="text-sm text-ink-muted mt-3">Sou seu executivo — pergunta ou manda executar:</p>
            <div className="flex gap-2 flex-wrap justify-center mt-3">
              {['Resumo do mês', 'Quantos leads temos?', 'Cria uma campanha pra barbearias sem site', 'Envie cobrança pra quem tá pendente', 'O que chegou no WhatsApp hoje?'].map(s => (
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
        {status === 'thinking' && mode === 'text' && <div className="bg-canvas border border-line rounded-2xl px-4 py-2.5 text-sm w-fit"><Loader2 className="h-4 w-4 animate-spin text-brand-500" /></div>}
      </div>

      {mode === 'text' && (
        <div className="p-3 border-t border-line flex gap-2">
          <input className="input flex-1" placeholder="Pergunte ou mande executar…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
          <button className="btn-primary !px-4" onClick={send} disabled={!input.trim() || status === 'thinking'}><Send className="h-4 w-4" /></button>
        </div>
      )}
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
  const [support, setSupport] = useState({ phone: '', name: 'Eduardo Daflon', photo: '' })
  const [busy, setBusy] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'support_whatsapp').maybeSingle()
      .then(({ data }) => { if (data?.value) setSupport({ phone: '', name: 'Eduardo Daflon', photo: '', ...data.value }) })
  }, [])

  async function save() {
    setBusy('fees')
    await callFn('admin', { action: 'update_fees', withdrawal_percent: pct, min_withdrawal_cents: minCents })
    setBusy(''); setSaved('fees'); setTimeout(() => setSaved(''), 2500)
  }
  async function saveSupport() {
    setBusy('support')
    await callFn('admin', { action: 'update_settings', key: 'support_whatsapp', value: { ...support, role: 'Desenvolvedor da plataforma' } })
    setBusy(''); setSaved('support'); setTimeout(() => setSaved(''), 2500)
  }

  return (
    <div className="grid sm:grid-cols-2 gap-5 max-w-3xl">
      <div className="card-lux p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-brand-500" /> Taxas da plataforma</h3>
        <div>
          <label className="label">Taxa de saque (%)</label>
          <input type="number" min={0} max={30} step={0.5} className="input" value={pct} onChange={e => setPct(+e.target.value)} />
        </div>
        <div>
          <label className="label">Saque mínimo (centavos)</label>
          <input type="number" min={100} step={100} className="input" value={minCents} onChange={e => setMinCents(+e.target.value)} />
        </div>
        <button className="btn-primary" onClick={save} disabled={busy === 'fees'}>{busy === 'fees' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{saved === 'fees' ? 'Salvo ✓' : 'Salvar'}</button>
      </div>

      <div className="card-lux p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-brand-500" /> Contato de suporte</h3>
        <p className="text-[11px] text-ink-muted">Aparece na landing ("fale comigo") e na página de Suporte das empresas — botão que abre o WhatsApp direto.</p>
        <div>
          <label className="label">Nome exibido</label>
          <input className="input" value={support.name} onChange={e => setSupport({ ...support, name: e.target.value })} placeholder="Eduardo Daflon" />
        </div>
        <div>
          <label className="label">WhatsApp (com DDD)</label>
          <input className="input" inputMode="numeric" value={maskPhoneBR((support.phone || '').replace(/^55/, ''))}
            onChange={e => setSupport({ ...support, phone: '55' + e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="(22) 99999-9999" />
        </div>
        <div>
          <label className="label">Foto (URL, opcional)</label>
          <input className="input" value={support.photo} onChange={e => setSupport({ ...support, photo: e.target.value })} placeholder="https://…/foto.jpg — vazio mostra iniciais" />
        </div>
        <button className="btn-primary" onClick={saveSupport} disabled={busy === 'support'}>{busy === 'support' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{saved === 'support' ? 'Salvo ✓' : 'Salvar'}</button>
      </div>
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
            {p.yearly_price_cents != null && (
              <p className="text-[11px] text-emerald-600 font-medium">
                {brl(p.yearly_price_cents)}/ano ({Math.round((1 - p.yearly_price_cents / (p.price_cents * 12)) * 100)}% off)
              </p>
            )}
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
                <div><label className="label">Stripe price ID (mensal)</label><input className="input" value={editing.stripe_price_id ?? ''} onChange={e => setEditing({ ...editing, stripe_price_id: e.target.value || null })} /></div>
                <div><label className="label">Stripe price ID (anual)</label><input className="input" value={editing.stripe_yearly_price_id ?? ''} onChange={e => setEditing({ ...editing, stripe_yearly_price_id: e.target.value || null })} /></div>
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

// ================= PROSPECÇÃO =================
const LEAD_STATUS = [
  { id: 'novo', label: 'Novo', cls: 'bg-slate-100 text-slate-600' },
  { id: 'contatado', label: 'Contatado', cls: 'bg-blue-100 text-blue-700' },
  { id: 'respondeu', label: 'Respondeu', cls: 'bg-emerald-100 text-emerald-700' },
  { id: 'convertido', label: 'Convertido', cls: 'bg-brand-100 text-brand-700' },
  { id: 'descartado', label: 'Descartado', cls: 'bg-red-100 text-red-500' },
]
const DEFAULT_PROSPECT_MSG = `Oi! Tudo bem? Vi o {nome} aqui em {cidade} e reparei que vocês ainda não têm página de agendamento própria 🙂

Eu sou da IAstetic — a gente coloca uma recepcionista com IA no WhatsApp do estabelecimento: ela agenda, responde clientes, cobra sinal no Pix e ainda cria um site de agendamento com a cara do seu negócio.

Posso te mandar uma demonstração rapidinho?`

function ProspectCard() {
  const [sub, setSub] = useState<'scan' | 'leads' | 'camps'>('scan')
  const [stats, setStats] = useState<any>(null)
  const [scans, setScans] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [camps, setCamps] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ niche: 'todos', city: '', uf: '', radius_km: 5 })
  const [f, setF] = useState({ only_no_site: false, only_valid_whatsapp: false, niche: '', status: '', search: '' })
  const pgLeads = usePaged(leads, 15, [f.niche, f.status, f.only_no_site, f.only_valid_whatsapp, f.search])
  const [camp, setCamp] = useState({ name: '', message: DEFAULT_PROSPECT_MSG, image_url: '', image_prompt: '', audience: 'no_site_whatsapp', interval_sec: 45, vary_messages: true })
  const [imgPrompt, setImgPrompt] = useState('')
  const [imgEdit, setImgEdit] = useState(false)

  async function loadStats() { const d = await callFn<any>('admin', { action: 'prospect_stats' }).catch(() => null); setStats(d) }
  async function loadScans() { const d = await callFn<any[]>('admin', { action: 'prospect_scans' }).catch(() => []); setScans(d ?? []) }
  async function loadLeads() {
    const d = await callFn<any[]>('admin', {
      action: 'prospect_leads', niche: f.niche || undefined, status: f.status || undefined,
      only_no_site: f.only_no_site || undefined, only_valid_whatsapp: f.only_valid_whatsapp || undefined,
      search: f.search || undefined,
    }).catch(() => [])
    setLeads(d ?? [])
  }
  async function loadCamps() { const d = await callFn<any[]>('admin', { action: 'prospect_campaigns' }).catch(() => []); setCamps(d ?? []) }
  useEffect(() => { loadStats(); loadScans(); loadCamps() }, [])
  useEffect(() => { loadLeads() }, [f.niche, f.status, f.only_no_site, f.only_valid_whatsapp])

  async function scan() {
    if (!form.city.trim()) { setMsg('Informe a cidade.'); return }
    setBusy('scan'); setMsg('')
    try {
      const r = await callFn<any>('admin', { action: 'prospect_scan', niche: form.niche, city: form.city.trim(), uf: form.uf.trim(), radius_km: form.radius_km })
      setMsg(`Varredura concluída: ${r.found} encontrados, ${r.saved} salvos, ${r.without_site} sem site, ${r.whatsapp_valid} com WhatsApp válido.`)
      setSub('leads'); setF(x => ({ ...x, only_no_site: true, only_valid_whatsapp: true }))
      loadStats(); loadScans()
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }

  async function checkWa() {
    setBusy('wa')
    try { const r = await callFn<any>('admin', { action: 'prospect_check_whatsapp' }); setMsg(`Verificados ${r.checked} números — ${r.valid} com WhatsApp.`) }
    catch (e) { setMsg((e as Error).message) }
    setBusy(''); loadLeads(); loadStats()
  }

  async function saveCamp() {
    setBusy('camp')
    try {
      await callFn('admin', { action: 'prospect_campaign_save', ...camp })
      setMsg('Campanha salva.'); setCamp({ name: '', message: DEFAULT_PROSPECT_MSG, image_url: '', image_prompt: '', audience: 'no_site_whatsapp', interval_sec: 45, vary_messages: true }); loadCamps()
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }

  async function launch(id: string) {
    if (!confirm('Disparar a campanha? Os envios saem 1 a 1 pelo WhatsApp do admin, com intervalo.')) return
    setBusy(`launch-${id}`)
    try {
      const r = await callFn<any>('admin', { action: 'prospect_campaign_launch', campaign_id: id, lead_ids: selected.size ? [...selected] : undefined })
      setMsg(`${r.queued} envios na fila — 1 a cada ~${r.interval_sec}s.`); setSelected(new Set()); loadCamps()
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }

  async function genImg() {
    if (imgPrompt.trim().length < 4) { setMsg('Descreva a imagem.'); return }
    setBusy('img')
    try {
      const r = await callFn<any>('admin', { action: 'prospect_gen_image', prompt: imgPrompt, edit_of: imgEdit ? camp.image_prompt : undefined })
      setCamp(c => ({ ...c, image_url: r.url, image_prompt: r.prompt })); setImgPrompt(''); setImgEdit(false)
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }

  const stBadge = (s: string) => LEAD_STATUS.find(x => x.id === s) ?? LEAD_STATUS[0]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          ['Leads', stats?.total], ['WhatsApp ✓', stats?.valid_whatsapp], ['Sem site', stats?.without_site],
          ['Quentes', stats?.hot], ['Contatados', stats?.contacted], ['Responderam', stats?.replied], ['Convertidos', stats?.converted],
        ].map(([l, v]) => (
          <div key={l as string} className="card-lux p-3 text-center">
            <div className="font-display text-xl font-bold">{v ?? '—'}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {msg && <div className="card-lux p-3 text-sm text-brand-700 bg-brand-50 border-brand-200">{msg}</div>}

      <div className="flex gap-1 border-b border-ink/10">
        {[['scan', 'Varredura', Search], ['leads', `Leads${leads.length ? ` (${leads.length})` : ''}`, MapPin], ['camps', 'Campanhas', Megaphone]].map(([k, l, I]: any) => (
          <button key={k} onClick={() => setSub(k)}
            className={clsx('px-4 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
              sub === k ? 'text-brand-600 border-brand-500' : 'text-ink-muted border-transparent hover:text-ink')}>
            <I className="h-3.5 w-3.5" />{l}
          </button>
        ))}
      </div>

      {sub === 'scan' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card-lux p-5 space-y-4">
            <h3 className="font-display font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-brand-500" /> Nova varredura</h3>
            <p className="text-xs text-ink-muted">Busca estabelecimentos de beleza em dados públicos de mapa — com <code className="text-[10px]">SERPER_API_KEY</code> em Integrações usa o Google Maps real (mais telefones). Depois valida WhatsApp pela instância do admin.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nicho</label>
                <select className="input" value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })}>
                  <option value="todos">Todos</option>
                  {Object.values(NICHES).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Raio (km)</label>
                <input className="input" type="number" min={1} max={30} value={form.radius_km} onChange={e => setForm({ ...form, radius_km: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="São Paulo" />
              </div>
              <div>
                <label className="label">UF</label>
                <input className="input" maxLength={2} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} placeholder="SP" />
              </div>
            </div>
            <button className="btn-primary w-full" onClick={scan} disabled={busy === 'scan'}>
              {busy === 'scan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Varrer região
            </button>
            {busy === 'scan' && <p className="text-[11px] text-ink-muted text-center">Buscando e validando WhatsApp — pode levar ~1 min.</p>}
          </div>
          <div className="card-lux p-5">
            <h3 className="font-display font-semibold mb-3">Varreduras recentes</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {scans.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink/10 p-3 text-xs">
                  <div>
                    <div className="font-semibold">{s.city}{s.uf ? `/${s.uf}` : ''} · {NICHES[s.niche as keyof typeof NICHES]?.name ?? 'Todos'}</div>
                    <div className="text-ink-muted">{new Date(s.created_at).toLocaleString('pt-BR')} · raio {(s.radius_m / 1000).toFixed(0)}km</div>
                  </div>
                  <div className="text-right text-[10px] text-ink-muted">
                    <div><b className="text-ink">{s.saved}</b> leads</div>
                    <div>{s.whatsapp_valid} WA ✓ · {s.without_site} sem site</div>
                  </div>
                </div>
              ))}
              {!scans.length && <p className="text-xs text-ink-muted">Nenhuma varredura ainda — faça a primeira ao lado.</p>}
            </div>
          </div>
        </div>
      )}

      {sub === 'leads' && (
        <div className="card-lux p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input !w-48" placeholder="Buscar nome/telefone" value={f.search}
              onChange={e => setF({ ...f, search: e.target.value })} onKeyDown={e => e.key === 'Enter' && loadLeads()} />
            <select className="input !w-40" value={f.niche} onChange={e => setF({ ...f, niche: e.target.value })}>
              <option value="">Todos os nichos</option>
              {Object.values(NICHES).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select className="input !w-36" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
              <option value="">Qualquer status</option>
              {LEAD_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
              <input type="checkbox" checked={f.only_no_site} onChange={e => setF({ ...f, only_no_site: e.target.checked })} /> sem site
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
              <input type="checkbox" checked={f.only_valid_whatsapp} onChange={e => setF({ ...f, only_valid_whatsapp: e.target.checked })} /> WhatsApp ✓
            </label>
            <div className="flex-1" />
            <button className="btn-ghost text-xs" onClick={checkWa} disabled={busy === 'wa'}>
              {busy === 'wa' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Revalidar WhatsApp
            </button>
            <span className="text-[10px] text-ink-muted">{selected.size} selecionados</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted border-b border-ink/10">
                  <th className="p-2 w-6"><input type="checkbox" checked={selected.size === leads.length && leads.length > 0}
                    onChange={e => setSelected(e.target.checked ? new Set(leads.map(l => l.id)) : new Set())} /></th>
                  <th className="p-2">Estabelecimento</th><th className="p-2">Telefone</th><th className="p-2">Nicho</th>
                  <th className="p-2">Local</th><th className="p-2">Sinais</th><th className="p-2">Status</th><th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {pgLeads.slice.map(l => (
                  <tr key={l.id} className="border-b border-ink/5 hover:bg-brand-50/40">
                    <td className="p-2"><input type="checkbox" checked={selected.has(l.id)}
                      onChange={e => { const s = new Set(selected); if (e.target.checked) s.add(l.id); else s.delete(l.id); setSelected(s) }} /></td>
                    <td className="p-2">
                      <div className="font-semibold">{l.name}</div>
                      {l.address && <div className="text-[10px] text-ink-muted">{l.address}</div>}
                    </td>
                    <td className="p-2 font-mono text-[11px]">{l.phone ?? '—'}</td>
                    <td className="p-2"><span className="badge bg-brand-50 text-brand-700 text-[10px]">{NICHES[l.niche as keyof typeof NICHES]?.name ?? l.niche}</span></td>
                    <td className="p-2 text-ink-muted">{l.city}{l.uf ? `/${l.uf}` : ''}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        {l.whatsapp_valid === true && <span className="badge bg-emerald-100 text-emerald-700 text-[9px]">WA ✓</span>}
                        {l.whatsapp_valid === false && <PhoneOff className="h-3.5 w-3.5 text-red-400" />}
                        {l.whatsapp_valid === null && <span className="badge bg-slate-100 text-slate-500 text-[9px]">WA?</span>}
                        {!l.has_site && <span className="badge bg-amber-100 text-amber-700 text-[9px]">sem site</span>}
                        {l.site_url && <a href={l.site_url.startsWith('http') ? l.site_url : `https://${l.site_url}`} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5 text-ink-muted hover:text-brand-600" /></a>}
                        {l.instagram && <a href={`https://instagram.com/${String(l.instagram).replace('@', '')}`} target="_blank" rel="noreferrer" className="badge bg-pink-100 text-pink-600 text-[9px]">IG</a>}
                        {l.facebook && <a href={`https://facebook.com/${String(l.facebook).replace('@', '')}`} target="_blank" rel="noreferrer" className="badge bg-blue-100 text-blue-600 text-[9px]">FB</a>}
                      </div>
                    </td>
                    <td className="p-2">
                      <select value={l.status} className={clsx('badge text-[9px] border-0 cursor-pointer', stBadge(l.status).cls)}
                        onChange={async e => { await callFn('admin', { action: 'prospect_lead_update', id: l.id, status: e.target.value }); loadLeads(); loadStats() }}>
                        {LEAD_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <button className="text-ink-muted hover:text-red-500" onClick={async () => { await callFn('admin', { action: 'prospect_lead_delete', id: l.id }); loadLeads(); loadStats() }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!leads.length && <tr><td colSpan={8} className="p-6 text-center text-ink-muted">Nenhum lead — faça uma varredura primeiro.</td></tr>}
              </tbody>
            </table>
            <Pagination page={pgLeads.page} pages={pgLeads.pages} total={pgLeads.total} onChange={pgLeads.setPage} className="pb-3" />
          </div>
          {selected.size > 0 && <p className="text-[11px] text-ink-muted">Dica: selecione leads e dispare uma campanha só pra eles na aba Campanhas.</p>}
        </div>
      )}

      {sub === 'camps' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card-lux p-5 space-y-3">
            <h3 className="font-display font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-brand-500" /> Nova campanha</h3>
            <input className="input" placeholder="Nome da campanha" value={camp.name} onChange={e => setCamp({ ...camp, name: e.target.value })} />
            <div>
              <textarea className="input min-h-32" value={camp.message} onChange={e => setCamp({ ...camp, message: e.target.value })} />
              <p className="text-[10px] text-ink-muted mt-1">Variáveis: {'{nome}'} {'{cidade}'} {'{nicho}'} — quem responder entra no funil de vendas da IA do admin.</p>
            </div>
            <select className="input" value={camp.audience} onChange={e => setCamp({ ...camp, audience: e.target.value })}>
              <option value="no_site_whatsapp">Sem site + WhatsApp válido (quentes)</option>
              <option value="all_valid">Todos com WhatsApp válido</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Intervalo entre envios (seg)</label>
                <input className="input" inputMode="numeric" maxLength={3} value={camp.interval_sec}
                  onChange={e => setCamp({ ...camp, interval_sec: Math.min(600, Math.max(15, Number(e.target.value.replace(/\D/g, '')) || 15)) })} />
                <p className="text-[10px] text-ink-muted mt-0.5">15–600s — espaça os disparos p/ não parecer spam.</p>
              </div>
              <label className="flex items-start gap-2 text-xs text-ink-soft cursor-pointer pt-5">
                <input type="checkbox" className="accent-brand-500 h-4 w-4 mt-0.5" checked={camp.vary_messages} onChange={e => setCamp({ ...camp, vary_messages: e.target.checked })} />
                Variar a mensagem com IA — cada lead recebe uma redação diferente
              </label>
            </div>
            {camp.image_url ? (
              <div className="space-y-2">
                <div className="relative">
                  <img src={camp.image_url} className="rounded-xl w-full" />
                  <button className="absolute top-2 right-2 btn-ghost !p-1.5 bg-white/80" onClick={() => { setCamp({ ...camp, image_url: '', image_prompt: '' }); setImgEdit(false) }}><X className="h-3.5 w-3.5" /></button>
                </div>
                {imgEdit ? (
                  <div className="flex gap-2">
                    <input className="input" placeholder="O que ajustar na arte? Ex.: coloca um cachorro" value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} autoFocus
                      onKeyDown={e => e.key === 'Enter' && genImg()} />
                    <button className="btn-ghost text-xs whitespace-nowrap" onClick={genImg} disabled={busy === 'img'}>
                      {busy === 'img' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkle className="h-3.5 w-3.5" />} Aplicar
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost text-xs" onClick={() => setImgEdit(true)}><Pencil className="h-3.5 w-3.5" /> Editar arte</button>
                )}
              </div>
            ) : (
              <div className="flex gap-2"><input className="input" placeholder="Descreva a arte da campanha pra gerar com IA…" value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && genImg()} />
                <button className="btn-ghost text-xs whitespace-nowrap" onClick={genImg} disabled={busy === 'img'}>{busy === 'img' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkle className="h-3.5 w-3.5" />} Gerar</button></div>
            )}
            <button className="btn-primary w-full" onClick={saveCamp} disabled={!!busy}>{busy === 'camp' && <Loader2 className="h-4 w-4 animate-spin" />} Salvar campanha</button>
          </div>

          <div className="space-y-3">
            {camps.map(c => (
              <div key={c.id} className="card-lux p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm">{c.name}</div>
                  <span className={clsx('badge text-[10px]', c.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : c.status === 'sending' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                    {c.status === 'sent' ? 'concluída' : c.status === 'sending' ? 'disparando' : 'rascunho'}
                  </span>
                </div>
                <p className="text-xs text-ink-muted line-clamp-2">{c.message}</p>
                {c.image_url && <img src={c.image_url} className="rounded-lg max-h-24 object-cover" />}
                <div className="flex items-center justify-between text-[11px] text-ink-muted">
                  <span>{c.sent_count} enviados · {c.pending} na fila · {c.failed} falhas</span>
                  <span>{c.audience === 'no_site_whatsapp' ? 'sem site + WA' : 'todos com WA'}</span>
                </div>
                {c.status !== 'sent' && (
                  <button className="btn-primary w-full !py-2 text-xs" onClick={() => launch(c.id)} disabled={!!busy}>
                    {busy === `launch-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Disparar{selected.size ? ` para ${selected.size} selecionados` : ' para a audiência'}
                  </button>
                )}
              </div>
            ))}
            {!camps.length && <p className="text-xs text-ink-muted text-center py-8">Nenhuma campanha ainda.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ================= SUPORTE =================
const TICKET_STATUS: Record<string, [string, string]> = {
  aberto: ['Aberto', 'bg-amber-100 text-amber-700'],
  em_atendimento: ['Em atendimento', 'bg-blue-100 text-blue-700'],
  aguardando_empresa: ['Aguardando empresa', 'bg-violet-100 text-violet-700'],
  resolvido: ['Resolvido', 'bg-emerald-100 text-emerald-700'],
}
const TICKET_CATS: Record<string, string> = { duvida: 'Dúvida', bug: 'Algo quebrou', whatsapp: 'WhatsApp/IA', financeiro: 'Financeiro', sugestao: 'Sugestão' }

function SupportCard() {
  const [tickets, setTickets] = useState<any[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [filter, setFilter] = useState('')
  const pgTk = usePaged(tickets, 12, [filter])
  const [detail, setDetail] = useState<any>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState('')

  async function load() {
    const d = await callFn<any>('admin', { action: 'support_list', status: filter || undefined }).catch(() => null)
    setTickets(d?.tickets ?? []); setOpenCount(d?.open ?? 0)
  }
  useEffect(() => { load() }, [filter])

  async function openTicket(id: string) {
    const d = await callFn<any>('admin', { action: 'support_get', id }).catch(() => null)
    setDetail(d); load()
  }

  async function sendReply() {
    if (!reply.trim() || !detail) return
    setBusy('reply')
    await callFn('admin', { action: 'support_reply', ticket_id: detail.ticket.id, message: reply }).catch(() => {})
    setReply(''); setBusy('')
    openTicket(detail.ticket.id)
  }

  async function setStatus(id: string, status: string) {
    await callFn('admin', { action: 'support_status', id, status }).catch(() => {})
    if (detail?.ticket?.id === id) setDetail({ ...detail, ticket: { ...detail.ticket, status } })
    load()
  }

  const st = (s: string) => TICKET_STATUS[s] ?? TICKET_STATUS.aberto

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-brand-500" /> Chamados
            {openCount > 0 && <span className="badge bg-amber-100 text-amber-700 text-[10px]">{openCount} abertos</span>}</h3>
          <select className="input !w-36 !py-1.5 text-xs" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="space-y-2 max-h-[65vh] overflow-y-auto">
          {pgTk.slice.map(t => (
            <button key={t.id} onClick={() => openTicket(t.id)}
              className={clsx('card-lux p-3.5 w-full text-left transition', detail?.ticket?.id === t.id && 'ring-2 ring-brand-400')}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm truncate">{t.subject}</p>
                <span className={clsx('badge text-[9px] shrink-0', st(t.status)[1])}>{st(t.status)[0]}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-ink-muted">
                <span>{t.companies?.name} · {TICKET_CATS[t.category] ?? t.category}</span>
                <span>{new Date(t.updated_at).toLocaleDateString('pt-BR')}</span>
              </div>
            </button>
          ))}
          {!tickets.length && <p className="card-lux p-8 text-center text-xs text-ink-muted">Nenhum chamado{filter ? ' com esse status' : ''} — tudo em dia.</p>}
          <Pagination page={pgTk.page} pages={pgTk.pages} total={pgTk.total} onChange={pgTk.setPage} />
        </div>
      </div>

      <div className="lg:col-span-3">
        {detail ? (
          <div className="card-lux overflow-hidden flex flex-col" style={{ height: '70vh' }}>
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{detail.ticket.subject}</h3>
                <p className="text-[11px] text-ink-muted">
                  {detail.ticket.companies?.name} · {TICKET_CATS[detail.ticket.category]} ·
                  {detail.ticket.companies?.whatsapp_public ? ` WA ${detail.ticket.companies.whatsapp_public}` : ' sem WhatsApp'}
                </p>
              </div>
              <select className="input !w-40 !py-1.5 text-xs" value={detail.ticket.status}
                onChange={e => setStatus(detail.ticket.id, e.target.value)}>
                {Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(detail.messages ?? []).map((m: any) => (
                <div key={m.id} className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  m.sender === 'admin' ? 'ml-auto bg-brand-600 text-white rounded-br-md' : 'bg-ink/5 rounded-bl-md')}>
                  {m.body}
                  <div className={clsx('text-[9px] mt-1', m.sender === 'admin' ? 'text-white/60' : 'text-ink-muted')}>
                    {m.sender === 'admin' ? 'Você · ' : `${detail.ticket.companies?.name} · `}{new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-line flex gap-2">
              <input className="input flex-1" placeholder="Responder como suporte…" value={reply}
                onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} />
              <button className="btn-primary !px-4" onClick={sendReply} disabled={busy === 'reply' || !reply.trim()}>
                {busy === 'reply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="card-lux p-10 text-center text-sm text-ink-muted h-64 grid place-items-center">
            Selecione um chamado pra ver a conversa e responder.
          </div>
        )}
      </div>
    </div>
  )
}
