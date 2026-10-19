/** Validação/máscaras de formulário — telefone BR, e-mail, senha. */

export function onlyDigits(v: string, max = 15): string {
  return v.replace(/\D/g, '').slice(0, max)
}

/** Máscara progressiva (XX) XXXXX-XXXX — aceita até 11 dígitos (DDD + número). */
export function maskPhoneBR(v: string): string {
  const d = onlyDigits(v, 11)
  if (!d.length) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Telefone BR válido: 10 (fixo) ou 11 (celular) dígitos com DDD. */
export function isValidPhoneBR(v: string): boolean {
  const d = onlyDigits(v, 15)
  return (d.length === 10 || d.length === 11) && Number(d.slice(0, 2)) >= 11
}

export const KNOWN_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.com.br',
  'icloud.com', 'me.com', 'mac.com',
  'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'r7.com',
  'globo.com', 'globomail.com', 'zipmail.com.br',
  'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'gmx.net', 'zoho.com', 'mail.com',
])

/** E-mail válido E de provedor conhecido (evita domínios inventados). */
export function isValidEmail(v: string): boolean {
  const m = /^[^\s@]+@([^\s@]+\.[a-z]{2,})$/.exec(v.trim().toLowerCase())
  return !!m && KNOWN_EMAIL_DOMAINS.has(m[1])
}
