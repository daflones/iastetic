import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, ImagePlus, Link2, Loader2, QrCode, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDraft, draftHas, draftClear } from '@/hooks/useDraft'
import { QRCodeSVG } from 'qrcode.react'
import clsx from 'clsx'

const AMENITIES: [string, string][] = [
  ['wifi', 'Wi-Fi'], ['parking', 'Estacionamento'], ['accessibility', 'Acessibilidade'], ['kids', 'Atende crianças'],
  ['reception', 'Recepção'], ['drinks', 'Bebidas'], ['entertainment', 'Entretenimento'], ['smoking_area', 'Fumodromo'],
]
const PAY_METHODS: [string, string][] = [
  ['cash', 'Dinheiro'], ['debit', 'Cartão de Débito'], ['credit', 'Cartão de Crédito'], ['pix', 'Pix'],
  ['paylink', 'Link de Pagamento'], ['check', 'Cheque'], ['boleto', 'Boleto'], ['transfer', 'Transferência'],
]

export default function MyPagePage() {
  const { company, refresh } = useAuth()
  const dk = `mypage:${company?.id ?? 'anon'}`
  const [cfg, setCfg] = useDraft<any>(`${dk}:cfg`, {})
  const [slug, setSlug] = useDraft(`${dk}:slug`, '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null)
  const [logoUrl, setLogoUrl] = useDraft<string | null>(`${dk}:logo`, null)
  const [coverUrl, setCoverUrl] = useDraft<string | null>(`${dk}:cover`, null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!company) return
    const cid = company.id
    if (!draftHas(`mypage:${cid}:cfg`)) setCfg(company.booking_config ?? {})
    if (!draftHas(`mypage:${cid}:slug`)) setSlug(company.slug ?? '')
    if (!draftHas(`mypage:${cid}:logo`)) setLogoUrl(company.logo_url)
    if (!draftHas(`mypage:${cid}:cover`)) setCoverUrl(company.cover_url)
  }, [company])

  const pageUrl = company?.slug ? `${location.origin}/agendar/${slug || company.slug}` : null

  async function upload(kind: 'logo' | 'cover', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !company) return
    setUploading(kind)
    const ext = file.name.split('.').pop()
    const { data, error } = await supabase.storage.from('logos').upload(`${company.id}/${kind}-${Date.now()}.${ext}`, file, { upsert: true })
    if (!error && data) {
      const { data: pub } = supabase.storage.from('logos').getPublicUrl(data.path)
      if (kind === 'logo') setLogoUrl(pub.publicUrl); else setCoverUrl(pub.publicUrl)
    }
    setUploading(null)
  }

  async function save() {
    if (!company) return
    setBusy(true)
    await supabase.from('companies').update({ slug: slug || undefined, logo_url: logoUrl, cover_url: coverUrl, booking_config: cfg }).eq('id', company.id)
    ;['cfg', 'slug', 'logo', 'cover'].forEach(k => draftClear(`mypage:${company.id}:${k}`))
    await refresh()
    setBusy(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  const toggle = (group: 'amenities' | 'payment_methods', key: string) =>
    setCfg({ ...cfg, [group]: { ...(cfg[group] ?? {}), [key]: !(cfg[group]?.[key]) } })

  if (!company) return null

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><Link2 className="h-7 w-7 text-brand-500" /> Minha página de agendamento</h1>
          <p className="text-sm text-ink-muted">Link público onde clientes agendam sozinhos — com seus serviços, horários e sinal se quiser.</p>
        </div>
        {pageUrl && (
          <div className="flex gap-2">
            <a href={pageUrl} target="_blank" className="btn-outline text-xs"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
            <button className="btn-outline text-xs" onClick={() => { navigator.clipboard.writeText(pageUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copiar link
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* identidade visual */}
          <div className="card-lux p-6 space-y-5">
            <h3 className="font-semibold">Identidade visual</h3>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="label">Logotipo</label>
                <label className="block cursor-pointer">
                  <div className="h-28 rounded-2xl border-2 border-dashed border-line hover:border-brand-400 transition grid place-items-center overflow-hidden bg-canvas">
                    {logoUrl ? <img src={logoUrl} className="h-full w-full object-contain" /> : uploading === 'logo' ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" /> : <span className="text-xs text-ink-muted flex flex-col items-center gap-1"><ImagePlus className="h-5 w-5" /> enviar logo</span>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => upload('logo', e)} />
                </label>
              </div>
              <div>
                <label className="label">Capa (fundo do topo)</label>
                <label className="block cursor-pointer">
                  <div className="h-28 rounded-2xl border-2 border-dashed border-line hover:border-brand-400 transition grid place-items-center overflow-hidden bg-canvas">
                    {coverUrl ? <img src={coverUrl} className="h-full w-full object-cover" /> : uploading === 'cover' ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" /> : <span className="text-xs text-ink-muted flex flex-col items-center gap-1"><ImagePlus className="h-5 w-5" /> enviar capa</span>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => upload('cover', e)} />
                </label>
              </div>
            </div>
            <div>
              <label className="label">Endereço da página (slug)</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted whitespace-nowrap">/agendar/</span>
                <input className="input font-mono text-sm" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="meu-studio" />
              </div>
            </div>
          </div>

          {/* contato e social */}
          <div className="card-lux p-6 space-y-4">
            <h3 className="font-semibold">Links & localização</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Facebook</label><input className="input" placeholder="facebook.com/suaempresa" value={cfg.socials?.facebook ?? ''} onChange={e => setCfg({ ...cfg, socials: { ...(cfg.socials ?? {}), facebook: e.target.value } })} /></div>
              <div><label className="label">TikTok</label><input className="input" placeholder="tiktok.com/@seuusuario" value={cfg.socials?.tiktok ?? ''} onChange={e => setCfg({ ...cfg, socials: { ...(cfg.socials ?? {}), tiktok: e.target.value } })} /></div>
            </div>
            <div><label className="label">Link do Google Maps</label><input className="input" placeholder="https://maps.google.com/…" value={cfg.maps_url ?? ''} onChange={e => setCfg({ ...cfg, maps_url: e.target.value })} /></div>
            <div><label className="label">Frase do topo (opcional)</label><input className="input" placeholder="Ex.: agende seu horário em 30 segundos" value={cfg.banner_text ?? ''} onChange={e => setCfg({ ...cfg, banner_text: e.target.value })} /></div>
          </div>

          {/* comodidades */}
          <div className="card-lux p-6 space-y-4">
            <h3 className="font-semibold">Comodidades</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {AMENITIES.map(([k, label]) => {
                const on = !!cfg.amenities?.[k]
                return (
                  <button key={k} onClick={() => toggle('amenities', k)}
                    className={clsx('rounded-xl border px-3 py-2.5 text-xs font-medium transition text-left', on ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-line text-ink-muted hover:border-brand-300')}>
                    {on ? '✓ ' : ''}{label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* pagamentos */}
          <div className="card-lux p-6 space-y-4">
            <h3 className="font-semibold">Formas de pagamento aceitas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PAY_METHODS.map(([k, label]) => {
                const on = !!cfg.payment_methods?.[k]
                return (
                  <button key={k} onClick={() => toggle('payment_methods', k)}
                    className={clsx('rounded-xl border px-3 py-2.5 text-xs font-medium transition text-left', on ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-line text-ink-muted hover:border-brand-300')}>
                    {on ? '✓ ' : ''}{label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* sinal */}
          <div className="card-lux p-6 space-y-4">
            <h3 className="font-semibold">Sinal para agendar</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={cfg.payments_on_page ?? false} onChange={e => setCfg({ ...cfg, payments_on_page: e.target.checked })} />
              Cobrar sinal no agendamento online
            </label>
            {cfg.payments_on_page && (
              <div className="grid sm:grid-cols-2 gap-4 pl-6">
                <div><label className="label">Percentual do sinal (%)</label><input type="number" min={5} max={100} className="input" value={cfg.deposit_percent ?? 30} onChange={e => setCfg({ ...cfg, deposit_percent: +e.target.value })} /></div>
                <div><label className="label">Método</label>
                  <select className="input" value={cfg.deposit_method ?? 'pix'} onChange={e => setCfg({ ...cfg, deposit_method: e.target.value })}>
                    <option value="pix">Pix (QR copia-e-cola)</option>
                    <option value="card">Cartão (link Stripe)</option>
                  </select>
                </div>
                <p className="text-xs text-ink-muted sm:col-span-2">O sinal cai direto na sua carteira IAstetic. O horário confirma automaticamente quando o cliente paga.</p>
              </div>
            )}
          </div>
        </div>

        {/* preview lateral */}
        <div className="space-y-4">
          <div className="card-lux p-4 sticky top-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3 flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5" /> Sua página</p>
            {pageUrl && (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl border border-line bg-white p-3"><QRCodeSVG value={pageUrl} size={140} /></div>
                <p className="text-[11px] font-mono text-ink-muted break-all text-center">{pageUrl}</p>
                <p className="text-[11px] text-ink-muted text-center">Compartilhe o link ou imprima o QR no estabelecimento.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end sticky bottom-4">
        <button className="btn-primary px-8 shadow-glow" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? 'Salvo ✓' : 'Salvar página'}
        </button>
      </div>
    </div>
  )
}
