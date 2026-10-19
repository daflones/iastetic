import Art from './Art'
import clsx from 'clsx'

/** Miniatura da arte do nicho (substitui emoji de identidade visual). */
export default function NicheArt({ id, className }: { id: string; className?: string }) {
  return (
    <Art
      name={`niche-${id}`}
      className={clsx('object-cover', className)}
      placeholderClass={className}
    />
  )
}
