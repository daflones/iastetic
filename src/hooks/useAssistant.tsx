import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { callFn } from '@/lib/supabase'
import { useAuth } from './useAuth'
import { useDraft } from './useDraft'
import { useRecorder } from './useRecorder'

export type AssistantImage = { url: string; prompt: string }
export type AssistantPost = { title: string; caption: string; hashtags: string; image_url?: string; platform?: 'instagram' | 'facebook'; format?: 'feed' | 'story' }
export type AssistantMsg = { role: 'user' | 'assistant'; text: string; audio?: string; audioBlocked?: boolean; images?: AssistantImage[]; posts?: AssistantPost[] }

type Reply = { reply: string; thread_id: string | null; audio: string | null; transcript: string | null; images?: AssistantImage[]; posts?: AssistantPost[]; audio_blocked?: boolean }

type Ctx = {
  msgs: AssistantMsg[]
  input: string
  setInput: (v: string) => void
  voice: boolean
  setVoice: (v: boolean) => void
  busy: boolean
  recording: boolean
  send: (text?: string) => Promise<void>
  toggleMic: () => Promise<void>
  reset: () => void
}

const AssistantCtx = createContext<Ctx | null>(null)

const GREETING: AssistantMsg[] = [{ role: 'assistant', text: 'Oi! Sou sua assistente de negócios. Pergunte sobre agenda, clientes, faturamento — ou peça posts, legendas, campanhas e imagens pro Instagram. Posso responder em texto ou áudio.' }]

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { company } = useAuth()
  const cid = company?.id ?? 'anon'
  const [msgs, setMsgs] = useDraft<AssistantMsg[]>(`assistant-msgs:${cid}`, GREETING)
  const [input, setInput] = useDraft(`assistant-input:${cid}`, '')
  const [voice, setVoice] = useDraft(`assistant-voice:${cid}`, false)
  const [threadId, setThreadId] = useDraft<string | null>(`assistant-thread:${cid}`, null)
  const [busy, setBusy] = useState(false)
  const { recording, start: startRec, stop: stopRec } = useRecorder()
  const player = useRef<HTMLAudioElement | null>(null)

  // toca o áudio assim que chega; pausa o anterior para nunca sobrepor/duplicar
  const playNow = useCallback((src: string) => {
    player.current?.pause()
    player.current = new Audio(src)
    player.current.play().catch(() => {})
  }, [])

  const append = useCallback((list: AssistantMsg[]) => {
    setMsgs(prev => [...prev.slice(-60), ...list])
  }, [setMsgs])

  const send = useCallback(async (text?: string) => {
    const t = (text ?? input).trim()
    if (!t || busy) return
    setInput('')
    append([{ role: 'user', text: t }])
    setBusy(true)
    try {
      const r = await callFn<Reply>('business-assistant', { message: t, voice, thread_id: threadId })
      if (r.thread_id) setThreadId(r.thread_id)
      append([{ role: 'assistant', text: r.reply || 'Não consegui montar a resposta agora — tenta de novo?', audio: r.audio ?? undefined, audioBlocked: r.audio_blocked, images: r.images?.length ? r.images : undefined, posts: r.posts?.length ? r.posts : undefined }])
      if (r.audio) playNow(r.audio)
    } catch (e) {
      append([{ role: 'assistant', text: 'Opa, tive um probleminha agora: ' + (e as Error).message + '. Tenta de novo?' }])
    }
    setBusy(false)
  }, [input, busy, voice, threadId, append, setInput, setThreadId, playNow])

  const toggleMic = useCallback(async () => {
    if (busy) return
    if (!recording) {
      try { await startRec() } catch {
        append([{ role: 'assistant', text: 'Não consegui acessar o microfone — libera a permissão no navegador e tenta de novo.' }])
      }
      return
    }
    const rec = await stopRec()
    if (!rec) return
    setBusy(true)
    try {
      const r = await callFn<Reply>('business-assistant', { audio: rec.base64, audio_mime: rec.mime, voice, thread_id: threadId })
      if (r.thread_id) setThreadId(r.thread_id)
      append([
        { role: 'user', text: `Áudio: ${r.transcript || '(transcrição indisponível)'}` },
        { role: 'assistant', text: r.reply || 'Não consegui montar a resposta agora — tenta de novo?', audio: r.audio ?? undefined, audioBlocked: r.audio_blocked, images: r.images?.length ? r.images : undefined, posts: r.posts?.length ? r.posts : undefined },
      ])
      if (r.audio) playNow(r.audio)
    } catch (e) {
      append([{ role: 'assistant', text: 'Não entendi o áudio: ' + (e as Error).message + '. Tenta de novo ou escreva.' }])
    }
    setBusy(false)
  }, [busy, recording, voice, threadId, append, startRec, stopRec, setThreadId, playNow])

  const reset = useCallback(() => { setMsgs(GREETING); setThreadId(null) }, [setMsgs, setThreadId])

  return (
    <AssistantCtx.Provider value={{ msgs, input, setInput, voice, setVoice, busy, recording, send, toggleMic, reset }}>
      {children}
    </AssistantCtx.Provider>
  )
}

export function useAssistant() {
  const ctx = useContext(AssistantCtx)
  if (!ctx) throw new Error('useAssistant fora do AssistantProvider')
  return ctx
}
