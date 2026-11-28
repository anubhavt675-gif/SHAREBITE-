import { Link } from 'react-router-dom';
import styles from './Footer.module.css';

export function ShareBiteLogoIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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
  );
}

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <Link to="/" className={styles.brand} aria-label="ShareBite Home">
          <div className={styles.brandMark}>
            <ShareBiteLogoIcon size={34} />
          </div>
          <div>
            <p className={styles.brandName}>ShareBite</p>
            <p className={styles.brandTagline}>Share Food. Share Hope.</p>
          </div>
        </Link>

        <div className={styles.links}>
          <div className={styles.linkGroup}>
            <p className={styles.linkGroupTitle}>Platform</p>
            <Link to="/how-it-works" className={styles.link}>How It Works</Link>
            <Link to="/discover" className={styles.link}>Find Food</Link>
            <Link to="/donations/new" className={styles.link}>Donate Food</Link>
            <Link to="/map" className={styles.link}>Live Map</Link>
          </div>
          <div className={styles.linkGroup}>
            <p className={styles.linkGroupTitle}>Company</p>
            <Link to="/about" className={styles.link}>About</Link>
            <Link to="/impact" className={styles.link}>Impact</Link>
            <Link to="/partners" className={styles.link}>Partners</Link>
          </div>
          <div className={styles.linkGroup}>
            <p className={styles.linkGroupTitle}>Account</p>
            <Link to="/login" className={styles.link}>Log In</Link>
            <Link to="/register" className={styles.link}>Join ShareBite</Link>
          </div>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <p className={styles.copyright}>© {new Date().getFullYear()} ShareBite. Good food should never go to waste.</p>
      </div>
    </footer>
  );
}
