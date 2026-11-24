import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, HeartHandshake, Leaf, MapPin } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import { PartnersService } from '../../services/partners';
import { WE_CARE_FOUNDATION } from '../../config/outreachPartners';
import type { Partner } from '../../types';
import styles from './SimplePublicPage.module.css';

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    PartnersService.getVerifiedPartners().then(d => { setPartners(d); setLoading(false); });
  }, []);

  const outreachOrg = WE_CARE_FOUNDATION;

  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.inner} style={{ maxWidth: 960 }}>
          <h1 className={styles.title}>NGO Outreach & Partners</h1>
          <p className={styles.lead}>
            Community organizations we connect with and verified partners working alongside ShareBite to rescue food and feed communities.
          </p>

          {/* Featured NGO Outreach Organization (Shared Config with Homepage) */}
          <section aria-label="Featured NGO Outreach" style={{ marginBottom: '2.5rem' }}>
            <a
              href={outreachOrg.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${outreachOrg.name} official website (opens in a new tab)`}
              data-testid="partners-we-care-card"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(200px, 280px) 1fr',
                gap: 24,
                alignItems: 'center',
                background: 'linear-gradient(90deg, #fff4e6 0%, #fffaf2 100%)',
                border: '1.5px solid rgba(217, 119, 54, 0.35)',
                borderRadius: 22,
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit',
                boxShadow: '0 8px 26px rgba(191, 91, 39, 0.08)',
              }}
            >
              <div style={{ height: '100%', minHeight: 200 }}>
                <img
                  src={outreachOrg.photo}
                  alt={outreachOrg.photoAlt}
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div style={{ padding: '22px 24px 22px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 12px',
                      borderRadius: 999,
                      background: '#f6e1c8',
                      color: '#8c3f17',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <HeartHandshake size={13} /> {outreachOrg.eyebrowLabel}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 12px',
                      borderRadius: 999,
                      background: '#e5f1df',
                      color: '#355e2b',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <Leaf size={12} /> {outreachOrg.badgeLabel}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#183254' }}>
                    {outreachOrg.name}
                  </h2>
                  <img
                    src={outreachOrg.logo}
                    alt={outreachOrg.logoAlt}
                    loading="lazy"
                    decoding="async"
                    style={{ height: 38, width: 'auto', objectFit: 'contain' }}
                  />
                </div>

                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#54493e' }}>
                  {outreachOrg.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#7a6f62', fontWeight: 600 }}>
                    <MapPin size={13} /> {outreachOrg.location}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: '#bf5b27' }}>
                    {outreachOrg.ctaLabel} <ArrowRight size={14} /> <ExternalLink size={12} />
                  </span>
                </div>
              </div>
            </a>
          </section>

          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            Verified Platform Partners
          </h2>
          {loading ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading partners...</p>
          ) : partners.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '2rem' }}>
              No verified platform partners listed yet. Organizations will appear here once verified by our admin team.
            </p>
          ) : (
            <div className={styles.partnerGrid}>
              {partners.map(p => (
                <div key={p.id} className={styles.partnerCard}>
                  {p.logoUrl && <img src={p.logoUrl} alt={p.organizationName} />}
                  <h3>{p.organizationName}</h3>
                  <p className={styles.partnerType}>{p.organizationType}</p>
                  {p.city && <p className={styles.partnerCity}>{p.city}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
