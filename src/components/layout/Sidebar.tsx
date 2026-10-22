import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, Search, Utensils, MapPin, ClipboardList,
  BarChart2, User, Settings, ShieldCheck, ShieldAlert, X, Leaf,
  Truck, Package
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ShareBiteLogo } from './Navbar';
import UserAvatar from '../ui/UserAvatar';
import styles from './Sidebar.module.css';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: <LayoutGrid size={18} />, label: 'Dashboard' },
  { to: '/discover', icon: <Search size={18} />, label: 'Discover Food' },
  // Donor workflow
  { to: '/donor-donations', icon: <Utensils size={18} />, label: 'My Donations', roles: ['donor', 'partner'] },
  { to: '/donations/new', icon: <Package size={18} />, label: 'Donate Food', roles: ['donor', 'partner'] },
  // NGO workflow
  { to: '/my-claims', icon: <ClipboardList size={18} />, label: 'My Claims', roles: ['ngo', 'receiver'] },
  // Rider workflow
  { to: '/rider-dashboard', icon: <Truck size={18} />, label: 'Rider Jobs', roles: ['rider'] },
  // Volunteer — sees discover + requests
  { to: '/requests', icon: <ClipboardList size={18} />, label: 'Requests', roles: ['volunteer'] },
  { to: '/map', icon: <MapPin size={18} />, label: 'Live Map' },
  { to: '/impact-dashboard', icon: <BarChart2 size={18} />, label: 'Impact' },
  { to: '/profile', icon: <User size={18} />, label: 'Profile' },
  { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
  { to: '/verification', icon: <ShieldCheck size={18} />, label: 'Verification' },
  { to: '/admin', icon: <ShieldAlert size={18} />, label: 'Admin Portal', roles: ['admin'] },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { user } = useAuth();

  const visibleItems = navItems.filter(item =>
    !item.roles || !user || item.roles.includes(user.role)
  );

  return (
    <>
      {open && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarBrand}>
            <ShareBiteLogo />
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        {user && (
          <div className={styles.userCard}>
            <UserAvatar size={48} />
            <div className={styles.userInfo}>
              <p className={styles.userInfoName}>{user.name || 'Anubhav'}</p>
              <div className={styles.userBadgeRow}>
                <span className={styles.roleBadge}>
                  {user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Donor'}
                </span>
              </div>
              <p className={styles.userTagline}>Doing good today! 🌱</p>
            </div>
          </div>
        )}

        <nav className={styles.nav}>
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Promo card */}
        <div className={styles.promoCard}>
          <div className={styles.promoIcon}>
            <Leaf size={18} color="#16A34A" />
          </div>
          <div className={styles.promoContent}>
            <p className={styles.promoTitle}>Good Food<br />Brighter Tomorrows</p>
            <p className={styles.promoSub}>Together we can reduce waste and fight hunger.</p>
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          <p className={styles.footerText}>ShareBite v1.0</p>
          <p className={styles.footerSub}>Share Food. Share Hope.</p>
        </div>
      </aside>
    </>
  );
}
