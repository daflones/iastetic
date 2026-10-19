import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react'

export default function PaymentResultPage() {
  const { result } = useParams()
  const ok = result === 'sucesso' || result === 'success'
  const [dots, setDots] = useState('')
  useEffect(() => { const i = setInterval(() => setDots(d => d.length < 3 ? d + '.' : ''), 400); return () => clearInterval(i) }, [])

  return (
    <div className="min-h-screen bg-canvas grid place-items-center p-6">
      <div className="card-lux anim-pop w-full max-w-sm p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 grid place-items-center mb-5">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        {ok ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <h1 className="h-display text-2xl">Pagamento confirmado!</h1>
            <p className="text-sm text-ink-muted mt-2">Seu plano já está ativo{dots}</p>
            <Link to="/app/dashboard" className="btn-primary w-full mt-6 justify-center">Ir para o painel</Link>
          </>
        ) : (
          <>
            <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <h1 className="h-display text-2xl">Pagamento cancelado</h1>
            <p className="text-sm text-ink-muted mt-2">Nada foi cobrado. Você pode tentar de novo ou pagar com Pix.</p>
            <Link to="/app/planos" className="btn-primary w-full mt-6 justify-center">Voltar aos planos</Link>
          </>
        )}
      </div>
    </div>
  )
}
