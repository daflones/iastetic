import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import {
  CalendarCheck, MessageCircle, Users, Bot, ArrowRight, Wallet,
  TrendingUp, TrendingDown, Sparkles, ArrowUpRight, Wifi, WifiOff, Crown, LifeBuoy,
} from 'lucide-react'
import { supabase, brl, callFn } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { NICHES } from '@/lib/niches'
import Art from '@/components/ui/Art'
import clsx from 'clsx'

interface Stats {
  contacts_total: number; contacts_new: number; conversations_open: number
  messages_in: number; messages_ai: number; appointments: number; appointments_ai: number
  appointments_today: number; no_shows: number; revenue_cents: number; received_cents: number
  stages: Record<string, number>
  top_services: { name: string; count: number; revenue: number }[]
  daily: { day: string; messages: number; appointments: number }[]
  wallet: { balance: number; reserved: number } | null
}

const fadeUp = { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } }
const FUNNEL_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b', '#ef4444']

function Delta({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span className={clsx('badge text-[10px] font-bold', up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400')}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export default function DashboardPage() {
  const { company } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [notifs, setNotifs] = useState<any[]>([])
  const [handoffs, setHandoffs] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [quota, setQuota] = useState<any>(null)
  const [inst, setInst] = useState<any>(null)
  const [supportWaiting, setSupportWaiting] = useState(0)

  useEffect(() => {
    if (!company) return
    supabase.rpc('dashboard_stats', { p_company: company.id }).then(({ data }) => setStats(data as Stats))
    supabase.from('notifications').select('*').eq('company_id', company.id).eq('read', false).order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setNotifs(data ?? []))
    supabase.from('conversations').select('id,ai_state,contacts(name,push_name,phone)').eq('company_id', company.id).eq('mode', 'human').eq('status', 'open')
      .then(({ data }) => setHandoffs((data ?? []).filter((c: any) => c.ai_state?.handoff_at && !c.ai_state?.handoff_answered)))
    supabase.from('campaigns').select('id,title,sent_count,total_targets,status').eq('company_id', company.id).eq('status', 'sending')
      .then(({ data }) => setCampaigns(data ?? []))
    // consumo do plano + status da conexão
    callFn<any>('payments', { action: 'quota_status' }).then(r => setQuota(r)).catch(() => {})
    supabase.from('instances').select('instance_name,label,phone,status,ai_enabled,last_seen_at').eq('company_id', company.id)
      .order('created_at').limit(1).maybeSingle().then(({ data }) => setInst(data))
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('status', 'aguardando_empresa')
      .then(({ count }) => setSupportWaiting(count ?? 0))
  }, [company?.id])

  const niche = company ? NICHES[company.niche] : null
  const nicheKey = company?.niche ?? 'estetica'

  // deltas: últimos 15d vs 15d anteriores (usa série diária de 30d)
  const deltas = useMemo(() => {
    const d = stats?.daily ?? []
    const half = Math.floor(d.length / 2)
    const sum = (arr: typeof d, k: 'messages' | 'appointments') => arr.reduce((a, x) => a + x[k], 0)
    const pct = (prev: number, cur: number) => prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100
    return {
      messages: pct(sum(d.slice(0, half), 'messages'), sum(d.slice(half), 'messages')),
      appointments: pct(sum(d.slice(0, half), 'appointments'), sum(d.slice(half), 'appointments')),
    }
  }, [stats])

  const funnel = useMemo(() => {
    const labels: Record<string, string> = { novo: 'Novos', interessado: 'Interessadas', agendado: 'Agendadas', cliente: 'Clientes', inativo: 'Inativas', perdido: 'Perdidas' }
    return (['novo', 'interessado', 'agendado', 'cliente', 'inativo', 'perdido'] as const)
      .map((s, i) => ({ name: labels[s], value: stats?.stages?.[s] ?? 0, color: FUNNEL_COLORS[i] }))
      .filter(f => f.value > 0)
  }, [stats])

  const cards = [
    { label: 'Agendamentos hoje', value: stats?.appointments_today ?? '—', icon: CalendarCheck, to: '/app/agenda', delta: deltas.appointments },
    { label: 'Conversas ativas', value: stats?.conversations_open ?? '—', icon: MessageCircle, to: '/app/chat', delta: deltas.messages },
    { label: 'Agendados pela IA (30d)', value: stats?.appointments_ai ?? '—', icon: Bot, to: '/app/agenda', delta: deltas.appointments },
    { label: 'Receita realizada (30d)', value: stats ? brl(stats.revenue_cents) : '—', icon: TrendingUp, to: '/app/agenda', delta: deltas.appointments },
    { label: 'Novos contatos (30d)', value: stats?.contacts_new ?? '—', icon: Users, to: '/app/contatos', delta: deltas.messages },
    { label: 'Saldo da carteira', value: stats?.wallet ? brl(stats.wallet.balance) : '—', icon: Wallet, to: '/app/carteira', delta: 0 },
  ]

  return (
    <div className="space-y-6 relative">
      {/* orbes decorativos */}
      <div className="orb h-72 w-72 bg-brand-300 -top-20 -right-16" />
      <div className="orb h-56 w-56 bg-accent-300 top-96 -left-24" style={{ animationDelay: '-6s' }} />

      {/* banner de boas-vindas com arte do nicho */}
      <motion.div {...fadeUp} className="card-lux relative overflow-hidden">
        <Art name={`dash-hero-${nicheKey}`} alt=""
          className="absolute inset-y-0 right-0 h-full w-2/3 object-cover object-left opacity-70 [mask-image:linear-gradient(to_right,transparent,black_45%)]"
          placeholderClass="absolute inset-y-0 right-0 h-full w-2/3 opacity-60 [mask-image:linear-gradient(to_right,transparent,black_45%)]" />
        <div className="relative p-6 sm:p-8 max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-500 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" /> painel {niche ? `• ${niche.name}` : ''}
          </p>
          <h1 className="h-display text-2xl sm:text-3xl mt-2">Olá, {company?.name}</h1>
          <p className="text-sm text-ink-muted mt-1.5">Sua IA trabalhou enquanto você dormia — aqui está o resumo.</p>
          <Link to="/app/chat" className="btn-primary text-sm mt-5">Abrir chat ao vivo <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </motion.div>

      {/* alerta: clientes pedindo atendimento humano */}
      {handoffs.length > 0 && (
        <motion.div {...fadeUp} className="card-lux !border-red-200 bg-red-50/60 p-4 flex flex-wrap items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-red-100 grid place-items-center text-red-500 animate-pulse shrink-0">🆘</span>
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-sm text-red-700">{handoffs.length} cliente{handoffs.length > 1 ? 's' : ''} pedindo atendimento humano</p>
            <p className="text-xs text-red-500">{handoffs.map((h: any) => h.contacts?.name ?? h.contacts?.push_name ?? h.contacts?.phone).slice(0, 3).join(', ')}{handoffs.length > 3 ? ` +${handoffs.length - 3}` : ''}</p>
          </div>
          <Link to="/app/chat" className="btn-primary !py-2 text-xs">Assumir no chat <ArrowRight className="h-3.5 w-3.5" /></Link>
        </motion.div>
      )}

      {/* suporte respondeu */}
      {supportWaiting > 0 && (
        <motion.div {...fadeUp} className="card-lux p-4 flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-violet-100 grid place-items-center text-violet-600 shrink-0"><LifeBuoy className="h-4 w-4" /></span>
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-sm">O suporte respondeu seu chamado</p>
            <p className="text-xs text-ink-muted">{supportWaiting > 1 ? `${supportWaiting} chamados aguardando você` : 'Tem uma resposta nova te esperando'}</p>
          </div>
          <Link to="/app/suporte" className="btn-ghost text-xs">Ver resposta <ArrowRight className="h-3.5 w-3.5" /></Link>
        </motion.div>
      )}

      {/* campanhas disparando */}
      {campaigns.map(cp => (
        <motion.div key={cp.id} {...fadeUp} className="card-lux p-4 flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-brand-100 grid place-items-center text-brand-600 shrink-0"><MessageCircle className="h-4 w-4" /></span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">Campanha "{cp.title}" enviando</p>
            <div className="mt-1.5 h-1.5 rounded-full bg-brand-50 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all" style={{ width: `${cp.total_targets ? Math.round((cp.sent_count / cp.total_targets) * 100) : 0}%` }} />
            </div>
          </div>
          <span className="text-xs font-semibold text-brand-700 shrink-0">{cp.sent_count}/{cp.total_targets}</span>
        </motion.div>
      ))}

      {/* cards de métrica com delta */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} {...fadeUp} transition={{ delay: 0.06 * i }}>
            <Link to={c.to} className="card-lux p-4 block hover:shadow-glow hover:-translate-y-0.5 transition-all group">
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-50 to-accent-100 grid place-items-center group-hover:scale-110 transition-transform">
                  <c.icon className="h-4.5 w-4.5 text-brand-500" />
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-ink-muted opacity-0 group-hover:opacity-100 transition" />
              </div>
              <p className="mt-3 text-xl sm:text-2xl font-bold tracking-tight">{c.value}</p>
              <div className="flex items-center justify-between gap-1 mt-1">
                <p className="text-[10px] text-ink-muted leading-tight">{c.label}</p>
                {c.delta !== 0 && <Delta value={c.delta} />}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* gráfico principal */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="card-lux p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold">Atividade — últimos 30 dias</h3>
            <div className="flex gap-4 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Mensagens</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-500" /> Agendamentos</span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.daily ?? []} margin={{ top: 12 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--brand-500))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="rgb(var(--brand-500))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--accent-500))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="rgb(var(--accent-500))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgb(var(--ink-muted))' }} tickFormatter={d => String(d).slice(8)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--ink-muted))' }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ borderRadius: 14, border: '1px solid rgb(var(--line))', background: 'rgb(var(--surface))', fontSize: 12, boxShadow: '0 12px 32px -8px rgb(var(--brand-500) / 0.25)' }}
                  formatter={(v: any, name: any) => [v, name === 'messages' ? 'Mensagens' : 'Agendamentos']}
                  labelFormatter={d => `Dia ${String(d).slice(8)}/${String(d).slice(5, 7)}`} />
                <Area type="monotone" dataKey="messages" stroke="rgb(var(--brand-500))" fill="url(#g1)" strokeWidth={2.5} dot={false} />
                <Area type="monotone" dataKey="appointments" stroke="rgb(var(--accent-500))" fill="url(#g2)" strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* donut do funil */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="card-lux p-5 flex flex-col">
          <h3 className="font-semibold mb-1">Funil de clientes</h3>
          <p className="text-[11px] text-ink-muted">{stats?.contacts_total ?? 0} contatos no total</p>
          <div className="flex-1 grid place-items-center relative min-h-[180px]">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={funnel} dataKey="value" innerRadius={58} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                  {funnel.map((f, i) => <Cell key={i} fill={f.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgb(var(--line))' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center">
                <p className="text-2xl font-bold">{stats?.contacts_total ?? 0}</p>
                <p className="text-[10px] text-ink-muted uppercase tracking-wide">contatos</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
            {funnel.map(f => (
              <div key={f.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: f.color }} />
                <span className="text-ink-muted flex-1 truncate">{f.name}</span>
                <span className="font-semibold">{f.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* consumo do plano + status da IA */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* consumo do plano */}
        <motion.div {...fadeUp} transition={{ delay: 0.22 }} className="card-lux p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2"><Crown className="h-4 w-4 text-brand-500" /> Consumo do plano{quota?.plan ? ` — ${quota.plan.name}` : ''}</h3>
            <Link to="/app/planos" className="text-xs text-brand-600 hover:underline flex items-center gap-1">recarregar <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          {!quota ? (
            <p className="text-xs text-ink-muted">Carregando uso…</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {Object.entries(quota.resources as Record<string, any>).map(([key, r]) => {
                const pct = r.limit ? Math.min(100, Math.round((r.used / r.limit) * 100)) : 0
                const danger = r.used >= r.limit && !r.credits
                return (
                  <div key={key}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-ink-muted capitalize">{r.label}</span>
                      <span className={clsx('font-semibold', danger ? 'text-red-500' : 'text-ink')}>
                        {r.used}/{r.limit}{r.credits > 0 && <span className="text-brand-600 font-normal"> +{r.credits} recarga</span>}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-brand-50 overflow-hidden">
                      <div className={clsx('h-full rounded-full transition-all', danger ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-gradient-to-r from-brand-400 to-brand-600')}
                        style={{ width: `${pct}%` }} />
                    </div>
                    {danger && <p className="text-[10px] text-red-500 mt-0.5">Esgotado — recarregue pra continuar.</p>}
                  </div>
                )
              })}
            </div>
          )}

        </motion.div>

        {/* status da IA / conexão */}
        <motion.div {...fadeUp} transition={{ delay: 0.26 }} className="card-lux p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Bot className="h-4 w-4 text-brand-500" /> IA no WhatsApp</h3>
          {!inst ? (
            <div className="text-center py-2">
              <WifiOff className="h-8 w-8 text-ink-muted/40 mx-auto mb-2" />
              <p className="text-xs text-ink-muted">Nenhuma conexão configurada.</p>
              <Link to="/app/whatsapp" className="btn-outline !py-1.5 text-xs mt-3 inline-flex">Conectar WhatsApp</Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={clsx('h-10 w-10 rounded-xl grid place-items-center shrink-0', inst.status === 'connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500')}>
                  {inst.status === 'connected' ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{inst.label ?? inst.instance_name}</p>
                  <p className={clsx('text-[11px]', inst.status === 'connected' ? 'text-emerald-600' : 'text-red-500')}>
                    {inst.status === 'connected' ? `Conectado${inst.phone ? ` • ${inst.phone}` : ''}` : 'Desconectado — clientes sem resposta automática'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs rounded-lg bg-canvas px-3 py-2">
                <span className="text-ink-muted">IA respondendo</span>
                <span className={clsx('badge', inst.ai_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-500')}>
                  {inst.ai_enabled ? 'ligada' : 'desligada'}
                </span>
              </div>
              {inst.last_seen_at && <p className="text-[10px] text-ink-muted">Último sinal: {new Date(inst.last_seen_at).toLocaleString('pt-BR')}</p>}
              {inst.status !== 'connected' && <Link to="/app/whatsapp" className="btn-primary !py-2 text-xs w-full">Reconectar</Link>}
            </div>
          )}
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* top serviços com barras */}
        <motion.div {...fadeUp} transition={{ delay: 0.25 }} className="card-lux p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Serviços mais agendados (30d)</h3>
          {(stats?.top_services?.length ?? 0) === 0 ? (
            <div className="flex items-center gap-4 text-ink-muted">
              <Art name="empty-agenda" className="h-24 w-24 object-contain" placeholderClass="h-24 w-24 rounded-2xl" />
              <p className="text-sm">Quando os agendamentos chegarem, os campeões aparecem aqui.</p>
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats!.top_services} layout="vertical" margin={{ left: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'rgb(var(--ink-soft))' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgb(var(--line))' }} formatter={(v: any, n: any) => n === 'count' ? [`${v} agendamentos`, ''] : [brl(Number(v)), 'Receita']} />
                  <Bar dataKey="count" fill="rgb(var(--brand-500))" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* novidades */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="card-lux p-5">
          <h3 className="font-semibold mb-3">Últimas novidades</h3>
          <div className="space-y-2.5">
            {notifs.length === 0 && (
              <div className="text-center py-4">
                <Art name="empty-chat" className="h-20 w-20 object-contain mx-auto" placeholderClass="h-20 w-20 rounded-2xl mx-auto" />
                <p className="text-xs text-ink-muted mt-2">Tudo em dia — novidades da IA aparecem aqui.</p>
              </div>
            )}
            {notifs.map(n => (
              <Link key={n.id} to={n.link ?? '/app/chat'} className="block rounded-xl bg-brand-50/70 border border-brand-100 px-3 py-2.5 hover:bg-brand-100 transition"
                onClick={() => supabase.from('notifications').update({ read: true }).eq('id', n.id)}>
                <p className="text-xs font-semibold text-brand-800">{n.title}</p>
                {n.body && <p className="text-[11px] text-ink-soft mt-0.5">{n.body}</p>}
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
