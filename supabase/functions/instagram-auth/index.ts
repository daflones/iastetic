import { serviceClient } from '../_shared/db.ts'
import { getSecret } from '../_shared/secrets.ts'

// instagram-auth: três papéis num endpoint só —
//  1) GET ?hub.mode=subscribe → verificação do webhook do Meta (echo do challenge)
//  2) POST                  → eventos do webhook (comentários, menções) — ACK por ora
//  3) GET ?code=            → callback OAuth do Instagram Login → token longo → salva
Deno.serve(async (req) => {
  const url = new URL(req.url)

  // (1) verificação do webhook: Meta chama GET e espera o hub.challenge de volta
  if (req.method === 'GET' && url.searchParams.get('hub.mode') === 'subscribe') {
    const verify = await getSecret('IG_WEBHOOK_VERIFY_TOKEN')
    if (verify && url.searchParams.get('hub.verify_token') === verify) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('forbidden', { status: 403 })
  }

  // (2) eventos do webhook (comentários/menções) — confirma recebimento
  if (req.method === 'POST') {
    const ev = await req.json().catch(() => null)
    if (ev) console.log('ig webhook:', JSON.stringify(ev).slice(0, 500))
    return new Response('ok', { status: 200 })
  }

  // (3) callback OAuth: code → token curto → token longo (60d) → perfil → salva
  const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
  const back = (q: string) => Response.redirect(`${site}/admin?tab=posts&ig=${q}`, 302)

  const code = url.searchParams.get('code')
  if (!code) return back('erro')
  try {
    const appId = (await getSecret('IG_APP_ID')) ?? (await getSecret('META_APP_ID'))
    const appSecret = (await getSecret('IG_APP_SECRET')) ?? (await getSecret('META_APP_SECRET'))
    if (!appId || !appSecret) return back('sem_config')

    const redirect = `${url.origin}/functions/v1/instagram-auth`
    const t1 = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId, client_secret: appSecret, grant_type: 'authorization_code',
        redirect_uri: redirect, code,
      }),
    }).then(r => r.json())
    const short = t1.access_token
    const igId = String(t1.user_id ?? '')
    if (!short || !igId) return back('token_fail')

    const t2 = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${short}`).then(r => r.json())
    const token = t2.access_token ?? short
    const expires = Date.now() + (Number(t2.expires_in ?? 5_184_000) * 1000)

    const prof = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username,name,profile_picture_url&access_token=${token}`).then(r => r.json())

    await serviceClient().from('platform_settings').upsert({
      key: 'instagram',
      value: {
        ig_user_id: prof.user_id ?? igId, access_token: token, token_expires_at: new Date(expires).toISOString(),
        username: prof.username ?? null, name: prof.name ?? null, avatar: prof.profile_picture_url ?? null,
        connected_at: new Date().toISOString(), login_type: 'instagram',
      },
    })
    return back('ok')
  } catch { return back('erro') }
})
