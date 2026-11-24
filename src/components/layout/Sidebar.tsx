import { useMemo, useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Search, Utensils, MapPin, ClipboardList,
  BarChart2, User, Settings, ShieldCheck, ShieldAlert, X, Leaf,
  Truck, Plus, MessageSquare, Heart, Building2, Home, Wallet, LogOut, Bike,
  Package, ShoppingBag, Bell, ArrowRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../services/auth';
import { ChatService } from '../../services/chat';
import { NotificationsService } from '../../services/notifications';
import { ShareBiteLogo } from './Navbar';
import UserAvatar from '../ui/UserAvatar';
import styles from './Sidebar.module.css';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  highlight?: boolean;
  matchPaths?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = normalizeRole(user?.role);
  const isRider = role === 'rider';
  const isNgo = role === 'ngo';
  const isDedicatedShell = isRider || isNgo;
  const userId = user?.id;
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnreadChatCount(0);
      setUnreadNotifCount(0);
      return;
    }
    let active = true;
    const refreshUnread = () => {
      ChatService.getTotalUnreadCount(userId)
        .then((c) => {
          if (active) setUnreadChatCount(c);
        })
        .catch(() => {});
    };

    const refreshNotifs = () => {
      NotificationsService.getUnreadCount(userId)
        .then((c) => {
          if (active) setUnreadNotifCount(c > 0 ? c : 0);
        })
        .catch(() => {});
    };

    refreshUnread();
    refreshNotifs();
    const sub = ChatService.subscribeToUserConversations(userId, refreshUnread);
    const notifSub = NotificationsService.subscribeToNotifications(userId, () => {
      if (active) setUnreadNotifCount((c) => c + 1);
    });
    window.addEventListener('sharebite:chat-unread-sync', refreshUnread);

    return () => {
      active = false;
      sub.unsubscribe();
      notifSub.unsubscribe();
      window.removeEventListener('sharebite:chat-unread-sync', refreshUnread);
    };
  }, [userId]);

  const chatBadge = unreadChatCount > 0 ? String(unreadChatCount > 99 ? '99+' : unreadChatCount) : undefined;
  const notifBadge = unreadNotifCount > 0 ? String(unreadNotifCount > 99 ? '99+' : unreadNotifCount) : undefined;

  // Purpose-built navigation strictly segregated by trusted role
  // Donor, NGO, Community, and Admin menus remain 100% preserved.
  const roleNavItems = useMemo<NavItem[]>(() => {
    if (!role) return [];
    switch (role) {
      case 'rider':
        return [
          {
            to: '/rider-dashboard',
            icon: <Home size={18} />,
            label: 'Dashboard',
            matchPaths: ['/rider-dashboard', '/rider/dashboard'],
          },
          {
            to: '/rider/available-food',
            icon: <Utensils size={18} />,
            label: 'Available Food',
            matchPaths: ['/rider/available-food'],
          },
          {
            to: '/rider/deliveries',
            icon: <Truck size={18} />,
            label: 'My Deliveries',
            matchPaths: ['/rider/deliveries'],
          },
          {
            to: '/rider/earnings',
            icon: <Wallet size={18} />,
            label: 'Earnings',
          },
          {
            to: '/chat',
            icon: <MessageSquare size={18} />,
            label: 'Messages',
            badge: chatBadge,
          },
          {
            to: '/notifications',
            icon: <ClipboardList size={18} />,
            label: 'Notifications',
          },
          {
            to: '/profile',
            icon: <User size={18} />,
            label: 'Profile',
          },
          {
            to: '/settings',
            icon: <Settings size={18} />,
            label: 'Settings',
          },
        ];

      case 'ngo':
        return [
          {
            to: '/ngo-dashboard',
            icon: <Home size={18} />,
            label: 'Dashboard',
            matchPaths: ['/ngo-dashboard', '/ngo/dashboard'],
          },
          {
            to: '/ngo/food-requests',
            icon: <Package size={18} />,
            label: 'Food Requests',
            matchPaths: ['/ngo/food-requests', '/ngo/available-food'],
          },
          {
            to: '/ngo/collections',
            icon: <Bike size={18} />,
            label: 'Active Collections',
            matchPaths: ['/ngo/collections', '/my-claims'],
          },
          {
            to: '/ngo/received-food',
            icon: <ShoppingBag size={18} />,
            label: 'Received Food',
            matchPaths: ['/ngo/received-food'],
          },
          {
            to: '/chat',
            icon: <MessageSquare size={18} />,
            label: 'Messages',
            badge: chatBadge,
            matchPaths: ['/chat'],
          },
          {
            to: '/notifications',
            icon: <Bell size={18} />,
            label: 'Notifications',
            badge: notifBadge,
          },
          {
            to: '/ngo/reports',
            icon: <BarChart2 size={18} />,
            label: 'Reports',
            matchPaths: ['/ngo/reports', '/impact-dashboard'],
          },
          { to: '/profile', icon: <User size={18} />, label: 'Profile' },
          { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
        ];

      case 'community':
        return [
          { to: '/community-dashboard', icon: <Heart size={18} />, label: 'Community Meals' },
          { to: '/discover', icon: <Search size={18} />, label: 'Find Free Food' },
          { to: '/requests', icon: <ClipboardList size={18} />, label: 'My Food Requests' },
          { to: '/map', icon: <MapPin size={18} />, label: 'Distribution Centers' },
          { to: '/chat', icon: <MessageSquare size={18} />, label: 'Messages', badge: chatBadge },
          { to: '/profile', icon: <User size={18} />, label: 'My Profile' },
          { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
        ];

      case 'admin':
        return [
          { to: '/admin', icon: <ShieldAlert size={18} />, label: 'Admin Command Portal' },
          { to: '/donations', icon: <Utensils size={18} />, label: 'All Food Listings' },
          { to: '/rider-dashboard', icon: <Truck size={18} />, label: 'Fleet Operations' },
          { to: '/my-claims', icon: <ClipboardList size={18} />, label: 'NGO Claims' },
          { to: '/impact-dashboard', icon: <BarChart2 size={18} />, label: 'Platform Analytics' },
          { to: '/verification', icon: <ShieldCheck size={18} />, label: 'Partner Verification' },
          { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
        ];

      case 'donor':
        return [
          { to: '/donor-dashboard', icon: <LayoutGrid size={18} />, label: 'Donor Dashboard' },
          { to: '/donations/new', icon: <Plus size={18} />, label: 'Donate Surplus Food', highlight: true },
          { to: '/donor-donations', icon: <Truck size={18} />, label: 'Track Deliveries & History' },
          { to: '/discover', icon: <Search size={18} />, label: 'Explore Network' },
          { to: '/ngos', icon: <Building2 size={18} />, label: 'Find NGOs Across India' },
          { to: '/chat', icon: <MessageSquare size={18} />, label: 'Rider & NGO Chat', badge: chatBadge },
          { to: '/impact-dashboard', icon: <BarChart2 size={18} />, label: 'Food & CO2 Impact' },
          { to: '/profile', icon: <User size={18} />, label: 'Donor Profile' },
          { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
        ];
    }
  }, [role, chatBadge, notifBadge]);

  const roleLabel = useMemo(() => {
    if (!role) return 'ShareBite Member';
    switch (role) {
      case 'rider':
        return '🚴 Logistics Fleet Partner';
      case 'ngo':
        return '🏛️ Community NGO Relief';
      case 'community':
        return '🤝 Community Member';
      case 'admin':
        return '🛡️ Platform Administrator';
      case 'donor':
        return '🌱 Verified Food Donor';
    }
  }, [role]);

  const handleSidebarLogout = async () => {
    if (window.innerWidth < 1024) onClose();
    await logout();
    navigate('/');
  };

  return (
    <>
      {open && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isDedicatedShell ? styles.riderSidebar : ''} ${open ? styles.open : ''}`}>
        {isDedicatedShell ? (
          <div className={styles.riderBrandTop}>
            <Link
              to={isNgo ? '/ngo-dashboard' : '/rider-dashboard'}
              className={styles.riderLogoLink}
              onClick={() => { if (window.innerWidth < 1024) onClose(); }}
            >
              <ShareBiteLogo />
            </Link>
            <button className={styles.closeBtnMobileOnly} onClick={onClose} aria-label="Close sidebar">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarBrand}>
              <ShareBiteLogo />
            </div>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close sidebar">
              <X size={18} />
            </button>
          </div>
        )}

        {user && !isDedicatedShell && (
          <div className={styles.userCard}>
            <UserAvatar size={48} src={user.avatar} name={user.name} />
            <div className={styles.userInfo}>
              <p className={styles.userInfoName}>{user.name || 'Member'}</p>
              <div className={styles.userBadgeRow}>
                <span className={styles.roleBadge}>
                  {roleLabel}
                </span>
              </div>
              <p className={styles.userTagline}>
                Sharing food, saving lives 🌱
              </p>
            </div>
          </div>
        )}

        <nav className={styles.nav}>
          {roleNavItems.map(item => {
            const customActive = item.matchPaths
              ? item.matchPaths.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
              : undefined;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => {
                  const active = customActive ?? isActive;
                  return `${styles.navItem} ${active ? styles.navItemActive : ''} ${item.highlight ? styles.navItemHighlight : ''}`;
                }}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge && (
                  <span style={{
                    marginLeft: 'auto',
                    background: '#ea580c',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 10
                  }}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}

          {isDedicatedShell && (
            <button
              type="button"
              className={`${styles.navItem} ${styles.logoutNavBtn}`}
              onClick={handleSidebarLogout}
            >
              <span className={styles.navIcon}><LogOut size={18} /></span>
              <span className={styles.navLabel}>Logout</span>
            </button>
          )}

          {role === 'donor' && (
            <button
              type="button"
              className={styles.navItem}
              style={{ color: '#EA580C', fontWeight: 700, marginTop: 4 }}
              onClick={async () => {
                if (window.innerWidth < 1024) onClose();
                await switchRole('rider');
                navigate('/rider-dashboard');
              }}
            >
              <span className={styles.navIcon}><Bike size={18} /></span>
              <span className={styles.navLabel}>🛵 Switch to Rider Portal</span>
            </button>
          )}
        </nav>

        {/* Donor Action Card (100% preserved) */}
        {role === 'donor' && (
          <div style={{ margin: '16px 14px', padding: 14, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12 }}>
            <p style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 700, color: '#9a3412' }}>Have excess food today?</p>
            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#7c2d12' }}>Publish it now so a rider can collect it before closing.</p>
            <Link
              to="/donations/new"
              onClick={() => { if (window.innerWidth < 1024) onClose(); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#ea580c', color: '#fff', padding: '6px 12px',
                borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none'
              }}
            >
              <Plus size={14} /> Donate Surplus Food
            </Link>
          </div>
        )}

        {isNgo ? (
          <div
            style={{
              margin: '12px 14px 16px',
              padding: '16px 14px',
              background: 'linear-gradient(180deg, #fff8f0 0%, #ffefe0 100%)',
              border: '1px solid #fed7aa',
              borderRadius: 16,
              textAlign: 'center',
            }}
          >
            <div aria-hidden="true" style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <svg width="64" height="52" viewBox="0 0 72 58" fill="none">
                <path d="M36 6C32.5 2 26 2.5 24 7C22 11.5 26 16 36 22C46 16 50 11.5 48 7C46 2.5 39.5 2 36 6Z" fill="#EF4444" />
                <circle cx="24" cy="28" r="7" fill="#16A34A" />
                <circle cx="48" cy="27" r="6.5" fill="#F97316" />
                <circle cx="36" cy="26" r="7.5" fill="#FACC15" />
                <rect x="14" y="28" width="44" height="24" rx="6" fill="#D97706" />
                <rect x="18" y="32" width="36" height="16" rx="4" fill="#F59E0B" />
              </svg>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 800, color: '#192538', lineHeight: 1.3 }}>
              Help Us<br />Feed More People
            </p>
            <Link
              to="/ngo/food-requests?create=1"
              onClick={() => { if (window.innerWidth < 1024) onClose(); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                color: '#FFFFFF',
                padding: '9px 12px',
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
              }}
            >
              Create Food Request <ArrowRight size={13} />
            </Link>
          </div>
        ) : isRider ? (
          <div className={styles.riderHungerCard}>
            <div className={styles.scooterGraphic} aria-hidden="true">
              <svg width="88" height="58" viewBox="0 0 100 66" fill="none">
                <rect x="14" y="14" width="24" height="20" rx="5" fill="#EA580C" />
                <path d="M26 20C24 18 21 18 20 20C19 22 20 24 26 28C32 24 33 22 32 20C31 18 28 18 26 20Z" fill="#FFFFFF" />
                <path d="M22 36H64L72 22H60" stroke="#F97316" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M30 36C30 28 44 28 48 38H68C74 38 78 43 78 48H24C24 41 27 36 30 36Z" fill="#FB923C" />
                <circle cx="28" cy="50" r="10" fill="#1E293B" />
                <circle cx="28" cy="50" r="4.5" fill="#E2E8F0" />
                <circle cx="72" cy="50" r="10" fill="#1E293B" />
                <circle cx="72" cy="50" r="4.5" fill="#E2E8F0" />
              </svg>
            </div>
            <p className={styles.riderHungerText}>
              Together
              <br />
              for a Hunger-Free
              <br />
              India ❤️
            </p>
          </div>
        ) : (
          <>
            <div className={styles.promoCard}>
              <div className={styles.promoIcon}>
                <Leaf size={18} color="#16A34A" />
              </div>
              <div className={styles.promoContent}>
                <p className={styles.promoTitle}>Zero Food Waste<br />Zero Hunger</p>
                <p className={styles.promoSub}>Real-time food rescue network.</p>
              </div>
            </div>

            <div className={styles.sidebarFooter}>
              <p className={styles.footerText}>ShareBite v2.0</p>
              <p className={styles.footerSub}>Share Food. Share Hope.</p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
