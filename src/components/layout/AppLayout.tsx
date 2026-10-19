import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, MessageCircle, CalendarDays, Users, Sparkles, UserSquare,
  Bot, QrCode, Bell, Wallet, Crown, BrainCircuit, FolderOpen, LogOut, Menu, ShieldCheck, Lock, Link2, Megaphone, LifeBuoy,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { AssistantProvider } from '@/hooks/useAssistant'
import { supabase } from '@/lib/supabase'
import { NICHES } from '@/lib/niches'
import Art from '@/components/ui/Art'
import NicheArt from '@/components/ui/NicheArt'
import clsx from 'clsx'

type Item = { to: string; label: string; icon: any; live?: boolean; feat?: string }
type Section = { title: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    title: 'Principal',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/app/chat', label: 'Chat', icon: MessageCircle, live: true },
      { to: '/app/agenda', label: 'Agenda', icon: CalendarDays },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      { to: '/app/contatos', label: 'Clientes & Leads', icon: Users },
      { to: '/app/whatsapp', label: 'WhatsApp', icon: QrCode },
      { to: '/app/followups', label: 'Follow-ups', icon: Bell },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/app/servicos', label: 'Serviços', icon: Sparkles },
      { to: '/app/profissionais', label: 'Profissionais', icon: UserSquare },
      { to: '/app/minha-pagina', label: 'Minha Página', icon: Link2 },
      { to: '/app/arquivos', label: 'Arquivos da IA', icon: FolderOpen, feat: 'images' },
    ],
  },
  {
    title: 'Social',
    items: [
      { to: '/app/social', label: 'Posts & Redes', icon: Megaphone, feat: 'images' },
    ],
  },
  {
    title: 'Inteligência & Negócio',
    items: [
      { to: '/app/ia', label: 'Configurar IA', icon: Bot },
      { to: '/app/assistente', label: 'Assistente IA', icon: BrainCircuit, feat: 'assistant' },
      { to: '/app/carteira', label: 'Carteira', icon: Wallet },
      { to: '/app/planos', label: 'Meu Plano', icon: Crown },
      { to: '/app/suporte', label: 'Suporte', icon: LifeBuoy },
    ],
  },
]

export default function AppLayout() {
  const { company, plan, features, isAdmin, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const nav = useNavigate()
  const loc = useLocation()
  const niche = company ? NICHES[company.niche] : null

  useEffect(() => {
    if (!company) return
    supabase.from('conversations').select('unread_count').eq('company_id', company.id).eq('status', 'open')
      .then(({ data }) => setUnread((data ?? []).reduce((a, c) => a + (c.unread_count ?? 0), 0)))
    const ch = supabase.channel('unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${company.id}` },
        async () => {
          const { data } = await supabase.from('conversations').select('unread_count').eq('company_id', company.id).eq('status', 'open')
          setUnread((data ?? []).reduce((a, c) => a + (c.unread_count ?? 0), 0))
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [company?.id])

  const subBadge = company?.subscription_status === 'trial'
    ? `Trial até ${new Date(company.trial_until).toLocaleDateString('pt-BR')}`
    : company?.subscription_status === 'active' ? (plan?.name ?? 'Ativo') : 'Assinatura inativa'

  const initials = (company?.name ?? 'IA').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen flex mesh-bg texture-noise">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed lg:static inset-y-0 left-0 z-40 w-[264px] shrink-0 bg-surface/95 backdrop-blur-xl border-r border-line flex flex-col transition-transform lg:translate-x-0 relative overflow-hidden',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="orb bg-brand-200 h-48 w-48 -top-16 -right-16 opacity-50" />

        {/* logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line/70 relative">
          <Art name="logo" className="h-10 w-10 rounded-xl object-cover shadow-glow" placeholderClass="h-10 w-10 rounded-xl" />
          <div className="leading-tight">
            <p className="font-display font-bold text-ink">IAstetic</p>
            <p className="text-[11px] text-ink-muted flex items-center gap-1.5">
              {niche && <NicheArt id={niche.id} className="h-3.5 w-3.5 rounded-full" />}
              {niche ? niche.name : 'Estética'}
            </p>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 relative">
          {SECTIONS.map(sec => (
            <div key={sec.title} className="mb-5">
              <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted/80">{sec.title}</p>
              <div className="space-y-0.5">
                {sec.items.map(m => {
                  const locked = !!m.feat && !(features as any)[m.feat]
                  return (
                    <NavLink key={m.to} to={m.to} onClick={() => setOpen(false)}
                      className={({ isActive }) => clsx(
                        'group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all',
                        isActive
                          ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-soft'
                          : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700',
                      )}>
                      {({ isActive }) => (
                        <>
                          <span className={clsx(
                            'grid h-7 w-7 place-items-center rounded-lg transition-all shrink-0',
                            isActive ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-500 group-hover:bg-brand-100',
                          )}>
                            <m.icon className="h-[15px] w-[15px]" />
                          </span>
                          <span className="flex-1 truncate">{m.label}</span>
                          {locked && <Lock className={clsx('h-3 w-3', isActive ? 'text-white/70' : 'text-ink-muted/60')} />}
                          {m.live && unread > 0 && <span className="badge bg-red-500 text-white !px-1.5">{unread}</span>}
                          {isActive && <motion.span layoutId="nav-glow" className="absolute inset-y-1.5 -left-3.5 w-1 rounded-r-full bg-brand-500 shadow-[0_0_12px_rgb(var(--brand-500)/0.9)]" />}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-brand-50 hover:text-brand-700">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-500 group-hover:bg-brand-100"><ShieldCheck className="h-[15px] w-[15px]" /></span>
              Admin da plataforma
            </NavLink>
          )}
        </nav>

        {/* user card */}
        <div className="p-3.5 border-t border-line/70 relative">
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-50 to-accent-100/70 px-3 py-2.5 ring-1 ring-brand-100">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-accent-500 grid place-items-center text-white text-xs font-bold shadow-soft shrink-0">{initials}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[13px] font-semibold text-brand-800 truncate">{company?.name}</p>
              <p className="text-[11px] text-ink-muted truncate">{subBadge}</p>
            </div>
          </div>
          <button onClick={async () => { await signOut(); nav('/') }} className="btn-ghost w-full justify-start text-xs mt-1.5">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-ink/30 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <main className="flex-1 min-w-0">
        <header className="lg:hidden h-14 flex items-center gap-3 px-4 border-b border-line bg-surface sticky top-0 z-20">
          <button className="btn-ghost p-2" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="font-display font-bold">IAstetic</span>
          {unread > 0 && <span className="badge bg-red-500 text-white ml-auto">{unread} msgs</span>}
        </header>
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto relative">
          <AssistantProvider>
            <AnimatePresence mode="wait">
              <motion.div key={loc.pathname}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}>
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </AssistantProvider>
        </div>
      </main>
    </div>
  )
}
