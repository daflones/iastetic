import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { maskPhoneBR } from '@/lib/validators'
import clsx from 'clsx'

interface Cfg { phone: string; name: string; role: string; photo?: string }
const FALLBACK: Cfg = { phone: '', name: 'Eduardo Daflon', role: 'Desenvolvedor da plataforma', photo: '' }

export function useSupportContact(): Cfg {
  const [cfg, setCfg] = useState<Cfg>(FALLBACK)
  useEffect(() => {
    supabase.from('platform_settings').select('value').eq('key', 'support_whatsapp').maybeSingle()
      .then(({ data }) => { if (data?.value?.phone) setCfg({ ...FALLBACK, ...data.value }) })
  }, [])
  return cfg
}

/** Card "fale comigo": foto + nome + WhatsApp direto. `compact` = versão botão/inline. */
export default function SupportContact({ className, compact }: { className?: string; compact?: boolean }) {
  const cfg = useSupportContact()
  if (!cfg.phone) return null
  const digits = cfg.phone.replace(/\D/g, '')
  const wa = `https://wa.me/${digits}?text=${encodeURIComponent('Oi! Vim pela IAstetic e tenho uma dúvida.')}`

  if (compact) {
    return (
      <a href={wa} target="_blank" rel="noreferrer"
        className={clsx('flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand-300 transition', className)}>
        <Avatar cfg={cfg} size="h-10 w-10" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{cfg.name}</p>
          <p className="text-[11px] text-ink-muted">{cfg.role} · {maskPhoneBR(digits.slice(2))}</p>
        </div>
        <span className="btn-primary !py-2 text-xs shrink-0"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</span>
      </a>
    )
  }

  return (
    <div className={clsx('card-lux p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left', className)}>
      <Avatar cfg={cfg} size="h-20 w-20" ring />
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">ficou com dúvida?</p>
        <h3 className="h-display text-xl mt-1">Fale direto comigo</h3>
        <p className="text-sm text-ink-muted mt-1">
          <b className="text-ink">{cfg.name}</b> · {cfg.role}<br />
          {maskPhoneBR(digits.slice(2))} — me chama no WhatsApp que eu respondo de verdade.
        </p>
      </div>
      <a href={wa} target="_blank" rel="noreferrer" className="btn-primary shrink-0">
        <MessageCircle className="h-4 w-4" /> Chamar no WhatsApp
      </a>
    </div>
  )
}

function Avatar({ cfg, size, ring }: { cfg: Cfg; size: string; ring?: boolean }) {
  const [err, setErr] = useState(false)
  const initials = cfg.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const cls = clsx(size, 'rounded-full object-cover shrink-0 grid place-items-center font-display font-bold',
    ring ? 'ring-4 ring-brand-100 shadow-soft' : 'ring-2 ring-brand-100')
  if (cfg.photo && !err) return <img src={cfg.photo} onError={() => setErr(true)} alt={cfg.name} className={cls} />
  return <span className={clsx(cls, 'bg-gradient-to-br from-brand-500 to-accent-600 text-white text-sm')}>{initials}</span>
}
