import { useEffect, useRef, useState } from 'react'

const store = (key: string) => `draft:${key}`

export function draftHas(key: string): boolean {
  try { return localStorage.getItem(store(key)) != null } catch { return false }
}

export function draftClear(key: string) {
  try { localStorage.removeItem(store(key)) } catch { /* ignora */ }
}

function merge<T>(initial: T, saved: unknown): T {
  if (saved == null) return initial
  if (initial !== null && typeof initial === 'object' && !Array.isArray(initial) && typeof saved === 'object' && !Array.isArray(saved)) {
    return { ...(initial as object), ...(saved as object) } as T
  }
  return saved as T
}

/**
 * Estado persistido em localStorage — guarda rascunho de inputs/formulários
 * para sobreviver a troca de página/aba. Limpar com o terceiro retorno.
 */
export function useDraft<T>(key: string, initial: T) {
  const [value, setValueState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(store(key))
      return merge(initial, raw != null ? JSON.parse(raw) : null)
    } catch { return initial }
  })
  const keyRef = useRef(key)

  useEffect(() => {
    if (keyRef.current === key) return
    keyRef.current = key
    try {
      const raw = localStorage.getItem(store(key))
      setValueState(merge(initial, raw != null ? JSON.parse(raw) : null))
    } catch { setValueState(initial) }
  }, [key])

  const setValue = (v: T | ((p: T) => T)) => {
    setValueState(prev => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      try {
        const k = store(keyRef.current)
        if (next == null || next === '') localStorage.removeItem(k)
        else localStorage.setItem(k, JSON.stringify(next))
      } catch { /* storage cheio/privado — ignora */ }
      return next
    })
  }

  const clear = () => {
    draftClear(keyRef.current)
    setValueState(initial)
  }

  return [value, setValue, clear] as const
}
