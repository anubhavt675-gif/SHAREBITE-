import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Utensils, Users, Leaf, ArrowRight, Plus, MapPin,
  Clock, Phone, MessageSquare, CheckCircle, Navigation,
  Bike, RefreshCw, Loader2, Sparkles, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DonationService } from '../../services/donations';
import { ImpactService } from '../../services/impact';
import { ClaimsService, type DeliveryTask } from '../../services/claims';
import { ChatService } from '../../services/chat';
import { NGOService } from '../../services/ngo';
import { NGOOperationsService, type NGOFoodRequest } from '../../services/ngoOperations';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import { formatDistanceToNow } from 'date-fns';
import type { FoodListing, ImpactStats, NearbyNGO } from '../../types';
import styles from './DonorDashboardPage.module.css';

interface DonorLiveTask extends DeliveryTask {
  pickupCode?: string;
  riderUserId?: string;
}

interface DonorDashboardProps {
  // Optional props
}

export default function DonorDashboardPage(_props: DonorDashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;

  const [listings, setListings] = useState<FoodListing[]>([]);
  const [activeTasks, setActiveTasks] = useState<DonorLiveTask[]>([]);
  const [nearbyNgos, setNearbyNgos] = useState<NearbyNGO[]>([]);
  const [openNgoRequests, setOpenNgoRequests] = useState<NGOFoodRequest[]>([]);
  const [impact, setImpact] = useState<ImpactStats | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const userLocationRef = useRef(user?.location);

  useEffect(() => {
    userLocationRef.current = user?.location;
  }, [user?.location]);

  const fetchDonorData = useCallback(async (isSilent = false) => {
    if (!userId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [listingsData, impactData, donorDashboardRows, openReqs] = await Promise.all([
        DonationService.getMyListings(userId),
        ImpactService.getUserImpact(userId, 'donor'),
        ClaimsService.getDonorDashboardListings(userId),
        NGOOperationsService.getOpenFoodRequests().catch(() => [] as NGOFoodRequest[]),
      ]);

      setListings(listingsData);
      setImpact(impactData);
      setOpenNgoRequests(openReqs);

      // Extract active delivery tasks with real coordinates, codes & rider details
      const liveTasks: DonorLiveTask[] = [];
      for (const row of donorDashboardRows) {
        if (
          row.delivery_task_id &&
          ['rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit', 'delivered'].includes(row.delivery_status)
        ) {
          liveTasks.push({
            id: row.delivery_task_id,
            foodListingId: row.id,
            donorId: row.donor_id,
            ngoId: row.ngo_id || undefined,
            assignmentType: row.assignment_type,
            foodTitle: row.title,
            servingsRequired: row.servings_claimed || row.servings || 1,
            quantityUnit: 'servings',
            status: row.delivery_status,
            pickupAddress: row.pickup_address,
            pickupLat: row.latitude,
            pickupLng: row.longitude,
            dropoffAddress: row.dropoff_address,
            dropoffLat: row.dropoff_lat,
            dropoffLng: row.dropoff_lng,
            pickupCode: row.pickup_code || undefined,
            riderUserId: row.rider_user_id || undefined,
            riderName: row.rider_name || 'Assigned Rider',
            riderPhone: row.rider_phone || undefined,
            ngoName: row.ngo_name || (row.assignment_type === 'rider_direct_pickup' ? 'Community Relief Dropoff' : 'Accepted NGO'),
            createdAt: row.created_at,
            updatedAt: row.updated_at || new Date().toISOString(),
            incidentReported: false,
          });
        }
      }
      setActiveTasks(liveTasks);

      // Load real nearby verified NGOs based on donor's latest listing or profile location
      const refLat = listingsData.find((l) => l.latitude)?.latitude ?? userLocationRef.current?.latitude;
      const refLng = listingsData.find((l) => l.longitude)?.longitude ?? userLocationRef.current?.longitude;
      if (typeof refLat === 'number' && typeof refLng === 'number' && refLat !== 0 && refLng !== 0) {
        NGOService.getNearbyNGOs(refLat, refLng, 20, true).then(setNearbyNgos).catch(() => {});
      }
    } catch (err) {
      console.warn('Error loading donor dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const fetchDonorDataRef = useRef(fetchDonorData);
  useEffect(() => {
    fetchDonorDataRef.current = fetchDonorData;
  }, [fetchDonorData]);

  useEffect(() => {
    fetchDonorDataRef.current(false);

    if (!userId) return;
    // Subscribe to donor listings & task updates
    const sub = ClaimsService.subscribeToDonorListings(userId, () => {
      fetchDonorDataRef.current(true);
    });

    const refreshUnread = () => {
      ChatService.getTotalUnreadCount(userId)
        .then(setUnreadChatCount)
        .catch(() => {});
    };
    refreshUnread();
    const chatSub = ChatService.subscribeToUserConversations(userId, refreshUnread);

    return () => {
      sub.unsubscribe();
      chatSub.unsubscribe();
    };
  }, [userId]);

  const handleOpenChat = async (task: DonorLiveTask) => {
    if (!userId) return;
    const recipientId = task.riderUserId || task.ngoId;
    if (!recipientId) {
      navigate('/chat');
      return;
    }
    try {
      const conv = await ChatService.openDeliveryConversation(userId, recipientId, {
        relatedListingId: task.foodListingId,
        relatedTaskId: task.id,
        title: task.foodTitle || 'Pickup Coordination',
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      navigate('/chat');
    }
  };

  // Donations waiting for acceptance
  const waitingDonations = useMemo(() => {
    return listings.filter(l => l.status === 'available' || l.status === 'partially_reserved');
  }, [listings]);

  // Completed/past donations
  const completedDonations = useMemo(() => {
    return listings.filter(l => l.status === 'completed' || l.status === 'picked_up');
  }, [listings]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <Loader2 size={36} className="animate-spin" style={{ color: '#ea580c', margin: '0 auto 16px' }} />
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading your donor command center...</p>
      </div>
    );
  }

  const firstName = user?.name ? user.name.split(' ')[0] : 'Food Donor';

  return (
    <div className={styles.page}>
      {/* ── 1. Hero Banner ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <div className={styles.roleBadge}>
            <Sparkles size={14} /> Food Donor Hub
          </div>
          <h1 className={styles.heroTitle}>Hello, {firstName}!</h1>
          <p className={styles.heroSubtitle}>
            Your kitchen surplus connects with local orphanages, shelters, and relief kitchens.
            Track your rider live and verify pickup handovers in real time.
          </p>
          <div className={styles.heroActions}>
            <Link to="/donations/new" className={styles.donateBtn}>
              <Plus size={18} strokeWidth={2.5} /> Donate Surplus Food
            </Link>
            <Link to="/donor-donations" className={styles.historyBtn}>
              <Utensils size={16} /> All Donations & History
            </Link>
          </div>
        </div>
      </div>

      {/* ── Live Order Accepted & Rider Coming Notification Banner ── */}
      {activeTasks.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #fff7ed 100%)',
            border: '1.5px solid #22c55e',
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
            boxShadow: '0 6px 20px rgba(22, 163, 74, 0.1)',
          }}
          role="status"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 240 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#dcfce7',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Bike size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#14532d', marginBottom: 2 }}>
                🛵 Order Accepted! Rider is Coming to Pick Up Your Order
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                <strong>{activeTasks[0].riderName || 'Assigned Rider'}</strong> has accepted{' '}
                <strong>{activeTasks[0].foodTitle}</strong> ({activeTasks[0].servingsRequired} servings) and is
                heading to {activeTasks[0].pickupAddress || 'your pickup location'}.
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6,
                  background: '#ffffff',
                  border: '1.5px solid #86efac',
                  padding: '4px 12px',
                  borderRadius: 8,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
                  🔑 Handover Code:
                </span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: '#15803d',
                    letterSpacing: 2.5,
                    fontFamily: 'monospace',
                  }}
                >
                  {activeTasks[0].pickupCode || ClaimsService.derivePickupCode(activeTasks[0].foodListingId || activeTasks[0].id)}
                </span>
                <span style={{ fontSize: 11.5, color: '#4b5563' }}>
                  (Share with rider upon arrival)
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleOpenChat(activeTasks[0])}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 10,
                border: '1px solid #16a34a',
                background: '#16a34a',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <MessageSquare size={14} /> Chat with Rider
              {unreadChatCount > 0 && (
                <span
                  style={{
                    background: '#ffffff',
                    color: '#15803d',
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 999,
                    marginLeft: 2,
                  }}
                >
                  {unreadChatCount}
                </span>
              )}
            </button>
            {activeTasks[0].riderPhone && (
              <a
                href={`tel:${activeTasks[0].riderPhone}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 14px',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                  background: '#ffffff',
                  color: '#15803d',
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                <Phone size={14} /> Call Rider
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── 2. Impact Metrics Strip ── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#ffedd5', color: '#ea580c' }}>
            <Utensils size={22} />
          </div>
          <div>
            <div className={styles.statValue}>{impact?.mealsSaved ?? listings.reduce((acc, l) => acc + (l.servings || 0), 0)}</div>
            <div className={styles.statLabel}>Meals Donated</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#dcfce7', color: '#16a34a' }}>
            <Leaf size={22} />
          </div>
          <div>
            <div className={styles.statValue}>{impact?.foodRedistributedKg ?? 0} kg</div>
            <div className={styles.statLabel}>Food Rescued</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
            <Users size={22} />
          </div>
          <div>
            <div className={styles.statValue}>{impact?.peopleReached ?? 0}</div>
            <div className={styles.statLabel}>People Reached</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <Bike size={22} />
          </div>
          <div>
            <div className={styles.statValue}>{activeTasks.length}</div>
            <div className={styles.statLabel}>Active Rider Deliveries</div>
          </div>
        </div>
      </div>

      {/* ── 3. ZOMATO-STYLE LIVE RIDER TRACKING (When a rider is assigned) ── */}
      {activeTasks.length > 0 && (
        <section className={styles.liveTrackingSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.pulseDot} /> Live Rider Tracking (Zomato-Style)
            </h2>
            <button
              onClick={() => fetchDonorData(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              title="Refresh tracking"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {activeTasks.map((task) => {
            const matchedListing = listings.find((l) => l.id === task.foodListingId);
            const thumbUrl = matchedListing?.imageUrl || task.foodImageUrl;

            return (
              <div
                key={task.id}
                className={styles.liveCard}
                style={{
                  background: '#fffcf8',
                  border: '1px solid #f1e4d3',
                  borderRadius: 22,
                  padding: '20px 22px',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
                }}
              >
                {/* Top Food Info & Live Tracking Pill Header (Matches Reference Design) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 14,
                    marginBottom: 14,
                    paddingBottom: 14,
                    borderBottom: '1px solid #f5ece0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={task.foodTitle}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 14,
                          objectFit: 'cover',
                          border: '1px solid #fed7aa',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 14,
                          background: '#fff7ed',
                          border: '1px solid #fed7aa',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
                          flexShrink: 0,
                        }}
                      >
                        🍱
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 19,
                          fontWeight: 800,
                          color: '#0f172a',
                          lineHeight: 1.25,
                        }}
                      >
                        {task.foodTitle || 'Fresh Food Donation'}
                      </h3>
                      <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                        {task.servingsRequired} people can eat · Donated{' '}
                        {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#fff3e6',
                      color: '#c2410c',
                      border: '1px solid #fed7aa',
                      borderRadius: 999,
                      padding: '7px 16px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: '#ea580c',
                        boxShadow: '0 0 0 3px rgba(234, 88, 12, 0.2)',
                      }}
                    />
                    <span>Live Tracking</span>
                  </div>
                </div>

                {/* Split Zomato-Style Embedded Live Map + Right Tracking Info Panel */}
                <LiveTrackingMap
                  deliveryTaskId={task.id}
                  taskStatus={task.status}
                  pickupLat={task.pickupLat}
                  pickupLng={task.pickupLng}
                  pickupLabel={task.pickupAddress || 'Your Pickup Location'}
                  dropoffLat={task.dropoffLat}
                  dropoffLng={task.dropoffLng}
                  dropoffLabel={task.ngoName || 'Destination'}
                  viewerRole="donor"
                  riderName={task.riderName || 'Assigned Rider'}
                  riderPhone={task.riderPhone}
                  donorName={user?.name || 'Food Donor'}
                  assignedAt={task.createdAt}
                  updatedAt={task.updatedAt}
                  onOpenChat={() => handleOpenChat(task)}
                  showTrackingPanel={true}
                  height={330}
                />

                {/* Pickup Verification Code Box - ALWAYS shown so donor has full verification authority */}
                {(() => {
                  const resolvedCode = task.pickupCode || ClaimsService.derivePickupCode(task.foodListingId || task.id);
                  return (
                    <div className={styles.pickupCodeBox} style={{ marginTop: 14 }}>
                      <div className={styles.codeExplainer}>
                        <strong>🔑 Food Handover Verification Code</strong>
                        Tell this 6-character code to rider <strong>{task.riderName || 'Rider'}</strong> when they arrive at your location to verify and release the food.
                      </div>
                      <div className={styles.secretCode}>{resolvedCode}</div>
                    </div>
                  );
                })()}

                {/* Route & Dropoff Information */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    color: '#4b5563',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    padding: '11px 16px',
                    borderRadius: 12,
                    marginTop: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Navigation size={15} color="#ea580c" />
                    <span>
                      <strong>Destination:</strong> {task.ngoName}
                    </span>
                  </div>
                  <div>
                    <Link
                      to="/donor-donations"
                      style={{ color: '#ea580c', fontWeight: 700, textDecoration: 'none' }}
                    >
                      View Full Lifecycle Details &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ── 4. Available / Waiting for Rider Section ── */}
      <section style={{ marginBottom: 32 }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <Clock size={20} color="#ea580c" /> Available Donations ({waitingDonations.length})
          </h2>
          <Link to="/donations/new" style={{ color: '#ea580c', fontWeight: 600, fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={16} /> New Donation
          </Link>
        </div>

        {waitingDonations.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🍱</div>
            <h3 className={styles.emptyTitle}>No active listings right now</h3>
            <p className={styles.emptySubtitle}>
              Have surplus cooked meals, fresh groceries, or bakery items? Publish a donation in under 2 minutes.
            </p>
            <Link to="/donations/new" className={styles.donateBtn}>
              <Plus size={16} /> Donate Food Now
            </Link>
          </div>
        ) : (
          <div className={styles.donationsGrid}>
            {waitingDonations.map(listing => (
              <div key={listing.id} className={styles.donationCard}>
                <div className={styles.cardTop}>
                  {listing.imageUrl ? (
                    <img src={listing.imageUrl} alt={listing.title} className={styles.cardImg} />
                  ) : (
                    <div className={styles.cardImgPlaceholder}>🥗</div>
                  )}
                  <span className={`${styles.cardStatusBadge} ${styles.statusWaiting}`}>
                    Waiting for Rider
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{listing.title}</h3>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <Users size={14} /> {listing.availableServings} servings
                    </span>
                    <span className={styles.metaItem}>
                      <MapPin size={14} /> {listing.city || 'Pickup location set'}
                    </span>
                    <span className={styles.metaItem}>
                      <Clock size={14} /> Available until {new Date(listing.availableUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={styles.cardFooter}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      Listed {formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}
                    </span>
                    <Link to={`/donations/${listing.id}`} className={styles.viewDetailsLink}>
                      Details <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Active NGO Food Requests (Real Supabase Data) ── */}
      {openNgoRequests.length > 0 && (
        <section style={{ marginBottom: 32 }} data-testid="donor-ngo-requests-section">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <Users size={20} color="#ea580c" /> Active NGO Food Requests ({openNgoRequests.length})
            </h2>
            <Link to="/donations/new" style={{ color: '#ea580c', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Donate to Fulfill &rarr;
            </Link>
          </div>
          <div className={styles.donationsGrid}>
            {openNgoRequests.slice(0, 3).map((req) => (
              <div key={req.id} className={styles.donationCard}>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{req.title}</h3>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <Utensils size={14} /> {req.requiredQuantity} {req.quantityUnit} · {req.foodType}
                    </span>
                    {req.ngoName && (
                      <span className={styles.metaItem}>
                        <ShieldCheck size={14} color="#16a34a" /> {req.ngoName}
                      </span>
                    )}
                    {req.city && (
                      <span className={styles.metaItem}>
                        <MapPin size={14} /> {req.city}
                      </span>
                    )}
                  </div>
                  <div className={styles.cardFooter}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: req.urgency === 'urgent' || req.urgency === 'high' ? '#dc2626' : '#ea580c', textTransform: 'uppercase' }}>
                      {req.urgency} priority
                    </span>
                    <Link to="/donations/new" className={styles.viewDetailsLink}>
                      Fulfill Request <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Nearby Verified NGOs Strip (Real Supabase data) ── */}
      {nearbyNgos.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <ShieldCheck size={20} color="#16a34a" /> Nearby Verified NGOs ({nearbyNgos.length})
            </h2>
            <Link to="/ngos" style={{ color: '#ea580c', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              View NGO Map &rarr;
            </Link>
          </div>
          <div className={styles.donationsGrid}>
            {nearbyNgos.slice(0, 3).map((ngo) => (
              <div key={ngo.id} className={styles.donationCard}>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{ngo.organizationName || ngo.fullName}</h3>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <MapPin size={14} /> {ngo.distanceKm} km away · {ngo.city || ngo.address || 'Nearby'}
                    </span>
                    {ngo.operatingHours && (
                      <span className={styles.metaItem}>
                        <Clock size={14} /> {ngo.operatingHours}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. Completed Donations History Preview ── */}
      {completedDonations.length > 0 && (
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <CheckCircle size={20} color="#16a34a" /> Completed Rescues ({completedDonations.length})
            </h2>
            <Link to="/donor-donations" style={{ color: '#ea580c', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              View All History &rarr;
            </Link>
          </div>

          <div className={styles.donationsGrid}>
            {completedDonations.slice(0, 3).map(listing => (
              <div key={listing.id} className={styles.donationCard}>
                <div className={styles.cardTop}>
                  {listing.imageUrl ? (
                    <img src={listing.imageUrl} alt={listing.title} className={styles.cardImg} />
                  ) : (
                    <div className={styles.cardImgPlaceholder}>✅</div>
                  )}
                  <span className={`${styles.cardStatusBadge} ${styles.statusDelivered}`}>
                    Delivered & Served
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{listing.title}</h3>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px 0' }}>
                    {listing.servings} meals safely transported by rider to local community beneficiaries.
                  </p>
                  <div className={styles.cardFooter}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                      ✓ Successfully Handed Over
                    </span>
                    <Link to={`/donations/${listing.id}`} className={styles.viewDetailsLink}>
                      View <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
