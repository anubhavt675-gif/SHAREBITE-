import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import './index.css';

// Public pages (LandingPage eager for instant LCP, secondary public pages lazy)
import LandingPage from './pages/public/LandingPage';
const AboutPage = lazy(() => import('./pages/public/AboutPage'));
const HowItWorksPage = lazy(() => import('./pages/public/HowItWorksPage'));
const PublicImpactPage = lazy(() => import('./pages/public/PublicImpactPage'));
const PartnersPage = lazy(() => import('./pages/public/PartnersPage'));

// Auth pages
const RoleSelectPage = lazy(() => import('./pages/auth/RoleSelectPage'));
const DonorRegisterPage = lazy(() => import('./pages/auth/DonorRegisterPage'));
const AcceptorRegisterPage = lazy(() => import('./pages/auth/AcceptorRegisterPage'));
const RiderRegisterPage = lazy(() => import('./pages/auth/RiderRegisterPage'));
const SingleRoleAuthPage = lazy(() => import('./pages/auth/SingleRoleAuthPage'));
const AuthCallbackPage = lazy(() => import('./pages/auth/AuthCallbackPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));

// App layout & pages
const AppShell = lazy(() => import('./components/layout/AppShell'));
const DashboardPage = lazy(() => import('./pages/app/DashboardPage'));
const DonationsPage = lazy(() => import('./pages/app/DonationsPage'));
const CreateDonationPage = lazy(() => import('./pages/app/CreateDonationPage'));
const DonationDetailPage = lazy(() => import('./pages/app/DonationDetailPage'));
const DiscoverPage = lazy(() => import('./pages/app/DiscoverPage'));
const MapPage = lazy(() => import('./pages/app/MapPage'));
const RequestsPage = lazy(() => import('./pages/app/RequestsPage'));
const NotificationsPage = lazy(() => import('./pages/app/NotificationsPage'));
const ImpactDashboardPage = lazy(() => import('./pages/app/ImpactDashboardPage'));
const ProfilePage = lazy(() => import('./pages/app/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage'));
const VerificationPage = lazy(() => import('./pages/app/VerificationPage'));
const AdminPage = lazy(() => import('./pages/app/AdminPage'));
const RiderDashboardPage = lazy(() => import('./pages/app/RiderDashboardPage'));
const NGOClaimsDashboard = lazy(() => import('./pages/app/NGOClaimsDashboard'));
const DonorDonationsStatus = lazy(() => import('./pages/app/DonorDonationsStatus'));
const ChatPage = lazy(() => import('./pages/app/ChatPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoading />;
  if (!user) return <Navigate to="/register" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--color-bg)',
    }}>
      <div style={{
        width: 40, height: 40, border: '3px solid var(--color-primary-100)',
        borderTopColor: 'var(--color-primary)', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/impact" element={<PublicImpactPage />} />
        <Route path="/partners" element={<PartnersPage />} />

        {/* Role-Based Auth Routes: First Select Role -> Then Dedicated Single Form */}
        <Route path="/register" element={<PublicOnlyRoute><RoleSelectPage initialMode="signup" /></PublicOnlyRoute>} />
        {/* Ultra-HiFi dedicated pages per role (Register mode) */}
        <Route path="/register/donor"     element={<PublicOnlyRoute><DonorRegisterPage initialMode="register" /></PublicOnlyRoute>} />
        <Route path="/register/acceptor"  element={<PublicOnlyRoute><AcceptorRegisterPage initialMode="register" /></PublicOnlyRoute>} />
        <Route path="/register/ngo"       element={<PublicOnlyRoute><AcceptorRegisterPage initialMode="register" /></PublicOnlyRoute>} />
        <Route path="/register/rider"     element={<PublicOnlyRoute><RiderRegisterPage initialMode="register" /></PublicOnlyRoute>} />
        <Route path="/register/community" element={<PublicOnlyRoute><SingleRoleAuthPage forcedRole="community" initialMode="signup" /></PublicOnlyRoute>} />
        <Route path="/register/:role"     element={<PublicOnlyRoute><SingleRoleAuthPage initialMode="signup" /></PublicOnlyRoute>} />

        {/* Ultra-HiFi dedicated pages per role (Login mode) */}
        <Route path="/login"              element={<Navigate to="/register" replace />} />
        <Route path="/login/donor"        element={<PublicOnlyRoute><DonorRegisterPage initialMode="login" /></PublicOnlyRoute>} />
        <Route path="/login/acceptor"     element={<PublicOnlyRoute><AcceptorRegisterPage initialMode="login" /></PublicOnlyRoute>} />
        <Route path="/login/ngo"          element={<PublicOnlyRoute><AcceptorRegisterPage initialMode="login" /></PublicOnlyRoute>} />
        <Route path="/login/rider"        element={<PublicOnlyRoute><RiderRegisterPage initialMode="login" /></PublicOnlyRoute>} />
        <Route path="/login/community"    element={<PublicOnlyRoute><SingleRoleAuthPage forcedRole="community" initialMode="login" /></PublicOnlyRoute>} />
        <Route path="/login/:role"        element={<PublicOnlyRoute><SingleRoleAuthPage initialMode="login" /></PublicOnlyRoute>} />
        <Route path="/signup" element={<Navigate to="/register" replace />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected App */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/donations" element={<DonationsPage />} />
          <Route path="/donations/new" element={<CreateDonationPage />} />
          <Route path="/donations/:id" element={<DonationDetailPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/impact-dashboard" element={<ImpactDashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/admin" element={<AdminPage />} />
          {/* Phase 2-14: New workflow routes */}
          <Route path="/rider-dashboard" element={<RiderDashboardPage />} />
          <Route path="/my-claims" element={<NGOClaimsDashboard />} />
          <Route path="/donor-donations" element={<DonorDonationsStatus />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
