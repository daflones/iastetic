import { ApiError } from './http.ts'
import { requireSecret } from './secrets.ts'

async function base() { return (await requireSecret('EVOLUTION_URL')).replace(/\/$/, '') }
async function headers() { return { apikey: await requireSecret('EVOLUTION_APIKEY'), 'Content-Type': 'application/json' } }

async function evo(path: string, method = 'GET', body?: unknown, timeoutMs = 30_000) {
  const res = await fetch(await base() + path, {
    method, headers: await headers(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new ApiError(res.status >= 500 ? 502 : res.status, 'EVOLUTION_ERROR', `Evolution ${res.status}: ${typeof data === 'string' ? data : data?.response?.message ?? JSON.stringify(data)}`.slice(0, 300))
  return data
}

// ---------- instâncias ----------
export async function createInstance(name: string, number?: string) {
  return evo('/instance/create', 'POST', {
    instanceName: name,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    number: number?.replace(/\D/g, '') || undefined,
    webhook: undefined,
  })
}
export async function setWebhook(instanceName: string, url: string, secret?: string, enabled = true) {
  return evo(`/webhook/set/${encodeURIComponent(instanceName)}`, 'POST', {
    webhook: {
      enabled,
      url,
      webhookByEvents: false,
      webhookBase64: true,
      headers: secret ? { 'x-iastetic-hook': secret } : undefined,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPDATE', 'CALL'],
    },
  })
}
export async function connectInstance(name: string, number?: string) {
  const q = number ? `?number=${number.replace(/\D/g, '')}` : ''
  return evo(`/instance/connect/${encodeURIComponent(name)}${q}`, 'GET')
}
export async function fetchInstances() { return evo('/instance/fetchInstances') }
export async function connectionState(name: string) { return evo(`/instance/connectionState/${encodeURIComponent(name)}`) }
export async function logoutInstance(name: string) { return evo(`/instance/logout/${encodeURIComponent(name)}`, 'DELETE') }
export async function deleteInstance(name: string) { return evo(`/instance/delete/${encodeURIComponent(name)}`, 'DELETE') }
export async function restartInstance(name: string) { return evo(`/instance/restart/${encodeURIComponent(name)}`, 'PUT') }

// ---------- envio ----------
export async function sendText(instanceName: string, number: string, text: string) {
  return evo(`/message/sendText/${encodeURIComponent(instanceName)}`, 'POST', {
    number: number.replace(/\D/g, ''), text, delay: 0,
  }, 45_000)
}
export async function sendMedia(instanceName: string, number: string, mediaUrlOrBase64: string, caption = '', fileName = 'arquivo.jpg', mimetype = 'image/jpeg') {
  return evo(`/message/sendMedia/${encodeURIComponent(instanceName)}`, 'POST', {
    number: number.replace(/\D/g, ''), mediatype: 'image', mimetype, caption, media: mediaUrlOrBase64, fileName,
  }, 60_000)
}
export async function sendAudio(instanceName: string, number: string, audioBase64OrUrl: string) {
  return evo(`/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, 'POST', {
    number: number.replace(/\D/g, ''), audio: audioBase64OrUrl,
  }, 60_000)
}
export async function sendPresence(instanceName: string, number: string, presence: 'composing' | 'paused' | 'recording' = 'composing') {
  try { return await evo(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, 'POST', { number: number.replace(/\D/g, ''), delay: 800, presence }, 15_000) } catch { /* best effort */ }
}
export async function markRead(instanceName: string, remoteJid: string, fromMe = false, id?: string) {
  try { return await evo(`/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`, 'POST', { readMessages: [{ remoteJid, fromMe, id }] }, 15_000) } catch { /* best effort */ }
}
export async function fetchMessageMedia(instanceName: string, message: unknown) {
  return evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, 'POST', { message, convertToMp4: false }, 60_000)
}
export async function findProfilePicture(instanceName: string, number: string) {
  try { return await evo(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, 'POST', { number: number.replace(/\D/g, '') }, 15_000) }
  catch { return null }
}

/** Verifica em lote se números têm WhatsApp. Retorna [{number, exists, jid}] (best effort). */
export async function checkWhatsAppNumbers(instanceName: string, numbers: string[]): Promise<{ number: string; exists: boolean; jid?: string }[]> {
  try {
    const res = await evo(`/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, 'POST',
      { numbers: numbers.map(n => n.replace(/\D/g, '')) }, 60_000)
    const arr = Array.isArray(res) ? res : res?.numbers ?? []
    return arr.map((r: any) => ({
      number: String(r.number ?? r.jid ?? '').replace(/\D/g, ''),
      exists: !!(r.exists ?? r.existsOnWhatsapp ?? (r.jid && String(r.jid).includes('@'))),
      jid: r.jid,
    }))
  } catch { return [] }
}

// ---------- payload do webhook ----------
export interface IncomingMessage {
  instanceName: string
  remoteJid: string
  fromMe: boolean
  pushName?: string
  messageId?: string
  type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'location' | 'unknown'
  text?: string
  raw: any
}

export function parseIncoming(body: any): IncomingMessage | null {
  const instanceName = body?.instance ?? body?.instanceName
  const data = body?.data
  const key = data?.key
  if (!instanceName || !key?.remoteJid) return null
  const remoteJid: string = key.remoteJid
  if (remoteJid.endsWith('@g.us') || remoteJid.includes('broadcast') || remoteJid === 'status@broadcast') return null
  const msg = data?.message
  if (!msg) return null
  let type: IncomingMessage['type'] = 'unknown'
  let text: string | undefined
  if (msg.conversation) { type = 'text'; text = msg.conversation }
  else if (msg.extendedTextMessage) { type = 'text'; text = msg.extendedTextMessage.text }
  else if (msg.audioMessage) type = 'audio'
  else if (msg.imageMessage) { type = 'image'; text = msg.imageMessage.caption || undefined }
  else if (msg.videoMessage) type = 'video'
  else if (msg.documentMessage) type = 'document'
  else if (msg.stickerMessage) type = 'sticker'
  else if (msg.locationMessage) type = 'location'
  else if (msg.buttonsResponseMessage?.selectedDisplayText) { type = 'text'; text = msg.buttonsResponseMessage.selectedDisplayText }
  else if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) { type = 'text'; text = msg.listResponseMessage.singleSelectReply.selectedRowId }
  else if (msg.templateButtonReplyMessage?.selectedDisplayText) { type = 'text'; text = msg.templateButtonReplyMessage.selectedDisplayText }
  return {
    instanceName,
    remoteJid,
    fromMe: !!key.fromMe,
    pushName: data?.pushName,
    messageId: key.id,
    type,
    text,
    raw: data,
  }
}
