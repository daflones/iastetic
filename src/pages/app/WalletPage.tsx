import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Check, CreditCard, Loader2, Wallet, X } from 'lucide-react'
import { supabase, callFn, brl, fmtDateTime } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { WalletEntry } from '@/lib/types'
import { QRCodeSVG } from 'qrcode.react'
import clsx from 'clsx'

export default function WalletPage() {
  const { company } = useAuth()
  const [wallet, setWallet] = useState<any>(null)
  const [entries, setEntries] = useState<WalletEntry[]>([])
  const [depositModal, setDepositModal] = useState(false)
  const [withdrawModal, setWithdrawModal] = useState(false)

  useEffect(() => { if (company) load() }, [company?.id])

  async function load() {
    const [{ data: w }, { data: e }] = await Promise.all([
      supabase.from('wallets').select('*').eq('company_id', company!.id).single(),
      supabase.from('wallet_entries').select('*').eq('company_id', company!.id).order('created_at', { ascending: false }).limit(50),
    ])
    setWallet(w); setEntries((e as WalletEntry[]) ?? [])
  }

  const entryLabel = (k: string, desc?: string | null) => desc ?? ({
    credit: 'Crédito', debit: 'Débito', fee: 'Taxa de saque', reserve: 'Valor reservado', release: 'Reserva liberada',
  }[k] ?? k)

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><Wallet className="h-7 w-7 text-brand-500" /> Carteira</h1>

      <div className="card-lux p-6 bg-gradient-to-br from-ink to-[#2a2036] text-white relative overflow-hidden">
        <div className="absolute inset-0 texture-dots opacity-15" />
        <div className="orb bg-brand-500/30 h-56 w-56 -right-16 -top-16" />
        <div className="orb bg-accent-500/25 h-48 w-48 -left-10 -bottom-16" style={{ animationDelay: '-6s' }} />
        <div className="relative grid sm:grid-cols-3 gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/60">Saldo disponível</p>
            <p className="font-display text-4xl font-bold mt-1">{brl(wallet?.balance_cents ?? 0)}</p>
            <p className="text-xs text-white/50 mt-1">dá para pagar o plano ou sacar via Pix</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/60">Reservado</p>
            <p className="font-display text-2xl font-semibold mt-1 text-amber-300">{brl(wallet?.reserved_cents ?? 0)}</p>
            <p className="text-xs text-white/50 mt-1">em saques e assinaturas em andamento</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end justify-center">
            <button className="btn-primary !bg-brand-400 hover:!bg-brand-500 w-full sm:w-auto" onClick={() => setDepositModal(true)}>
              <ArrowDownToLine className="h-4 w-4" /> Depositar via Pix
            </button>
            <button className="btn-ghost !text-white/80 hover:!bg-white/10 w-full sm:w-auto" onClick={() => setWithdrawModal(true)}>
              <ArrowUpFromLine className="h-4 w-4" /> Sacar (taxa 5%)
            </button>
          </div>
        </div>
      </div>

      <div className="card-lux overflow-hidden">
        <div className="px-5 py-4 border-b border-line"><h3 className="font-semibold text-sm">Extrato</h3></div>
        <div className="divide-y divide-line/60">
          {entries.map(e => (
            <div key={e.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{entryLabel(e.kind, e.description)}</p>
                <p className="text-xs text-ink-muted">{fmtDateTime(e.created_at)}{e.balance_after_cents != null ? ` • saldo: ${brl(e.balance_after_cents)}` : ''}</p>
              </div>
              <span className={clsx('font-display font-semibold text-sm whitespace-nowrap', e.amount_cents >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                {e.amount_cents >= 0 ? '+' : ''}{brl(e.amount_cents)}
              </span>
            </div>
          ))}
          {entries.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-muted">Sem movimentações ainda.</p>}
        </div>
      </div>

      {depositModal && <DepositModal onClose={r => { setDepositModal(false); if (r) load() }} />}
      {withdrawModal && <WithdrawModal wallet={wallet} onClose={r => { setWithdrawModal(false); if (r) load() }} />}
    </div>
  )
}

function DepositModal({ onClose }: { onClose: (r: boolean) => void }) {
  const [amount, setAmount] = useState(100)
  const [busy, setBusy] = useState(false)
  const [charge, setCharge] = useState<{ qr: string } | null>(null)
  const [error, setError] = useState('')

  async function create(method: 'pix' | 'card') {
    setBusy(true); setError('')
    try {
      const r = await callFn<any>('payments', { action: 'wallet_deposit', method, amount_cents: Math.round(amount * 100) })
      if (method === 'card') { window.location.href = r.checkout_url; return }
      setCharge({ qr: r.qr_code })
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(!!charge && false)}>
      <div className="card-lux anim-pop w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg">Depositar na carteira</h3>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>
        {!charge ? (
          <div className="space-y-4">
            <div><label className="label">Valor (R$)</label><input type="number" min={10} step={10} className="input text-center text-xl font-bold" value={amount} onChange={e => setAmount(+e.target.value)} /></div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button className="btn-primary w-full" onClick={() => create('pix')} disabled={busy || amount < 10}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gerar QR Code Pix</button>
            <button className="btn-outline w-full" onClick={() => create('card')} disabled={busy || amount < 10}><CreditCard className="h-4 w-4" /> Pagar com cartão (Stripe)</button>
            <p className="text-[11px] text-ink-muted text-center">Pix cai na hora; cartão abre o checkout seguro. O saldo entra sozinho quando confirmar.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-2xl border border-line bg-white p-4"><QRCodeSVG value={charge.qr} size={200} /></div>
            <p className="font-display font-bold text-xl">{brl(Math.round(amount * 100))}</p>
            <textarea readOnly className="input text-[10px] h-20 font-mono" value={charge.qr} onClick={e => (e.target as HTMLTextAreaElement).select()} />
            <p className="text-xs text-ink-muted">Ou copie o código acima e cole no app do banco.</p>
            <button className="btn-outline w-full" onClick={() => onClose(true)}>Já paguei</button>
          </div>
        )}
      </div>
    </div>
  )
}

function WithdrawModal({ wallet, onClose }: { wallet: any; onClose: (r: boolean) => void }) {
  const [amount, setAmount] = useState(0)
  const [pixKey, setPixKey] = useState('')
  const [keyType, setKeyType] = useState('cpf')
  const [doc, setDoc] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const available = wallet?.balance_cents ?? 0
  const fee = Math.round(amount * 100 * 0.05)
  const net = Math.round(amount * 100) - fee
  const needsDoc = keyType === 'email' || keyType === 'phone' || keyType === 'evp'

  async function submit() {
    setBusy(true); setError('')
    try {
      await callFn('payments', { action: 'withdraw', amount_cents: Math.round(amount * 100), pix_key: pixKey, pix_key_type: keyType, recipient_document: doc || undefined })
      setDone(true)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(done)}>
      <div className="card-lux anim-pop w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg">Sacar via Pix</h3>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>
        {done ? (
          <div className="text-center space-y-3 py-4">
            <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center mx-auto"><Check className="h-7 w-7" /></div>
            <p className="font-semibold">Saque solicitado!</p>
            <p className="text-xs text-ink-muted">Processando no provedor de pagamentos. Se falhar, o valor volta para o saldo automaticamente.</p>
            <button className="btn-primary w-full" onClick={() => onClose(true)}>OK</button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted">Disponível: <b>{brl(available)}</b></p>
            <div><label className="label">Valor (R$)</label><input type="number" min={10} step={10} className="input text-center text-xl font-bold" value={amount || ''} onChange={e => setAmount(+e.target.value)} placeholder="0,00" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1"><label className="label">Tipo da chave</label>
                <select className="input" value={keyType} onChange={e => setKeyType(e.target.value)}>
                  <option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="evp">Aleatória</option>
                </select>
              </div>
              <div className="col-span-2"><label className="label">Chave Pix de destino</label><input className="input" value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="sua chave" /></div>
            </div>
            {needsDoc && <div><label className="label">CPF/CNPJ do titular da chave</label><input className="input" value={doc} onChange={e => setDoc(e.target.value)} placeholder="000.000.000-00" /></div>}
            {amount > 0 && (
              <div className="rounded-xl bg-canvas border border-line p-3 text-xs space-y-1">
                <div className="flex justify-between"><span>Solicitado</span><b>{brl(Math.round(amount * 100))}</b></div>
                <div className="flex justify-between text-red-500"><span>Taxa plataforma (5%)</span><b>−{brl(fee)}</b></div>
                <div className="flex justify-between text-emerald-600"><span>Você recebe</span><b>{brl(net)}</b></div>
              </div>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button className="btn-primary w-full" onClick={submit} disabled={busy || Math.round(amount * 100) > available || amount <= 0 || !pixKey.trim() || (needsDoc && doc.replace(/\D/g, '').length < 11)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Solicitar saque
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
