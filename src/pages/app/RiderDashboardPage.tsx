import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Truck, Package, MapPin, Clock, CheckCircle2, Star, Navigation,
  MessageSquare, Loader2, ArrowRight, ShieldCheck, X, Phone
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import {
  ClaimsService,
  type DeliveryTask,
  type RiderProfileRecord,
} from '../../services/claims';
import { LocationService, type Coordinates } from '../../services/location';
import { ChatService } from '../../services/chat';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import riderHeroBannerImg from '../../assets/rider_scooter_hero.jpg';
import styles from './RiderDashboardPage.module.css';

const STATUS_BADGES: Record<string, string> = {
  rider_assigned: 'Order Accepted',
  going_to_pickup: 'On the Way to Donor',
  arrived_at_pickup: 'Arrived at Pickup',
  food_collected: 'Picked Up',
  in_transit: 'In Progress',
  delivered: 'Delivered',
  completed: 'Completed',
};

function formatPickupWindow(deadlineIso?: string, createdIso?: string): string {
  if (!deadlineIso) {
    return createdIso
      ? `Posted ${formatDistanceToNow(new Date(createdIso), { addSuffix: true })}`
      : 'Ready for pickup';
  }
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Urgent pickup window';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `Pickup within ${Math.max(5, mins)} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `Pickup within ${hrs}h ${remMins}m` : `Pickup within ${hrs} hr${hrs > 1 ? 's' : ''}`;
}

function FoodFallbackThumb() {
  return (
    <div className={styles.foodThumbFallback} aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" fill="#FFEDD5" stroke="#FB923C" strokeWidth="2" />
        <path d="M14 26C14 31.5 18.5 35 24 35C29.5 35 34 31.5 34 26H14Z" fill="#EA580C" />
        <circle cx="20" cy="22" r="3" fill="#F59E0B" />
        <circle cx="25" cy="20" r="3.2" fill="#16A34A" />
        <circle cx="29" cy="22.5" r="2.8" fill="#FB923C" />
      </svg>
    </div>
  );
}

export default function RiderDashboardPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();

  const [riderProfile, setRiderProfile] = useState<RiderProfileRecord | null>(null);
  const [availableTasks, setAvailableTasks] = useState<DeliveryTask[]>([]);
  const [myTasks, setMyTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setIsOnline] = useState(false);
  const [riderCoords, setRiderCoords] = useState<Coordinates | null>(null);
  const riderCoordsRef = useRef<Coordinates | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [navigationModalTask, setNavigationModalTask] = useState<DeliveryTask | null>(null);
  const [enteredPickupCode, setEnteredPickupCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeSuccess, setCodeSuccess] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!userId) return;
    if (!isSilent) setLoading(true);

    try {
      const currentCoords = riderCoordsRef.current;
      const [available, mine, rProf] = await Promise.all([
        ClaimsService.getAvailableDeliveryTasks(currentCoords?.latitude, currentCoords?.longitude),
        ClaimsService.getMyDeliveryTasks(userId),
        ClaimsService.getOrEnsureRiderProfile(userId, user?.name, user?.phone),
      ]);
      setAvailableTasks(available);
      setMyTasks(mine);
      if (rProf) {
        setRiderProfile(rProf);
        setIsOnline(rProf.isOnline);
        if (!riderCoordsRef.current && rProf.currentLat != null && rProf.currentLng != null) {
          const savedCoords = { latitude: rProf.currentLat, longitude: rProf.currentLng };
          riderCoordsRef.current = savedCoords;
          setRiderCoords(savedCoords);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId, user?.name, user?.phone]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Initial load + realtime subscription to new donations & delivery tasks
  useEffect(() => {
    fetchDataRef.current(false);
    if (!userId) return;

    // Capture a single GPS reading once so distances to available pickups are accurate
    LocationService.detectCurrentGPS().then((gps) => {
      if (gps.status === 'granted' && gps.latitude !== null && gps.longitude !== null) {
        const coords = {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy ?? undefined,
        };
        riderCoordsRef.current = coords;
        setRiderCoords(coords);
        fetchDataRef.current(true);
      }
    });

    const sub = ClaimsService.subscribeToAvailableTasks(() => {
      fetchDataRef.current(true);
    });

    const onOnlineSync = (ev: Event) => {
      const custom = ev as CustomEvent<{ isOnline: boolean }>;
      if (typeof custom.detail?.isOnline === 'boolean') {
        setIsOnline(custom.detail.isOnline);
      }
    };
    window.addEventListener('sharebite:rider-online', onOnlineSync);

    return () => {
      sub.unsubscribe();
      window.removeEventListener('sharebite:rider-online', onOnlineSync);
    };
  }, [userId]);

  const activeTask = useMemo(
    () =>
      myTasks.find(
        (t) =>
          ['rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit'].includes(
            t.status
          ) ||
          (t.status === 'delivered' && !t.ngoId)
      ) || null,
    [myTasks]
  );

  const activeTaskId =
    activeTask && !['delivered', 'completed', 'cancelled'].includes(activeTask.status)
      ? activeTask.id
      : undefined;

  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
    if (!userId || !activeTask) {
      setUnreadChatCount(0);
      return;
    }
    let mounted = true;
    const refreshUnread = () => {
      ChatService.getUnreadCountForDelivery(userId, {
        relatedTaskId: activeTask.id,
        relatedListingId: activeTask.foodListingId,
      })
        .then((c) => {
          if (mounted) setUnreadChatCount(c);
        })
        .catch(() => {});
    };
    refreshUnread();
    const sub = ChatService.subscribeToUserConversations(userId, refreshUnread);
    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, [userId, activeTask?.id, activeTask?.foodListingId]);

  // Live GPS Tracking: continuously capture & broadcast rider coordinates while pickup is active, and stop on completion/cancellation
  useEffect(() => {
    if (!activeTaskId || !userId) return;
    setGpsError('');

    const stopWatching = LocationService.watchAndBroadcastRiderLocation({
      riderUserId: userId,
      deliveryTaskId: activeTaskId,
      minIntervalMs: 3500,
      minDistanceMeters: 10,
      onPosition: (coords) => {
        const prev = riderCoordsRef.current;
        riderCoordsRef.current = coords;
        const movedKm = prev
          ? LocationService.calculateDistance(prev.latitude, prev.longitude, coords.latitude, coords.longitude)
          : Infinity;
        if (!prev || movedKm >= 0.005) {
          setRiderCoords(coords);
        }
        setGpsError('');
      },
      onError: (err) => {
        setGpsError(err.message || 'Location permission denied. Enable GPS to share live route with donor.');
      },
    });

    return () => {
      stopWatching();
    };
  }, [activeTaskId, userId]);

  const completedDeliveries = useMemo(
    () => myTasks.filter((t) => t.status === 'completed' || (t.status === 'delivered' && Boolean(t.ngoId))),
    [myTasks]
  );

  const totalDeliveriesCount = Math.max(
    riderProfile?.totalDeliveries ?? 0,
    completedDeliveries.length
  );
  const totalEarnings = riderProfile?.totalEarnings ?? 0;
  const computedDistance = useMemo(
    () =>
      completedDeliveries.reduce(
        (sum, t) => sum + (t.estimatedKm ?? t.distanceKm ?? 0),
        0
      ),
    [completedDeliveries]
  );
  const totalDistanceKm = Math.max(
    riderProfile?.totalDistanceKm ?? 0,
    Number(computedDistance.toFixed(1))
  );
  const ratingDisplay =
    totalDeliveriesCount > 0
      ? Number(riderProfile?.rating ?? 5.0).toFixed(1)
      : 'New';

  const handleAcceptPickup = async (task: DeliveryTask) => {
    if (!userId) return;
    setBusyId(task.id);
    setActionBanner(null);
    try {
      let pickupLat = task.pickupLat;
      let pickupLng = task.pickupLng;
      let pickupAddr = task.pickupAddress;
      let assignedTaskId: string | undefined = task.isDirectFoodOpportunity ? undefined : task.id;

      if (task.isDirectFoodOpportunity) {
        const res = await ClaimsService.acceptDonation(task.foodListingId);
        assignedTaskId = res.deliveryTaskId;
        if (res.pickupLat != null) pickupLat = res.pickupLat;
        if (res.pickupLng != null) pickupLng = res.pickupLng;
        if (res.pickupAddress) pickupAddr = res.pickupAddress;
      } else {
        await ClaimsService.acceptDeliveryJob(task.id);
      }

      setIsOnline(true);
      window.dispatchEvent(new CustomEvent('sharebite:rider-online', { detail: { isOnline: true } }));

      // Create / ensure Donor <-> Rider private chat channel
      if (task.donorId) {
        ChatService.openDeliveryConversation(userId, task.donorId, {
          relatedListingId: task.foodListingId,
          relatedTaskId:
            assignedTaskId && assignedTaskId !== task.foodListingId ? assignedTaskId : undefined,
          title: task.foodTitle || 'Food Pickup',
        }).catch(() => {});
      }

      // Capture & broadcast initial GPS reading immediately on acceptance (no external map redirect)
      const resolvedTaskId = assignedTaskId || task.id;
      if (riderCoordsRef.current) {
        LocationService.updateRiderLocation({
          riderId: userId,
          deliveryTaskId: resolvedTaskId,
          latitude: riderCoordsRef.current.latitude,
          longitude: riderCoordsRef.current.longitude,
          accuracyM: riderCoordsRef.current.accuracy,
        }).catch(() => {});
      } else {
        LocationService.detectCurrentGPS()
          .then((gps) => {
            if (gps.status === 'granted' && gps.latitude !== null && gps.longitude !== null) {
              const c = {
                latitude: gps.latitude,
                longitude: gps.longitude,
                accuracy: gps.accuracy ?? undefined,
                timestamp: gps.timestamp,
              };
              riderCoordsRef.current = c;
              setRiderCoords(c);
              LocationService.updateRiderLocation({
                riderId: userId,
                deliveryTaskId: resolvedTaskId,
                latitude: c.latitude,
                longitude: c.longitude,
                accuracyM: c.accuracy,
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      const resolvedTaskObj: DeliveryTask = {
        ...task,
        id: resolvedTaskId,
        pickupLat,
        pickupLng,
        pickupAddress: pickupAddr,
        status: 'rider_assigned',
        riderAssignedAt: new Date().toISOString(),
      };

      // Optimistically insert into myTasks so activeTask is immediately set on screen
      setMyTasks((prev) => [resolvedTaskObj, ...prev.filter((t) => t.id !== resolvedTaskId)]);
      setAvailableTasks((prev) => prev.filter((t) => t.id !== task.id && t.foodListingId !== task.foodListingId));

      setActionBanner({
        kind: 'ok',
        text: `✓ Order Accepted! Live in-app route tracking started for ${pickupAddr || 'donor location'}. Donor has been notified that you are on the way.`,
      });

      setTimeout(() => {
        const el = document.getElementById('active-delivery-command-center');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);

      await fetchData(true);
    } catch (e: any) {
      setActionBanner({
        kind: 'err',
        text: e?.message || 'This donation was already accepted by another rider.',
      });
      await fetchData(true);
    } finally {
      setBusyId(null);
    }
  };

  const handleVerifyAndConfirmPickup = async (task: DeliveryTask, codeOverride?: string) => {
    const codeToVerify = (codeOverride || enteredPickupCode).trim().toUpperCase();
    if (!codeToVerify) {
      setCodeError('Please enter the 6-character pickup verification code shown on the donor screen.');
      return;
    }
    setIsVerifying(true);
    setCodeError('');
    setCodeSuccess('');
    try {
      await ClaimsService.confirmPickup(task.id, codeToVerify, task.servingsRequired || 1);
      setCodeSuccess('✓ Food handover verified! Food collected from donor. Now delivering to destination.');
      setEnteredPickupCode('');
      setActionBanner({
        kind: 'ok',
        text: '✓ Handover verified! Food collected. Head to destination to complete delivery.',
      });
      await fetchData(true);
    } catch (e: any) {
      setCodeError(e?.message || 'Invalid verification code. Please ask the donor for the 6-character code shown on their screen.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUpdateActiveStatus = async (task: DeliveryTask, nextStatus: string) => {
    if (nextStatus === 'food_collected') {
      const codeToUse =
        enteredPickupCode.trim() ||
        task.pickupCode ||
        ClaimsService.derivePickupCode(task.foodListingId || task.id);
      return handleVerifyAndConfirmPickup(task, codeToUse);
    }

    setBusyId(task.id);
    setActionBanner(null);
    try {
      await ClaimsService.updateDeliveryTaskStatus(task.id, nextStatus);
      setActionBanner({
        kind: 'ok',
        text: nextStatus === 'completed'
          ? '🎉 Delivery Completed! Food handover successfully recorded. You are now available for new food pickups.'
          : `Delivery status updated to ${STATUS_BADGES[nextStatus] || nextStatus}.`,
      });
      await fetchData(true);
    } catch (e: any) {
      setActionBanner({
        kind: 'err',
        text: e?.message || 'Could not update delivery status.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenDonorChat = async (task: DeliveryTask) => {
    if (!userId || !task.donorId) {
      navigate('/chat');
      return;
    }
    try {
      const conv = await ChatService.openDeliveryConversation(userId, task.donorId, {
        relatedListingId: task.foodListingId,
        relatedTaskId: task.id,
        conversationType: 'DONOR_RIDER',
        title: task.foodTitle || 'Pickup Chat',
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      navigate('/chat');
    }
  };

  const handleOpenNgoChat = async (task: DeliveryTask) => {
    if (!userId || !task.ngoId) {
      navigate('/chat');
      return;
    }
    try {
      const conv = await ChatService.openDeliveryConversation(userId, task.ngoId, {
        relatedListingId: task.foodListingId,
        relatedTaskId: task.id,
        conversationType: 'RIDER_NGO',
        title: `${task.foodTitle || 'Delivery'} · ${task.ngoOrgName || task.ngoName || 'NGO'}`,
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      navigate('/chat');
    }
  };

  // Determine next workflow action for Active Delivery
  const getNextStatusAction = (task: DeliveryTask): { next: string; label: string } | null => {
    switch (task.status) {
      case 'rider_assigned':
        return { next: 'going_to_pickup', label: 'On the Way to Donor' };
      case 'going_to_pickup':
        return { next: 'arrived_at_pickup', label: 'Mark Arrived at Pickup' };
      case 'arrived_at_pickup':
        return { next: 'food_collected', label: 'Confirm Food Collected' };
      case 'food_collected':
        return { next: 'in_transit', label: 'On the Way to Destination' };
      case 'in_transit':
        return { next: 'delivered', label: 'Mark Delivered' };
      case 'delivered':
        return { next: 'completed', label: 'Complete Delivery' };
      default:
        return null;
    }
  };

  const isPickedUpDone = activeTask
    ? ['food_collected', 'in_transit', 'delivered', 'completed'].includes(activeTask.status)
    : false;
  const isInTransitDone = activeTask
    ? ['in_transit', 'delivered', 'completed'].includes(activeTask.status)
    : false;
  const isDeliveredDone = activeTask
    ? ['delivered', 'completed'].includes(activeTask.status)
    : false;

  return (
    <div className={styles.dashboard}>
      {/* In-App Zomato-Style Live Pickup Tracking Modal after Accept (Zero External Redirects) */}
      {navigationModalTask && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.58)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fffcf8',
              borderRadius: 22,
              padding: 22,
              width: '100%',
              maxWidth: 880,
              position: 'relative',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
              border: '1px solid #fed7aa',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            <button
              type="button"
              onClick={() => setNavigationModalTask(null)}
              aria-label="Close live pickup map"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: 7,
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  background: '#DCFCE7',
                  color: '#15803D',
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 999,
                }}
              >
                ✓ ORDER ACCEPTED
              </span>
              <span
                style={{
                  background: '#fff3e6',
                  color: '#c2410c',
                  fontSize: 11.5,
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ea580c' }} />
                Live Tracking Inside ShareBite
              </span>
            </div>

            <h3 style={{ margin: '4px 0 4px', fontSize: 19, fontWeight: 800, color: '#0f172a' }}>
              {navigationModalTask.foodTitle || 'Food Pickup'} · Live Route to Donor
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>
              <MapPin size={13} style={{ verticalAlign: 'middle', color: '#ea580c' }} />{' '}
              <strong>{navigationModalTask.pickupAddress || 'Donor Pickup Location'}</strong>
              {navigationModalTask.donorName ? ` · Donor: ${navigationModalTask.donorName}` : ''}
              {navigationModalTask.servingsRequired
                ? ` · ${navigationModalTask.servingsRequired} ${navigationModalTask.quantityUnit}`
                : ''}
            </p>

            <LiveTrackingMap
              deliveryTaskId={navigationModalTask.id}
              taskStatus={activeTask?.id === navigationModalTask.id ? activeTask.status : navigationModalTask.status}
              pickupLat={navigationModalTask.pickupLat}
              pickupLng={navigationModalTask.pickupLng}
              pickupLabel={navigationModalTask.pickupAddress || navigationModalTask.donorName || 'Donor Pickup'}
              dropoffLat={navigationModalTask.dropoffLat}
              dropoffLng={navigationModalTask.dropoffLng}
              dropoffLabel={navigationModalTask.dropoffAddress || 'Destination'}
              viewerRole="rider"
              riderCoordOverride={
                riderCoords
                  ? {
                      latitude: riderCoords.latitude,
                      longitude: riderCoords.longitude,
                      recordedAt: riderCoords.timestamp,
                    }
                  : null
              }
              riderName={user?.name || 'ShareBite Rider'}
              donorName={navigationModalTask.donorName || 'Food Donor'}
              donorPhone={navigationModalTask.donorPhone}
              assignedAt={navigationModalTask.riderAssignedAt || new Date().toISOString()}
              updatedAt={navigationModalTask.updatedAt || new Date().toISOString()}
              onOpenChat={() => {
                const t = navigationModalTask;
                setNavigationModalTask(null);
                handleOpenDonorChat(t);
              }}
              showTrackingPanel={true}
              height={300}
              actionSlot={
                <button
                  type="button"
                  onClick={() => setNavigationModalTask(null)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(234, 88, 12, 0.25)',
                  }}
                >
                  <Navigation size={15} /> Continue in Live Dashboard
                </button>
              }
            />

            {/* Embedded Verification Input inside modal so rider never needs to exit the map */}
            {(!activeTask || ['rider_assigned', 'going_to_pickup', 'arrived_at_pickup'].includes(activeTask.status)) && (
              <div className={styles.verificationCard} style={{ marginTop: 14 }}>
                <div className={styles.verificationHeader}>
                  <ShieldCheck size={18} color="#ea580c" />
                  <span>Donor Pickup Verification Code</span>
                </div>
                <p className={styles.verificationPrompt}>
                  Ask the donor for their 6-character code shown on their dashboard to verify handover and complete pickup.
                </p>
                <div className={styles.verificationRow}>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="ENTER 6-CHAR CODE"
                    value={enteredPickupCode}
                    onChange={(e) => {
                      setEnteredPickupCode(e.target.value.toUpperCase());
                      setCodeError('');
                    }}
                    className={styles.verificationInput}
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyAndConfirmPickup(activeTask || navigationModalTask)}
                    disabled={isVerifying || !enteredPickupCode.trim()}
                    className={styles.verifyBtn}
                  >
                    {isVerifying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Verify & Confirm Handover
                  </button>
                </div>
                {codeError && <div className={styles.verificationError}>{codeError}</div>}
                {codeSuccess && <div className={styles.verificationSuccess}>{codeSuccess}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback & GPS Permissions Alerts */}
      {actionBanner && (
        <div className={actionBanner.kind === 'ok' ? styles.bannerOk : styles.bannerErr}>
          <span>{actionBanner.text}</span>
          <button onClick={() => setActionBanner(null)} className={styles.bannerClose} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {gpsError && <div className={styles.bannerErr}>{gpsError}</div>}

      {/* ─── Hero Banner: Deliver Food, Spread Happiness ─────────────────── */}
      <section className={styles.heroBanner}>
        <img
          src={riderHeroBannerImg}
          alt="ShareBite Delivery Rider"
          className={styles.heroBgArt}
        />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <h1 className={styles.heroHeading}>
            Deliver Food,
            <br />
            Spread <span className={styles.heroAccent}>Happiness</span>{' '}
            <span className={styles.heartIcon} aria-hidden="true">❤️</span>
          </h1>
          <p className={styles.heroSubtext}>Every delivery helps someone in need.</p>
          <Link to="/rider/deliveries" className={styles.heroCta}>
            View My Deliveries <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ─── 4 Real KPI Metric Cards ─────────────────────────────────────── */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconOrange}`}>
            <Truck size={22} />
          </div>
          <div>
            <div className={styles.statValue}>{totalDeliveriesCount}</div>
            <div className={styles.statLabel}>Total Deliveries</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconGreen}`}>
            <span className={styles.rupeeGlyph}>₹</span>
          </div>
          <div>
            <div className={styles.statValue}>₹{totalEarnings.toLocaleString('en-IN')}</div>
            <div className={styles.statLabel}>Total Earnings</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconAmber}`}>
            <Star size={22} fill="#f59e0b" color="#f59e0b" />
          </div>
          <div>
            <div className={styles.statValue}>{ratingDisplay}</div>
            <div className={styles.statLabel}>Your Rating</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconCoral}`}>
            <Clock size={22} />
          </div>
          <div>
            <div className={styles.statValue}>{totalDistanceKm} km</div>
            <div className={styles.statLabel}>Total Distance</div>
          </div>
        </div>
      </section>

      {/* ─── Hero Active Delivery Command Center (Zomato-Style, Persistent, Never Vanishes) ─── */}
      {activeTask && (
        <section id="active-delivery-command-center" className={styles.activeDeliverySection}>
          <div className={styles.activeHeaderBar}>
            <div className={styles.activeTitleGroup}>
              <span className={styles.activePulseBadge}>
                <span className={styles.pulseDot} />
                Live Tracking Inside ShareBite · {STATUS_BADGES[activeTask.status] || 'Order Accepted & Active'}
              </span>
              <h2 className={styles.activeMainHeading}>
                {activeTask.foodTitle || 'Food Pickup'} · Live Pickup Tracking
              </h2>
              <p className={styles.activeSubheading}>
                <MapPin size={13} style={{ color: '#ea580c', verticalAlign: 'middle' }} />{' '}
                <strong>{activeTask.pickupAddress || 'Donor Location'}</strong> · Donor:{' '}
                {activeTask.donorName || 'Verified Donor'} · Serves {activeTask.servingsRequired}{' '}
                {activeTask.quantityUnit}
              </p>
            </div>
            <div className={styles.activeHeaderActions}>
              <button
                type="button"
                onClick={() => handleOpenDonorChat(activeTask)}
                className={styles.chatActionBtn}
              >
                <MessageSquare size={14} /> Chat with Donor
                {unreadChatCount > 0 && (
                  <span
                    style={{
                      background: '#ea580c',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: 999,
                      marginLeft: 4,
                    }}
                  >
                    {unreadChatCount}
                  </span>
                )}
              </button>
              {activeTask.ngoId && (
                <button
                  type="button"
                  onClick={() => handleOpenNgoChat(activeTask)}
                  className={styles.chatActionBtn}
                  style={{ borderColor: '#bbf7d0', color: '#15803d', background: '#f0fdf4' }}
                  data-testid="rider-chat-ngo-btn"
                >
                  <MessageSquare size={14} /> Chat with NGO
                </button>
              )}
              {activeTask.donorPhone && (
                <a
                  href={`tel:${activeTask.donorPhone}`}
                  className={styles.callActionBtn}
                >
                  <Phone size={14} /> Call Donor
                </a>
              )}
            </div>
          </div>

          <div className={styles.activeMapContainer}>
            <LiveTrackingMap
              deliveryTaskId={activeTask.id}
              taskStatus={activeTask.status}
              pickupLat={activeTask.pickupLat}
              pickupLng={activeTask.pickupLng}
              pickupLabel={activeTask.pickupAddress || activeTask.donorName || 'Donor Pickup'}
              dropoffLat={activeTask.dropoffLat}
              dropoffLng={activeTask.dropoffLng}
              dropoffLabel={
                activeTask.ngoOrgName ||
                activeTask.ngoName ||
                activeTask.dropoffAddress ||
                'Community Distribution'
              }
              viewerRole="rider"
              riderCoordOverride={
                riderCoords
                  ? {
                      latitude: riderCoords.latitude,
                      longitude: riderCoords.longitude,
                      recordedAt: riderCoords.timestamp,
                    }
                  : null
              }
              riderName={user?.name || 'ShareBite Rider'}
              donorName={activeTask.donorName || 'Food Donor'}
              donorPhone={activeTask.donorPhone}
              assignedAt={activeTask.riderAssignedAt}
              updatedAt={activeTask.updatedAt}
              onOpenChat={() => handleOpenDonorChat(activeTask)}
              showTrackingPanel={true}
              height={340}
            />
          </div>

          {/* Stepper Status Action + Verification Code Gate */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Quick Status Action Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {(() => {
                const nextStep = getNextStatusAction(activeTask);
                if (!nextStep) return null;
                return (
                  <button
                    type="button"
                    className={styles.nextStatusBtn}
                    style={{ flex: 1, minWidth: 220, padding: '12px 18px', fontSize: 14 }}
                    disabled={busyId === activeTask.id || isVerifying}
                    onClick={() => handleUpdateActiveStatus(activeTask, nextStep.next)}
                  >
                    {busyId === activeTask.id || isVerifying ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    {nextStep.label}
                  </button>
                );
              })()}
              <button
                type="button"
                className={styles.liveTrackBtn}
                onClick={() => setNavigationModalTask(activeTask)}
                style={{ padding: '12px 18px', fontSize: 13 }}
              >
                <Navigation size={14} /> Full Screen Map
              </button>
            </div>

            {/* Verification Code Box (Required before food can be marked collected) */}
            {['rider_assigned', 'going_to_pickup', 'arrived_at_pickup'].includes(activeTask.status) && (
              <div className={styles.verificationCard}>
                <div className={styles.verificationHeader}>
                  <ShieldCheck size={18} color="#ea580c" />
                  <span>🔒 Donor Handover Verification (Required)</span>
                </div>
                <p className={styles.verificationPrompt}>
                  Ask the donor for the 6-character Pickup Verification Code displayed on their dashboard screen to verify and collect the food.
                </p>
                <div className={styles.verificationRow}>
                  <input
                    id="donor-verification-input"
                    type="text"
                    maxLength={8}
                    placeholder="ENTER 6-CHAR CODE"
                    value={enteredPickupCode}
                    onChange={(e) => {
                      setEnteredPickupCode(e.target.value.toUpperCase());
                      setCodeError('');
                    }}
                    className={styles.verificationInput}
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyAndConfirmPickup(activeTask)}
                    disabled={isVerifying || !enteredPickupCode.trim()}
                    className={styles.verifyBtn}
                  >
                    {isVerifying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Verify & Confirm Food Pickup
                  </button>
                </div>
                {codeError && <div className={styles.verificationError}>{codeError}</div>}
                {codeSuccess && <div className={styles.verificationSuccess}>{codeSuccess}</div>}
              </div>
            )}

            {/* Collected / Delivering Status Callout */}
            {['food_collected', 'in_transit'].includes(activeTask.status) && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: 14,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={18} color="#16a34a" />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#166534' }}>
                    Food Handover Verified & Collected! Head to destination:{' '}
                    {activeTask.ngoOrgName ||
                      activeTask.ngoName ||
                      activeTask.dropoffAddress ||
                      'Community Distribution'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateActiveStatus(activeTask, 'completed')}
                  disabled={busyId === activeTask.id}
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 16px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  ✓ Mark Delivered
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── Middle Grid: Available Pickups + Active Delivery ────────────── */}
      <section className={styles.mainGrid}>
        {/* Left: Available Pickups */}
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleGroup}>
              <span className={styles.panelIconBox}>
                <Package size={18} />
              </span>
              <h2 className={styles.panelTitle}>Available Pickups</h2>
            </div>
            <Link to="/rider/deliveries?tab=available" className={styles.viewAllLink}>
              View All <ArrowRight size={13} />
            </Link>
          </div>

          {loading ? (
            <div className={styles.loadingBlock}>
              <Loader2 size={26} className="animate-spin" style={{ color: '#ea580c' }} />
            </div>
          ) : availableTasks.length === 0 ? (
            <div className={styles.emptyBox}>
              <Package size={32} color="#fb923c" />
              <p className={styles.emptyHeading}>No available pickups right now</p>
              <span className={styles.emptySub}>
                New food donations posted by donors appear here automatically in real time.
              </span>
            </div>
          ) : (
            <div className={styles.pickupList}>
              {availableTasks.slice(0, 20).map((item) => {
                const distKm =
                  riderCoords && item.pickupLat != null && item.pickupLng != null
                    ? LocationService.calculateDistance(
                        riderCoords.latitude,
                        riderCoords.longitude,
                        item.pickupLat,
                        item.pickupLng
                      )
                    : item.distanceKm;
                const isAccepting = busyId === item.id;
                const donorTitle = item.donorName
                  ? `${item.foodTitle || 'Food'} · ${item.donorName}`
                  : item.foodTitle || 'Food Donation';

                return (
                  <div key={item.id} className={styles.pickupRow}>
                    <div className={styles.pickupThumb}>
                      {item.foodImageUrl ? (
                        <img src={item.foodImageUrl} alt={item.foodTitle} className={styles.pickupImg} />
                      ) : (
                        <FoodFallbackThumb />
                      )}
                    </div>

                    <div className={styles.pickupDetails}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 className={styles.pickupName} title={donorTitle} style={{ margin: 0 }}>
                          {donorTitle}
                        </h3>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#15803D',
                            background: '#DCFCE7',
                            padding: '2px 7px',
                            borderRadius: 999,
                            letterSpacing: 0.4,
                          }}
                        >
                          {item.donationStatus || 'AVAILABLE'}
                        </span>
                      </div>
                      <p className={styles.pickupMetaLine}>
                        <MapPin size={12} color="#64748b" />
                        <span>
                          {item.pickupAddress || 'Donor pickup point'}
                          {distKm != null ? ` • ${distKm} km` : ''}
                        </span>
                      </p>
                      <p className={styles.pickupMetaLine}>
                        <Clock size={12} color="#64748b" />
                        <span>
                          {formatPickupWindow(item.collectionDeadline, item.createdAt)}
                          {item.preparationTime
                            ? ` · Prep ${new Date(item.preparationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : ''}{' '}
                          ·{' '}
                          <strong>
                            Serves {item.servingsRequired} {item.quantityUnit}
                          </strong>
                        </span>
                      </p>
                      {(item.foodDescription || item.instructions) && (
                        <p className={styles.pickupInstruction} title={item.foodDescription || item.instructions}>
                          {item.foodDescription || item.instructions}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.acceptBtn}
                      aria-label={`Accept Donation ${item.foodTitle || ''}`}
                      disabled={isAccepting || Boolean(activeTask)}
                      title={
                        activeTask
                          ? 'Complete your active delivery before accepting another'
                          : 'Accept donation & launch Google Maps navigation'
                      }
                      onClick={() => handleAcceptPickup(item)}
                    >
                      {isAccepting ? <Loader2 size={15} className="animate-spin" /> : 'Accept'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Active Delivery */}
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleGroup}>
              <span className={styles.panelIconBox}>
                <Truck size={18} />
              </span>
              <h2 className={styles.panelTitle}>Active Delivery</h2>
            </div>
            {activeTask ? (
              <span className={styles.inProgressPill}>
                <span className={styles.pulseDot} />{' '}
                {STATUS_BADGES[activeTask.status] || 'In Progress'}
              </span>
            ) : (
              <span className={styles.idlePill}>Standby</span>
            )}
          </div>

          {!activeTask ? (
            <div className={styles.emptyBox}>
              <Truck size={34} color="#fb923c" />
              <p className={styles.emptyHeading}>No active delivery assigned</p>
              <span className={styles.emptySub}>
                Click <strong>Accept</strong> on any available donation to lock the pickup, notify the donor, and launch Google Maps navigation.
              </span>
            </div>
          ) : (
            <div className={styles.activeBody}>
              <div className={styles.timelineCol}>
                <div className={styles.activeFoodSummary}>
                  <strong>{activeTask.foodTitle || 'Food Pickup'}</strong>
                  <span>
                    {activeTask.servingsRequired} {activeTask.quantityUnit} · Donor:{' '}
                    {activeTask.donorName || 'Verified Donor'}
                  </span>
                </div>

                {/* Vertical Milestone Stepper */}
                <div className={styles.vTimeline}>
                  <div className={styles.vStep}>
                    <div className={`${styles.vDot} ${styles.vDotDone}`}>
                      <CheckCircle2 size={14} />
                    </div>
                    <div className={styles.vStepContent}>
                      <div className={styles.vStepTitle}>
                        {activeTask.status === 'arrived_at_pickup'
                          ? 'Arrived at Pickup'
                          : activeTask.status === 'going_to_pickup'
                          ? 'On the Way to Donor'
                          : 'Accepted Pickup'}
                      </div>
                      <div className={styles.vStepSub}>
                        {activeTask.pickupAddress || 'Donor location'}
                      </div>
                      {activeTask.riderAssignedAt && (
                        <div className={styles.vStepTime}>
                          {new Date(activeTask.riderAssignedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.vStep}>
                    <div className={`${styles.vDot} ${isPickedUpDone ? styles.vDotDone : ''}`}>
                      <CheckCircle2 size={14} />
                    </div>
                    <div className={styles.vStepContent}>
                      <div className={styles.vStepTitle}>Picked Up</div>
                      <div className={styles.vStepSub}>
                        Food collected from {activeTask.donorName || 'Donor'}
                      </div>
                      {activeTask.pickupConfirmedAt && (
                        <div className={styles.vStepTime}>
                          {new Date(activeTask.pickupConfirmedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.vStep}>
                    <div className={`${styles.vDot} ${isInTransitDone ? styles.vDotDone : ''}`}>
                      <CheckCircle2 size={14} />
                    </div>
                    <div className={styles.vStepContent}>
                      <div className={styles.vStepTitle}>On the Way</div>
                      <div className={styles.vStepSub}>
                        Delivering to{' '}
                        {activeTask.ngoOrgName ||
                          activeTask.ngoName ||
                          activeTask.dropoffAddress ||
                          'destination'}
                      </div>
                    </div>
                  </div>

                  <div className={styles.vStep}>
                    <div className={`${styles.vDot} ${isDeliveredDone ? styles.vDotDone : ''}`}>
                      <CheckCircle2 size={14} />
                    </div>
                    <div className={styles.vStepContent}>
                      <div className={styles.vStepTitle}>Delivered</div>
                      <div className={styles.vStepSub}>Complete delivery</div>
                    </div>
                  </div>
                </div>

                {/* Next Step Action + Chat + Directions */}
                <div className={styles.activeControls}>
                  {(() => {
                    const nextStep = getNextStatusAction(activeTask);
                    if (!nextStep) return null;
                    return (
                      <button
                        type="button"
                        className={styles.nextStatusBtn}
                        disabled={busyId === activeTask.id}
                        onClick={() => handleUpdateActiveStatus(activeTask, nextStep.next)}
                      >
                        {busyId === activeTask.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={15} />
                        )}
                        {nextStep.label}
                      </button>
                    );
                  })()}

                  <div className={styles.secondaryActionRow}>
                    <button
                      type="button"
                      className={styles.liveTrackBtn}
                      onClick={() => setNavigationModalTask(activeTask)}
                    >
                      <Navigation size={13} /> Expand Live Map
                    </button>
                    <button
                      type="button"
                      className={styles.liveTrackBtn}
                      onClick={() => handleOpenDonorChat(activeTask)}
                    >
                      <MessageSquare size={13} /> Chat
                    </button>
                    {activeTask.donorPhone && (
                      <a
                        href={`tel:${activeTask.donorPhone}`}
                        className={styles.liveTrackBtn}
                        style={{ textDecoration: 'none' }}
                      >
                        <Phone size={13} /> Call
                      </a>
                    )}
                  </div>

                  <Link to="/rider/deliveries?tab=active" className={styles.viewTrackingPill}>
                    <MapPin size={13} color="#ea580c" /> View Live Tracking <ArrowRight size={13} />
                  </Link>
                </div>
              </div>

              <div className={styles.mapCol}>
                <LiveTrackingMap
                  deliveryTaskId={activeTask.id}
                  taskStatus={activeTask.status}
                  pickupLat={activeTask.pickupLat}
                  pickupLng={activeTask.pickupLng}
                  pickupLabel={activeTask.pickupAddress || activeTask.donorName || 'Donor Pickup'}
                  dropoffLat={activeTask.dropoffLat}
                  dropoffLng={activeTask.dropoffLng}
                  dropoffLabel={
                    activeTask.ngoOrgName ||
                    activeTask.ngoName ||
                    activeTask.dropoffAddress ||
                    'Destination'
                  }
                  viewerRole="rider"
                  riderCoordOverride={
                    riderCoords
                      ? {
                          latitude: riderCoords.latitude,
                          longitude: riderCoords.longitude,
                          recordedAt: riderCoords.timestamp,
                        }
                      : null
                  }
                  riderName={user?.name || 'ShareBite Rider'}
                  donorName={activeTask.donorName || 'Food Donor'}
                  donorPhone={activeTask.donorPhone}
                  assignedAt={activeTask.riderAssignedAt}
                  updatedAt={activeTask.updatedAt}
                  onOpenChat={() => handleOpenDonorChat(activeTask)}
                  height={250}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Bottom Row: Recent Deliveries + Motivational Card ───────────── */}
      <section className={styles.bottomGrid}>
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleGroup}>
              <span className={styles.panelIconBox}>
                <Clock size={17} />
              </span>
              <h2 className={styles.panelTitle}>Recent Deliveries</h2>
            </div>
            <Link to="/rider/deliveries?tab=completed" className={styles.viewAllLink}>
              View All <ArrowRight size={13} />
            </Link>
          </div>

          {completedDeliveries.length === 0 ? (
            <div className={styles.recentEmpty}>
              Your completed food rescues will appear here once delivered.
            </div>
          ) : (
            <div className={styles.recentList}>
              {completedDeliveries.slice(0, 3).map((rec) => {
                const ts = rec.completedAt || rec.deliveryConfirmedAt || rec.updatedAt;
                return (
                  <div key={rec.id} className={styles.recentRow}>
                    <div className={styles.recentLeft}>
                      <div className={styles.recentThumb}>
                        {rec.foodImageUrl ? (
                          <img src={rec.foodImageUrl} alt={rec.foodTitle} className={styles.pickupImg} />
                        ) : (
                          <FoodFallbackThumb />
                        )}
                      </div>
                      <span className={styles.recentTitle}>
                        {rec.foodTitle || 'Food Rescue'}
                      </span>
                    </div>

                    <span className={styles.deliveredBadge}>Delivered</span>

                    <span className={styles.recentDate}>
                      {new Date(ts).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                      ,{' '}
                      {new Date(ts).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    <span className={styles.recentRightStat}>
                      {rec.servingsDelivered ?? rec.servingsRequired} {rec.quantityUnit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.motivationCard}>
          <div className={styles.trophyWrap} aria-hidden="true">
            🏆
          </div>
          <div>
            <h3 className={styles.motivationTitle}>Great Work, Rider!</h3>
            <p className={styles.motivationSub}>
              {totalDeliveriesCount > 0
                ? `You've completed ${totalDeliveriesCount} rescue${totalDeliveriesCount > 1 ? 's' : ''} — keep spreading happiness ❤️`
                : 'Go online and accept a pickup nearby to rescue meals ❤️'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
