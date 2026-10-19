import { useEffect, useState } from 'react'
import { Download, FileImage, Link2, Lock, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDraft } from '@/hooks/useDraft'
import type { CompanyFile } from '@/lib/types'
import clsx from 'clsx'

export default function FilesPage() {
  const { company, features, loading } = useAuth()
  const [items, setItems] = useState<CompanyFile[]>([])
  const [editing, setEditing] = useState<Partial<CompanyFile> | null>(null)

  useEffect(() => { if (company && features.images) load() }, [company?.id, features.images])
  async function load() {
    const { data } = await supabase.from('company_files').select('*').eq('company_id', company!.id).order('created_at', { ascending: false })
    setItems((data as CompanyFile[]) ?? [])
  }

  if (!loading && company && !features.images) {
    return (
      <div className="card-lux p-10 text-center max-w-md mx-auto mt-10">
        <Lock className="h-10 w-10 text-brand-400 mx-auto mb-3" />
        <h2 className="font-display font-semibold text-lg">Arquivos da IA</h2>
        <p className="text-sm text-ink-muted mt-2">Disponível nos planos Pro e Studio. Cadastre fotos, catálogos e links que a IA envia aos clientes no WhatsApp.</p>
        <a href="/app/planos" className="btn-primary mt-5 inline-flex">Ver planos</a>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl">Arquivos da IA</h1>
          <p className="text-sm text-ink-muted">Imagens e links que a IA pode enviar aos clientes (tabela de preços, portfólio, agendamento…).</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ title: '', kind: 'image', url: '', description: '' })}>
          <Plus className="h-4 w-4" /> Novo arquivo
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map(f => (
          <div key={f.id} className="card-lux overflow-hidden group">
            {f.kind === 'image' ? (
              <div className="h-36 bg-canvas grid place-items-center overflow-hidden">
                <img src={f.url} alt={f.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
              </div>
            ) : (
              <div className="h-36 bg-gradient-to-br from-brand-50 to-accent-50 grid place-items-center"><Link2 className="h-8 w-8 text-brand-400" /></div>
            )}
            <div className="p-3.5">
              <p className="font-medium text-sm truncate">{f.title}</p>
              <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5">{f.description}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] badge bg-brand-50 text-brand-700">{f.kind === 'image' ? 'imagem' : f.kind}</span>
                  {(f.tags ?? []).includes('gerada-ia') && <span className="text-[10px] badge bg-gradient-to-r from-brand-500 to-accent-500 text-white"><Sparkles className="h-2.5 w-2.5" /> gerada por IA</span>}
                </div>
                <div className="flex items-center gap-1">
                  {f.kind === 'image' && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-brand-600 transition" title="Baixar"><Download className="h-3.5 w-3.5" /></a>
                  )}
                  <button className="text-ink-muted hover:text-red-500 transition" onClick={async () => { await supabase.from('company_files').delete().eq('id', f.id); load() }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && <p className="card-lux p-10 text-center text-sm text-ink-muted">Nada aqui ainda. Cadastre fotos do seu trabalho ou links úteis — a IA usa quando o cliente pedir.</p>}

      {editing && <FileModal file={editing} companyId={company!.id} onClose={r => { setEditing(null); if (r) load() }} />}
    </div>
  )
}

function FileModal({ file, companyId, onClose }: { file: Partial<CompanyFile>; companyId: string; onClose: (r: boolean) => void }) {
  const [f, setF, clearF] = useDraft(`file:${file.id ?? 'new'}`, { title: file.title ?? '', kind: (file.kind ?? 'image') as 'image' | 'link', url: file.url ?? '', description: file.description ?? '' })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileObj = e.target.files?.[0]
    if (!fileObj) return
    setUploading(true)
    const ext = fileObj.name.split('.').pop()
    const path = `${companyId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('files').upload(path, fileObj)
    if (!error && data) {
      const { data: pub } = supabase.storage.from('files').getPublicUrl(data.path)
      setF(prev => ({ ...prev, url: pub.publicUrl }))
    }
    setUploading(false)
  }

  async function save() {
    setBusy(true)
    const payload = { title: f.title, kind: f.kind, url: f.url, description: f.description || null }
    if (file.id) await supabase.from('company_files').update(payload).eq('id', file.id)
    else await supabase.from('company_files').insert({ ...payload, company_id: companyId })
    setBusy(false); clearF(); onClose(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(false)}>
      <div className="card-lux anim-pop w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-lg">Arquivo para a IA</h3>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['image', 'link'] as const).map(t => (
              <button key={t} type="button" onClick={() => setF({ ...f, kind: t })}
                className={clsx('flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition',
                  f.kind === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-soft')}>
                {t === 'image' ? <FileImage className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {t === 'image' ? 'Imagem' : 'Link'}
              </button>
            ))}
          </div>
          <div><label className="label">Nome (a IA vê isso)</label><input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Ex.: Tabela de preços 2026" /></div>
          {f.kind === 'image' && (
            <div>
              <label className="label">Imagem</label>
              <label className={clsx('block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition', f.url ? 'border-brand-300 bg-brand-50/50' : 'border-line hover:border-brand-300')}>
                <input type="file" accept="image/*" className="hidden" onChange={upload} />
                {uploading ? <p className="text-xs text-ink-muted">Enviando…</p>
                  : f.url ? <img src={f.url} className="h-32 mx-auto rounded-lg object-cover" />
                  : <p className="text-xs text-ink-muted flex flex-col items-center gap-1"><Upload className="h-5 w-5" /> clique para enviar</p>}
              </label>
            </div>
          )}
          <div>
            <label className="label">{f.kind === 'link' ? 'URL do link' : 'Ou cole uma URL de imagem'}</label>
            <input className="input" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://…" />
          </div>
          <div><label className="label">Quando enviar? (descrição para a IA)</label><textarea className="input min-h-[70px]" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Ex.: mande quando a cliente pedir preços; quando quiser ver fotos de trabalhos anteriores…" /></div>
        </div>
        <button className="btn-primary w-full mt-5" onClick={save} disabled={busy || !f.title.trim() || !f.url.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}
