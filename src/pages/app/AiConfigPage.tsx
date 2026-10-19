import { useEffect, useState } from 'react'
import { Bot, Loader2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDraft, draftHas, draftClear } from '@/hooks/useDraft'
import { NICHES } from '@/lib/niches'
import NicheArt from '@/components/ui/NicheArt'
import { maskPhoneBR } from '@/lib/validators'
import clsx from 'clsx'

const DAYS = [{ k: 'sun', l: 'Domingo' }, { k: 'mon', l: 'Segunda' }, { k: 'tue', l: 'Terça' }, { k: 'wed', l: 'Quarta' }, { k: 'thu', l: 'Quinta' }, { k: 'fri', l: 'Sexta' }, { k: 'sat', l: 'Sábado' }]

export default function AiConfigPage() {
  const { company, refresh, features } = useAuth()
  const dk = `aiconfig:${company?.id ?? 'anon'}`
  const [ai, setAi] = useDraft<any>(`${dk}:ai`, {})
  const [companyForm, setCompanyForm] = useDraft<any>(`${dk}:company`, {})
  const [extra, setExtra] = useDraft<Record<string, string>>(`${dk}:extra`, {})
  const [hours, setHours] = useDraft<any>(`${dk}:hours`, {})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const niche = company ? NICHES[company.niche] : null

  useEffect(() => {
    if (!company) return
    const cid = company.id
    // rascunho salvo vence: só hidrata do banco se não houver edição pendente
    if (!draftHas(`aiconfig:${cid}:ai`)) setAi(company.ai_config ?? {})
    if (!draftHas(`aiconfig:${cid}:company`)) setCompanyForm({ name: company.name, phone: company.phone ?? '', whatsapp_public: company.whatsapp_public ?? '', address: company.address ?? '', city: company.city ?? '', state: company.state ?? '', instagram: company.instagram ?? '' })
    if (!draftHas(`aiconfig:${cid}:extra`)) setExtra(company.extra ?? {})
    if (!draftHas(`aiconfig:${cid}:hours`)) setHours(company.business_hours ?? {})
  }, [company])

  async function save() {
    setBusy(true)
    await supabase.from('companies').update({
      ai_config: ai, extra, business_hours: hours,
      name: companyForm.name, phone: companyForm.phone || null, whatsapp_public: companyForm.whatsapp_public || null,
      address: companyForm.address || null, city: companyForm.city || null, state: companyForm.state || null,
      instagram: companyForm.instagram || null,
    }).eq('id', company!.id)
    ;['ai', 'company', 'extra', 'hours'].forEach(k => draftClear(`aiconfig:${company!.id}:${k}`))
    await refresh()
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  if (!company) return null
  const feat = features

  const Toggle = ({ k, label, desc, locked }: { k: string; label: string; desc: string; locked?: string }) => (
    <div className={clsx('flex items-start justify-between gap-4 rounded-xl border border-line p-4', locked && 'opacity-60')}>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-ink-muted mt-0.5">{locked ?? desc}</p>
      </div>
      <button type="button" disabled={!!locked} onClick={() => setAi({ ...ai, [k]: !ai[k] })}
        className={clsx('h-6 w-11 rounded-full transition-colors relative shrink-0', ai[k] && !locked ? 'bg-brand-500' : 'bg-line')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', ai[k] && !locked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><Bot className="h-7 w-7 text-brand-500" /> Configurar a IA</h1>
        <p className="text-sm text-ink-muted">Nome, personalidade, limites e o que ela pode fazer — tudo entra no comportamento dela na hora.</p>
      </div>

      <div className="card-lux p-6 space-y-4">
        <h3 className="font-semibold">Personalidade</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Nome da IA</label>
            <input className="input" value={ai.name ?? ''} onChange={e => setAi({ ...ai, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Atraso da resposta (segundos)</label>
            <input type="number" min={0} max={30} className="input" value={ai.reply_delay_sec ?? 2} onChange={e => setAi({ ...ai, reply_delay_sec: +e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Tom de voz</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {niche?.toneSuggestions.map(t => (
              <button key={t} onClick={() => setAi({ ...ai, tone: t })}
                className={clsx('text-xs rounded-full px-3 py-1.5 border transition', ai.tone === t ? 'bg-brand-500 text-white border-brand-500' : 'border-line text-ink-soft')}>
                {t}
              </button>
            ))}
          </div>
          <input className="input" value={ai.tone ?? ''} onChange={e => setAi({ ...ai, tone: e.target.value })} placeholder="Ex.: acolhedora, usa emojis com moderação" />
        </div>
        <div>
          <label className="label">Saudação inicial (opcional)</label>
          <input className="input" value={ai.greeting ?? ''} onChange={e => setAi({ ...ai, greeting: e.target.value })} placeholder="Ex.: Oi! Aqui é a Bia do Studio ✨" />
        </div>
        <div>
          <label className="label">O que ela PODE falar (orientações extras)</label>
          <textarea className="input min-h-[80px]" value={ai.allowed ?? ''} onChange={e => setAi({ ...ai, allowed: e.target.value })}
            placeholder="Ex.: pode informar estacionamento ao lado, aceita pix e dinheiro, pets bem-vindos…" />
        </div>
        <div>
          <label className="label">O que ela NÃO PODE falar/fazer</label>
          <textarea className="input min-h-[80px]" value={ai.forbidden ?? ''} onChange={e => setAi({ ...ai, forbidden: e.target.value })}
            placeholder="Ex.: dar desconto, falar mal de concorrente, agendar domingo, confirmar química sem avaliação…" />
        </div>
      </div>

      <div className="card-lux p-6 space-y-4">
        <h3 className="font-semibold">Capacidades</h3>
        <Toggle k="send_audio" label="Responder com áudio" desc="A IA envia respostas por voz (TTS natural em pt-BR)." locked={!feat.audio ? 'Disponível a partir do plano Pro' : undefined} />
        <Toggle k="send_images" label="Enviar imagens do acervo" desc="A IA pode mandar fotos e links que você cadastrou em Arquivos da IA." locked={!feat.images ? 'Disponível a partir do plano Pro' : undefined} />
        <Toggle k="payments_enabled" label="Cobranças no chat" desc="Gera Pix copia-e-cola e link de cartão na conversa; cai na sua carteira." locked={!feat.payments ? 'Disponível a partir do plano Pro' : undefined} />
        <Toggle k="auto_confirm" label="Confirmar agendamento automaticamente" desc="Desligado: agendamentos chegam como 'agendado' para você confirmar." />
        {ai.payments_enabled && (
          <label className="flex items-center gap-2 text-sm px-1">
            <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={ai.require_deposit ?? false} onChange={e => setAi({ ...ai, require_deposit: e.target.checked })} />
            Exigir sinal de
            <input type="number" min={5} max={100} className="input !w-20 !py-1 text-center" value={ai.deposit_percent ?? 30} onChange={e => setAi({ ...ai, deposit_percent: +e.target.value })} />
            % para confirmar agendamento
          </label>
        )}
      </div>

      <div className="card-lux p-6 space-y-4">
        <h3 className="font-semibold">Atendimento humano</h3>
        <p className="text-xs text-ink-muted -mt-2">Quando a cliente pedir um humano, a IA pausa e avisa sua equipe no painel (Dashboard → notificações). Qualquer um pode assumir no Chat.</p>
        <Toggle k="handoff_to_attendant" label="Escalar para o WhatsApp do atendente"
          desc="Ligado: se ninguém assumir em ~2 min, os dados da cliente (nome, número, motivo) são enviados por WhatsApp para o número abaixo. Desligado: apenas o aviso no painel." />
        {ai.handoff_to_attendant && (
          <div>
            <label className="label">WhatsApp do atendente</label>
            <input className="input" value={ai.handoff_phone ?? ''} inputMode="numeric" maxLength={15} onChange={e => setAi({ ...ai, handoff_phone: maskPhoneBR(e.target.value) })}
              placeholder="(11) 99999-9999 — recebe o alerta com os dados da cliente" />
            <p className="text-[11px] text-ink-muted mt-1">O alerta sai do mesmo número conectado do seu estabelecimento.</p>
          </div>
        )}
      </div>

      <div className="card-lux p-6 space-y-4">
        <h3 className="font-semibold">Estabelecimento</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Nome</label><input className="input" value={companyForm.name ?? ''} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} /></div>
          <div><label className="label">WhatsApp público</label><input className="input" value={companyForm.whatsapp_public ?? ''} inputMode="numeric" maxLength={15} onChange={e => setCompanyForm({ ...companyForm, whatsapp_public: maskPhoneBR(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Endereço</label><input className="input" value={companyForm.address ?? ''} onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })} /></div>
          <div><label className="label">Cidade</label><input className="input" value={companyForm.city ?? ''} onChange={e => setCompanyForm({ ...companyForm, city: e.target.value })} /></div>
          <div><label className="label">UF</label><input className="input" maxLength={2} value={companyForm.state ?? ''} onChange={e => setCompanyForm({ ...companyForm, state: e.target.value.toUpperCase() })} /></div>
          <div className="sm:col-span-2"><label className="label">Instagram</label><input className="input" value={companyForm.instagram ?? ''} onChange={e => setCompanyForm({ ...companyForm, instagram: e.target.value })} /></div>
        </div>
      </div>

      {niche && (
        <div className="card-lux p-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2">Detalhes do seu nicho (<NicheArt id={niche.id} className="h-5 w-5 rounded-md" /> {niche.name})</h3>
          {niche.extraFields.map(f => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              {f.type === 'textarea'
                ? <textarea className="input min-h-[80px]" placeholder={f.placeholder} value={extra[f.key] ?? ''} onChange={e => setExtra({ ...extra, [f.key]: e.target.value })} />
                : f.type === 'select'
                  ? <select className="input" value={extra[f.key] ?? ''} onChange={e => setExtra({ ...extra, [f.key]: e.target.value })}>
                      <option value="">—</option>
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : <input className="input" placeholder={f.placeholder} value={extra[f.key] ?? ''} onChange={e => setExtra({ ...extra, [f.key]: e.target.value })} />}
            </div>
          ))}
        </div>
      )}

      <div className="card-lux p-6 space-y-3">
        <h3 className="font-semibold">Horário de funcionamento</h3>
        {DAYS.map(d => {
          const ranges = hours[d.k] ?? []
          return (
            <div key={d.k} className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm w-24">
                <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={ranges.length > 0}
                  onChange={e => setHours({ ...hours, [d.k]: e.target.checked ? [['09:00', '18:00']] : [] })} />
                {d.l}
              </label>
              {ranges.map((r: [string, string], i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="time" className="input !w-[105px] !py-1.5" value={r[0]} onChange={e => setHours({ ...hours, [d.k]: ranges.map((x: [string, string], j: number) => j === i ? [e.target.value, x[1]] : x) })} />
                  <span className="text-ink-muted text-xs">–</span>
                  <input type="time" className="input !w-[105px] !py-1.5" value={r[1]} onChange={e => setHours({ ...hours, [d.k]: ranges.map((x: [string, string], j: number) => j === i ? [x[0], e.target.value] : x) })} />
                </div>
              ))}
              {ranges.length > 0 && <button className="text-xs text-ink-muted hover:text-brand-600" onClick={() => setHours({ ...hours, [d.k]: [...ranges, ['12:00', '13:00']] })}>+ intervalo</button>}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end sticky bottom-4">
        <button className="btn-primary px-8 shadow-glow" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? 'Salvo ✓' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
