import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Bike,
  Users,
  Leaf,
  MapPin,
  ChevronRight,
  Clock,
  CheckCircle2,
  Zap,
  BarChart2,
  Loader2,
  Maximize2,
  X,
  Phone,
  MessageSquare,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import {
  NGOOperationsService,
  type NGODashboardStats,
  type NGOActivityItem,
} from '../../services/ngoOperations';
import { type NgoClaim } from '../../services/claims';
import { ChatService } from '../../services/chat';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import ngoVolunteersPhoto from '../../assets/ngo_volunteers_photo.jpg';
import styles from './NGODashboardPage.module.css';

function getCollectionBadge(claim: NgoClaim): {
  label: string;
  tone: 'blue' | 'amber' | 'green' | 'orange';
  subtext: string;
} {
  const ds = claim.deliveryStatus || claim.status;
  if (claim.collectionMethod === 'direct_ngo_pickup') {
    if (claim.status === 'food_collected' || claim.status === 'delivered') {
      return { label: 'Food Collected', tone: 'green', subtext: 'Direct Collection' };
    }
    return { label: 'Direct Pickup', tone: 'orange', subtext: 'Collect Now' };
  }
  if (ds === 'delivered' || ds === 'arrived_at_pickup') {
    return { label: 'Rider Arrived', tone: 'amber', subtext: 'Collect Now' };
  }
  if (ds === 'food_collected' || ds === 'in_transit') {
    return { label: 'Food Collected', tone: 'green', subtext: 'Heading to NGO' };
  }
  if (ds === 'going_to_pickup' || ds === 'rider_assigned') {
    return { label: 'On the Way', tone: 'blue', subtext: claim.riderName ? `Rider: ${claim.riderName}` : 'Rider Assigned' };
  }
  return { label: 'Awaiting Rider', tone: 'orange', subtext: 'Matching Rider' };
}

export default function NGODashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;

  const [stats, setStats] = useState<NGODashboardStats>({
    availableFoodCount: 0,
    availableTodayCount: 0,
    activeCollectionsCount: 0,
    peopleFedThisMonth: 0,
    peopleFedIsEstimated: false,
    foodSavedKg: 0,
    foodSavedIsEstimated: false,
  });
  const [activeCollections, setActiveCollections] = useState<NgoClaim[]>([]);
  const [recentActivity, setRecentActivity] = useState<NGOActivityItem[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const bundle = await NGOOperationsService.getDashboardBundle(userId);
        setStats(bundle.stats);
        setActiveCollections(bundle.activeCollections);
        setRecentActivity(bundle.recentActivity);
        setSelectedClaimId((prev) => {
          if (prev && bundle.activeCollections.some((c) => c.id === prev)) return prev;
          const withTask = bundle.activeCollections.find((c) => Boolean(c.deliveryTaskId));
          return withTask?.id || bundle.activeCollections[0]?.id || null;
        });
      } catch (e: any) {
        if (!silent) setError(e?.message || 'Could not load NGO dashboard data.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [userId]
  );

  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    loadDataRef.current(false);
    if (!userId) return;
    const sub = NGOOperationsService.subscribeToNgoPortal(userId, () => {
      loadDataRef.current(true);
    });
    return () => {
      sub.unsubscribe();
    };
  }, [userId]);

  const selectedCollection =
    activeCollections.find((c) => c.id === selectedClaimId) || activeCollections[0] || null;

  const handleOpenChat = async (claim: NgoClaim) => {
    if (!userId) return;
    const peerId =
      claim.collectionMethod === 'direct_ngo_pickup'
        ? claim.donorId
        : claim.donorId;
    if (!peerId) {
      navigate('/chat');
      return;
    }
    try {
      const conv = await ChatService.openDeliveryConversation(userId, peerId, {
        relatedListingId: claim.foodListingId,
        relatedTaskId: claim.deliveryTaskId,
        title: claim.foodTitle || 'NGO Collection',
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      navigate('/chat');
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <Loader2 size={32} className="animate-spin" style={{ color: '#EA580C' }} />
        <p>Loading your NGO command center...</p>
      </div>
    );
  }

  const orgName = user?.organizationName || user?.name || 'NGO Partner';

  return (
    <div className={styles.page}>
      {error && (
        <div className={styles.errorBanner} role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => loadData(false)} className={styles.retryBtn}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* ─── Welcome Banner (Exact Reference Match) ─── */}
      <section className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <h1 className={styles.welcomeTitle}>
            Hello, {orgName}! <span aria-hidden="true">👋</span>
          </h1>
          <p className={styles.welcomeSub}>
            Collect food, reduce waste and feed those in need. <span aria-hidden="true">❤️</span>
          </p>
        </div>
        <div className={styles.welcomeArtWrap}>
          <img
            src={ngoVolunteersPhoto}
            alt="ShareBite NGO food handover"
            className={styles.welcomeArtImg}
          />
        </div>
      </section>

      {/* ─── 4 Real KPI Statistic Cards ─── */}
      <section className={styles.statsGrid}>
        <Link to="/ngo/food-requests" className={`${styles.statCard} ${styles.statCardPeach}`}>
          <div className={`${styles.statIconCircle} ${styles.iconCoral}`}>
            <Package size={22} />
          </div>
          <div className={styles.statText}>
            <div className={styles.statValue} data-testid="ngo-kpi-available">{stats.availableFoodCount}</div>
            <div className={styles.statLabel}>Available Food</div>
            <div className={styles.statMetaGreen}>
              ↑ +{stats.availableTodayCount} today
            </div>
          </div>
        </Link>

        <Link to="/ngo/collections" className={`${styles.statCard} ${styles.statCardMint}`}>
          <div className={`${styles.statIconCircle} ${styles.iconGreen}`}>
            <Bike size={22} />
          </div>
          <div className={styles.statText}>
            <div className={styles.statValue}>{stats.activeCollectionsCount}</div>
            <div className={styles.statLabel}>Active Collections</div>
            <div className={styles.statMetaMuted}>In Progress</div>
          </div>
        </Link>

        <Link to="/ngo/reports" className={`${styles.statCard} ${styles.statCardSky}`}>
          <div className={`${styles.statIconCircle} ${styles.iconBlue}`}>
            <Users size={22} />
          </div>
          <div className={styles.statText}>
            <div className={styles.statValue}>{stats.peopleFedThisMonth.toLocaleString('en-IN')}</div>
            <div className={styles.statLabel}>People Fed</div>
            <div className={styles.statMetaMuted}>
              This Month{stats.peopleFedIsEstimated ? ' (est.)' : ''}
            </div>
          </div>
        </Link>

        <Link to="/ngo/received-food" className={`${styles.statCard} ${styles.statCardLavender}`}>
          <div className={`${styles.statIconCircle} ${styles.iconPurple}`}>
            <Leaf size={22} />
          </div>
          <div className={styles.statText}>
            <div className={styles.statValue}>{stats.foodSavedKg} kg</div>
            <div className={styles.statLabel}>Food Saved</div>
            <div className={styles.statMetaMuted}>
              From Waste{stats.foodSavedIsEstimated ? ' (est.)' : ''}
            </div>
          </div>
        </Link>
      </section>

      {/* ─── Middle 2-Column Split: Active Collections + Live Collection Tracking ─── */}
      <section className={styles.midGrid}>
        {/* Active Collections */}
        <div className={styles.panelCard}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              <Bike size={19} color="#EA580C" /> Active Collections
            </h2>
            <Link to="/ngo/collections" className={styles.viewAllLink}>
              View All →
            </Link>
          </div>

          {activeCollections.length === 0 ? (
            <div className={styles.emptyBox}>
              <Package size={32} color="#CBD5E1" />
              <p className={styles.emptyTitle}>No active collections right now</p>
              <span className={styles.emptySub}>
                Browse available nearby food donations or post a food request to start a collection.
              </span>
              <Link to="/ngo/food-requests" className={styles.emptyActionBtn}>
                Browse Available Food
              </Link>
            </div>
          ) : (
            <div className={styles.collectionList}>
              {activeCollections.slice(0, 4).map((claim) => {
                const badge = getCollectionBadge(claim);
                const isSelected = selectedCollection?.id === claim.id;

                return (
                  <div
                    key={claim.id}
                    className={`${styles.collectionRow} ${isSelected ? styles.collectionRowSelected : ''}`}
                    onClick={() => setSelectedClaimId(claim.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedClaimId(claim.id);
                    }}
                  >
                    <div className={styles.collectionThumbWrap}>
                      {claim.foodImageUrl ? (
                        <img
                          src={claim.foodImageUrl}
                          alt={claim.foodTitle || 'Food'}
                          className={styles.collectionThumb}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.collectionThumbFallback}>🍱</div>
                      )}
                    </div>

                    <div className={styles.collectionInfo}>
                      <div className={styles.collectionTitle}>
                        {claim.foodTitle || 'Food Donation'}
                      </div>
                      <div className={styles.collectionDonor}>
                        Donor: {claim.donorName || 'Verified Donor'} · {claim.servingsClaimed} servings
                      </div>
                      <div className={styles.collectionAddr}>
                        <MapPin size={12} color="#EA580C" />
                        <span>{claim.pickupAddress || 'Pickup location assigned'}</span>
                      </div>
                    </div>

                    <div className={styles.collectionRight}>
                      <span className={`${styles.statusPill} ${styles[`pill_${badge.tone}`]}`}>
                        {badge.label}
                      </span>
                      <span className={styles.collectionSubMeta}>{badge.subtext}</span>
                    </div>

                    <ChevronRight size={16} color="#94A3B8" className={styles.rowArrow} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Collection Tracking */}
        <div className={styles.panelCard}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              <span className={styles.orangePinDot} /> Live Collection Tracking
            </h2>
            {selectedCollection && (
              <button
                type="button"
                className={styles.expandMapBtn}
                onClick={() => setFullscreenMap(true)}
                title="Expand live tracking map"
                aria-label="Fullscreen map"
              >
                <Maximize2 size={15} />
              </button>
            )}
          </div>

          {selectedCollection && selectedCollection.deliveryTaskId ? (
            <div className={styles.mapPanelWrap}>
              <LiveTrackingMap
                deliveryTaskId={selectedCollection.deliveryTaskId}
                taskStatus={selectedCollection.deliveryStatus || selectedCollection.status}
                pickupLat={selectedCollection.pickupLat}
                pickupLng={selectedCollection.pickupLng}
                pickupLabel={selectedCollection.pickupAddress || 'Donor Pickup'}
                dropoffLat={selectedCollection.dropoffLat ?? user?.location?.latitude}
                dropoffLng={selectedCollection.dropoffLng ?? user?.location?.longitude}
                dropoffLabel={`Our NGO (${orgName})`}
                viewerRole="donor"
                riderName={selectedCollection.riderName || 'Assigned Rider'}
                riderPhone={selectedCollection.riderPhone}
                donorName={selectedCollection.donorName}
                assignedAt={selectedCollection.createdAt}
                updatedAt={selectedCollection.updatedAt}
                onOpenChat={() => handleOpenChat(selectedCollection)}
                showTrackingPanel={false}
                height={240}
              />

              <div className={styles.trackingRiderBar}>
                <div className={styles.trackingRiderLeft}>
                  <div className={styles.riderAvatarCircle}>
                    {(selectedCollection.riderName || 'R').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className={styles.riderBarName}>
                      {selectedCollection.riderName || 'Matching Nearby Rider'}
                    </div>
                    <div className={styles.riderBarSub}>
                      {selectedCollection.deliveryStatus === 'in_transit' ||
                      selectedCollection.deliveryStatus === 'food_collected'
                        ? 'Heading to your NGO facility'
                        : 'Collecting food from donor'}
                    </div>
                  </div>
                </div>
                <div className={styles.trackingRiderActions}>
                  <button
                    type="button"
                    onClick={() => handleOpenChat(selectedCollection)}
                    className={styles.iconCircleBtn}
                    title="Message about this collection"
                    aria-label="Message"
                  >
                    <MessageSquare size={16} />
                  </button>
                  {selectedCollection.riderPhone && (
                    <a
                      href={`tel:${selectedCollection.riderPhone}`}
                      className={styles.iconCircleBtnPrimary}
                      title="Call assigned rider"
                      aria-label="Call rider"
                    >
                      <Phone size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : selectedCollection ? (
            <div className={styles.directNoticeBox}>
              <div className={styles.directIconWrap}>
                <Package size={26} color="#EA580C" />
              </div>
              <h3 className={styles.directTitle}>Direct NGO Collection Active</h3>
              <p className={styles.directDesc}>
                <strong>{selectedCollection.foodTitle}</strong> ({selectedCollection.servingsClaimed} servings) is
                assigned for direct collection by your NGO staff at{' '}
                <strong>{selectedCollection.pickupAddress || 'donor location'}</strong>.
              </p>
              <div className={styles.directBtnRow}>
                <Link to="/ngo/collections" className={styles.emptyActionBtn}>
                  Manage Collection
                </Link>
                <button
                  type="button"
                  onClick={() => handleOpenChat(selectedCollection)}
                  className={styles.secondaryBtn}
                >
                  <MessageSquare size={14} /> Message Donor
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyBox}>
              <MapPin size={32} color="#CBD5E1" />
              <p className={styles.emptyTitle}>No active delivery being tracked</p>
              <span className={styles.emptySub}>
                Live rider GPS tracking appears here automatically once a rider-assisted collection is in progress.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ─── Bottom 2-Column Split: Recent Activity + Quick Actions ─── */}
      <section className={styles.bottomGrid}>
        {/* Recent Activity */}
        <div className={styles.panelCard}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              <Clock size={18} color="#EA580C" /> Recent Activity
            </h2>
            <Link to="/notifications" className={styles.viewAllLink}>
              View All →
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <div className={styles.emptyActivity}>
              No recent operations recorded yet. Activity updates automatically as your NGO posts requests, claims food, and logs distributions.
            </div>
          ) : (
            <div className={styles.activityList}>
              {recentActivity.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  to={item.actionUrl || '/ngo/collections'}
                  className={styles.activityRow}
                >
                  <div
                    className={`${styles.activityDotIcon} ${
                      item.kind === 'food_collected' || item.kind === 'delivery_completed' || item.kind === 'food_distributed'
                        ? styles.actGreen
                        : item.kind === 'rider_assigned'
                        ? styles.actOrange
                        : styles.actAmber
                    }`}
                  >
                    {item.kind === 'food_collected' || item.kind === 'delivery_completed' || item.kind === 'food_distributed' ? (
                      <CheckCircle2 size={14} />
                    ) : item.kind === 'rider_assigned' ? (
                      <Bike size={14} />
                    ) : (
                      <Package size={14} />
                    )}
                  </div>
                  <span className={styles.activityDesc}>{item.description}</span>
                  <span className={styles.activityTime}>
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions (Exact 3 Tiles from Reference Image) */}
        <div className={styles.panelCard}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              <Zap size={18} color="#EA580C" /> Quick Actions
            </h2>
          </div>

          <div className={styles.quickGrid}>
            <Link to="/ngo/food-requests?create=1" className={`${styles.quickTile} ${styles.quickPeach}`}>
              <div className={`${styles.quickIcon} ${styles.quickIconOrange}`}>
                <Package size={24} />
              </div>
              <span className={styles.quickLabel}>Create<br />Food Request</span>
            </Link>

            <Link to="/ngo/volunteers" className={`${styles.quickTile} ${styles.quickLavender}`}>
              <div className={`${styles.quickIcon} ${styles.quickIconPurple}`}>
                <Users size={24} />
              </div>
              <span className={styles.quickLabel}>Manage<br />Volunteers</span>
            </Link>

            <Link to="/ngo/reports" className={`${styles.quickTile} ${styles.quickMint}`}>
              <div className={`${styles.quickIcon} ${styles.quickIconGreen}`}>
                <BarChart2 size={24} />
              </div>
              <span className={styles.quickLabel}>View<br />Impact Report</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Fullscreen Live Tracking Modal */}
      {fullscreenMap && selectedCollection?.deliveryTaskId && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHead}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#192538' }}>
                  Live Collection Tracking — {selectedCollection.foodTitle}
                </h3>
                <span style={{ fontSize: 12.5, color: '#64748B' }}>
                  Donor: {selectedCollection.donorName || 'Verified Donor'} · Rider:{' '}
                  {selectedCollection.riderName || 'Assigned Rider'}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setFullscreenMap(false)}
                aria-label="Close fullscreen map"
              >
                <X size={18} />
              </button>
            </div>
            <LiveTrackingMap
              deliveryTaskId={selectedCollection.deliveryTaskId}
              taskStatus={selectedCollection.deliveryStatus || selectedCollection.status}
              pickupLat={selectedCollection.pickupLat}
              pickupLng={selectedCollection.pickupLng}
              pickupLabel={selectedCollection.pickupAddress || 'Donor Pickup'}
              dropoffLat={selectedCollection.dropoffLat ?? user?.location?.latitude}
              dropoffLng={selectedCollection.dropoffLng ?? user?.location?.longitude}
              dropoffLabel={`Our NGO (${orgName})`}
              viewerRole="donor"
              riderName={selectedCollection.riderName || 'Assigned Rider'}
              riderPhone={selectedCollection.riderPhone}
              assignedAt={selectedCollection.createdAt}
              updatedAt={selectedCollection.updatedAt}
              onOpenChat={() => {
                setFullscreenMap(false);
                handleOpenChat(selectedCollection);
              }}
              showTrackingPanel={true}
              height={460}
            />
          </div>
        </div>
      )}
    </div>
  );
}
