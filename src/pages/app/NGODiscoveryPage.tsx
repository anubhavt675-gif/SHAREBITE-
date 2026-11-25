import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, MapPin, Phone, Globe, Mail, Navigation,
  Filter, X, ChevronDown, SlidersHorizontal, Building2,
  ExternalLink, Loader2, RotateCcw, Map, List, AlertCircle,
  CheckCircle2, Info, ShieldCheck, Crosshair, Eye, ArrowRight,
  AlertTriangle, WifiOff,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import {
  NGODiscoveryService,
  type NGOSearchParams,
} from '../../services/ngoDiscovery';
import type { IndiaNGO, NGOCategory } from '../../types';
import styles from './NGODiscoveryPage.module.css';
import 'leaflet/dist/leaflet.css';
import '../../styles/leaflet-fix.css';

// ─── Map Helpers ──────────────────────────────────────────────────────────────

function createNGOMarker(ngo: IndiaNGO, selected: boolean) {
  const isRegistered = ngo.listingType === 'sharebite_registered';
  const color = isRegistered ? '#2E7D32' : '#BF5B27';
  const scale = selected ? 'scale(1.22)' : 'scale(1)';
  return divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg) ${scale};border:2.5px solid #fff;box-shadow:0 4px 12px ${color}66;display:flex;align-items:center;justify-content:center;transition:transform 0.2s"><svg style="transform:rotate(45deg);width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function createUserMarker() {
  return divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.2),0 4px 12px rgba(0,0,0,0.2)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function MapFlyTo({ coords, zoom = 14 }: { coords: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.flyTo(coords, zoom, { duration: 0.7 });
    }
  }, [coords, zoom, map]);
  return null;
}

// ─── Truthful Listing & Registration Badges ───────────────────────────────────

function ListingStatusBadges({ ngo }: { ngo: IndiaNGO }) {
  const isRegistered = ngo.listingType === 'sharebite_registered';

  return (
    <div className={styles.cardStatusRow}>
      {isRegistered ? (
        <span
          className={styles.badge}
          style={{ color: '#166534', background: '#ECFDF3', border: '1px solid #BBF7D0' }}
          data-testid="badge-sharebite-registered"
        >
          <CheckCircle2 size={11} />
          ShareBite Registered NGO
        </span>
      ) : (
        <span
          className={styles.badge}
          style={{ color: '#9A3412', background: '#FFF7ED', border: '1px solid #FED7AA' }}
          data-testid="badge-external-listing"
        >
          <Globe size={11} />
          External NGO Listing
        </span>
      )}

      {ngo.govRegistrationVerified === true && (
        <span
          className={styles.badge}
          style={{ color: '#1E40AF', background: '#EFF6FF', border: '1px solid #BFDBFE' }}
          data-testid="badge-gov-verified"
        >
          <ShieldCheck size={11} />
          Government Registration Confirmed
        </span>
      )}
    </div>
  );
}

// ─── NGO Result Card ──────────────────────────────────────────────────────────

function NGOCard({
  ngo,
  selected,
  onSelect,
  onViewDetails,
  onViewLocation,
}: {
  ngo: IndiaNGO;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
  onViewLocation: () => void;
}) {
  const catLabels = NGODiscoveryService.NGO_CATEGORIES
    .filter((c) => ngo.categories.includes(c.value))
    .slice(0, 3);

  const locationLine = [ngo.address, ngo.city, ngo.state, ngo.pincode]
    .filter(Boolean)
    .reduce<string[]>((acc, part) => {
      const p = String(part).trim();
      if (!p) return acc;
      const alreadyIncluded = acc.some((prev) => prev.toLowerCase().includes(p.toLowerCase()));
      if (!alreadyIncluded) acc.push(p);
      return acc;
    }, [])
    .join(', ');

  return (
    <article
      id={`ngo-card-${ngo.id}`}
      className={`${styles.ngoCard} ${selected ? styles.ngoCardSelected : ''}`}
      onClick={onSelect}
      data-testid="ngo-result-card"
      data-listing-type={ngo.listingType || 'external_listing'}
    >
      {/* Header row */}
      <div className={styles.cardHeader}>
        {ngo.imageUrl ? (
          <img
            src={ngo.imageUrl}
            alt={ngo.name}
            className={styles.cardThumb}
            loading="lazy"
          />
        ) : (
          <div className={styles.cardIcon}>
            <Building2 size={20} />
          </div>
        )}
        <div className={styles.cardMeta}>
          <h3 className={styles.cardName}>{ngo.name}</h3>
          <div className={styles.cardTagRow}>
            {catLabels.map((c) => (
              <span key={c.value} className={styles.catTag}>
                {c.emoji} {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Status badges */}
      <ListingStatusBadges ngo={ngo} />

      {/* Description (if real) */}
      {ngo.description && (
        <p className={styles.cardDesc}>{ngo.description}</p>
      )}

      {/* Available public organization details */}
      <div className={styles.cardInfo}>
        {locationLine && (
          <div className={styles.infoRow}>
            <MapPin size={13} />
            <span>{locationLine}</span>
          </div>
        )}
        {ngo.distanceKm != null && (
          <div className={styles.infoRow}>
            <Navigation size={13} />
            <span>{ngo.distanceKm} km from your location</span>
          </div>
        )}
        {ngo.phone && (
          <div className={styles.infoRow}>
            <Phone size={13} />
            <a href={`tel:${ngo.phone}`} onClick={(e) => e.stopPropagation()}>
              {ngo.phone}
            </a>
          </div>
        )}
        {ngo.email && (
          <div className={styles.infoRow}>
            <Mail size={13} />
            <a href={`mailto:${ngo.email}`} onClick={(e) => e.stopPropagation()}>
              {ngo.email}
            </a>
          </div>
        )}
        {ngo.website && (
          <div className={styles.infoRow}>
            <Globe size={13} />
            <a
              href={ngo.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {ngo.website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 46)}
              <ExternalLink size={10} style={{ marginLeft: 4 }} />
            </a>
          </div>
        )}
        {ngo.govRegistrationVerified && ngo.registrationNumber && (
          <div className={styles.infoRow}>
            <ShieldCheck size={13} />
            <span>Reg. ID: {ngo.registrationNumber}</span>
          </div>
        )}
      </div>

      {/* Source attribution */}
      <div className={styles.cardSource}>
        Data Source: <strong>{ngo.sourceName}</strong>
        {ngo.updatedAt &&
          ` · Updated ${new Date(ngo.updatedAt).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
          })}`}
      </div>

      {/* Functional actions — strictly View Details, Visit Website, View Location */}
      <div className={styles.cardActions}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          data-testid="ngo-view-details-btn"
        >
          <Eye size={14} />
          View Details
        </button>

        {ngo.website && (
          <a
            href={ngo.website}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actionBtn}
            onClick={(e) => e.stopPropagation()}
            data-testid="ngo-visit-website-btn"
          >
            <ExternalLink size={14} />
            Visit Website
          </a>
        )}

        {ngo.latitude != null && ngo.longitude != null && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={(e) => {
              e.stopPropagation();
              onViewLocation();
            }}
            data-testid="ngo-view-location-btn"
          >
            <MapPin size={14} />
            View Location
          </button>
        )}
      </div>
    </article>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function NGOSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <div className={styles.skeletonRow}>
        <div className={`${styles.skeleton} ${styles.skeletonIcon}`} />
        <div className={styles.skeletonLines}>
          <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
          <div className={`${styles.skeleton} ${styles.skeletonSub}`} />
        </div>
      </div>
      <div className={`${styles.skeleton} ${styles.skeletonBody}`} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const RADII = [
  { label: 'All India', value: 9999 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
  { label: '50 km', value: 50 },
  { label: '100 km', value: 100 },
];

const QUICK_SEARCH_CHIPS = [
  'We Care Foundation',
  'NGOs in Delhi',
  'Food donation NGOs in Gurugram',
  'NGOs in Mumbai',
  'NGOs in Punjab',
  '122003',
];

const INITIAL_PAGE_SIZE = 10;

export default function NGODiscoveryPage({
  embeddedInShell = false,
}: {
  embeddedInShell?: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQuery = searchParams.get('q') || '';
  const urlNearby = searchParams.get('nearby') === '1';

  // Search & filter state
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);
  const [selectedState, setSelectedState] = useState(searchParams.get('state') || '');
  const [selectedCity, setSelectedCity] = useState(searchParams.get('city') || '');
  const [selectedCategories, setSelectedCategories] = useState<NGOCategory[]>([]);
  const [radiusKm, setRadiusKm] = useState<number>(urlNearby ? 25 : 9999);
  const [onlyShareBiteRegistered, setOnlyShareBiteRegistered] = useState(false);
  const [onlyGovVerified, setOnlyGovVerified] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'nearest' | 'name'>('relevance');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Location permission state (explicit user opt-in only)
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number; city: string } | null>(null);
  const [locPermission, setLocPermission] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [locStatusMessage, setLocStatusMessage] = useState<string | null>(null);

  // Results state
  const [ngos, setNgos] = useState<IndiaNGO[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [googleAttribution, setGoogleAttribution] = useState(false);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync when URL query changes (e.g., from Navbar search)
  useEffect(() => {
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
    setVisibleCount(INITIAL_PAGE_SIZE);
    setSelectedId(null);
  }, [urlQuery]);

  // Explicit geolocation permission request
  const requestUserLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocPermission('unsupported');
      setLocStatusMessage('Geolocation is not supported in this browser. Search by city, state, or PIN code instead.');
      return;
    }

    setLocPermission('requesting');
    setLocStatusMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocPermission('granted');
        setLocStatusMessage('Location enabled — distances calculated from your current position.');
        setSortBy('nearest');
        if (radiusKm === 9999) {
          setRadiusKm(50);
        }
      },
      (err) => {
        setLocPermission('denied');
        if (err.code === err.PERMISSION_DENIED) {
          setLocStatusMessage(
            'Location permission was denied. You can still search NGOs across India by city, state, district, or PIN code.'
          );
        } else {
          setLocStatusMessage(
            'Could not determine your location. Please enter a city, state, or PIN code to search.'
          );
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  }, [radiusKm]);

  // If user clicked "Nearby NGOs near me" from Navbar dropdown
  useEffect(() => {
    if (urlNearby && locPermission === 'idle') {
      requestUserLocation();
    }
  }, [urlNearby, locPermission, requestUserLocation]);

  const effectiveCoords = searchCoords
    ? { lat: searchCoords.lat, lng: searchCoords.lng }
    : userCoords
    ? { lat: userCoords.latitude, lng: userCoords.longitude }
    : null;

  // Geocode query when it contains a city/state/PIN so map centers properly
  useEffect(() => {
    const q = activeQuery.trim();
    if (!q) {
      setSearchCoords(null);
      return;
    }

    const parsed = NGODiscoveryService.parseIndiaQuery(q);
    const geoTarget = parsed.detectedPincode || parsed.detectedCity || parsed.detectedState;
    if (!geoTarget) {
      setSearchCoords(null);
      return;
    }

    const controller = new AbortController();
    setGeocoding(true);
    NGODiscoveryService.geocodeSearchQuery(geoTarget, controller.signal)
      .then((geo) => {
        if (!controller.signal.aborted) {
          setSearchCoords(geo ? { lat: geo.lat, lng: geo.lng, city: geo.city } : null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setGeocoding(false);
      });

    return () => controller.abort();
  }, [activeQuery]);

  // Main debounced hybrid search runner with AbortController
  const runSearch = useCallback(
    async (override?: Partial<NGOSearchParams>, append = false) => {
      if (!append && abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);

      setNetworkError(null);
      if (!append) setQuotaNotice(null);

      const params: NGOSearchParams = {
        query: activeQuery || undefined,
        state: selectedState || undefined,
        city: selectedCity || undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        lat: userCoords?.latitude ?? searchCoords?.lat,
        lng: userCoords?.longitude ?? searchCoords?.lng,
        radiusKm,
        onlyShareBiteRegistered,
        onlyGovVerified,
        sortBy,
        ...override,
      };

      try {
        const res = await NGODiscoveryService.searchNGOs(params, controller.signal);
        if (controller.signal.aborted) return;

        if (append) {
          setNgos((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...res.ngos.filter((n) => !seen.has(n.id))];
          });
        } else {
          setNgos(res.ngos);
          setVisibleCount(INITIAL_PAGE_SIZE);
        }

        setSources(res.sources);
        setNextPageToken(res.nextPageToken);
        setGoogleAttribution(res.googleAttribution);
        setQuotaNotice(res.quotaExceeded ? res.quotaMessage || 'API search quota reached.' : null);
        setNetworkError(res.networkError ? res.networkMessage || 'Network error while searching.' : null);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setNetworkError('Unable to complete the search. Please check your internet connection and retry.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      activeQuery,
      selectedState,
      selectedCity,
      selectedCategories,
      userCoords?.latitude,
      userCoords?.longitude,
      searchCoords?.lat,
      searchCoords?.lng,
      radiusKm,
      onlyShareBiteRegistered,
      onlyGovVerified,
      sortBy,
    ]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch();
    }, 260);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runSearch]);

  const handleSubmitSearch = (overrideQuery?: string) => {
    const q = (overrideQuery !== undefined ? overrideQuery : searchInput).trim();
    setSearchInput(q);
    setActiveQuery(q);
    if (q) {
      NGODiscoveryService.saveRecentSearch(q);
      setSearchParams({ q });
    } else {
      setSearchParams({});
    }
  };

  const handleLoadMore = async () => {
    if (visibleCount < ngos.length) {
      setVisibleCount((prev) => prev + INITIAL_PAGE_SIZE);
      return;
    }
    if (nextPageToken && !loadingMore) {
      await runSearch({ pageToken: nextPageToken }, true);
      setVisibleCount((prev) => prev + INITIAL_PAGE_SIZE);
    }
  };

  const handleReset = () => {
    setSearchInput('');
    setActiveQuery('');
    setSelectedState('');
    setSelectedCity('');
    setSelectedCategories([]);
    setRadiusKm(9999);
    setOnlyShareBiteRegistered(false);
    setOnlyGovVerified(false);
    setSortBy('relevance');
    setSearchCoords(null);
    setSearchParams({});
  };

  const toggleCategory = (cat: NGOCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const isFilterActive = Boolean(
    selectedState ||
      selectedCity ||
      selectedCategories.length > 0 ||
      radiusKm !== 9999 ||
      onlyShareBiteRegistered ||
      onlyGovVerified ||
      sortBy !== 'relevance'
  );

  const visibleNGOs = ngos.slice(0, visibleCount);
  const canLoadMore = visibleCount < ngos.length || Boolean(nextPageToken);

  const selectedNGO = ngos.find((n) => n.id === selectedId);
  const firstMappedNGO = ngos.find((n) => n.latitude != null && n.longitude != null);

  const mapCenter: [number, number] = effectiveCoords
    ? [effectiveCoords.lat, effectiveCoords.lng]
    : firstMappedNGO?.latitude != null && firstMappedNGO?.longitude != null
    ? [firstMappedNGO.latitude, firstMappedNGO.longitude]
    : [22.5937, 78.9629];

  const flyToCoord: [number, number] | null =
    selectedNGO?.latitude != null && selectedNGO?.longitude != null
      ? [selectedNGO.latitude, selectedNGO.longitude]
      : effectiveCoords
      ? [effectiveCoords.lat, effectiveCoords.lng]
      : null;

  const detailsBasePath = embeddedInShell ? '/ngos' : '/ngo-search';

  const openDetails = (ngo: IndiaNGO) => {
    navigate(`${detailsBasePath}/${encodeURIComponent(ngo.id)}`, {
      state: { ngo, backSearch: searchParams.toString() },
    });
  };

  const focusLocationOnMap = (ngo: IndiaNGO) => {
    setSelectedId(ngo.id);
    if (window.innerWidth < 960) {
      setViewMode('map');
    } else {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const pageBody = (
    <div className={`${styles.page} ${!embeddedInShell ? styles.publicPageOffset : ''}`}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerBadge}>
          <Building2 size={12} />
          <span>INDIA-WIDE NGO DISCOVERY</span>
        </div>
        <h1 className={styles.title}>
          Discover NGOs <span className={styles.titleAccent}>across India</span>
        </h1>
        <p className={styles.subtitle}>
          Search ShareBite Registered NGOs and publicly listed organizations across India by name,
          city, state, district, PIN code, food bank, or community welfare category.
        </p>
      </div>

      {/* ── Search Bar ── */}
      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <Search size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitSearch()}
            placeholder="Search We Care Foundation, NGOs in Delhi, Gurugram, Mumbai, Punjab, or 6-digit PIN..."
            id="ngo-search-input"
            data-testid="ngo-page-search-input"
          />
          {geocoding && <Loader2 size={16} className={styles.searchSpinner} />}
          {searchInput && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => handleSubmitSearch('')}
              aria-label="Clear NGO search"
              data-testid="ngo-page-clear-btn"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="button"
            className={styles.searchBtn}
            onClick={() => handleSubmitSearch()}
            disabled={geocoding}
            data-testid="ngo-page-search-btn"
          >
            Search
          </button>
        </div>

        {/* Quick suggestions */}
        <div className={styles.quickSearches}>
          <span className={styles.quickLabel}>Try searching:</span>
          {QUICK_SEARCH_CHIPS.map((q) => (
            <button
              key={q}
              type="button"
              className={styles.quickChip}
              onClick={() => handleSubmitSearch(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── Controls & Location Permission Bar ── */}
      <div className={styles.controlBar}>
        <div className={styles.controlLeft}>
          <button
            type="button"
            className={`${styles.filterToggle} ${showFilters ? styles.filterToggleActive : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            data-testid="ngo-filters-toggle"
          >
            <SlidersHorizontal size={15} />
            Filters
            {isFilterActive && <span className={styles.filterDot} />}
          </button>

          {/* Explicit Location Permission Button */}
          <button
            type="button"
            className={`${styles.filterToggle} ${locPermission === 'granted' ? styles.filterToggleActive : ''}`}
            onClick={requestUserLocation}
            disabled={locPermission === 'requesting'}
            data-testid="ngo-use-location-btn"
          >
            {locPermission === 'requesting' ? (
              <Loader2 size={14} className={styles.searchSpinner} />
            ) : (
              <Crosshair size={14} />
            )}
            {locPermission === 'granted' ? 'Nearby Active' : 'Use My Location'}
          </button>

          {/* Distance filter */}
          <div className={styles.pillSelect}>
            <Navigation size={13} />
            <span>{RADII.find((r) => r.value === radiusKm)?.label || 'All India'}</span>
            <select
              className={styles.nativeSelect}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              id="ngo-radius-select"
              aria-label="Distance filter"
            >
              {RADII.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>

          {/* Sort */}
          <div className={styles.pillSelect}>
            <Filter size={13} />
            <span>
              {sortBy === 'relevance' ? 'Relevance' : sortBy === 'nearest' ? 'Nearest First' : 'Name A–Z'}
            </span>
            <select
              className={styles.nativeSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'relevance' | 'nearest' | 'name')}
              id="ngo-sort-select"
              aria-label="Sort NGOs"
            >
              <option value="relevance">Relevance</option>
              <option value="nearest">Nearest First</option>
              <option value="name">Name A–Z</option>
            </select>
            <ChevronDown size={13} />
          </div>

          {/* Quick toggle pills */}
          <button
            type="button"
            className={`${styles.filterToggle} ${onlyShareBiteRegistered ? styles.filterToggleActive : ''}`}
            onClick={() => setOnlyShareBiteRegistered((v) => !v)}
            data-testid="filter-sharebite-registered"
          >
            <CheckCircle2 size={14} />
            ShareBite Registered
          </button>

          <button
            type="button"
            className={`${styles.filterToggle} ${onlyGovVerified ? styles.filterToggleActive : ''}`}
            onClick={() => setOnlyGovVerified((v) => !v)}
            data-testid="filter-gov-verified"
          >
            <ShieldCheck size={14} />
            Gov. Registration Confirmed
          </button>

          {isFilterActive && (
            <button type="button" className={styles.resetBtn} onClick={handleReset}>
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>

        <div className={styles.controlRight}>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('list')}
              id="ngo-list-view-btn"
            >
              <List size={15} /> List
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${viewMode === 'map' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('map')}
              id="ngo-map-view-btn"
            >
              <Map size={15} /> Map
            </button>
          </div>
        </div>
      </div>

      {/* ── Expandable Filters Panel (State, City, Category) ── */}
      {showFilters && (
        <div className={styles.filterPanel} data-testid="ngo-filters-panel">
          <div className={styles.filterSection}>
            <p className={styles.filterLabel}>NGO Category</p>
            <div className={styles.categoryGrid}>
              {NGODiscoveryService.NGO_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  className={`${styles.catBtn} ${
                    selectedCategories.includes(cat.value) ? styles.catBtnActive : ''
                  }`}
                  onClick={() => toggleCategory(cat.value)}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterColumnNarrow}>
            <div className={styles.filterSection}>
              <label className={styles.filterLabel} htmlFor="ngo-state-select">
                State / Union Territory
              </label>
              <select
                className={styles.stateSelect}
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                id="ngo-state-select"
                data-testid="ngo-state-select"
              >
                <option value="">All India</option>
                {NGODiscoveryService.INDIA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterSection}>
              <label className={styles.filterLabel} htmlFor="ngo-city-input">
                City / District
              </label>
              <input
                id="ngo-city-input"
                type="text"
                className={styles.stateSelect}
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                placeholder="e.g., Gurugram, Delhi, Mumbai, Amritsar..."
                data-testid="ngo-city-input"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Status / Permission / Quota / Network Banners ── */}
      {locStatusMessage && (
        <div
          className={
            locPermission === 'denied' || locPermission === 'unsupported'
              ? styles.warningBanner
              : styles.successBanner
          }
          role="status"
          data-testid="ngo-location-banner"
        >
          {locPermission === 'denied' || locPermission === 'unsupported' ? (
            <AlertCircle size={15} />
          ) : (
            <CheckCircle2 size={15} />
          )}
          <span>{locStatusMessage}</span>
        </div>
      )}

      {quotaNotice && (
        <div className={styles.warningBanner} role="alert" data-testid="ngo-quota-banner">
          <AlertTriangle size={15} />
          <span>{quotaNotice}</span>
        </div>
      )}

      {networkError && (
        <div className={styles.errorBanner} role="alert" data-testid="ngo-network-banner">
          <WifiOff size={15} />
          <span>{networkError}</span>
          <button type="button" className={styles.inlineRetryBtn} onClick={() => runSearch()}>
            Retry
          </button>
        </div>
      )}

      {/* ── Data Transparency & Attribution Notice ── */}
      <div className={styles.dataNotice}>
        <Info size={14} />
        <span>
          <strong>ShareBite Registered NGOs</strong> are active on our platform;{' '}
          <strong>External NGO Listings</strong> are publicly discoverable organizations and are not
          automatically verified ShareBite partners.
          {sources.length > 0 ? (
            <>
              {' '}
              Sources in view: <strong>{sources.join(' · ')}</strong>.
            </>
          ) : null}
          {googleAttribution ? ' Powered by Google Maps / Places.' : ''}
        </span>
      </div>

      {/* ── Main Content: Map + Results ── */}
      {viewMode === 'map' ? (
        <div className={styles.fullMapWrap}>
          <MapContainer
            center={mapCenter}
            zoom={effectiveCoords ? 11 : 5}
            className={styles.fullMap}
            zoomControl={true}
          >
            <MapFlyTo coords={flyToCoord} zoom={selectedNGO ? 14 : 11} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            {userCoords && (
              <Marker position={[userCoords.latitude, userCoords.longitude]} icon={createUserMarker()}>
                <Popup>
                  <strong>Your Current Location</strong>
                </Popup>
              </Marker>
            )}
            {ngos.map((ngo) =>
              ngo.latitude != null && ngo.longitude != null ? (
                <Marker
                  key={ngo.id}
                  position={[ngo.latitude, ngo.longitude]}
                  icon={createNGOMarker(ngo, ngo.id === selectedId)}
                  eventHandlers={{ click: () => setSelectedId(ngo.id) }}
                >
                  <Popup>
                    <div style={{ minWidth: 190 }}>
                      <strong>{ngo.name}</strong>
                      <p style={{ fontSize: 12, marginTop: 4, color: '#64748b' }}>
                        {[ngo.city, ngo.state].filter(Boolean).join(', ')}
                        {ngo.distanceKm != null ? ` · ${ngo.distanceKm} km` : ''}
                      </p>
                      <button
                        type="button"
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          padding: '5px 10px',
                          background: '#BF5B27',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                        onClick={() => openDetails(ngo)}
                      >
                        View Details →
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ) : null
            )}
          </MapContainer>
          <button type="button" className={styles.backToList} onClick={() => setViewMode('list')}>
            <List size={15} /> Back to List
          </button>
        </div>
      ) : (
        <div className={styles.splitLayout}>
          {/* Left: Interactive Embedded Map */}
          <div className={styles.mapCol} ref={mapSectionRef}>
            <MapContainer
              center={mapCenter}
              zoom={effectiveCoords ? 11 : 5}
              className={styles.sideMap}
              zoomControl={true}
            >
              <MapFlyTo coords={flyToCoord} zoom={selectedNGO ? 14 : 11} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              {userCoords && (
                <Marker position={[userCoords.latitude, userCoords.longitude]} icon={createUserMarker()}>
                  <Popup>
                    <strong>Your Current Location</strong>
                  </Popup>
                </Marker>
              )}
              {ngos.map((ngo) =>
                ngo.latitude != null && ngo.longitude != null ? (
                  <Marker
                    key={ngo.id}
                    position={[ngo.latitude, ngo.longitude]}
                    icon={createNGOMarker(ngo, ngo.id === selectedId)}
                    eventHandlers={{
                      click: () => {
                        setSelectedId(ngo.id);
                        document
                          .getElementById(`ngo-card-${ngo.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      },
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: 185 }}>
                        <strong>{ngo.name}</strong>
                        <p style={{ fontSize: 12, marginTop: 4, color: '#64748b' }}>
                          {[ngo.city, ngo.state].filter(Boolean).join(', ')}
                        </p>
                        <button
                          type="button"
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            padding: '4px 10px',
                            background: '#BF5B27',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                          onClick={() => openDetails(ngo)}
                        >
                          View Details
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ) : null
              )}
            </MapContainer>
            <div className={styles.mapLegend}>
              <span>
                <span className={styles.dot} style={{ background: '#2E7D32' }} /> ShareBite Registered NGO
              </span>
              <span>
                <span className={styles.dot} style={{ background: '#BF5B27' }} /> External NGO Listing
              </span>
            </div>
          </div>

          {/* Right: Search Results List */}
          <div className={styles.listCol}>
            <div className={styles.listHeader}>
              <div>
                <h2 className={styles.listTitle}>
                  {activeQuery
                    ? `Results for "${activeQuery}"`
                    : selectedState
                    ? `NGOs in ${selectedState}`
                    : selectedCity
                    ? `NGOs in ${selectedCity}`
                    : 'NGOs Across India'}
                </h2>
                <p className={styles.listCount} data-testid="ngo-results-count">
                  {loading
                    ? 'Searching across India...'
                    : `${ngos.length} organisation${ngos.length !== 1 ? 's' : ''} found`}
                </p>
              </div>
              <button
                type="button"
                className={styles.mapViewMobileBtn}
                onClick={() => setViewMode('map')}
              >
                <Map size={14} /> Full Map
              </button>
            </div>

            <div className={styles.cardsList}>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <NGOSkeleton key={i} />)
              ) : ngos.length === 0 ? (
                <div className={styles.emptyState} data-testid="ngo-empty-state">
                  <Building2 size={38} color="#C4B49E" />
                  <h3>No matching NGOs found</h3>
                  <p>
                    {activeQuery
                      ? `We could not find verified or public NGO listings matching "${activeQuery}". Try searching by city (e.g., Delhi, Mumbai, Gurugram, Amritsar), Indian state, or food donation category.`
                      : 'Try removing one of your active filters or searching a city or PIN code.'}
                  </p>
                  <div className={styles.emptyActions}>
                    <button type="button" className={styles.retryBtn} onClick={handleReset}>
                      Reset Search & Filters
                    </button>
                    {networkError && (
                      <button type="button" className={styles.retryBtn} onClick={() => runSearch()}>
                        Retry Search
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {visibleNGOs.map((ngo) => (
                    <NGOCard
                      key={ngo.id}
                      ngo={ngo}
                      selected={ngo.id === selectedId}
                      onSelect={() => setSelectedId(ngo.id === selectedId ? null : ngo.id)}
                      onViewDetails={() => openDetails(ngo)}
                      onViewLocation={() => focusLocationOnMap(ngo)}
                    />
                  ))}

                  {canLoadMore && (
                    <button
                      type="button"
                      className={styles.loadMoreBtn}
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      data-testid="ngo-load-more-btn"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 size={15} className={styles.searchSpinner} /> Loading more NGOs...
                        </>
                      ) : (
                        <>
                          Load More NGOs <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embeddedInShell) {
    return pageBody;
  }

  return (
    <div className={styles.publicShell}>
      <Navbar />
      <main className={styles.publicMain}>{pageBody}</main>
      <Footer />
    </div>
  );
}
