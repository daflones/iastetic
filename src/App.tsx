import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactElement } from 'react'
import { useAuth } from '@/hooks/useAuth'
import LandingPage from '@/pages/landing/LandingPage'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import OnboardingPage from '@/pages/auth/OnboardingPage'
import AppLayout from '@/components/layout/AppLayout'
import DashboardPage from '@/pages/app/DashboardPage'
import ChatPage from '@/pages/app/ChatPage'
import AgendaPage from '@/pages/app/AgendaPage'
import ContactsPage from '@/pages/app/ContactsPage'
import ServicesPage from '@/pages/app/ServicesPage'
import ProfessionalsPage from '@/pages/app/ProfessionalsPage'
import AiConfigPage from '@/pages/app/AiConfigPage'
import WhatsappPage from '@/pages/app/WhatsappPage'
import FollowupsPage from '@/pages/app/FollowupsPage'
import WalletPage from '@/pages/app/WalletPage'
import PlansPage from '@/pages/app/PlansPage'
import AssistantPage from '@/pages/app/AssistantPage'
import FilesPage from '@/pages/app/FilesPage'
import SocialPage from '@/pages/app/SocialPage'
import AdminPage from '@/pages/admin/AdminPage'
import PaymentResultPage from '@/pages/PaymentResultPage'
import BookingPage from '@/pages/public/BookingPage'
import MyPagePage from '@/pages/app/MyPagePage'
import SupportPage from '@/pages/app/SupportPage'

function FullLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-brand-400 to-accent-500 animate-pulse" />
        <p className="text-sm text-ink-muted">Carregando…</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <FullLoader />
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />
  return children
}

function RequireCompany({ children }: { children: ReactElement }) {
  const { company, loading } = useAuth()
  if (loading) return <FullLoader />
  if (!company) return <Navigate to="/onboarding" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/pagamento/:result" element={<PaymentResultPage />} />
      <Route path="/agendar/:slug" element={<BookingPage />} />
      <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><RequireCompany><AppLayout /></RequireCompany></RequireAuth>}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="contatos" element={<ContactsPage />} />
        <Route path="servicos" element={<ServicesPage />} />
        <Route path="profissionais" element={<ProfessionalsPage />} />
        <Route path="ia" element={<AiConfigPage />} />
        <Route path="whatsapp" element={<WhatsappPage />} />
        <Route path="followups" element={<FollowupsPage />} />
        <Route path="carteira" element={<WalletPage />} />
        <Route path="planos" element={<PlansPage />} />
        <Route path="assistente" element={<AssistantPage />} />
        <Route path="arquivos" element={<FilesPage />} />
        <Route path="minha-pagina" element={<MyPagePage />} />
        <Route path="social" element={<SocialPage />} />
        <Route path="suporte" element={<SupportPage />} />
      </Route>
      <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
