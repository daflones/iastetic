import { useRef, useState } from 'react'

export interface RecordedAudio {
  base64: string
  mime: string
}

export interface AutoListenOpts {
  /** ms de silêncio pra encerrar a captura depois de detectar fala */
  silenceMs?: number
  /** volume RMS mínimo pra considerar "fala" */
  threshold?: number
  /** callback quando a gravação parar sozinha por silêncio (devolve o áudio) */
  onDone: (rec: RecordedAudio | null) => void
}

// AudioContext compartilhado — criado/destravado por gesto do usuário e reusado nas escutas.
let micCtx: AudioContext | null = null

/** Chamar DENTRO de um onClick para destravar o contexto de áudio (autoplay policy). */
export function unlockMicAudio() {
  try {
    if (!micCtx) micCtx = new AudioContext()
    if (micCtx.state === 'suspended') void micCtx.resume()
  } catch { /* sem suporte */ }
}

/** Grava áudio do microfone via MediaRecorder e devolve base64 pra enviar às Edge Functions. */
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0) // 0..1 pra animar UI
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rafRef = useRef<number>(0)
  const ctxRef = useRef<AudioContext | null>(null)

  function cleanupStream() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recRef.current = null
    ctxRef.current = null // contexto compartilhado fica vivo pra próxima escuta
    setRecording(false)
    setLevel(0)
  }

  function finish(): Promise<RecordedAudio | null> {
    return new Promise(resolve => {
      const rec = recRef.current
      if (!rec) return resolve(null)
      rec.onstop = () => {
        cleanupStream()
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (!blob.size) return resolve(null)
        blob.arrayBuffer().then(buf => {
          const bytes = new Uint8Array(buf)
          let bin = ''
          for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
          resolve({ base64: btoa(bin), mime: blob.type })
        })
      }
      rec.stop()
    })
  }

  async function start() {
    if (recRef.current) return // já capturando (ref é sempre atual, state pode estar velho)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    streamRef.current = stream
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ?? ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.start(250)
    recRef.current = rec
    setRecording(true)
  }

  /** Liga o microfone e encerra sozinho quando a pessoa para de falar. */
  async function startAuto(opts: AutoListenOpts) {
    // mata qualquer captura anterior pendurada antes de começar uma limpa
    cancelAnimationFrame(rafRef.current)
    const oldRec = recRef.current
    if (oldRec) {
      recRef.current = null
      try { oldRec.stop() } catch { /* já parado */ }
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    await start()
    const stream = streamRef.current
    const myRec = recRef.current
    if (!stream || !myRec) return opts.onDone(null)
    const silenceMs = opts.silenceMs ?? 1400
    const threshold = opts.threshold ?? 0.006
    const ctx = micCtx ?? (micCtx = new AudioContext())
    ctxRef.current = ctx
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let heard = false
    let silentSince = 0
    const t0 = Date.now()
    const tick = async () => {
      if (recRef.current !== myRec) return // outra escuta assumiu — sai calada
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      let peak = 0
      for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; sum += v * v; if (v > peak) peak = v }
      const rms = Math.sqrt(sum / buf.length)
      setLevel(Math.min(1, rms * 10))
      const now = Date.now()
      if (rms > threshold || peak > threshold * 4) { heard = true; silentSince = 0 }
      else if (heard && !silentSince) silentSince = now
      const timedOut = now - t0 > 60_000 // trava de segurança
      const suspended = ctx.state === 'suspended' && now - t0 > 4000 // contexto travado sem gesto
      const done = (heard && silentSince && now - silentSince > silenceMs) || timedOut || suspended
      if (done) { opts.onDone(await finish()); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stop(): Promise<RecordedAudio | null> { return finish() }

  function ctxState() { return micCtx?.state ?? 'none' }

  /** Diagnóstico da faixa de áudio capturada (qual mic, se está muda, sample rate). */
  function trackInfo() {
    const t = streamRef.current?.getAudioTracks()[0]
    if (!t) return 'sem track'
    const s = (t.getSettings?.() ?? {}) as { sampleRate?: number }
    return `${t.label || 'mic?'} · ${t.muted ? 'TRACK MUDA' : 'track on'} · ${t.readyState} · ${s.sampleRate ?? '?'}Hz`
  }

  async function cancel() {
    chunksRef.current = []
    await finish()
  }

  return { recording, level, start, startAuto, stop, cancel, ctxState, trackInfo }
}
