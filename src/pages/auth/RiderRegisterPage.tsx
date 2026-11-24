import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  User, Phone, Mail, MapPin, FileText, Lock, Eye, EyeOff,
  ArrowRight, Loader2, CheckCircle2, AlertCircle,
  Search, Bell, Bike, Heart, Leaf,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import riderPhoto from '../../assets/rider_delivery_photo.jpg';
import leafTopLeft from '../../assets/leaf_top_left.png';
import leafBottomLeft from '../../assets/leaf_bottom_left.png';
import authLeavesTopRight from '../../assets/auth_leaves_top_right.png';
import styles from './DonorRegister.module.css';

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function ShareBiteLogoFull({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.logoFull}>
      <div className={compact ? styles.logoIconCompact : styles.logoIcon}>
        <svg width={compact ? '18' : '20'} height={compact ? '18' : '20'} viewBox="0 0 24 24" fill="none">
          <path d="M7 3v6a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M9 11v10" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 3v4" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 3c-1.66 0-3 1.79-3 4s1.34 4 3 4 3-1.79 3-4-1.34-4-3-4zM16 11v10" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className={styles.logoText}>
        <span className={compact ? styles.logoNameCompact : styles.logoName}>
          <span className={styles.logoShareDark}>Share</span>
          <span className={styles.logoBiteOrange}>Bite</span>
        </span>
        <span className={compact ? styles.logoTaglineCompact : styles.logoTagline}>Share Food. Share Hope.</span>
      </div>
    </div>
  );
}

export default function RiderRegisterPage({ initialMode }: { initialMode?: 'register' | 'login' } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, signup, signInWithGoogle, switchRole } = useAuth();

  const isLoginRoute = initialMode === 'login' || location.pathname.startsWith('/login');
  const [mode, setMode] = useState<'register' | 'login'>(isLoginRoute ? 'login' : 'register');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleActivateRider = async () => {
    setSwitchingRole(true);
    setError(null);
    try {
      await switchRole('rider');
      navigate('/rider-dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to switch role to Rider.');
    } finally {
      setSwitchingRole(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError('Please enter your email and password.');
        return;
      }
      setLoading(true);
      try {
        await login(email.trim(), password, 'rider');
        navigate('/rider-dashboard', { replace: true });
      } catch (err: any) {
        const msg = err?.message || 'Login failed. Please check your credentials.';
        setError(msg.replace(/^ROLE_MISMATCH:\s*/, ''));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const fullAddress = address.trim()
        ? regNumber.trim()
          ? `${address.trim()} (Reg: ${regNumber.trim()})`
          : address.trim()
        : regNumber.trim()
        ? `Reg: ${regNumber.trim()}`
        : undefined;

      const res = await signup({
        name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role: 'rider',
        password,
        address: fullAddress,
      });

      if (res.sessionExists) {
        navigate('/rider-dashboard', { replace: true });
        return;
      }

      try {
        await login(email.trim(), password, 'rider');
        navigate('/rider-dashboard', { replace: true });
        return;
      } catch {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      try {
        localStorage.setItem('sharebite_active_role_override', 'rider');
      } catch {}
      await signInWithGoogle('rider');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Botanical corner leaves (original Rider assets preserved) */}
      <img src={leafTopLeft} className={styles.leafTopLeft} alt="" aria-hidden="true" />
      <img src={leafBottomLeft} className={styles.leafBottomLeft} alt="" aria-hidden="true" />
      <img src={authLeavesTopRight} className={styles.leafTopRight} alt="" aria-hidden="true" />

      {/* ═══════════════════════════════════ TOP NAVBAR ═══════════════════════════════════ */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.navLogo}>
            <ShareBiteLogoFull />
          </Link>

          <nav className={styles.navLinks}>
            <Link to="/" className={`${styles.navLink} ${styles.navLinkActive}`}>Home</Link>
            <Link to="/about" className={styles.navLink}>About</Link>
            <Link to="/how-it-works" className={styles.navLink}>How It Works</Link>
            <Link to="/impact" className={styles.navLink}>Impact</Link>
            <Link to="/partners" className={styles.navLink}>Contact</Link>
          </nav>

          <div className={styles.navRight}>
            <div className={styles.navSearch}>
              <Search size={15} className={styles.navSearchIcon} />
              <input
                type="text"
                placeholder="Search food, NGOs, or location..."
                className={styles.navSearchInput}
              />
            </div>
            <button type="button" className={styles.navBellBtn} title="Notifications">
              <Bell size={17} />
              <span className={styles.navBellBadge}>3</span>
            </button>
            <Link to="/register" className={styles.navGetStartedBtn}>
              Get Started <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════ MAIN CONTENT (Exact Donor 3-Column Layout) ═══════════════════════════════════ */}
      <main className={styles.main}>
        {/* ─────────────── LEFT HERO SECTION ─────────────── */}
        <section className={styles.heroSection}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <Bike size={14} className={styles.heroBadgeIcon} />
              <span>RIDER</span>
            </div>

            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleRow}>
                <span className={styles.heroTitleGreen}>Ride for a</span>
                <span className={styles.sparkleWrap}>
                  <svg className={styles.sparkleSvg} width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2v5M4.5 4.5l3.5 3.5M2 12h5" stroke="#EA580C" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </span>
              </span>
              <span className={styles.heroTitleOrange}>bigger purpose.</span>
            </h1>

            <p className={styles.heroPara}>
              Join as a rider and help deliver food to those in need. Be a part of a kinder,
              healthier India by turning your ride into real impact.
            </p>

            {/* 3 Rider Impact Features (Same 3-column icon layout as Donor page) */}
            <div className={styles.impactRow}>
              <div className={styles.impactItem}>
                <div className={styles.impactIcon}>
                  <Bike size={17} />
                </div>
                <span>Earn Income</span>
              </div>
              <div className={styles.impactItem}>
                <div className={styles.impactIcon}>
                  <Heart size={17} />
                </div>
                <span>Help Communities</span>
              </div>
              <div className={styles.impactItem}>
                <div className={styles.impactIcon}>
                  <Leaf size={17} />
                </div>
                <span>Support a Greener Planet</span>
              </div>
            </div>

            {/* Handwritten Note */}
            <div className={styles.handwrittenNote}>
              <span className={styles.handwrittenLine}>Safe rides.</span>
              <span className={styles.handwrittenLine}>Fresh meals.</span>
              <span className={styles.handwrittenLine}>
                Happy communities. <span className={styles.handwrittenHeart}>❤️</span>
              </span>
            </div>
          </div>
        </section>

        {/* ─────────────── CENTRAL CIRCULAR RIDER PHOTO (Original Image Preserved) ─────────────── */}
        <div className={styles.chefPhotoWrapper}>
          <div className={styles.chefPhotoAura} />

          <div className={styles.floatingLeafTopRight}>
            <svg width="44" height="58" viewBox="0 0 44 58" fill="none">
              <path d="M22 2C12 10 6 24 8 38C10 52 20 57 28 55C36 53 41 41 39 27C37 13 29 4 22 2Z" fill="#3D704D" />
              <path d="M22 2C22 2 20 30 12 54" stroke="#224831" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          <div className={styles.floatingLeafBottomRight}>
            <svg width="48" height="42" viewBox="0 0 48 42" fill="none">
              <path d="M46 22C38 12 26 4 13 6C0 8 -4 20 4 28C12 36 26 40 38 34C44 30 46 24 46 22Z" fill="#528362" />
              <path d="M46 22C46 22 18 20 2 34" stroke="#2B543A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          <div className={styles.chefPhotoCircle}>
            <img
              src={riderPhoto}
              alt="Smiling Indian food delivery rider on motorcycle with orange backpack"
              className={styles.chefPhotoImg}
            />
          </div>
        </div>

        {/* ─────────────── RIGHT FLOATING CARD (Exact Donor Card Layout) ─────────────── */}
        <aside className={styles.cardContainer}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <ShareBiteLogoFull compact />
              <div className={styles.cardBadge}>
                <Bike size={12} />
                <span>RIDER</span>
              </div>
            </div>

            <h2 className={styles.cardTitle}>
              {mode === 'login' ? (
                <>Log In to <span className={styles.cardTitleHighlight}>Rider</span> Account</>
              ) : (
                <>Register Your <span className={styles.cardTitleHighlight}>Rider</span> Account</>
              )}
            </h2>

            <p className={styles.cardSubtitle}>
              {mode === 'login'
                ? 'Welcome back! Enter your email and password to start delivering.'
                : 'Join hands with us and help deliver food to those in need.'}
            </p>

            {error && (
              <div className={styles.errorBox} role="alert">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {/* Active Session Role Switcher */}
            {user && user.role !== 'rider' && (
              <div
                style={{
                  background: '#FFF7ED',
                  border: '1.5px solid #FDBA74',
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bike size={18} color="#EA580C" />
                  <div>
                    <strong style={{ display: 'block', fontSize: '12px', color: '#9A3412' }}>
                      Signed in as {user.name || user.email} ({user.role})
                    </strong>
                    <span style={{ fontSize: '11px', color: '#C2410C' }}>
                      Switch this account to Rider mode right now.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleActivateRider}
                  disabled={switchingRole}
                  className={styles.ctaBtn}
                  style={{ marginTop: 0, height: 34, fontSize: '0.8rem' }}
                >
                  {switchingRole ? (
                    <Loader2 size={15} className={styles.spinner} />
                  ) : (
                    'Activate Rider Role & Open Dashboard →'
                  )}
                </button>
              </div>
            )}

            {success ? (
              <div className={styles.successBox} role="status">
                <CheckCircle2 size={17} />
                <div>
                  <strong>Account Created!</strong>
                  <p style={{ margin: '2px 0 0' }}>Please check your email and log in to continue.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSuccess(false);
                      setMode('login');
                    }}
                    className={styles.proceedBtn}
                  >
                    Log In Here →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form} noValidate>
                {mode === 'register' && (
                  <>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="rider-fullName">Full Name</label>
                      <div className={styles.inputWrap}>
                        <User size={15} className={styles.inputIcon} />
                        <input
                          id="rider-fullName"
                          type="text"
                          placeholder="Enter your full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className={styles.input}
                          required
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="rider-phone">Mobile Number</label>
                      <div className={styles.inputWrap}>
                        <Phone size={15} className={styles.inputIcon} />
                        <input
                          id="rider-phone"
                          type="tel"
                          placeholder="Enter 10 digit mobile number"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={styles.input}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="rider-email">Email Address</label>
                  <div className={styles.inputWrap}>
                    <Mail size={15} className={styles.inputIcon} />
                    <input
                      id="rider-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>
                </div>

                {mode === 'register' && (
                  <>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="rider-address">Address</label>
                      <div className={styles.inputWrap}>
                        <MapPin size={15} className={styles.inputIcon} />
                        <input
                          id="rider-address"
                          type="text"
                          placeholder="Enter your complete address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className={styles.input}
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="rider-reg">Registration Number</label>
                      <div className={styles.inputWrap}>
                        <FileText size={15} className={styles.inputIcon} />
                        <input
                          id="rider-reg"
                          type="text"
                          placeholder="Enter your registration number"
                          value={regNumber}
                          onChange={(e) => setRegNumber(e.target.value)}
                          className={styles.input}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="rider-pass">Password</label>
                  <div className={styles.inputWrap}>
                    <Lock size={15} className={styles.inputIcon} />
                    <input
                      id="rider-pass"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={mode === 'login' ? 'Enter your password' : 'Create a strong password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={styles.input}
                      required
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowPassword((p) => !p)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className={styles.ctaBtn}>
                  {loading ? (
                    <Loader2 size={17} className={styles.spinner} />
                  ) : (
                    <>
                      {mode === 'login' ? 'Log In as Rider' : 'Register as Rider'}
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>

                <div className={styles.dividerRow}>
                  <div className={styles.dividerLine} />
                  <span className={styles.dividerText}>Or continue with</span>
                  <div className={styles.dividerLine} />
                </div>

                <button
                  type="button"
                  className={styles.googleBtn}
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </button>
              </form>
            )}

            <div className={styles.cardFooter}>
              {mode === 'login' ? (
                <>
                  <span>Don't have an account? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className={styles.cardFooterLink}
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  <span>Already have an account? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                    }}
                    className={styles.cardFooterLink}
                  >
                    Log in
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
