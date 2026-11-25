import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Bell, Menu, ChevronDown, User, LogOut, Settings, Search, MessageSquare,
  X, Clock, MapPin, Building2, Sparkles, Crosshair, ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSafeDashboardPath, normalizeRole } from '../../services/auth';
import { NotificationsService } from '../../services/notifications';
import { NGODiscoveryService, type SearchSuggestionItem } from '../../services/ngoDiscovery';
import UserAvatar from '../ui/UserAvatar';
import styles from './Navbar.module.css';

export function ShareBiteLogo() {
  return (
    <div className={styles.brandContainer}>
      <div className={styles.logoBadge}>
        <svg width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Heart shaped background with warm orange gradient */}
          <path
            d="M20 7.2C16.8 3.5 11.2 3.3 7.6 6.9C4.1 10.4 4.1 16.1 7.6 19.7L20 32.2L32.4 19.7C35.9 16.1 35.9 10.4 32.4 6.9C28.8 3.3 23.2 3.5 20 7.2Z"
            fill="#EA580C"
          />
          {/* White fork & spoon / leaf inner cut */}
          <path
            d="M16 12V18M14.5 12V15.5C14.5 16.3 15.2 17 16 17C16.8 17 17.5 16.3 17.5 15.5V12M16 18V23"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M24 12C22.6 12 21.8 13.2 21.8 14.8C21.8 16.4 22.6 17.4 24 17.4V23M24 12C25.4 12 26.2 13.2 26.2 14.8C26.2 16.4 25.4 17.4 24 17.4"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className={styles.brandText}>
        <span className={styles.brandTitle}>ShareBite</span>
        <span className={styles.brandTagline}>Share Food. Share Hope.</span>
      </div>
    </div>
  );
}

export default function Navbar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    NGODiscoveryService.getRecentSearches()
  );
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [switchingRole, setSwitchingRole] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync navbar search input when viewing /ngo-search?q=...
  useEffect(() => {
    if (location.pathname === '/ngo-search' || location.pathname === '/ngos') {
      const sp = new URLSearchParams(location.search);
      const qParam = sp.get('q') || '';
      setSearchQuery(qParam);
    }
  }, [location.pathname, location.search]);

  // Debounce suggestion computation to prevent excessive work while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
        setActiveSuggestionIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions = useMemo<SearchSuggestionItem[]>(
    () => NGODiscoveryService.getSuggestions(debouncedQuery),
    [debouncedQuery]
  );

  // Build unified keyboard-navigable dropdown list (Recent + Suggestions)
  const dropdownItems = useMemo<SearchSuggestionItem[]>(() => {
    const list: SearchSuggestionItem[] = [];
    if (!debouncedQuery.trim() && recentSearches.length > 0) {
      for (const recent of recentSearches) {
        list.push({
          id: `recent-${recent}`,
          label: recent,
          sublabel: 'Recent search',
          query: recent,
          kind: 'recent',
        });
      }
    }
    for (const s of suggestions) {
      if (!list.some((item) => item.query.toLowerCase() === s.query.toLowerCase())) {
        list.push(s);
      }
    }
    return list;
  }, [debouncedQuery, recentSearches, suggestions]);

  const submitNGOSearch = (queryText: string, isNearby = false) => {
    const trimmed = queryText.trim();
    setShowSearchDropdown(false);
    setActiveSuggestionIdx(-1);

    if (isNearby) {
      setSearchQuery('Nearby NGOs');
      setRecentSearches(NGODiscoveryService.saveRecentSearch('Nearby NGOs'));
      navigate('/ngo-search?nearby=1');
      return;
    }

    if (!trimmed) {
      navigate('/ngo-search');
      return;
    }

    setSearchQuery(trimmed);
    setRecentSearches(NGODiscoveryService.saveRecentSearch(trimmed));
    navigate(`/ngo-search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setShowSearchDropdown(true);
      setActiveSuggestionIdx(0);
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownItems.length > 0) {
        setActiveSuggestionIdx((prev) => (prev + 1) % dropdownItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdownItems.length > 0) {
        setActiveSuggestionIdx((prev) => (prev <= 0 ? dropdownItems.length - 1 : prev - 1));
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
      setActiveSuggestionIdx(-1);
      searchInputRef.current?.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showSearchDropdown && activeSuggestionIdx >= 0 && dropdownItems[activeSuggestionIdx]) {
        const picked = dropdownItems[activeSuggestionIdx];
        submitNGOSearch(picked.query, picked.kind === 'nearby');
      } else {
        submitNGOSearch(searchQuery);
      }
    }
  };

  const handleSwitchRole = async (target: 'donor' | 'rider') => {
    if (switchingRole) return;
    setSwitchingRole(true);
    try {
      setShowUserMenu(false);
      const switched = await switchRole(target);
      const dest = getSafeDashboardPath(switched.role);
      navigate(dest, { replace: true });
    } catch (err) {
      console.error('Failed to switch role:', err);
    } finally {
      setSwitchingRole(false);
    }
  };

  const isApp = location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/donor-') ||
    location.pathname.startsWith('/rider-') ||
    location.pathname.startsWith('/ngo-') ||
    location.pathname.startsWith('/my-claims') ||
    location.pathname.startsWith('/community-') ||
    location.pathname.startsWith('/donations') ||
    location.pathname.startsWith('/discover') ||
    location.pathname.startsWith('/map') ||
    location.pathname.startsWith('/requests') ||
    location.pathname.startsWith('/notifications') ||
    location.pathname.startsWith('/impact-dashboard') ||
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/ngos') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/verification') ||
    location.pathname.startsWith('/admin');

  const userId = user?.id;
  const canonicalRole = normalizeRole(user?.role);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    let initialSubscribed = false;
    const fetchUnread = () => {
      NotificationsService.getUnreadCount(userId).then((count) => {
        setUnreadCount(count > 0 ? count : 0);
      });
    };

    fetchUnread();
    const sub = NotificationsService.subscribeToNotifications(
      userId,
      () => {
        setUnreadCount((c) => c + 1);
      },
      () => {
        // Skip duplicate fetch on initial subscribe; only sync after an actual reconnect
        if (!initialSubscribed) {
          initialSubscribed = true;
          return;
        }
        fetchUnread();
      }
    );

    return () => {
      sub.unsubscribe();
    };
  }, [userId]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    submitNGOSearch(searchQuery);
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.navInner}>
        {/* Left: Brand Logo */}
        <div className={styles.navLeft}>
          {isApp && onToggleSidebar && (
            <button className={styles.menuBtn} onClick={onToggleSidebar} aria-label="Toggle sidebar">
              <Menu size={20} />
            </button>
          )}
          <Link to="/" className={styles.logoLink}>
            <ShareBiteLogo />
          </Link>
        </div>

        {/* Center: Dynamic Role-Specific Navigation links */}
        <div className={styles.navLinks}>
          {!user ? (
            <>
              <Link to="/" className={`${styles.navLink} ${location.pathname === '/' ? styles.navLinkActive : ''}`}>Home</Link>
              <Link to="/discover" className={`${styles.navLink} ${location.pathname === '/discover' ? styles.navLinkActive : ''}`}>Discover</Link>
              <Link to="/impact" className={`${styles.navLink} ${location.pathname === '/impact' ? styles.navLinkActive : ''}`}>Impact</Link>
              <Link to="/about" className={`${styles.navLink} ${location.pathname === '/about' ? styles.navLinkActive : ''}`}>About</Link>
              <Link to="/partners" className={`${styles.navLink} ${location.pathname === '/partners' ? styles.navLinkActive : ''}`}>Partners</Link>
            </>
          ) : canonicalRole === 'rider' ? (
            <>
              <Link to="/rider-dashboard" className={`${styles.navLink} ${location.pathname === '/rider-dashboard' ? styles.navLinkActive : ''}`}>Rider Home</Link>
              <Link to="/map" className={`${styles.navLink} ${location.pathname === '/map' ? styles.navLinkActive : ''}`}>Live Map</Link>
              <Link to="/chat" className={`${styles.navLink} ${location.pathname === '/chat' ? styles.navLinkActive : ''}`}>Messages</Link>
              <Link to="/impact-dashboard" className={`${styles.navLink} ${location.pathname === '/impact-dashboard' ? styles.navLinkActive : ''}`}>Fleet Stats</Link>
            </>
          ) : canonicalRole === 'ngo' ? (
            <>
              <Link to="/ngo-dashboard" className={`${styles.navLink} ${location.pathname === '/ngo-dashboard' ? styles.navLinkActive : ''}`}>NGO Hub</Link>
              <Link to="/discover" className={`${styles.navLink} ${location.pathname === '/discover' ? styles.navLinkActive : ''}`}>Claim Food</Link>
              <Link to="/my-claims" className={`${styles.navLink} ${location.pathname === '/my-claims' ? styles.navLinkActive : ''}`}>Incoming Deliveries</Link>
              <Link to="/requests" className={`${styles.navLink} ${location.pathname === '/requests' ? styles.navLinkActive : ''}`}>Distribution Log</Link>
              <Link to="/chat" className={`${styles.navLink} ${location.pathname === '/chat' ? styles.navLinkActive : ''}`}>Chat</Link>
            </>
          ) : canonicalRole === 'community' ? (
            <>
              <Link to="/community-dashboard" className={`${styles.navLink} ${location.pathname === '/community-dashboard' ? styles.navLinkActive : ''}`}>Community Home</Link>
              <Link to="/discover" className={`${styles.navLink} ${location.pathname === '/discover' ? styles.navLinkActive : ''}`}>Find Free Meals</Link>
              <Link to="/requests" className={`${styles.navLink} ${location.pathname === '/requests' ? styles.navLinkActive : ''}`}>My Requests</Link>
              <Link to="/map" className={`${styles.navLink} ${location.pathname === '/map' ? styles.navLinkActive : ''}`}>Distribution Centers</Link>
            </>
          ) : canonicalRole === 'admin' ? (
            <>
              <Link to="/admin" className={`${styles.navLink} ${location.pathname === '/admin' ? styles.navLinkActive : ''}`}>Admin Command</Link>
              <Link to="/donations" className={`${styles.navLink} ${location.pathname === '/donations' ? styles.navLinkActive : ''}`}>All Food Listings</Link>
              <Link to="/rider-dashboard" className={`${styles.navLink} ${location.pathname === '/rider-dashboard' ? styles.navLinkActive : ''}`}>Fleet Ops</Link>
              <Link to="/my-claims" className={`${styles.navLink} ${location.pathname === '/my-claims' ? styles.navLinkActive : ''}`}>NGO Claims</Link>
              <Link to="/impact-dashboard" className={`${styles.navLink} ${location.pathname === '/impact-dashboard' ? styles.navLinkActive : ''}`}>Analytics</Link>
            </>
          ) : canonicalRole === 'donor' ? (
            <>
              <Link to="/donor-dashboard" className={`${styles.navLink} ${location.pathname === '/donor-dashboard' ? styles.navLinkActive : ''}`}>Donor Dashboard</Link>
              <Link to="/donations/new" className={`${styles.navLink} ${location.pathname === '/donations/new' ? styles.navLinkActive : ''}`} style={{ color: '#ea580c', fontWeight: 700 }}>+ Donate Food</Link>
              <Link to="/donor-donations" className={`${styles.navLink} ${location.pathname === '/donor-donations' ? styles.navLinkActive : ''}`}>Track Deliveries</Link>
              <Link to="/discover" className={`${styles.navLink} ${location.pathname === '/discover' ? styles.navLinkActive : ''}`}>Network</Link>
              <Link to="/chat" className={`${styles.navLink} ${location.pathname === '/chat' ? styles.navLinkActive : ''}`}>Chat</Link>
              <button
                type="button"
                onClick={() => handleSwitchRole('rider')}
                disabled={switchingRole}
                style={{
                  background: '#FFF7ED',
                  border: '1px solid #FDBA74',
                  color: '#EA580C',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Switch role to Rider and view Rider Dashboard"
              >
                🛵 Rider Portal
              </button>
            </>
          ) : null}
        </div>

        {/* Right: Search, Notifications, Auth */}
        <div className={styles.navRight}>
          {/* India-Wide NGO Discovery Search Pill + Dropdown */}
          <div className={styles.searchWrap} ref={searchContainerRef}>
            <form
              className={`${styles.searchForm} ${showSearchDropdown ? styles.searchFormOpen : ''}`}
              onSubmit={handleSearch}
              role="search"
              aria-label="Search NGOs across India"
            >
              <Search size={15} className={styles.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search NGOs, cities, PIN, or food banks..."
                value={searchQuery}
                onFocus={() => {
                  setRecentSearches(NGODiscoveryService.getRecentSearches());
                  setShowSearchDropdown(true);
                }}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchDropdown(true);
                  setActiveSuggestionIdx(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search NGOs across India"
                aria-expanded={showSearchDropdown}
                aria-controls="navbar-ngo-search-dropdown"
                aria-autocomplete="list"
                data-testid="navbar-ngo-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.searchClearBtn}
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedQuery('');
                    setActiveSuggestionIdx(-1);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  data-testid="navbar-ngo-search-clear"
                >
                  <X size={13} />
                </button>
              )}
            </form>

            {showSearchDropdown && (
              <div
                id="navbar-ngo-search-dropdown"
                className={styles.searchDropdown}
                role="listbox"
                data-testid="navbar-ngo-search-dropdown"
              >
                {!debouncedQuery.trim() && recentSearches.length > 0 && (
                  <div className={styles.dropdownSectionHeader}>
                    <span>Recent Searches</span>
                    <button
                      type="button"
                      className={styles.clearRecentBtn}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        NGODiscoveryService.clearRecentSearches();
                        setRecentSearches([]);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                {dropdownItems.map((item, idx) => {
                  const isFirstSuggestionAfterRecent =
                    !debouncedQuery.trim() &&
                    recentSearches.length > 0 &&
                    idx === recentSearches.length;
                  const isActive = idx === activeSuggestionIdx;

                  return (
                    <div key={item.id}>
                      {isFirstSuggestionAfterRecent && (
                        <div className={styles.dropdownSectionHeader}>
                          <span>Popular India NGO Searches</span>
                        </div>
                      )}
                      {idx === 0 && (debouncedQuery.trim() || recentSearches.length === 0) && (
                        <div className={styles.dropdownSectionHeader}>
                          <span>
                            {debouncedQuery.trim()
                              ? 'Search Suggestions across India'
                              : 'Discover NGOs Across India'}
                          </span>
                        </div>
                      )}
                      <div
                        role="option"
                        aria-selected={isActive}
                        className={`${styles.dropdownItem} ${isActive ? styles.dropdownItemActive : ''}`}
                        onMouseEnter={() => setActiveSuggestionIdx(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          submitNGOSearch(item.query, item.kind === 'nearby');
                        }}
                        data-testid={`ngo-suggestion-${idx}`}
                      >
                        <span className={styles.dropdownItemIcon}>
                          {item.kind === 'recent' ? (
                            <Clock size={14} />
                          ) : item.kind === 'nearby' ? (
                            <Crosshair size={14} />
                          ) : item.kind === 'location' ? (
                            <MapPin size={14} />
                          ) : item.kind === 'category' ? (
                            <Sparkles size={14} />
                          ) : (
                            <Building2 size={14} />
                          )}
                        </span>
                        <span className={styles.dropdownItemBody}>
                          <span className={styles.dropdownItemTitle}>{item.label}</span>
                          {item.sublabel && (
                            <span className={styles.dropdownItemSub}>{item.sublabel}</span>
                          )}
                        </span>
                        {item.kind === 'recent' ? (
                          <button
                            type="button"
                            className={styles.dropdownRemoveBtn}
                            aria-label={`Remove ${item.label} from recent searches`}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setRecentSearches(NGODiscoveryService.removeRecentSearch(item.query));
                            }}
                          >
                            <X size={12} />
                          </button>
                        ) : (
                          <ArrowUpRight size={13} className={styles.dropdownArrow} />
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className={styles.dropdownFooter}>
                  <span>Press Enter to search · ↑↓ to navigate</span>
                  <button
                    type="button"
                    className={styles.dropdownExploreLink}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      submitNGOSearch(searchQuery);
                    }}
                  >
                    Open Full NGO Search →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bell Icon with red badge */}
          <Link to="/notifications" className={styles.notifBtn} aria-label="Notifications">
            <Bell size={19} className={styles.bellIcon} />
            <span className={styles.badge}>{unreadCount > 0 ? unreadCount : 0}</span>
          </Link>

          {user ? (
            <div className={styles.userMenuWrap}>
              <button className={styles.userBtn} onClick={() => setShowUserMenu(s => !s)}>
                <UserAvatar size={34} src={user.avatar} name={user.name} />
                <div className={styles.userMetaCol}>
                  <span className={styles.userNameText}>{user.name || 'Member'}</span>
                  <span className={styles.userRolePill}>
                    {canonicalRole ? (canonicalRole.charAt(0).toUpperCase() + canonicalRole.slice(1)) : 'Member'}
                  </span>
                </div>
                <ChevronDown size={14} className={styles.userChevron} />
              </button>
              {showUserMenu && (
                <div className={styles.userMenu}>
                  <div className={styles.userMenuHeader}>
                    <p className={styles.userMenuName}>{user.name}</p>
                    <p className={styles.userMenuRole}>{canonicalRole || user.role}</p>
                  </div>
                  <Link to={getSafeDashboardPath(user.role)} className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                    Dashboard
                  </Link>
                  <Link to="/chat" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                    <MessageSquare size={14} /> Messages
                  </Link>
                  {canonicalRole === 'rider' && (
                    <Link to="/rider-dashboard" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                      Rider Tasks
                    </Link>
                  )}
                  {canonicalRole === 'ngo' && (
                    <Link to="/my-claims" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                      NGO Claims
                    </Link>
                  )}
                  {canonicalRole === 'donor' && (
                    <Link to="/donor-donations" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                      My Food Donations
                    </Link>
                  )}
                  {canonicalRole === 'donor' && (
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => handleSwitchRole('rider')}
                      style={{ color: '#EA580C', fontWeight: 700 }}
                    >
                      🛵 Switch to Rider Portal
                    </button>
                  )}
                  {canonicalRole === 'rider' && (
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={() => handleSwitchRole('donor')}
                      style={{ color: '#16A34A', fontWeight: 700 }}
                    >
                      🍲 Switch to Donor Portal
                    </button>
                  )}
                  <Link to="/profile" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                    <User size={14} /> Profile
                  </Link>
                  <Link to="/settings" className={styles.menuItem} onClick={() => setShowUserMenu(false)}>
                    <Settings size={14} /> Settings
                  </Link>
                  <div className={styles.menuDivider} />
                  <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleLogout}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.authBtns}>
              <Link to="/register" className={styles.signupBtn}>Get Started →</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
