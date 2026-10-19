// Define secrets das Edge Functions via Management API sem expor valores no log.
// Uso: node scripts/set-secrets.mjs <caminho-do-.env-do-lifebots>
import { readFileSync } from 'node:fs'

const envPath = process.argv[2]
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const secrets = [
  { name: 'MERCOSULPAY_API_KEY', value: env.MERCOSULPAY_API_KEY },
  { name: 'MERCOSULPAY_WEBHOOK_SECRET', value: env.MERCOSULPAY_WEBHOOK_SECRET },
  { name: 'EVOLUTION_URL', value: 'https://evolutionapi.eletrify.me' },
  { name: 'EVOLUTION_APIKEY', value: 'evolutionapikeymrrobot' },
  { name: 'PUBLIC_SITE_URL', value: 'https://iastetic.com.br' },
].filter(s => s.value)

console.log('definindo:', secrets.map(s => s.name).join(', '))

const res = await fetch('https://api.supabase.com/v1/projects/ndnypgqieourcxpghffd/secrets', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.SUPABASE_MGMT_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(secrets),
})
console.log('status:', res.status)
console.log((await res.text()).slice(0, 300))
