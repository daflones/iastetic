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
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
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
    if (recording) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
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
    await start()
    const stream = streamRef.current
    if (!stream) return opts.onDone(null)
    const silenceMs = opts.silenceMs ?? 1400
    const threshold = opts.threshold ?? 0.008
    const ctx = new AudioContext()
    ctxRef.current = ctx
    // autoplay policy: sem gesto do usuário o contexto nasce suspenso e o analyser lê zero
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let heard = false
    let silentSince = 0
    const t0 = Date.now()
    const tick = async () => {
      if (!recRef.current) return
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
      const rms = Math.sqrt(sum / buf.length)
      setLevel(Math.min(1, rms * 8))
      const now = Date.now()
      if (rms > threshold) { heard = true; silentSince = 0 }
      else if (heard && !silentSince) silentSince = now
      const timedOut = now - t0 > 60_000 // trava de segurança
      const suspended = ctx.state === 'suspended' && now - t0 > 2500 // microfone ok, mas contexto travado sem gesto
      const done = (heard && silentSince && now - silentSince > silenceMs) || timedOut || suspended
      if (done) { opts.onDone(await finish()); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stop(): Promise<RecordedAudio | null> { return finish() }

  async function cancel() {
    chunksRef.current = []
    await finish()
  }

  return { recording, level, start, startAuto, stop, cancel }
}
