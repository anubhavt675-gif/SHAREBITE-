import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, Phone, Globe, Mail, Clock,
  ExternalLink, CheckCircle2, ShieldCheck, Info, AlertCircle,
  Loader2, Handshake, Lock,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { divIcon } from 'leaflet';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import { NGODiscoveryService } from '../../services/ngoDiscovery';
import type { IndiaNGO } from '../../types';
import styles from './NGODetailsPage.module.css';
import 'leaflet/dist/leaflet.css';
import '../../styles/leaflet-fix.css';

function createDetailPin(isRegistered: boolean) {
  const color = isRegistered ? '#2E7D32' : '#BF5B27';
  return divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 6px 16px ${color}66;display:flex;align-items:center;justify-content:center;"><svg style="transform:rotate(45deg);width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });
}

export default function NGODetailsPage({
  embeddedInShell = false,
}: {
  embeddedInShell?: boolean;
}) {
  const { ngoId } = useParams<{ ngoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as { ngo?: IndiaNGO; backSearch?: string };

  const [ngo, setNgo] = useState<IndiaNGO | null>(routeState.ngo || null);
  const [loading, setLoading] = useState(!routeState.ngo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ngoId) return;
    const decodedId = decodeURIComponent(ngoId);
    const controller = new AbortController();

    // Always enrich live details for gplace-* or when navigating directly to URL
    const needsFetch = !routeState.ngo || decodedId.startsWith('gplace-') || decodedId.startsWith('sb-');
    if (!needsFetch) return;

    if (!routeState.ngo) setLoading(true);
    NGODiscoveryService.getNGOById(decodedId, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        if (found) {
          setNgo(found);
          setError(null);
        } else if (!routeState.ngo) {
          setError('We could not find details for this NGO listing.');
        }
      })
      .catch((err: any) => {
        if (err?.name !== 'AbortError' && !routeState.ngo) {
          setError('Unable to load NGO details right now. Please try again.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [ngoId, routeState.ngo]);

  const backHref = embeddedInShell
    ? `/ngos${routeState.backSearch ? `?${routeState.backSearch}` : ''}`
    : `/ngo-search${routeState.backSearch ? `?${routeState.backSearch}` : ''}`;

  const googleMapsBrowserKey = (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    import.meta.env.VITE_GOOGLE_MAPS_KEY ||
    ''
  ).trim();

  const isRegistered = ngo?.listingType === 'sharebite_registered';
  const catLabels = ngo
    ? NGODiscoveryService.NGO_CATEGORIES.filter((c) => ngo.categories.includes(c.value))
    : [];

  const locationSummary = ngo
    ? [ngo.address, ngo.city, ngo.district, ngo.state, ngo.pincode]
        .filter(Boolean)
        .reduce<string[]>((acc, item) => {
          const val = String(item).trim();
          if (!val) return acc;
          if (!acc.some((x) => x.toLowerCase().includes(val.toLowerCase()))) acc.push(val);
          return acc;
        }, [])
        .join(', ')
    : '';

  const content = (
    <div className={`${styles.container} ${!embeddedInShell ? styles.publicOffset : ''}`}>
      <div className={styles.topNavRow}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate(backHref)}
          data-testid="ngo-details-back-btn"
        >
          <ArrowLeft size={16} /> Back to NGO Search
        </button>
      </div>

      {loading ? (
        <div className={styles.stateBox}>
          <Loader2 size={28} className={styles.spinner} />
          <p>Loading organization details...</p>
        </div>
      ) : error || !ngo ? (
        <div className={styles.stateBox} data-testid="ngo-details-not-found">
          <AlertCircle size={32} color="#BF5B27" />
          <h2>NGO listing unavailable</h2>
          <p>{error || 'This organization could not be loaded.'}</p>
          <Link to={backHref} className={styles.primaryBtn}>
            Return to India NGO Search
          </Link>
        </div>
      ) : (
        <div className={styles.layoutGrid} data-testid="ngo-details-page">
          {/* Left Main Column */}
          <div className={styles.mainCol}>
            {/* Hero Summary Card */}
            <section className={styles.heroCard}>
              <div className={styles.heroTop}>
                {ngo.imageUrl ? (
                  <img src={ngo.imageUrl} alt={ngo.name} className={styles.orgPhoto} />
                ) : (
                  <div className={styles.orgAvatarFallback}>
                    <Building2 size={32} />
                  </div>
                )}
                <div className={styles.heroText}>
                  <div className={styles.badgesRow}>
                    {isRegistered ? (
                      <span className={styles.badgeRegistered} data-testid="details-badge-registered">
                        <CheckCircle2 size={13} /> ShareBite Registered NGO
                      </span>
                    ) : (
                      <span className={styles.badgeExternal} data-testid="details-badge-external">
                        <Globe size={13} /> External NGO Listing
                      </span>
                    )}
                    {ngo.govRegistrationVerified === true && (
                      <span className={styles.badgeGov}>
                        <ShieldCheck size={13} /> Government Registration Confirmed
                      </span>
                    )}
                  </div>

                  <h1 className={styles.orgTitle} data-testid="ngo-details-title">
                    {ngo.name}
                  </h1>

                  <div className={styles.catChips}>
                    {catLabels.map((c) => (
                      <span key={c.value} className={styles.catChip}>
                        {c.emoji} {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {ngo.description && <p className={styles.orgDescription}>{ngo.description}</p>}

              <div className={styles.heroActions}>
                {ngo.website && (
                  <a
                    href={ngo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.primaryBtn}
                    data-testid="ngo-details-website-btn"
                  >
                    <ExternalLink size={15} /> Visit Official Website
                  </a>
                )}
                {ngo.phone && (
                  <a href={`tel:${ngo.phone}`} className={styles.secondaryBtn}>
                    <Phone size={15} /> Call {ngo.phone}
                  </a>
                )}
                {isRegistered && (
                  <Link to="/donations/new" className={styles.registeredActionBtn}>
                    <Handshake size={15} /> Donate Surplus Food on ShareBite
                  </Link>
                )}
              </div>
            </section>

            {/* Organization Information & Contact Details */}
            <section className={styles.infoCard}>
              <h2 className={styles.sectionHeading}>Organization & Public Contact Details</h2>
              <dl className={styles.detailsList}>
                {locationSummary && (
                  <div className={styles.detailRow}>
                    <dt>
                      <MapPin size={15} /> Address
                    </dt>
                    <dd>{locationSummary}</dd>
                  </div>
                )}
                {(ngo.city || ngo.state) && (
                  <div className={styles.detailRow}>
                    <dt>
                      <Building2 size={15} /> City / State
                    </dt>
                    <dd>{[ngo.city, ngo.district, ngo.state, ngo.pincode].filter(Boolean).join(', ')}</dd>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <dt>
                    <Phone size={15} /> Public Contact Number
                  </dt>
                  <dd>
                    {ngo.phone ? (
                      <a href={`tel:${ngo.phone}`}>{ngo.phone}</a>
                    ) : (
                      <span className={styles.mutedText}>Not publicly listed</span>
                    )}
                  </dd>
                </div>
                {ngo.email && (
                  <div className={styles.detailRow}>
                    <dt>
                      <Mail size={15} /> Public Email
                    </dt>
                    <dd>
                      <a href={`mailto:${ngo.email}`}>{ngo.email}</a>
                    </dd>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <dt>
                    <Globe size={15} /> Official Website
                  </dt>
                  <dd>
                    {ngo.website ? (
                      <a href={ngo.website} target="_blank" rel="noopener noreferrer">
                        {ngo.website} <ExternalLink size={12} style={{ display: 'inline' }} />
                      </a>
                    ) : (
                      <span className={styles.mutedText}>Not publicly listed</span>
                    )}
                  </dd>
                </div>
                {ngo.operatingHours && (
                  <div className={styles.detailRow}>
                    <dt>
                      <Clock size={15} /> Operating Hours
                    </dt>
                    <dd>{ngo.operatingHours}</dd>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <dt>
                    <ShieldCheck size={15} /> Registration Verification
                  </dt>
                  <dd>
                    {ngo.govRegistrationVerified && ngo.registrationNumber ? (
                      <span>
                        Confirmed ({ngo.registrationType || 'Government Registry'} · {ngo.registrationNumber})
                      </span>
                    ) : (
                      <span className={styles.mutedText}>
                        Not independently verified via government registry on ShareBite
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {/* ShareBite Platform Coordination Policy */}
            <section
              className={isRegistered ? styles.platformActiveBox : styles.platformExternalBox}
              data-testid="ngo-platform-status-box"
            >
              {isRegistered ? (
                <>
                  <CheckCircle2 size={20} color="#166534" />
                  <div>
                    <h3>Active ShareBite Registered NGO</h3>
                    <p>
                      This organization has an active NGO portal on ShareBite and can receive food
                      donation claims, live rider deliveries, and in-app delivery coordination.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Lock size={20} color="#9A3412" />
                  <div>
                    <h3>External Public NGO Listing (Not Registered on ShareBite)</h3>
                    <p>
                      This organization is shown for public discovery across India and is{' '}
                      <strong>not</strong> an official verified ShareBite partner. Private ShareBite
                      messaging and automated ShareBite rider delivery dispatch are disabled for
                      external listings. Please contact the organization directly via its official
                      website or public phone number.
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Right Column: Embedded Map + Source Attribution */}
          <aside className={styles.sideCol}>
            <section className={styles.mapCard}>
              <h2 className={styles.sectionHeading}>Location on Map</h2>
              {ngo.latitude != null && ngo.longitude != null ? (
                <div className={styles.mapWrap} data-testid="ngo-details-embedded-map">
                  {googleMapsBrowserKey && ngo.placeId ? (
                    <iframe
                      title={`Map showing ${ngo.name}`}
                      className={styles.googleEmbedFrame}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
                        googleMapsBrowserKey
                      )}&q=place_id:${encodeURIComponent(ngo.placeId)}`}
                      allowFullScreen
                    />
                  ) : (
                    <MapContainer
                      center={[ngo.latitude, ngo.longitude]}
                      zoom={14}
                      className={styles.leafletEmbed}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maxZoom={19}
                      />
                      <Marker
                        position={[ngo.latitude, ngo.longitude]}
                        icon={createDetailPin(Boolean(isRegistered))}
                      >
                        <Popup>
                          <strong>{ngo.name}</strong>
                          <br />
                          {[ngo.city, ngo.state].filter(Boolean).join(', ')}
                        </Popup>
                      </Marker>
                    </MapContainer>
                  )}
                </div>
              ) : (
                <div className={styles.noCoordsBox}>
                  <MapPin size={22} />
                  <span>Exact map coordinates are not publicly listed for this organization.</span>
                </div>
              )}

              {ngo.googleMapsUri && (
                <a
                  href={ngo.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceExtLink}
                >
                  View listing on Google Maps <ExternalLink size={12} />
                </a>
              )}
            </section>

            {/* Source Attribution */}
            <section className={styles.attributionCard} data-testid="ngo-source-attribution">
              <div className={styles.attrHeader}>
                <Info size={16} />
                <h3>Data Source & Attribution</h3>
              </div>
              <p>
                <strong>Primary Source:</strong> {ngo.sourceName}
              </p>
              <p>
                <strong>ShareBite Status:</strong>{' '}
                {isRegistered ? 'ShareBite Registered NGO' : 'External Public Listing'}
              </p>
              {ngo.dataSource === 'google_places' && (
                <p className={styles.googleAttr}>
                  Location and organization listing data provided via Google Places API (New).
                  Powered by Google Maps.
                </p>
              )}
              {ngo.sourceUrl && (
                <a
                  href={ngo.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceExtLink}
                >
                  View Original Source <ExternalLink size={12} />
                </a>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );

  if (embeddedInShell) return content;

  return (
    <div className={styles.publicShell}>
      <Navbar />
      <main className={styles.publicMain}>{content}</main>
      <Footer />
    </div>
  );
}
