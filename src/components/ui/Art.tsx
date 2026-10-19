import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import clsx from 'clsx'

/**
 * Renderiza /imagens/<name>.png se existir; senão, um placeholder
 * em gradiente nas cores do nicho (para popular aos poucos).
 */
export default function Art({ name, alt = '', className, placeholderClass }: {
  name: string
  alt?: string
  className?: string
  placeholderClass?: string
}) {
  const [missing, setMissing] = useState(false)
  if (missing) {
    return (
      <div className={clsx('grid place-items-center bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100', placeholderClass ?? className)}>
        <Sparkles className="h-8 w-8 text-brand-300" />
      </div>
    )
  }
  return (
    <img
      src={`/imagens/${name}.png`}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setMissing(true)}
    />
  )
}
