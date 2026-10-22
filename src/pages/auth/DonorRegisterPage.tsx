import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  User, Phone, Mail, MapPin, Lock, Eye, EyeOff,
  ArrowRight, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import donorChefPhoto from '../../assets/donor_chef_photo.jpg';
import leafTopLeft from '../../assets/leaf_top_left.png';
import leafBottomLeft from '../../assets/leaf_bottom_left.png';
import authLeavesTopRight from '../../assets/auth_leaves_top_right.png';
import styles from './DonorRegister.module.css';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function ShareBiteLogoFull({ dark = false }: { dark?: boolean }) {
  return (
    <div className={styles.logoFull}>
      <div className={styles.logoIcon}>
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <path d="M20 7.2C16.8 3.5 11.2 3.3 7.6 6.9C4.1 10.4 4.1 16.1 7.6 19.7L20 32.2L32.4 19.7C35.9 16.1 35.9 10.4 32.4 6.9C28.8 3.3 23.2 3.5 20 7.2Z" fill="#FF521C" />
          <path d="M16 12V18M14.5 12V15.5C14.5 16.3 15.2 17 16 17C16.8 17 17.5 16.3 17.5 15.5V12M16 18V23" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M24 12C22.6 12 21.8 13.2 21.8 14.8C21.8 16.4 22.6 17.4 24 17.4V23M24 12C25.4 12 26.2 13.2 26.2 14.8C26.2 16.4 25.4 17.4 24 17.4" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </div>
      <div className={styles.logoText}>
        <span className={styles.logoName}>
          <span className={dark ? styles.logoShareDark : styles.logoShareDark}>Share</span>
          <span className={styles.logoBiteOrange}>Bite</span>
        </span>
        <span className={styles.logoTagline}>Share Food. Share Hope.</span>
      </div>
    </div>
  );
}

export default function DonorRegisterPage({ initialMode }: { initialMode?: 'register' | 'login' } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, signInWithGoogle } = useAuth();

  const isLoginRoute = initialMode === 'login' || location.pathname.startsWith('/login');
  const [mode, setMode] = useState<'register' | 'login'>(isLoginRoute ? 'login' : 'register');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle('donor');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
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
        await login(email.trim(), password, 'donor');
        navigate('/dashboard', { replace: true });
      } catch (err: any) {
        setError(err.message || 'Login failed. Please check your credentials.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Register mode
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await signup({
        name: fullName.trim(),
        phone: phone.trim() || '+91 9999999999',
        email: email.trim(),
        role: 'donor',
        password,
        address: address.trim() || undefined,
      });

      if (res.sessionExists) {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Try automatic login
      try {
        await login(email.trim(), password, 'donor');
        navigate('/dashboard', { replace: true });
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

  return (
    <div className={styles.page}>
      {/* Botanical corner leaves */}
      <img src={leafTopLeft} className={styles.leafTopLeft} alt="" aria-hidden="true" />
      <img src={leafBottomLeft} className={styles.leafBottomLeft} alt="" aria-hidden="true" />
      <img src={authLeavesTopRight} className={styles.leafTopRight} alt="" aria-hidden="true" />

      {/* ═══════════════════════════════════ NAVIGATION ═══════════════════════════════════ */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          {/* Logo */}
          <Link to="/" className={styles.navLogo}>
            <ShareBiteLogoFull />
          </Link>

          {/* Center Nav Links */}
          <nav className={styles.navLinks}>
            <Link to="/" className={`${styles.navLink} ${styles.navLinkActive}`}>Home</Link>
            <Link to="/about" className={styles.navLink}>About</Link>
            <Link to="/how-it-works" className={styles.navLink}>How It Works</Link>
            <Link to="/impact" className={styles.navLink}>Impact</Link>
            <a href="#contact" className={styles.navLink}>Contact</a>
          </nav>

          {/* Right: Hunger Free India badge */}
          <div className={styles.navRight}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={styles.navLeafIcon}>
              <path d="M12 2C9 6 6 10 8 14C10 18 14 19 17 17C20 15 21 11 19 7C17 3 13 2 12 2Z" fill="#2D6A4F" />
              <path d="M12 2C12 2 12 12 8 18" stroke="#1B4332" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className={styles.navHungerText}>A Hunger Free India</span>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════ MAIN CONTENT ═══════════════════════════════════ */}
      <main className={styles.main}>

        {/* ─────────────── LEFT HERO ─────────────── */}
        <section className={styles.hero}>

          {/* FOOD DONOR badge */}
          <div className={styles.heroBadge}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h4v14H3zM17 3h4v14h-4zM3 10h4M17 10h4M10 3v18M8 21h8" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>FOOD DONOR</span>
          </div>

          {/* Main headline */}
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleGreen}>Give food,</span>
            <br />
            <span className={styles.heroTitleOrange}>spread hope.</span>
          </h1>

          {/* Supporting paragraph */}
          <p className={styles.heroPara}>
            Your extra food can bring smiles to those in need. Donate surplus food from
            your restaurant, hotel, or event and make a real difference.
          </p>

          {/* 3 Impact Features */}
          <div className={styles.impactRow}>
            <div className={styles.impactItem}>
              <div className={styles.impactIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 3h4v14H3zM17 3h4v14h-4z" stroke="#2D6A4F" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M10 3v18M8 21h8" stroke="#2D6A4F" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </div>
              <span>Reduce Food Waste</span>
            </div>
            <div className={styles.impactItem}>
              <div className={styles.impactIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#2D6A4F" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="9" cy="7" r="4" stroke="#2D6A4F" strokeWidth="1.7" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#2D6A4F" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </div>
              <span>Help Communities</span>
            </div>
            <div className={styles.impactItem}>
              <div className={styles.impactIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C9 6 6 10 8 14C10 18 14 19 17 17C20 15 21 11 19 7" stroke="#2D6A4F" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M12 2C12 2 12 10 8 18" stroke="#2D6A4F" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <span>Build a Greener Future</span>
            </div>
          </div>

          {/* Chef photo with organic border */}
          <div className={styles.chefPhotoContainer}>
            {/* Decorative background blob */}
            <div className={styles.chefPhotoBgBlob} />

            {/* Decorative leaves around photo */}
            <div className={styles.decLeaf1}>
              <svg width="48" height="58" viewBox="0 0 48 58" fill="none">
                <path d="M24 4C14 10 8 22 10 36C12 50 22 56 30 52C38 48 42 36 40 22C38 8 30 2 24 4Z" fill="#4A7C59" opacity="0.75" />
                <path d="M24 4C24 4 22 30 14 52" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              </svg>
            </div>
            <div className={styles.decLeaf2}>
              <svg width="40" height="52" viewBox="0 0 40 52" fill="none">
                <path d="M20 4C10 10 4 22 6 36C8 48 18 54 26 50C34 46 38 34 36 20C34 6 26 0 20 4Z" fill="#5B8C6A" opacity="0.65" />
                <path d="M20 4C20 4 18 28 10 50" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            </div>

            {/* Orange decorative arrows */}
            <div className={styles.decArrow1}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M14 7L19 12L14 17" stroke="#FF521C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.decArrow2}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M14 7L19 12L14 17" stroke="#FF521C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Orange heart decoration */}
            <div className={styles.decHeart}>
              <svg width="22" height="20" viewBox="0 0 24 22" fill="none">
                <path d="M12 19.5C12 19.5 2 13 2 6.5C2 4.5 3.5 2 6 2C8.5 2 10 3.5 12 5.5C14 3.5 15.5 2 18 2C20.5 2 22 4.5 22 6.5C22 13 12 19.5 12 19.5Z" fill="#FF521C" opacity="0.85" />
              </svg>
            </div>

            {/* The actual circular photo */}
            <div className={styles.chefPhotoCircle}>
              <img
                src={donorChefPhoto}
                alt="Chef and volunteer preparing meals in kitchen"
                className={styles.chefPhotoImg}
              />
            </div>
          </div>

          {/* Handwritten note at bottom-left */}
          <div className={styles.handwrittenNote}>
            <svg width="180" height="90" viewBox="0 0 180 90" fill="none" className={styles.handwrittenSvg}>
              {/* "Good food." */}
              <text x="8" y="28" fontFamily="'Caveat', 'Dancing Script', cursive" fontSize="20" fill="#FF521C" fontWeight="600">Good food.</text>
              {/* "Real people." */}
              <text x="8" y="54" fontFamily="'Caveat', 'Dancing Script', cursive" fontSize="20" fill="#FF521C" fontWeight="600">Real people.</text>
              {/* "Real impact." */}
              <text x="8" y="80" fontFamily="'Caveat', 'Dancing Script', cursive" fontSize="20" fill="#FF521C" fontWeight="600">Real impact.</text>
              {/* Small heart */}
              <path d="M140 72C140 72 136 68 136 65C136 63.3 137.3 62 139 62C140 62 141 62.7 141.5 63.7C142 62.7 143 62 144 62C145.7 62 147 63.3 147 65C147 68 143 72 141.5 73.5C140.8 72.8 140 72 140 72Z" fill="#FF521C" />
              {/* Squiggly doodle */}
              <path d="M8 88 Q25 82 42 88 Q59 94 76 88" stroke="#FF521C" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
            </svg>
          </div>
        </section>

        {/* ─────────────── RIGHT CARD ─────────────── */}
        <aside className={styles.card}>
          <div className={styles.cardInner}>

            {/* A. Card logo */}
            <div className={styles.cardLogo}>
              <ShareBiteLogoFull />
            </div>

            {/* B. Pill badge */}
            <div className={styles.cardBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="9" cy="7" r="4" stroke="#2D6A4F" strokeWidth="1.8" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>FOOD DONOR</span>
            </div>

            {/* C. Heading */}
            <h2 className={styles.cardTitle}>
              {mode === 'login' ? (
                <>
                  <span className={styles.cardTitleGreen}>Log In to </span>
                  <span className={styles.cardTitleOrange}>Donor</span>
                  <span className={styles.cardTitleGreen}> Account</span>
                </>
              ) : (
                <>
                  <span className={styles.cardTitleGreen}>Create Your </span>
                  <span className={styles.cardTitleOrange}>Donor</span>
                  <span className={styles.cardTitleGreen}> Account</span>
                </>
              )}
            </h2>

            {/* D. Subtitle */}
            <p className={styles.cardSubtitle}>
              {mode === 'login'
                ? 'Welcome back! Enter your email and password to continue.'
                : 'Join hands with us and help reduce food waste.'}
            </p>

            {/* Error */}
            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success ? (
              <div className={styles.successBox}>
                <CheckCircle2 size={18} />
                <div>
                  <strong>Account Created!</strong>
                  <p style={{ marginTop: 4, fontSize: '0.82rem' }}>
                    Registration successful. Please check your email and then log in right here.
                  </p>
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

                {/* E. Form fields */}

                {/* Register Mode Specific Fields */}
                {mode === 'register' && (
                  <>
                    {/* Full Name */}
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Full Name</label>
                      <div className={styles.inputWrap}>
                        <User size={16} className={styles.inputIcon} />
                        <input
                          type="text"
                          placeholder="Enter your full name"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          className={styles.input}
                          required
                        />
                      </div>
                    </div>

                    {/* Mobile */}
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Mobile Number</label>
                      <div className={styles.inputWrap}>
                        <Phone size={16} className={styles.inputIcon} />
                        <input
                          type="tel"
                          placeholder="Enter 10 digit mobile number"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          className={styles.input}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Email (Shown in both Register & Login) */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Email Address</label>
                  <div className={styles.inputWrap}>
                    <Mail size={16} className={styles.inputIcon} />
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>
                </div>

                {/* Address (Only in Register mode) */}
                {mode === 'register' && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Address</label>
                    <div className={styles.inputWrap}>
                      <MapPin size={16} className={styles.inputIcon} />
                      <input
                        type="text"
                        placeholder="Enter your complete address"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        className={styles.input}
                      />
                    </div>
                  </div>
                )}

                {/* Password (Shown in both) */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Password</label>
                  <div className={styles.inputWrap}>
                    <Lock size={16} className={styles.inputIcon} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={mode === 'login' ? 'Enter your password' : 'Create a strong password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={styles.input}
                      required
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowPassword(v => !v)}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* F. CTA Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={styles.ctaBtn}
                >
                  {loading ? (
                    <Loader2 size={18} className={styles.spinner} />
                  ) : (
                    <>
                      <span>{mode === 'login' ? 'Log In as Food Donor' : 'Register as Food Donor'}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                {/* G. Divider */}
                <div className={styles.dividerRow}>
                  <div className={styles.dividerLine} />
                  <span className={styles.dividerText}>Or continue with</span>
                  <div className={styles.dividerLine} />
                </div>

                {/* H. Google button */}
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

            {/* I. Bottom account prompt */}
            <p className={styles.cardFooter}>
              {mode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className={styles.cardFooterLink}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                    }}
                    className={styles.cardFooterLink}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}
                  >
                    Log in
                  </button>
                </>
              )}
            </p>

          </div>
        </aside>
      </main>
    </div>
  );
}
