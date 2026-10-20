
const GRAPH = 'https://graph.instagram.com/v21.0'

export interface IgConfig { ig_user_id: string; access_token: string; username?: string; token_expires_at?: string }

export async function igConfig(db: any): Promise<IgConfig | null> {
  const { data } = await db.from('platform_settings').select('value').eq('key', 'instagram').maybeSingle()
  return data?.value?.access_token && data?.value?.ig_user_id ? data.value : null
}

export async function igFetch(token: string, path: string, params: Record<string, string> = {}, method = 'GET', body?: any) {
  const url = new URL(`${GRAPH}/${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(method === 'GET' ? url.toString() : `${GRAPH}/${path}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: method === 'POST' ? new URLSearchParams({ ...body, access_token: token }).toString() : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(`Instagram API ${data.error?.code ?? res.status}: ${data.error?.message ?? 'erro'}`)
  return data
}

async function waitReady(token: string, id: string) {
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const st = await igFetch(token, id, { fields: 'status_code' }).catch(() => null)
    if (st?.status_code === 'FINISHED' || st?.status_code === 'PUBLISHED') return
    if (st?.status_code === 'ERROR') throw new Error('Instagram recusou a mídia (formato/tamanho).')
  }
}

/** Publica no Instagram: 1 vídeo → Reel; N itens → carrossel (vídeo e/ou imagem). */
export async function publishCarousel(ig: IgConfig, slides: { image_url?: string; composed_url?: string; video_url?: string }[], caption: string): Promise<string> {
  const items = slides.map(s => ({ video: s.video_url, img: s.composed_url ?? s.image_url })).filter(s => s.video || s.img)
  if (!items.length) throw new Error('Post sem mídia para publicar.')
  const cap = caption.slice(0, 2200)

  if (items.length === 1 && items[0].video) {
    const c = await igFetch(ig.access_token, `${ig.ig_user_id}/media`, {}, 'POST', {
      media_type: 'REELS', video_url: items[0].video, caption: cap, share_to_feed: 'true',
    })
    await waitReady(ig.access_token, c.id)
    const pub = await igFetch(ig.access_token, `${ig.ig_user_id}/media_publish`, {}, 'POST', { creation_id: c.id })
    return pub.id as string
  }

  const children: string[] = []
  for (const it of items.slice(0, 10)) {
    const params: Record<string, string> = it.video
      ? { media_type: 'VIDEO', video_url: it.video!, is_carousel_item: 'true' }
      : { image_url: it.img!, is_carousel_item: 'true' }
    const c = await igFetch(ig.access_token, `${ig.ig_user_id}/media`, {}, 'POST', params)
    await waitReady(ig.access_token, c.id)
    children.push(c.id)
  }
  const container = await igFetch(ig.access_token, `${ig.ig_user_id}/media`, {}, 'POST', {
    media_type: 'CAROUSEL', children: children.join(','), caption: cap,
  })
  await waitReady(ig.access_token, container.id)
  const pub = await igFetch(ig.access_token, `${ig.ig_user_id}/media_publish`, {}, 'POST', { creation_id: container.id })
  return pub.id as string
}


/** Varredura do cron: publica posts agendados cuja hora chegou. */
export async function publishDueSocialPosts(db: any): Promise<number> {
  const { data: due } = await db.from('social_posts').select('id,slides,caption,hashtags')
    .eq('status', 'pronto').not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString()).is('ig_media_id', null).limit(3)
  if (!due?.length) return 0
  const ig = await igConfig(db)
  if (!ig) return 0
  let n = 0
  for (const p of due) {
    try {
      const caption = `${p.caption ?? ''}\n\n${(p.hashtags ?? []).join(' ')}`.trim()
      const mediaId = await publishCarousel(ig, p.slides ?? [], caption)
      await db.from('social_posts').update({ ig_media_id: mediaId, status: 'publicado', published_at: new Date().toISOString(), scheduled_at: null, publish_error: null }).eq('id', p.id)
      n++
    } catch (e) {
      await db.from('social_posts').update({ publish_error: (e as Error).message.slice(0, 300) }).eq('id', p.id)
    }
  }
  return n
}
