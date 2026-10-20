import { serviceClient } from '../_shared/db.ts'
import { getSecret } from '../_shared/secrets.ts'

const GRAPH = 'https://graph.facebook.com/v21.0'

// Callback OAuth do Facebook/Instagram: troca code → token longo → acha conta IG Business → salva.
Deno.serve(async (req) => {
  const url = new URL(req.url)
  const site = (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br'
  const back = (q: string) => Response.redirect(`${site}/admin?tab=posts&ig=${q}`, 302)

  const code = url.searchParams.get('code')
  if (!code) return back('erro')
  try {
    const appId = await getSecret('META_APP_ID')
    const appSecret = await getSecret('META_APP_SECRET')
    if (!appId || !appSecret) return back('sem_config')

    const redirect = `${url.origin}/functions/v1/instagram-auth`
    // 1) code → token curto
    const t1 = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}`).then(r => r.json())
    if (!t1.access_token) return back('token_fail')
    // 2) token curto → longo (60 dias)
    const t2 = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${t1.access_token}`).then(r => r.json())
    const token = t2.access_token ?? t1.access_token
    const expires = Date.now() + (Number(t2.expires_in ?? 5_184_000) * 1000)
    // 3) páginas do usuário → a que tem instagram_business_account
    const pages = await fetch(`${GRAPH}/me/accounts?fields=id,name,instagram_business_account&access_token=${token}&limit=50`).then(r => r.json())
    const page = (pages.data ?? []).find((p: any) => p.instagram_business_account?.id)
    if (!page) return back('sem_conta_business')
    const igId = page.instagram_business_account.id
    // 4) dados do perfil IG
    const prof = await fetch(`${GRAPH}/${igId}?fields=username,name,profile_picture_url&access_token=${token}`).then(r => r.json())

    await serviceClient().from('platform_settings').upsert({
      key: 'instagram',
      value: {
        ig_user_id: igId, access_token: token, token_expires_at: new Date(expires).toISOString(),
        username: prof.username ?? null, name: prof.name ?? null, avatar: prof.profile_picture_url ?? null,
        page_id: page.id, page_name: page.name ?? null, connected_at: new Date().toISOString(),
      },
    })
    return back('ok')
  } catch { return back('erro') }
})
