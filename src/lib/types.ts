import type { NicheId } from './niches'

export interface Company {
  id: string
  name: string
  slug: string | null
  niche: NicheId
  owner_id: string | null
  phone: string | null
  email: string | null
  whatsapp_public: string | null
  address: string | null
  city: string | null
  state: string | null
  instagram: string | null
  logo_url: string | null
  cover_url: string | null
  booking_config: Record<string, any>
  timezone: string
  business_hours: Record<string, [string, string][]>
  extra: Record<string, string>
  ai_config: AiConfig
  plan_id: string | null
  subscription_status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
  subscription_until: string | null
  trial_until: string
  onboarding_step: number
  onboarding_done: boolean
  stripe_customer_id?: string | null
  is_demo?: boolean
  plans?: Plan
}

export interface AiConfig {
  name: string
  tone: string
  allowed?: string
  forbidden?: string
  greeting?: string
  send_images?: boolean
  send_audio?: boolean
  payments_enabled?: boolean
  require_deposit?: boolean
  deposit_percent?: number
  language?: string
  reply_delay_sec?: number
  auto_confirm?: boolean
}

export interface Plan {
  id: string
  slug: string
  name: string
  niche: NicheId | null
  description: string | null
  price_cents: number
  yearly_price_cents: number | null
  instances_limit: number
  professionals_limit: number
  monthly_messages_limit: number
  image_quota: number
  image_storage_limit: number
  assistant_audio_quota: number
  customer_audio_quota: number
  features: { audio?: boolean; images?: boolean; payments?: boolean; followups?: boolean; assistant?: boolean; priority?: boolean }
  stripe_price_id: string | null
  stripe_yearly_price_id: string | null
  highlight: boolean
  active: boolean
  sort: number
}

export interface CompanyFile {
  id: string
  company_id: string
  kind: 'image' | 'document' | 'link'
  title: string
  url: string
  description: string | null
  tags: string[]
  created_at: string
}

export interface WalletEntry {
  id: string
  company_id: string
  kind: 'credit' | 'debit' | 'fee' | 'reserve' | 'release'
  amount_cents: number
  balance_after_cents: number | null
  reference_type: string | null
  reference_id: string | null
  description: string | null
  created_at: string
}

export interface Contact {
  id: string
  company_id: string
  phone: string
  name: string | null
  push_name: string | null
  email: string | null
  birthday: string | null
  stage: 'novo' | 'interessado' | 'agendado' | 'cliente' | 'inativo' | 'perdido'
  tags: string[]
  notes: string | null
  avatar_url: string | null
  ai_paused: boolean
  total_spent_cents: number
  visits: number
  last_message_at: string | null
  created_at: string
}

export interface Conversation {
  id: string
  company_id: string
  contact_id: string
  instance_id: string | null
  remote_jid: string
  status: 'open' | 'closed'
  mode: 'ai' | 'human'
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  ai_state?: any
  contacts?: Contact
}

export interface Message {
  id: string
  conversation_id: string
  direction: 'in' | 'out'
  sender: 'contact' | 'ai' | 'human' | 'system'
  type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'location' | 'payment' | 'system'
  content: string | null
  media_url: string | null
  media_mime: string | null
  transcription: string | null
  created_at: string
  meta: Record<string, unknown>
}

export interface Service {
  id: string
  company_id: string
  name: string
  category: string | null
  description: string | null
  duration_min: number
  price_cents: number
  image_url: string | null
  professional_ids: string[]
  buffer_min: number
  active: boolean
  sort: number
}

export interface Professional {
  id: string
  company_id: string
  name: string
  avatar_url: string | null
  specialties: string[]
  working_hours: Record<string, [string, string][]> | null
  active: boolean
  color?: string | null
  pin_hash?: string | null
}

export interface Appointment {
  id: string
  company_id: string
  contact_id: string | null
  professional_id: string | null
  service_id: string | null
  service_name: string | null
  starts_at: string
  ends_at: string
  status: 'scheduled' | 'awaiting_payment' | 'confirmed' | 'done' | 'cancelled' | 'no_show'
  price_cents: number
  notes: string | null
  created_by: 'ai' | 'human' | 'client'
  contacts?: Contact | null
  professionals?: Professional | null
}

export interface Instance {
  id: string
  company_id: string
  instance_name: string
  label: string | null
  phone: string | null
  status: 'disconnected' | 'connecting' | 'connected'
  qr_base64: string | null
  pairing_code: string | null
  ai_enabled: boolean
  last_seen_at: string | null
}

export interface Payment {
  id: string
  kind: 'subscription' | 'customer_charge' | 'wallet_deposit' | 'withdrawal'
  provider: 'mercosulpay' | 'stripe' | 'wallet'
  status: string
  amount_cents: number
  fee_cents: number
  net_cents: number | null
  qr_code?: string | null
  qr_code_image?: string | null
  checkout_url?: string | null
  description: string | null
  created_at: string
  reason?: string | null
}

export interface Wallet {
  company_id: string
  balance_cents: number
  reserved_cents: number
  pix_key: string | null
  pix_key_type: string | null
  recipient_document: string | null
}

export interface FollowupRule {
  id: string
  company_id: string
  name: string
  trigger: 'after_appointment' | 'no_show' | 'inactive_days' | 'abandoned_lead' | 'maintenance' | 'birthday' | 'custom'
  delay_hours: number
  channel: 'text' | 'audio' | 'image'
  template: string
  image_url: string | null
  use_ai_variation: boolean
  active: boolean
  send_window: { from: string; to: string }
}
