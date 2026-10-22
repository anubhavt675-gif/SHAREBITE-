import { useAuth } from '../../context/AuthContext';
import DonorDashboardPage from '../../pages/app/DonorDashboardPage';
import RiderDashboardPage from '../../pages/app/RiderDashboardPage';
import NGOClaimsDashboard from '../../pages/app/NGOClaimsDashboard';
import BeneficiaryDashboardPage from '../../pages/app/BeneficiaryDashboardPage';
import AdminPage from '../../pages/app/AdminPage';
import { PageLoader } from '../states/LoadingState';

/**
 * RoleBasedDashboard
 * Authoritative dispatcher that renders the purpose-built dashboard
 * matching the user's trusted profile role in Supabase.
 */
export default function RoleBasedDashboard() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return <PageLoader />;
  }

  const role = user.role;

  switch (role) {
    case 'rider':
    case 'volunteer':
      return <RiderDashboardPage />;

    case 'ngo':
    case 'receiver':
    case 'acceptor':
      return <NGOClaimsDashboard />;

    case 'community':
      return <BeneficiaryDashboardPage />;

    case 'admin':
      return <AdminPage />;

    case 'donor':
    case 'partner':
    default:
      return <DonorDashboardPage />;
  }
}
