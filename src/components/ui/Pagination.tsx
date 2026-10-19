import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

/** Paginação client-side: passa a lista filtrada, recebe a fatia da página.
 * Reseta pra página 0 quando `deps` mudam (ex.: filtro). */
export function usePaged<T>(items: T[], perPage = 12, deps: unknown[] = []) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  useEffect(() => { setPage(0) }, deps)
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [pages, page])
  return { page, setPage, pages, total: items.length, slice: items.slice(page * perPage, (page + 1) * perPage) }
}

export default function Pagination({ page, pages, total, onChange, className }: {
  page: number; pages: number; total?: number; onChange: (p: number) => void; className?: string
}) {
  if (pages <= 1) return null
  const nums: number[] = []
  const lo = Math.max(0, Math.min(page - 2, pages - 5))
  for (let i = lo; i < Math.min(lo + 5, pages); i++) nums.push(i)
  const btn = 'h-8 min-w-8 px-2 rounded-lg text-xs font-medium grid place-items-center transition'
  return (
    <div className={clsx('flex items-center justify-center gap-1.5 pt-4', className)}>
      <button className={clsx(btn, 'text-ink-soft hover:bg-brand-50 disabled:opacity-30')} disabled={page === 0} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {nums.map(n => (
        <button key={n} onClick={() => onChange(n)}
          className={clsx(btn, n === page ? 'bg-brand-500 text-white shadow-soft' : 'text-ink-soft hover:bg-brand-50')}>
          {n + 1}
        </button>
      ))}
      {total != null && <span className="text-[10px] text-ink-muted ml-1.5">· {total} itens</span>}
      <button className={clsx(btn, 'text-ink-soft hover:bg-brand-50 disabled:opacity-30')} disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
