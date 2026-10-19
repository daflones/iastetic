import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Plus, PowerOff, QrCode, RefreshCw, Trash2 } from 'lucide-react'
import { supabase, callFn } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Instance } from '@/lib/types'
import clsx from 'clsx'

export default function WhatsappPage() {
  const { company, plan } = useAuth()
  const [params] = useSearchParams()
  const [instances, setInstances] = useState<Instance[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [naming, setNaming] = useState(false)
  const [instName, setInstName] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const onboarding = params.get('onboarding') === '1'

  useEffect(() => { if (company) load() }, [company?.id])

  // polling de status quando conectando
  useEffect(() => {
    const connecting = instances.find(i => i.status !== 'connected')
    if (pollRef.current) clearInterval(pollRef.current)
    if (connecting) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await callFn<{ status: string }>('evolution-manage', { action: 'status', instance_id: connecting.id })
          if (r.status === 'connected') { clearInterval(pollRef.current); load() }
          else if (connecting.status !== 'connected') {
            // também rebusca QR atualizado
            const { data } = await supabase.from('instances').select('*').eq('id', connecting.id).single()
            if (data) setInstances(prev => prev.map(i => i.id === data.id ? data : i))
          }
        } catch { /* ignore */ }
      }, 6000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [instances])

  async function load() {
    const r = await callFn<Instance[]>('evolution-manage', { action: 'list' })
    setInstances(r ?? [])
  }

  // nome sugerido: o nome da atendente IA configurada (ex.: "Íris"), senão a empresa escolhe
  const aiName = (company?.ai_config as any)?.name as string | undefined

  function openCreate() {
    setInstName(aiName ?? '')
    setNaming(true)
  }

  async function create() {
    setBusy('create'); setError('')
    try {
      const inst = await callFn<Instance>('evolution-manage', { action: 'create', display_name: instName.trim() || undefined })
      setNaming(false)
      await load()
      setExpanded(inst.id)
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  async function act(action: string, id: string) {
    setBusy(id + action)
    try {
      const r = await callFn<any>('evolution-manage', { action, instance_id: id })
      if (action === 'connect' && r?.qr_base64) {
        setInstances(prev => prev.map(i => i.id === id ? { ...i, qr_base64: r.qr_base64, pairing_code: r.pairing_code, status: 'connecting' } : i))
      } else await load()
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  async function toggleAi(inst: Instance) {
    await callFn('evolution-manage', { action: 'toggle_ai', instance_id: inst.id, ai_enabled: !inst.ai_enabled })
    setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, ai_enabled: !inst.ai_enabled } : i))
  }

  const limit = plan?.instances_limit ?? 1

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="h-display text-2xl sm:text-3xl">WhatsApp</h1>
        <p className="text-sm text-ink-muted">Cada número conectado é uma IA atendendo. Seu plano permite {limit} número(s).</p>
      </div>

      {onboarding && (
        <div className="card-lux p-5 border-brand-300 bg-brand-50/60">
          <p className="font-semibold text-brand-800">Quase lá! Último passo:</p>
          <p className="text-sm text-ink-soft mt-1">Crie a conexão abaixo e escaneie o QR Code com o WhatsApp <b>do número que vai atender os clientes</b> (Aparelhos conectados → Conectar aparelho).</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

      <div className="space-y-3">
        {instances.map(inst => (
          <div key={inst.id} className="card-lux p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className={clsx('h-10 w-10 rounded-xl grid place-items-center',
                inst.status === 'connected' ? 'bg-emerald-100 text-emerald-600' : inst.status === 'connecting' ? 'bg-amber-100 text-amber-600' : 'bg-red-50 text-red-400')}>
                <QrCode className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{inst.label ?? inst.phone ?? inst.instance_name}</p>
                <p className="text-xs text-ink-muted flex items-center gap-1.5">
                  <span className={clsx('h-2 w-2 rounded-full inline-block shrink-0',
                    inst.status === 'connected' ? 'bg-emerald-500' : inst.status === 'connecting' ? 'bg-amber-400' : 'bg-red-400')} />
                  {inst.status === 'connected' ? `Conectado${inst.phone ? ` • ${inst.phone}` : ''}` :
                    inst.status === 'connecting' ? 'Aguardando leitura do QR' : 'Desconectado'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                IA ativa
                <button onClick={() => toggleAi(inst)} className={clsx('h-5 w-9 rounded-full transition-colors relative', inst.ai_enabled ? 'bg-brand-500' : 'bg-line')}>
                  <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', inst.ai_enabled ? 'left-[18px]' : 'left-0.5')} />
                </button>
              </label>
              <div className="flex gap-1.5">
                {inst.status !== 'connected' && (
                  <button className="btn-outline !py-1.5 text-xs" disabled={busy === inst.id + 'connect'} onClick={() => { setExpanded(inst.id); act('connect', inst.id) }}>
                    {busy === inst.id + 'connect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} QR Code
                  </button>
                )}
                {inst.status === 'connected' ? (
                  <button className="btn-outline !py-1.5 text-xs" onClick={() => act('disconnect', inst.id)}><PowerOff className="h-3.5 w-3.5" /> Desconectar</button>
                ) : (
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => act('restart', inst.id)}><RefreshCw className="h-3.5 w-3.5" /></button>
                )}
                <button className="btn-danger !py-1.5 text-xs" onClick={() => act('delete', inst.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            {expanded === inst.id && inst.status !== 'connected' && (
              <div className="mt-4 rounded-2xl bg-canvas border border-line p-5 flex flex-col items-center gap-3">
                {inst.qr_base64 ? (
                  <img src={inst.qr_base64} className="h-56 w-56 rounded-xl border-4 border-white shadow-card" alt="QR Code WhatsApp" />
                ) : (
                  <div className="h-56 w-56 grid place-items-center text-ink-muted text-sm"><Loader2 className="h-6 w-6 animate-spin" /></div>
                )}
                {inst.pairing_code && <p className="text-sm">Código de pareamento: <code className="font-bold">{inst.pairing_code}</code></p>}
                <p className="text-xs text-ink-muted text-center max-w-xs">Abra o WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho → aponte para o QR. Ele atualiza sozinho quando conectar.</p>
              </div>
            )}
            {expanded !== inst.id && inst.status !== 'connected' && inst.qr_base64 && (
              <button className="text-xs text-brand-600 mt-3 font-medium" onClick={() => setExpanded(inst.id)}>ver QR Code</button>
            )}
          </div>
        ))}

        {instances.length < limit ? (
          naming ? (
            <div className="card-lux p-5 space-y-3 anim-pop">
              <p className="font-semibold text-sm">Nome dessa conexão</p>
              <p className="text-xs text-ink-muted">
                {aiName
                  ? `Sua atendente IA se chama "${aiName}" — usamos esse nome, mas você pode trocar.`
                  : 'Escolha como identificar este número (ex.: recepção, unidade 2, promoções).'}
              </p>
              <div className="flex items-center gap-2">
                <div className="input flex items-center gap-1.5 flex-1">
                  <span className="text-ink-muted text-sm whitespace-nowrap">{company?.name} ·</span>
                  <input className="flex-1 outline-none bg-transparent text-sm" value={instName} onChange={e => setInstName(e.target.value)}
                    placeholder={aiName ?? 'ex.: recepção'} maxLength={40} autoFocus onKeyDown={e => e.key === 'Enter' && create()} />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => setNaming(false)}>Voltar</button>
                <button onClick={create} disabled={busy === 'create'} className="btn-primary flex-1 !py-2 text-sm">
                  {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  Criar e gerar QR Code
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openCreate}
              className="w-full rounded-2xl border-2 border-dashed border-brand-300 py-5 text-brand-600 font-semibold text-sm hover:bg-brand-50 transition flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" />
              Conectar novo número ({instances.length}/{limit})
            </button>
          )
        ) : (
          <p className="text-center text-xs text-ink-muted">Limite do plano atingido. <a href="/app/planos" className="text-brand-600 font-semibold">Fazer upgrade</a> para conectar mais números.</p>
        )}
      </div>

      <div className="card-lux p-5 text-sm text-ink-soft space-y-2">
        <p className="font-semibold text-ink">Como funciona</p>
        <ul className="text-xs space-y-1.5 list-disc pl-4 text-ink-muted">
          <li>Funciona como WhatsApp Web: suas conversas continuam no aparelho.</li>
          <li>A IA responde novas mensagens automaticamente enquanto "IA ativa" estiver ligado.</li>
          <li>Você pode assumir qualquer conversa pelo Chat — a IA pausa só naquela conversa.</li>
          <li>Se o WhatsApp desconectar, reconecte pelo QR Code aqui.</li>
        </ul>
      </div>
    </div>
  )
}
