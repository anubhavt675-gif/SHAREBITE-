import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2, User, Phone, FileText,
  ArrowRight, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ngoPhoto from '../../assets/ngo_volunteers_photo.jpg';
import leafTopLeft from '../../assets/leaf_top_left.png';
import leafBottomLeft from '../../assets/leaf_bottom_left.png';
import authLeavesTopRight from '../../assets/auth_leaves_top_right.png';
import styles from './AcceptorRegister.module.css';

/* ─── Feed Your Community Logo (matches reference) ─── */
function FYCLogoIcon({ size = 36 }: { size?: number }) {
  return (
    <div className={styles.logoIcon} style={{ width: size, height: size }}>
      <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"
          fill="#FF521C"
        />
        <path d="M9 9v6M7.5 9v3.5a1.5 1.5 0 0 0 3 0V9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M14.5 9c-1 0-1.8 1-1.8 2.5s.8 2.5 1.8 2.5V9zm0 0c1 0 1.8 1 1.8 2.5S15.5 14 14.5 14" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

function FYCLogoFull({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.logoFull}>
      <FYCLogoIcon size={compact ? 34 : 40} />
      <div className={styles.logoText}>
        <div className={styles.logoName}>
          <span className={styles.logoGreen}>Feed Your</span>
          {' '}
          <span className={styles.logoOrange}>Community</span>
        </div>
        <div className={styles.logoTagline}>Food. Shelter. A Better Tomorrow.</div>
      </div>
    </div>
  );
}

export default function AcceptorRegisterPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [orgName, setOrgName]     = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone]         = useState('');
  const [regNumber, setRegNumber] = useState('');

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!orgName.trim() || !ownerName.trim() || !phone.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      /* use orgName as the display name and generate a temp email */
      const tempEmail = `ngo_${Date.now()}@sharebite.app`;
      const res = await signup({
        name: ownerName.trim(),
        phone: phone.trim(),
        email: tempEmail,
        role: 'ngo',
        password: `SB_${Date.now()}`,
        address: orgName.trim(),
      });
      if (res.sessionExists) {
        navigate('/dashboard', { replace: true });
      } else {
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
      {/* Botanical corner decorations */}
      <img src={leafTopLeft}       className={styles.leafTL} alt="" aria-hidden />
      <img src={leafBottomLeft}    className={styles.leafBL} alt="" aria-hidden />
      <img src={authLeavesTopRight} className={styles.leafTR} alt="" aria-hidden />

      {/* ══════════════════════════════ NAV ══════════════════════════════ */}
      <header className={styles.navbar}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.navLogoLink}><FYCLogoFull /></Link>

          <nav className={styles.navLinks}>
            <Link to="/"            className={`${styles.navLink} ${styles.navActive}`}>Home</Link>
            <Link to="/about"       className={styles.navLink}>About</Link>
            <Link to="/how-it-works" className={styles.navLink}>How It Works</Link>
            <Link to="/impact"      className={styles.navLink}>Impact</Link>
            <a    href="#contact"   className={styles.navLink}>Contact</a>
          </nav>

          <div className={styles.navRight}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2C9 6 6 10 8 14C10 18 14 19 17 17C20 15 21 11 19 7C17 3 13 2 12 2Z" fill="#2D6A4F"/>
              <path d="M12 2C12 2 12 12 8 18" stroke="#1B4332" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className={styles.navSlogan}>Stronger Communities. Brighter Futures.</span>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════ MAIN ══════════════════════════════ */}
      <main className={styles.main}>

        {/* ─────────────── LEFT HERO ─────────────── */}
        <section className={styles.hero}>

          {/* NGO / SHELTER badge */}
          <div className={styles.heroBadge}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="9" cy="7" r="4" stroke="#2D6A4F" strokeWidth="1.8"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span>NGO / SHELTER</span>
          </div>

          {/* Main headline */}
          <h1 className={styles.heroTitle}>
            <span className={styles.htGreen}>Support people,</span>
            <span className={styles.htOrange}>build stronger</span>
            <span className={styles.htOrange}>
              communities.{' '}
              <svg className={styles.titleHeart} width="28" height="26" viewBox="0 0 28 26" fill="none" aria-hidden>
                <path d="M14 23.5C14 23.5 2 15.5 2 7.5C2 4.5 4.5 2 7.5 2C9.5 2 12 3.5 14 6C16 3.5 18.5 2 20.5 2C23.5 2 26 4.5 26 7.5C26 15.5 14 23.5 14 23.5Z" stroke="#FF521C" strokeWidth="2" fill="none"/>
              </svg>
            </span>
          </h1>

          {/* Description */}
          <p className={styles.heroPara}>
            Join hands with us to provide food, shelter, and essential support to those in need.
            Together, we can create a kinder, healthier and more hopeful tomorrow.
          </p>

          {/* Three impact features */}
          <div className={styles.impactRow}>
            {[
              {
                label: 'Provide Nutritious Food',
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M3 11l1-8M7 3v8M5 11a4 4 0 0 0 4 4v6M17 3s2 2 2 6-2 6-2 6v3" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
              },
              {
                label: 'Support Shelter & Care',
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="9 22 9 12 15 12 15 22" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
              },
              {
                label: 'Empower Communities',
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round"/>
                    <circle cx="9" cy="7" r="4" stroke="#2D6A4F" strokeWidth="1.8"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ),
              },
            ].map((f) => (
              <div key={f.label} className={styles.impactItem}>
                <div className={styles.impactIcon}>{f.icon}</div>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          {/* Photo + decorations */}
          <div className={styles.photoContainer}>
            <div className={styles.photoBgBlob} />

            {/* Green botanical leaves near photo */}
            <div className={styles.dLeaf1} aria-hidden>
              <svg width="46" height="56" viewBox="0 0 46 56" fill="none">
                <path d="M23 4C13 10 7 22 9 36C11 50 21 56 29 52C37 48 41 36 39 22C37 8 29 2 23 4Z" fill="#4A7C59" opacity="0.7"/>
                <path d="M23 4C23 4 21 30 13 52" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
              </svg>
            </div>
            <div className={styles.dLeaf2} aria-hidden>
              <svg width="38" height="50" viewBox="0 0 38 50" fill="none">
                <path d="M19 4C9 10 3 22 5 36C7 48 17 54 25 50C33 46 37 34 35 20C33 6 25 0 19 4Z" fill="#5B8C6A" opacity="0.6"/>
                <path d="M19 4C19 4 17 28 9 50" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" opacity="0.48"/>
              </svg>
            </div>

            {/* Orange arrow decorations */}
            <div className={styles.dArrow1} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M14 7L19 12L14 17" stroke="#FF521C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className={styles.dArrow2} aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M14 7L19 12L14 17" stroke="#FF521C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* Orange heart */}
            <div className={styles.dHeart} aria-hidden>
              <svg width="18" height="17" viewBox="0 0 24 22" fill="none">
                <path d="M12 19.5C12 19.5 2 13 2 6.5C2 4.5 3.5 2 6 2C8.5 2 10 3.5 12 5.5C14 3.5 15.5 2 18 2C20.5 2 22 4.5 22 6.5C22 13 12 19.5 12 19.5Z" fill="#FF521C" opacity="0.82"/>
              </svg>
            </div>

            {/* The photo itself */}
            <div className={styles.photoCircle}>
              <img src={ngoPhoto} alt="NGO volunteers distributing food" className={styles.photoImg} />
            </div>
          </div>

          {/* Handwritten note */}
          <div className={styles.handwrittenNote} aria-hidden>
            <svg width="178" height="88" viewBox="0 0 178 88" fill="none" style={{ overflow: 'visible' }}>
              <text x="8" y="26" fontFamily="'Caveat','Dancing Script',cursive" fontSize="19" fill="#FF521C" fontWeight="600">Together</text>
              <text x="8" y="50" fontFamily="'Caveat','Dancing Script',cursive" fontSize="19" fill="#FF521C" fontWeight="600">We Make</text>
              <text x="8" y="74" fontFamily="'Caveat','Dancing Script',cursive" fontSize="19" fill="#FF521C" fontWeight="600">A Difference.</text>
              {/* outlined heart */}
              <path d="M135 68C135 68 131 64 131 61C131 59.3 132.3 58 134 58C135 58 136 58.7 136.5 59.7C137 58.7 138 58 139 58C140.7 58 142 59.3 142 61C142 64 138 68 136.5 69.5C135.8 68.8 135 68 135 68Z" stroke="#FF521C" strokeWidth="1.5" fill="none"/>
              {/* doodle line */}
              <path d="M8 84 Q25 78 42 84 Q58 90 74 84" stroke="#FF521C" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.55"/>
            </svg>
          </div>
        </section>

        {/* ─────────────── RIGHT CARD ─────────────── */}
        <aside className={styles.card}>
          <div className={styles.cardInner}>

            {/* A. Logo */}
            <div className={styles.cardLogo}>
              <FYCLogoFull compact />
            </div>

            {/* B. Badge */}
            <div className={styles.cardBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="9" cy="7" r="4" stroke="#2D6A4F" strokeWidth="1.8"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#2D6A4F" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span>NGO / SHELTER</span>
            </div>

            {/* C. Heading */}
            <h2 className={styles.cardTitle}>
              <span className={styles.ctGreen}>Register Your </span>
              <span className={styles.ctOrange}>NGO / Shelter</span>
            </h2>

            {/* D. Subtitle */}
            <p className={styles.cardSubtitle}>
              Join hands with us to provide food, shelter and essential support to those in need.
            </p>

            {/* Error / Success */}
            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {success ? (
              <div className={styles.successBox}>
                <CheckCircle2 size={16} />
                <div>
                  <strong>Registered!</strong>
                  <p style={{ marginTop: 3, fontSize: '0.8rem' }}>Your NGO has been registered. Please check your email to verify.</p>
                  <button onClick={() => navigate('/login/acceptor')} className={styles.proceedBtn}>
                    Go to Log In →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form} noValidate>

                {/* E. 4 Fields */}

                {/* 1. Organisation Name */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Organisation Name</label>
                  <div className={styles.inputWrap}>
                    <Building2 size={15} className={styles.inputIcon} />
                    <input type="text" placeholder="Enter organisation name"
                      value={orgName} onChange={e => setOrgName(e.target.value)}
                      className={styles.input} required />
                  </div>
                </div>

                {/* 2. Owner Name */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Owner Name</label>
                  <div className={styles.inputWrap}>
                    <User size={15} className={styles.inputIcon} />
                    <input type="text" placeholder="Enter owner name"
                      value={ownerName} onChange={e => setOwnerName(e.target.value)}
                      className={styles.input} required />
                  </div>
                </div>

                {/* 3. Owner Mobile Number */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Owner Mobile Number</label>
                  <div className={styles.inputWrap}>
                    <Phone size={15} className={styles.inputIcon} />
                    <input type="tel" placeholder="Enter 10 digit mobile number"
                      value={phone} onChange={e => setPhone(e.target.value)}
                      className={styles.input} required />
                  </div>
                </div>

                {/* 4. Registration Number */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Registration Number</label>
                  <div className={styles.inputWrap}>
                    <FileText size={15} className={styles.inputIcon} />
                    <input type="text" placeholder="Enter registration number"
                      value={regNumber} onChange={e => setRegNumber(e.target.value)}
                      className={styles.input} />
                  </div>
                </div>

                {/* F. CTA Button */}
                <button type="submit" disabled={loading} className={styles.ctaBtn}>
                  {loading
                    ? <Loader2 size={17} className={styles.spinner} />
                    : (<><span>Register as NGO / Shelter</span><ArrowRight size={17} /></>)
                  }
                </button>

                {/* G. Divider — NO Google button per reference */}
                <div className={styles.dividerRow}>
                  <div className={styles.dividerLine} />
                  <span className={styles.dividerText}>Or continue with</span>
                  <div className={styles.dividerLine} />
                </div>

              </form>
            )}

            {/* H. Login link */}
            <p className={styles.cardFooter}>
              Already have an account?{' '}
              <Link to="/login/acceptor" className={styles.cardFooterLink}>Log in</Link>
            </p>

          </div>
        </aside>
      </main>
    </div>
  );
}
