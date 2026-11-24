import { ArrowRight, ExternalLink, HeartHandshake, Leaf } from 'lucide-react';
import { WE_CARE_FOUNDATION } from '../../config/outreachPartners';
import styles from './WeCareFoundationSection.module.css';

export default function WeCareFoundationSection() {
  const org = WE_CARE_FOUNDATION;

  return (
    <section
      className={styles.sectionWrap}
      aria-label="We Care Foundation NGO Outreach"
    >
      <a
        href={org.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${org.name} official website (opens in a new tab)`}
        className={styles.bannerLink}
        data-testid="we-care-foundation-banner"
      >
        {/* LEFT SECTION — Genuine We Care Foundation Outreach Photograph */}
        <div className={styles.visualCol}>
          <img
            src={org.photo}
            alt={org.photoAlt}
            className={styles.visualPhoto}
            loading="lazy"
            decoding="async"
            width={420}
            height={220}
          />
          {/* Curved right boundary with warm burnt-orange accent matching design */}
          <svg
            className={styles.curveOverlay}
            viewBox="0 0 56 180"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M 8 0 C 44 45, 44 135, 8 180 L 56 180 L 56 0 Z"
              fill="#FFF3E5"
            />
            <path
              d="M 2 0 C 38 45, 38 135, 2 180"
              fill="none"
              stroke="#EA7B34"
              strokeWidth="9"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* CENTER SECTION — Foundation Outreach Information */}
        <div className={styles.contentCol}>
          <span className={styles.eyebrowPill}>
            <HeartHandshake size={13} aria-hidden="true" />
            <span>{org.eyebrowLabel}</span>
          </span>

          <div className={styles.headingRow}>
            <h2 className={styles.heading}>{org.name}</h2>
            <svg
              className={styles.burstAccent}
              width="22"
              height="20"
              viewBox="0 0 24 22"
              fill="none"
              aria-hidden="true"
            >
              <path d="M3 10L7 3" stroke="#EA7B34" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M9 13L19 7" stroke="#EA7B34" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M11 19L21 17" stroke="#EA7B34" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </div>

          <p className={styles.description}>{org.description}</p>

          <span className={styles.ctaRow}>
            <span>{org.ctaLabel}</span>
            <ArrowRight size={14} className={styles.ctaArrow} aria-hidden="true" />
            <ExternalLink size={12} aria-hidden="true" style={{ opacity: 0.75 }} />
          </span>
        </div>

        {/* RIGHT SECTION — Official We Care Foundation Logo & Outreach Tag */}
        <div className={styles.logoCol}>
          <ExternalLink
            size={14}
            className={styles.externalCorner}
            aria-hidden="true"
          />
          <div className={styles.logoWrap}>
            <img
              src={org.logo}
              alt={org.logoAlt}
              className={styles.logoImg}
              loading="lazy"
              decoding="async"
              width={200}
              height={70}
            />
          </div>
          <span className={styles.outreachBadge}>
            <Leaf size={13} aria-hidden="true" />
            <span>{org.badgeLabel}</span>
          </span>
        </div>
      </a>
    </section>
  );
}
