import { useRef, useState } from 'react'

export interface RecordedAudio {
  base64: string
  mime: string
}

/** Grava áudio do microfone via MediaRecorder e devolve base64 pra enviar às Edge Functions. */
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function start() {
    if (recording) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ?? ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.start(250)
    recRef.current = rec
    setRecording(true)
  }

  function stop(): Promise<RecordedAudio | null> {
    return new Promise(resolve => {
      const rec = recRef.current
      if (!rec) return resolve(null)
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        recRef.current = null
        setRecording(false)
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

  async function cancel() {
    chunksRef.current = []
    await stop()
  }

  return { recording, start, stop, cancel }
}
