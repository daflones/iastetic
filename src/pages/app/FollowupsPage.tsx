import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2, X, Volume2, Image, Type } from 'lucide-react'
import { supabase, fmtDateTime } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Pagination, { usePaged } from '@/components/ui/Pagination'
import { useDraft } from '@/hooks/useDraft'
import type { FollowupRule } from '@/lib/types'
import clsx from 'clsx'

const TRIGGERS = [
  { id: 'after_appointment', label: 'Após o atendimento', desc: 'ex.: 24h depois, agradecendo' },
  { id: 'maintenance', label: 'Manutenção/retorno', descByNiche: { salao: 'ex.: retoque de raiz ou luzes', unhas: 'ex.: manutenção do alongamento', olhar: 'ex.: manutenção de cílios ou henna' } },
  { id: 'no_show', label: 'Cliente não veio', desc: 'recupera quem faltou' },
  { id: 'inactive_days', label: 'Cliente sumida', desc: 'reativa após X dias sem contato' },
  { id: 'abandoned_lead', label: 'Lead não agendou', desc: 'quem perguntou e sumiu' },
  { id: 'birthday', label: 'Aniversário', desc: 'mensagem no dia' },
] as const

const NICHE_EXAMPLES: Record<string, string> = {
  salao: 'Oi {nome}! Já é hora do retoque da sua raiz… quer ver um horário essa semana? 💇‍♀️',
  unhas: 'Oi {nome}! Já faz um tempinho da sua manutenção… bora deixar as unhas lindas de novo? 💅',
  olhar: 'Oi {nome}! Seus cílios já pedem manutenção… quer agendar essa semana? ✨',
  barbearia: 'E aí, {nome}! Já faz umas semanas do seu último corte — bora deixar o visual em dia de novo? 💈',
  clinica: 'Oi {nome}! Já faz um tempo da sua última sessão — quer agendar a continuidade do seu protocolo? ✨',
}

const NICHE_EMPTY_HINT: Record<string, string> = {
  salao: 'Crie a primeira: ex. “lembrar retoque de raiz em 30 dias”.',
  unhas: 'Crie a primeira: ex. “lembrar manutenção de alongamento em 21 dias”.',
  olhar: 'Crie a primeira: ex. “lembrar manutenção de cílios em 15 dias”.',
  barbearia: 'Crie a primeira: ex. “chamar pra remarcar o corte 20 dias depois”.',
  clinica: 'Crie a primeira: ex. “lembrar próxima sessão do protocolo em 21 dias”.',
}

const CHANNELS = [
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'audio', label: 'Áudio (voz da IA)', icon: Volume2 },
  { id: 'image', label: 'Imagem + texto', icon: Image },
] as const

export default function FollowupsPage() {
  const { company, plan, features } = useAuth()
  const [rules, setRules] = useState<FollowupRule[]>([])
  const pg = usePaged(rules, 6)
  const [jobs, setJobs] = useState<any[]>([])
  const [editing, setEditing] = useState<Partial<FollowupRule> | null>(null)

  useEffect(() => { if (company) load() }, [company?.id])

  async function load() {
    const [{ data: r }, { data: j }] = await Promise.all([
      supabase.from('followup_rules').select('*').eq('company_id', company!.id).order('created_at'),
      supabase.from('followup_jobs').select('*, contacts(name,phone)').eq('company_id', company!.id).order('created_at', { ascending: false }).limit(15),
    ])
    setRules((r as FollowupRule[]) ?? [])
    setJobs(j ?? [])
  }

  async function toggle(r: FollowupRule) {
    await supabase.from('followup_rules').update({ active: !r.active }).eq('id', r.id); load()
  }

  const triggerLabel = (id: string) => TRIGGERS.find(t => t.id === id)?.label ?? id
  const nicheId = company?.niche ?? 'olhar'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><Bell className="h-7 w-7 text-brand-500" /> Follow-ups inteligentes</h1>
          <p className="text-sm text-ink-muted">Mensagens automáticas que trazem a cliente de volta — com variação escrita pela IA.</p>
        </div>
        <button className="btn-primary" disabled={!!plan && !features.followups} onClick={() => setEditing({ name: '', trigger: 'after_appointment', delay_hours: 24, channel: 'text', template: '', use_ai_variation: true, send_window: { from: '09:00', to: '20:00' }, active: true })}>
          <Plus className="h-4 w-4" /> Nova regra
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          {pg.slice.map(r => {
            const RuleIcon = CHANNELS.find(c => c.id === r.channel)?.icon ?? Type
            return (
            <div key={r.id} className={clsx('card-lux p-5 flex items-start gap-4', !r.active && 'opacity-55')}>
              <div className="h-10 w-10 rounded-xl bg-brand-50 grid place-items-center shrink-0">
                <RuleIcon className="h-5 w-5 text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{r.name}</p>
                  <span className="badge bg-brand-100 text-brand-700 text-[10px]">{triggerLabel(r.trigger)}</span>
                  <span className="badge bg-accent-100 text-accent-700 text-[10px]">+{r.delay_hours}h</span>
                  {r.use_ai_variation && <span className="badge bg-purple-100 text-purple-700 text-[10px]">variação IA</span>}
                </div>
                <p className="text-xs text-ink-muted mt-1.5 line-clamp-2 italic">“{r.template}”</p>
              </div>
              <div className="flex gap-1">
                <button className="btn-ghost !p-2 text-xs" onClick={() => setEditing(r)}>Editar</button>
                <button onClick={() => toggle(r)} className={clsx('h-5 w-9 rounded-full transition-colors relative mt-2', r.active ? 'bg-brand-500' : 'bg-line')}>
                  <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', r.active ? 'left-[18px]' : 'left-0.5')} />
                </button>
              </div>
            </div>
            )
          })}
          {rules.length === 0 && <p className="card-lux p-10 text-center text-sm text-ink-muted">Nenhuma regra. {NICHE_EMPTY_HINT[nicheId]}</p>}
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} onChange={pg.setPage} />
        </div>

        <div className="card-lux p-5 h-fit">
          <h3 className="font-semibold text-sm mb-3">Envios recentes</h3>
          <div className="space-y-2">
            {jobs.map(j => (
              <div key={j.id} className="rounded-lg border border-line px-3 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">{(j.contacts as any)?.name ?? (j.contacts as any)?.phone ?? '—'}</span>
                  <span className={clsx('badge text-[9px]',
                    j.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : j.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>
                    {j.status === 'sent' ? 'enviado' : j.status === 'pending' ? `agendado ${fmtDateTime(j.scheduled_at)}` : 'falhou'}
                  </span>
                </div>
                {j.sent_content && <p className="text-ink-muted mt-1 line-clamp-1 italic">“{j.sent_content}”</p>}
              </div>
            ))}
            {jobs.length === 0 && <p className="text-xs text-ink-muted">Nenhum follow-up ainda.</p>}
          </div>
        </div>
      </div>

      {editing && <RuleModal rule={editing} companyId={company!.id} nicheId={nicheId} onClose={r => { setEditing(null); if (r) load() }} />}
    </div>
  )
}

function RuleModal({ rule, companyId, nicheId, onClose }: { rule: Partial<FollowupRule>; companyId: string; nicheId: string; onClose: (r: boolean) => void }) {
  const isNew = !rule.id
  const [f, setF, clearF] = useDraft(`rule:${rule.id ?? 'new'}`, {
    name: rule.name ?? '', trigger: rule.trigger ?? 'after_appointment', delay_hours: rule.delay_hours ?? 24,
    channel: rule.channel ?? 'text', template: rule.template ?? '', image_url: rule.image_url ?? '',
    use_ai_variation: rule.use_ai_variation ?? true, from: rule.send_window?.from ?? '09:00', to: rule.send_window?.to ?? '20:00',
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const payload = { name: f.name, trigger: f.trigger, delay_hours: f.delay_hours, channel: f.channel, template: f.template, image_url: f.channel === 'image' ? f.image_url || null : null, use_ai_variation: f.use_ai_variation, send_window: { from: f.from, to: f.to } }
    if (isNew) await supabase.from('followup_rules').insert({ ...payload, company_id: companyId })
    else await supabase.from('followup_rules').update(payload).eq('id', rule.id)
    setBusy(false); clearF(); onClose(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(false)}>
      <div className="card-lux anim-pop w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-lg">{isNew ? 'Nova regra de follow-up' : 'Editar regra'}</h3>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div><label className="label">Nome da regra</label><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Ex.: Lembrete de manutenção" /></div>
          <div>
            <label className="label">Quando dispara</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGERS.map(t => (
                <button key={t.id} type="button" onClick={() => setF({ ...f, trigger: t.id as any })}
                  className={clsx('rounded-xl border p-3 text-left transition', f.trigger === t.id ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-300')}>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-[10px] text-ink-muted">{(t as any).descByNiche?.[nicheId] ?? (t as any).desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">{f.trigger === 'inactive_days' || f.trigger === 'abandoned_lead' ? 'Após dias' : 'Após horas'}</label>
              <input type="number" min={1} className="input" value={f.trigger === 'inactive_days' || f.trigger === 'abandoned_lead' ? Math.round(f.delay_hours / 24) : f.delay_hours}
                onChange={e => setF({ ...f, delay_hours: (f.trigger === 'inactive_days' || f.trigger === 'abandoned_lead') ? +e.target.value * 24 : +e.target.value })} />
            </div>
            <div><label className="label">Enviar a partir</label><input type="time" className="input" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
            <div><label className="label">Até</label><input type="time" className="input" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
          </div>
          <div>
            <label className="label">Canal</label>
            <div className="flex gap-2">
              {CHANNELS.map(c => (
                <button key={c.id} type="button" onClick={() => setF({ ...f, channel: c.id as any })}
                  className={clsx('flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition', f.channel === c.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-soft')}>
                  <c.icon className="h-3.5 w-3.5" /> {c.label}
                </button>
              ))}
            </div>
          </div>
          {f.channel === 'image' && (
            <div><label className="label">URL da imagem</label><input className="input" value={f.image_url} onChange={e => setF({ ...f, image_url: e.target.value })} placeholder="https://… ou cadastre em Arquivos da IA" /></div>
          )}
          <div>
            <label className="label">Mensagem base</label>
            <textarea className="input min-h-[90px]" value={f.template} onChange={e => setF({ ...f, template: e.target.value })}
              placeholder={NICHE_EXAMPLES[nicheId]} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={f.use_ai_variation} onChange={e => setF({ ...f, use_ai_variation: e.target.checked })} />
            IA reescreve a mensagem a cada envio (nunca manda igual duas vezes)
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          {!isNew && <button className="btn-danger" onClick={async () => { await supabase.from('followup_rules').delete().eq('id', rule.id); onClose(true) }}><Trash2 className="h-4 w-4" /></button>}
          <button className="btn-primary flex-1" onClick={save} disabled={busy || !f.name.trim() || !f.template.trim()}>{busy ? 'Salvando…' : 'Salvar regra'}</button>
        </div>
      </div>
    </div>
  )
}
