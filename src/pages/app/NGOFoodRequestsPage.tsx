import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package,
  Plus,
  Search,
  MapPin,
  Clock,
  Users,
  Bike,
  CheckCircle2,
  X,
  Loader2,
  Edit3,
  Trash2,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { DonationService } from '../../services/donations';
import { LocationService } from '../../services/location';
import {
  NGOOperationsService,
  type NGOFoodRequest,
} from '../../services/ngoOperations';
import type { FoodListing } from '../../types';
import styles from './NGOPortalSubpages.module.css';

export default function NGOFoodRequestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = user?.id;

  const initialCreate = searchParams.get('create') === '1';
  const [activeTab, setActiveTab] = useState<'available' | 'requests'>(
    initialCreate ? 'requests' : 'available'
  );
  const [showCreateForm, setShowCreateForm] = useState(initialCreate);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

  const [listings, setListings] = useState<FoodListing[]>([]);
  const [requests, setRequests] = useState<NGOFoodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Filters for Available Food
  const [searchQuery, setSearchQuery] = useState('');
  const [foodTypeFilter, setFoodTypeFilter] = useState<string>('all');
  const [minServings, setMinServings] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'newest' | 'distance' | 'deadline'>('newest');

  // Create/Edit Food Request form state
  const [title, setTitle] = useState('');
  const [foodType, setFoodType] = useState('Cooked Meals');
  const [dietaryPreference, setDietaryPreference] = useState<'veg' | 'non_veg' | 'both'>('veg');
  const [peopleCount, setPeopleCount] = useState(50);
  const [requiredQuantity, setRequiredQuantity] = useState(50);
  const [quantityUnit, setQuantityUnit] = useState('servings');
  const [neededBy, setNeededBy] = useState(() => {
    const d = new Date(Date.now() + 6 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [collectionPreference, setCollectionPreference] = useState<
    'rider_delivery' | 'direct_collection' | 'either'
  >('either');
  const [address, setAddress] = useState(user?.location?.address || user?.location?.city || '');
  const [storageRequirements, setStorageRequirements] = useState('');
  const [instructions, setInstructions] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setActiveTab('requests');
      setShowCreateForm(true);
    }
  }, [searchParams]);

  const fetchData = useCallback(
    async (silent = false) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      try {
        const [availData, reqData] = await Promise.all([
          DonationService.getActiveListings(),
          NGOOperationsService.getMyFoodRequests(userId),
        ]);
        const eligible = availData.filter(
          (l: FoodListing) =>
            (l.status === 'available' || l.status === 'partially_reserved') &&
            l.availableServings > 0 &&
            (!l.availableUntil || new Date(l.availableUntil).getTime() > Date.now())
        );
        setListings(eligible);
        setRequests(reqData);
      } catch (e: any) {
        if (!silent) setBanner({ kind: 'err', text: e?.message || 'Could not load food data.' });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    fetchData(false);
    if (!userId) return;
    const sub = NGOOperationsService.subscribeToNgoPortal(userId, () => fetchData(true));
    return () => sub.unsubscribe();
  }, [userId, fetchData]);

  const filteredListings = useMemo(() => {
    const ngoLat = user?.location?.latitude;
    const ngoLng = user?.location?.longitude;

    return listings
      .map((l) => {
        const dist =
          typeof ngoLat === 'number' &&
          typeof ngoLng === 'number' &&
          typeof l.latitude === 'number' &&
          typeof l.longitude === 'number'
            ? Number(LocationService.calculateDistance(ngoLat, ngoLng, l.latitude, l.longitude).toFixed(1))
            : l.distanceKm;
        return { ...l, distanceKm: dist };
      })
      .filter((l) => {
        if (foodTypeFilter !== 'all' && l.foodType !== foodTypeFilter) return false;
        if (minServings > 0 && l.availableServings < minServings) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            l.title.toLowerCase().includes(q) ||
            (l.city || '').toLowerCase().includes(q) ||
            (l.category || '').toLowerCase().includes(q) ||
            (l.donor?.name || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'distance') {
          return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
        }
        if (sortBy === 'deadline') {
          return new Date(a.availableUntil).getTime() - new Date(b.availableUntil).getTime();
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [listings, foodTypeFilter, minServings, searchQuery, sortBy, user?.location]);

  const handleAcceptListing = async (
    listing: FoodListing,
    mode: 'direct_collection' | 'rider_delivery'
  ) => {
    if (!userId || busyId) return;
    if (listing.availableUntil && new Date(listing.availableUntil).getTime() <= Date.now()) {
      setBanner({ kind: 'err', text: 'This donation collection deadline has expired.' });
      return;
    }
    setBusyId(`${listing.id}:${mode}`);
    setBanner(null);
    try {
      await NGOOperationsService.acceptDonationForNGO(
        listing.id,
        mode,
        listing.availableServings
      );
      setBanner({
        kind: 'ok',
        text:
          mode === 'direct_collection'
            ? `✓ Accepted "${listing.title}" for Direct NGO Collection! Moved to Active Collections and unlocked Donor chat.`
            : `✓ Claimed "${listing.title}" with Rider Delivery! Nearby riders have been notified.`,
      });
      await fetchData(true);
      setTimeout(() => navigate('/ngo/collections'), 900);
    } catch (e: any) {
      setBanner({
        kind: 'err',
        text: e?.message || 'This donation is no longer available or requires NGO verification.',
      });
      await fetchData(true);
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setEditingRequestId(null);
    setTitle('');
    setFoodType('Cooked Meals');
    setDietaryPreference('veg');
    setPeopleCount(50);
    setRequiredQuantity(50);
    setQuantityUnit('servings');
    setUrgency('normal');
    setCollectionPreference('either');
    setAddress(user?.location?.address || user?.location?.city || '');
    setStorageRequirements('');
    setInstructions('');
    setShowCreateForm(false);
    if (searchParams.get('create')) {
      setSearchParams({});
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || savingForm) return;
    setSavingForm(true);
    setBanner(null);
    try {
      if (editingRequestId) {
        await NGOOperationsService.updateFoodRequest(editingRequestId, userId, {
          title,
          foodType,
          peopleCount,
          requiredQuantity,
          neededBy: neededBy ? new Date(neededBy).toISOString() : undefined,
          urgency,
          instructions,
        });
        setBanner({ kind: 'ok', text: '✓ Food request updated successfully.' });
      } else {
        await NGOOperationsService.createFoodRequest(userId, {
          title,
          foodType,
          dietaryPreference,
          peopleCount,
          requiredQuantity,
          quantityUnit,
          neededBy: neededBy ? new Date(neededBy).toISOString() : new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
          urgency,
          collectionPreference,
          address: address || user?.location?.city || 'NGO Facility',
          city: user?.location?.city,
          latitude: user?.location?.latitude,
          longitude: user?.location?.longitude,
          storageRequirements,
          instructions,
        });
        setBanner({ kind: 'ok', text: '✓ Food request published! Donors can now see and fulfill your need.' });
      }
      resetForm();
      await fetchData(true);
    } catch (err: any) {
      setBanner({ kind: 'err', text: err?.message || 'Could not save food request.' });
    } finally {
      setSavingForm(false);
    }
  };

  const handleStartEdit = (req: NGOFoodRequest) => {
    setEditingRequestId(req.id);
    setTitle(req.title);
    setFoodType(req.foodType);
    setDietaryPreference(req.dietaryPreference);
    setPeopleCount(req.peopleCount);
    setRequiredQuantity(req.requiredQuantity);
    setQuantityUnit(req.quantityUnit);
    if (req.neededBy) setNeededBy(new Date(req.neededBy).toISOString().slice(0, 16));
    setUrgency(req.urgency);
    setCollectionPreference(req.collectionPreference);
    setAddress(req.address || '');
    setStorageRequirements(req.storageRequirements || '');
    setInstructions(req.instructions || '');
    setActiveTab('requests');
    setShowCreateForm(true);
  };

  const handleCancelRequest = async (req: NGOFoodRequest) => {
    if (!userId || !window.confirm(`Cancel food request "${req.title}"?`)) return;
    try {
      await NGOOperationsService.updateFoodRequest(req.id, userId, { status: 'CANCELLED' });
      setBanner({ kind: 'ok', text: `Request "${req.title}" cancelled.` });
      await fetchData(true);
    } catch (err: any) {
      setBanner({ kind: 'err', text: err?.message || 'Could not cancel request.' });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Food Requests & Available Food</h1>
          <p className={styles.pageSub}>
            Claim live nearby donor food for collection or publish open food needs for your community
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              setActiveTab('requests');
              setShowCreateForm((s) => !s);
              if (editingRequestId) setEditingRequestId(null);
            }}
          >
            <Plus size={16} /> Create Food Request
          </button>
        </div>
      </div>

      {!user?.isVerified && (
        <div className={styles.bannerWarn}>
          <AlertTriangle size={16} />
          <span>
            Your NGO verification is pending. Complete{' '}
            <Link to="/verification" style={{ color: '#c2410c', fontWeight: 800 }}>
              NGO Verification
            </Link>{' '}
            to unlock verified food claiming privileges.
          </span>
        </div>
      )}

      {banner && (
        <div className={banner.kind === 'ok' ? styles.bannerOk : styles.bannerErr}>
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabsBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'available' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('available')}
        >
          <Package size={15} /> Available Food ({filteredListings.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'requests' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          <Plus size={15} /> My Food Requests ({requests.length})
        </button>
      </div>

      {/* Create / Edit Food Request Form */}
      {showCreateForm && activeTab === 'requests' && (
        <form onSubmit={handleSubmitRequest} className={styles.formCard}>
          <div className={styles.headerRow} style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#192538' }}>
              {editingRequestId ? 'Edit Open Food Request' : 'Create New Food Request'}
            </h2>
            <button type="button" className={styles.outlineBtn} onClick={resetForm}>
              <X size={14} /> Close
            </button>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Request Title *</label>
              <input
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Dinner Meals for 60 Shelter Residents"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Food Type *</label>
              <input
                className={styles.input}
                value={foodType}
                onChange={(e) => setFoodType(e.target.value)}
                placeholder="Cooked Meals, Dry Ration, Fruits..."
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Veg / Non-Veg Preference</label>
              <select
                className={styles.select}
                value={dietaryPreference}
                onChange={(e) => setDietaryPreference(e.target.value as any)}
              >
                <option value="veg">Vegetarian Only</option>
                <option value="non_veg">Non-Vegetarian</option>
                <option value="both">Both Veg & Non-Veg</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>People Requiring Food *</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                value={peopleCount}
                onChange={(e) => setPeopleCount(Number(e.target.value) || 0)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Required Quantity *</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                value={requiredQuantity}
                onChange={(e) => setRequiredQuantity(Number(e.target.value) || 0)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Quantity Unit</label>
              <select
                className={styles.select}
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value)}
              >
                <option value="servings">Servings / Meals</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="packets">Packets / Boxes</option>
                <option value="trays">Trays</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Required Date & Time *</label>
              <input
                type="datetime-local"
                className={styles.input}
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Urgency Level</label>
              <select
                className={styles.select}
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as any)}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Delivery / Collection Preference</label>
              <select
                className={styles.select}
                value={collectionPreference}
                onChange={(e) => setCollectionPreference(e.target.value as any)}
              >
                <option value="either">Either Rider Delivery or Direct Collection</option>
                <option value="rider_delivery">Rider-Assisted Delivery</option>
                <option value="direct_collection">NGO Direct Collection</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>NGO Address *</label>
              <input
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Complete facility address"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Storage Requirements</label>
              <input
                className={styles.input}
                value={storageRequirements}
                onChange={(e) => setStorageRequirements(e.target.value)}
                placeholder="e.g., Insulated boxes, refrigerated..."
              />
            </div>
          </div>

          <div className={styles.field} style={{ marginTop: 14 }}>
            <label className={styles.fieldLabel}>Additional Instructions</label>
            <textarea
              className={styles.textarea}
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Gate entry instructions, meal timing notes..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button type="button" className={styles.outlineBtn} onClick={resetForm}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryBtn} data-testid="ngo-submit-request-btn" disabled={savingForm}>
              {savingForm ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {editingRequestId ? 'Update Request' : 'Publish Food Request'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 1: AVAILABLE FOOD DISCOVERY */}
      {activeTab === 'available' ? (
        <>
          <div className={styles.filterBar}>
            <div className={styles.searchWrap}>
              <Search size={15} color="#94a3b8" />
              <input
                className={styles.searchInput}
                placeholder="Search food name, city, donor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className={styles.filterSelect}
              value={foodTypeFilter}
              onChange={(e) => setFoodTypeFilter(e.target.value)}
            >
              <option value="all">All Dietary Types</option>
              <option value="veg">Vegetarian</option>
              <option value="non_veg">Non-Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>

            <select
              className={styles.filterSelect}
              value={minServings}
              onChange={(e) => setMinServings(Number(e.target.value))}
            >
              <option value={0}>Any Quantity</option>
              <option value={10}>10+ servings</option>
              <option value={25}>25+ servings</option>
              <option value={50}>50+ servings</option>
            </select>

            <select
              className={styles.filterSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="newest">Newest Donations</option>
              <option value="distance">Nearest First</option>
              <option value="deadline">Earliest Deadline</option>
            </select>
          </div>

          {loading ? (
            <div className={styles.emptyPanel}>
              <Loader2 size={28} className="animate-spin" color="#EA580C" />
              <p>Loading available donor food...</p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className={styles.emptyPanel}>
              <Package size={36} color="#CBD5E1" />
              <h3>No available food nearby right now</h3>
              <p>
                Post an open Food Request so nearby donors and restaurants know what your community needs today.
              </p>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => {
                  setActiveTab('requests');
                  setShowCreateForm(true);
                }}
              >
                <Plus size={15} /> Create Food Request
              </button>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {filteredListings.map((listing) => {
                // Privacy protection: display approximate area (city) before acceptance
                const approxArea = listing.city || 'Nearby Pickup Zone';
                const isDirectBusy = busyId === `${listing.id}:direct_collection`;
                const isRiderBusy = busyId === `${listing.id}:rider_delivery`;

                return (
                  <div key={listing.id} className={styles.card}>
                    <div className={styles.cardImgWrap}>
                      {listing.imageUrl ? (
                        <img
                          src={listing.imageUrl}
                          alt={listing.title}
                          className={styles.cardImg}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.cardImgFallback}>🍲</div>
                      )}
                      <span className={styles.cardImgBadge}>
                        {listing.foodType === 'veg'
                          ? '● Veg'
                          : listing.foodType === 'vegan'
                          ? '● Vegan'
                          : '● Non-Veg'}
                      </span>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.cardTitleRow}>
                        <h3 className={styles.cardTitle}>{listing.title}</h3>
                        <span className={`${styles.pill} ${styles.pillGreen}`}>AVAILABLE</span>
                      </div>

                      <div className={styles.metaGrid}>
                        <span className={styles.metaItem}>
                          <Users size={13} color="#EA580C" />
                          <strong>{listing.availableServings}</strong> servings
                        </span>
                        <span className={styles.metaItem}>
                          <MapPin size={13} color="#EA580C" />
                          {approxArea}
                          {listing.distanceKm != null ? ` · ${listing.distanceKm} km` : ''}
                        </span>
                        <span className={styles.metaItem}>
                          <Clock size={13} color="#64748B" />
                          Collect{' '}
                          {formatDistanceToNow(new Date(listing.availableUntil), { addSuffix: true })}
                        </span>
                      </div>

                      <div style={{ fontSize: 12.5, color: '#64748b' }}>
                        Donor: <strong>{listing.donor?.organizationName || listing.donor?.name || 'Verified Food Donor'}</strong>
                        {listing.createdAt && (
                          <> · Posted {new Date(listing.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                        )}
                      </div>

                      <div className={styles.cardActions}>
                        <Link to={`/donations/${listing.id}`} className={styles.outlineBtn}>
                          <Eye size={14} /> View Details
                        </Link>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          data-testid="accept-direct-btn"
                          disabled={Boolean(busyId)}
                          onClick={() => handleAcceptListing(listing, 'direct_collection')}
                          style={{ padding: '8px 12px', fontSize: 12.5 }}
                        >
                          {isDirectBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Accept Direct Collection
                        </button>
                        <button
                          type="button"
                          className={styles.outlineBtn}
                          disabled={Boolean(busyId)}
                          onClick={() => handleAcceptListing(listing, 'rider_delivery')}
                          style={{ padding: '8px 12px', fontSize: 12.5 }}
                        >
                          {isRiderBusy ? <Loader2 size={14} className="animate-spin" /> : <Bike size={14} />}
                          Request Rider Delivery
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* TAB 2: MY FOOD REQUESTS */
        <>
          {loading ? (
            <div className={styles.emptyPanel}>
              <Loader2 size={28} className="animate-spin" color="#EA580C" />
              <p>Loading your food requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className={styles.emptyPanel}>
              <Package size={36} color="#CBD5E1" />
              <h3>No NGO food requests posted yet</h3>
              <p>
                Create a food request specifying how many people need meals, dietary preference, and pickup window.
              </p>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setShowCreateForm(true)}
              >
                <Plus size={15} /> Create First Food Request
              </button>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {requests.map((req) => {
                const pct =
                  req.requiredQuantity > 0
                    ? Math.min(100, Math.round((req.fulfilledQuantity / req.requiredQuantity) * 100))
                    : 0;
                const statusTone =
                  req.status === 'FULFILLED'
                    ? styles.pillGreen
                    : req.status === 'PARTIALLY_FULFILLED'
                    ? styles.pillBlue
                    : req.status === 'CANCELLED' || req.status === 'EXPIRED'
                    ? styles.pillMuted
                    : styles.pillOrange;

                return (
                  <div key={req.id} className={styles.card}>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTitleRow}>
                        <h3 className={styles.cardTitle}>{req.title}</h3>
                        <span className={`${styles.pill} ${statusTone}`}>
                          {req.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className={styles.metaGrid}>
                        <span className={styles.metaItem}>
                          <Users size={13} color="#EA580C" /> {req.peopleCount} people
                        </span>
                        <span className={styles.metaItem}>
                          <Package size={13} color="#EA580C" /> {req.requiredQuantity} {req.quantityUnit}
                        </span>
                        <span className={styles.metaItem}>
                          <Clock size={13} color="#64748B" />
                          {req.neededBy
                            ? `Needed ${formatDistanceToNow(new Date(req.neededBy), { addSuffix: true })}`
                            : 'Flexible timing'}
                        </span>
                      </div>

                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: '#64748b',
                            marginBottom: 4,
                          }}
                        >
                          <span>Confirmed Fulfillment</span>
                          <strong>
                            {req.fulfilledQuantity} / {req.requiredQuantity} {req.quantityUnit} ({pct}%)
                          </strong>
                        </div>
                        <div className={styles.progressTrack}>
                          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      {req.address && (
                        <div style={{ fontSize: 12.5, color: '#64748b', display: 'flex', gap: 5, alignItems: 'center' }}>
                          <MapPin size={12} color="#EA580C" /> {req.address}
                        </div>
                      )}

                      {(req.status === 'OPEN' || req.status === 'PARTIALLY_FULFILLED') && (
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.outlineBtn}
                            onClick={() => handleStartEdit(req)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() => handleCancelRequest(req)}
                          >
                            <Trash2 size={13} /> Cancel Request
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
