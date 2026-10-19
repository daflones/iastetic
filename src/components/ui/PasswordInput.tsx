import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Input de senha com botão olho (mostrar/ocultar). */
export default function PasswordInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${className} !pr-10`} />
      <button type="button" tabIndex={-1} onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
