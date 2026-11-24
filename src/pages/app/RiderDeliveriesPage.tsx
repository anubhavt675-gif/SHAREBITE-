import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Truck, Package, MapPin, Clock, Navigation, MessageSquare,
  CheckCircle2, AlertTriangle, RefreshCw, Loader2, Phone, X, ShieldCheck
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import {
  ClaimsService,
  type DeliveryTask,
} from '../../services/claims';
import { LocationService, type Coordinates } from '../../services/location';
import { ChatService } from '../../services/chat';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import styles from './RiderDeliveriesPage.module.css';

const STATUS_LABELS: Record<string, string> = {
  awaiting_rider: 'Available',
  rider_assigned: 'Order Accepted',
  going_to_pickup: 'On the Way to Donor',
  arrived_at_pickup: 'Arrived at Pickup',
  food_collected: 'Food Collected',
  in_transit: 'On the Way to Destination',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  incident: 'Incident / Reassigned',
};

const WORKFLOW_STEPS = [
  { key: 'rider_assigned', label: 'Accepted' },
  { key: 'going_to_pickup', label: 'On the Way to Donor' },
  { key: 'arrived_at_pickup', label: 'Arrived at Pickup' },
  { key: 'food_collected', label: 'Food Collected' },
  { key: 'in_transit', label: 'On the Way to Destination' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

export default function RiderDeliveriesPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const explicitTab = searchParams.get('tab') as 'active' | 'available' | 'completed' | 'cancelled' | null;
  const isAvailableFoodRoute = location.pathname === '/rider/available-food';
  const initialTab: 'active' | 'available' | 'completed' | 'cancelled' =
    isAvailableFoodRoute ? 'available' : explicitTab || 'active';

  const [tab, setTab] = useState<'active' | 'available' | 'completed' | 'cancelled'>(initialTab);
  const [available, setAvailable] = useState<DeliveryTask[]>([]);
  const [myTasks, setMyTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [riderCoords, setRiderCoords] = useState<Coordinates | null>(null);
  const riderCoordsRef = useRef<Coordinates | null>(null);
  const hasAutoSelectedTabRef = useRef(false);
  const [navigationModalTask, setNavigationModalTask] = useState<DeliveryTask | null>(null);

  // Optional OTP Modal when NGO task requires verification code
  const [codeModal, setCodeModal] = useState<{
    mode: 'pickup' | 'dropoff';
    task: DeliveryTask;
    code: string;
    servings: number;
    error: string;
  } | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const coords = riderCoordsRef.current;
      const [availList, mineList] = await Promise.all([
        ClaimsService.getAvailableDeliveryTasks(coords?.latitude, coords?.longitude),
        ClaimsService.getMyDeliveryTasks(userId),
      ]);
      setAvailable(availList);
      setMyTasks(mineList);

      if (!hasAutoSelectedTabRef.current && !explicitTab && !isAvailableFoodRoute) {
        hasAutoSelectedTabRef.current = true;
        const hasActive = mineList.some(
          (t) =>
            ['rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit'].includes(t.status) ||
            (t.status === 'delivered' && !t.ngoId)
        );
        if (!hasActive && availList.length > 0) {
          setTab('available');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, explicitTab, isAvailableFoodRoute]);

  useEffect(() => {
    LocationService.detectCurrentGPS().then((gps) => {
      if (gps.status === 'granted' && gps.latitude !== null && gps.longitude !== null) {
        const c = { latitude: gps.latitude, longitude: gps.longitude, accuracy: gps.accuracy ?? undefined };
        riderCoordsRef.current = c;
        setRiderCoords(c);
        fetchAll(true);
      }
    });
  }, [fetchAll]);

  useEffect(() => {
    fetchAll(false);
    if (!userId) return;
    const sub = ClaimsService.subscribeToAvailableTasks(() => fetchAll(true));
    return () => {
      sub.unsubscribe();
    };
  }, [userId, fetchAll]);

  const activeTrackingTaskId = myTasks.find((t) =>
    ['rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit'].includes(t.status)
  )?.id;

  // Continuous live GPS broadcasting while rider has an active pickup task
  useEffect(() => {
    if (!userId || !activeTrackingTaskId) return;
    const stopWatching = LocationService.watchAndBroadcastRiderLocation({
      riderUserId: userId,
      deliveryTaskId: activeTrackingTaskId,
      minIntervalMs: 3500,
      minDistanceMeters: 10,
      onPosition: (coords) => {
        riderCoordsRef.current = coords;
        setRiderCoords(coords);
      },
    });
    return () => {
      stopWatching();
    };
  }, [userId, activeTrackingTaskId]);

  const selectTab = (next: 'active' | 'available' | 'completed' | 'cancelled') => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const handleAccept = async (task: DeliveryTask) => {
    if (!userId) return;
    setBusyId(task.id);
    setFeedback(null);
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

      // Ensure Donor <-> Rider chat channel exists
      if (task.donorId) {
        ChatService.openDeliveryConversation(userId, task.donorId, {
          relatedListingId: task.foodListingId,
          relatedTaskId: assignedTaskId,
          title: task.foodTitle || 'Food Pickup',
        }).catch(() => {});
      }

      // Capture & broadcast initial GPS reading immediately inside ShareBite (no external map redirect)
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

      setMyTasks((prev) => [resolvedTaskObj, ...prev.filter((t) => t.id !== resolvedTaskId)]);
      setAvailable((prev) => prev.filter((t) => t.id !== task.id && t.foodListingId !== task.foodListingId));
      setNavigationModalTask(resolvedTaskObj);

      setFeedback({
        type: 'ok',
        text: `✓ Order Accepted! Live in-app route tracking started for "${task.foodTitle || 'Food Pickup'}". Donor has been notified that you are on the way.`,
      });
      selectTab('active');
      await fetchAll(true);
    } catch (e: any) {
      setFeedback({
        type: 'err',
        text: e?.message || 'This pickup was already accepted by another rider.',
      });
      await fetchAll(true);
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvanceStatus = async (task: DeliveryTask, nextStatus: string) => {
    if (nextStatus === 'food_collected') {
      setCodeModal({
        mode: 'pickup',
        task,
        code: '',
        servings: task.servingsRequired || 1,
        error: '',
      });
      return;
    }
    setBusyId(task.id);
    setFeedback(null);
    try {
      await ClaimsService.updateDeliveryTaskStatus(task.id, nextStatus);
      setFeedback({
        type: 'ok',
        text: `Updated status to "${STATUS_LABELS[nextStatus] || nextStatus}".`,
      });
      await fetchAll(true);
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Failed to update delivery status.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmitCodeModal = async () => {
    if (!codeModal) return;
    setBusyId(codeModal.task.id);
    try {
      if (codeModal.mode === 'pickup') {
        await ClaimsService.confirmPickup(
          codeModal.task.id,
          codeModal.code,
          codeModal.servings
        );
      } else {
        await ClaimsService.confirmDeliveryToNgo(
          codeModal.task.id,
          codeModal.code,
          codeModal.servings
        );
      }
      setCodeModal(null);
      setFeedback({ type: 'ok', text: 'Verification confirmed successfully!' });
      await fetchAll(true);
    } catch (e: any) {
      setCodeModal((prev) => (prev ? { ...prev, error: e?.message || 'Verification failed' } : null));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenChat = async (task: DeliveryTask) => {
    if (!userId || !task.donorId) {
      navigate('/chat');
      return;
    }
    try {
      const conv = await ChatService.openDeliveryConversation(userId, task.donorId, {
        relatedListingId: task.foodListingId,
        relatedTaskId: task.isDirectFoodOpportunity ? undefined : task.id,
        title: task.foodTitle || 'Pickup Coordination',
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      navigate('/chat');
    }
  };

  const handleRelease = async (task: DeliveryTask) => {
    if (!window.confirm('Release this pickup back to the available pool for other riders?')) return;
    setBusyId(task.id);
    try {
      await ClaimsService.reassignDeliveryTask(task.id, 'Released by rider before pickup');
      setFeedback({ type: 'ok', text: 'Delivery released back to available pickups.' });
      await fetchAll(true);
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Could not release delivery.' });
    } finally {
      setBusyId(null);
    }
  };

  const activeList = myTasks.filter(
    (t) =>
      ['rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit'].includes(t.status) ||
      (t.status === 'delivered' && !t.ngoId)
  );
  const completedList = myTasks.filter(
    (t) => t.status === 'completed' || (t.status === 'delivered' && Boolean(t.ngoId))
  );
  const cancelledList = myTasks.filter((t) => ['cancelled', 'incident'].includes(t.status));

  const currentItems =
    tab === 'active'
      ? activeList
      : tab === 'available'
      ? available
      : tab === 'completed'
      ? completedList
      : cancelledList;

  const getStepIndex = (status: string) =>
    WORKFLOW_STEPS.findIndex((s) => s.key === status);

  return (
    <div className={styles.page}>
      {navigationModalTask && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalCard} style={{ maxWidth: 880, maxHeight: '92vh', overflowY: 'auto' }}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setNavigationModalTask(null)}
              aria-label="Close live pickup map"
            >
              <X size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>
                ✓ ORDER ACCEPTED
              </span>
              <span style={{ background: '#fff3e6', color: '#c2410c', fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>
                Live Tracking Inside ShareBite
              </span>
            </div>
            <h3 className={styles.modalTitle} style={{ marginTop: 6 }}>
              {navigationModalTask.foodTitle || 'Food Pickup'} · Live Route to Donor
            </h3>
            <p className={styles.modalDesc}>
              <MapPin size={13} style={{ verticalAlign: 'middle', color: '#ea580c' }} />{' '}
              <strong>{navigationModalTask.pickupAddress || 'Donor Pickup Location'}</strong>
              {navigationModalTask.donorName ? ` · Donor: ${navigationModalTask.donorName}` : ''}
            </p>

            <LiveTrackingMap
              deliveryTaskId={navigationModalTask.id}
              taskStatus={navigationModalTask.status}
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
                handleOpenChat(t);
              }}
              showTrackingPanel={true}
              height={300}
              actionSlot={
                <button
                  type="button"
                  className={styles.primaryBtn}
                  style={{ width: '100%', justifyContent: 'center', padding: '11px 16px' }}
                  onClick={() => setNavigationModalTask(null)}
                >
                  <Navigation size={15} /> Continue in Active Deliveries
                </button>
              }
            />
          </div>
        </div>
      )}

      {codeModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalCard}>
            <button className={styles.closeBtn} onClick={() => setCodeModal(null)} aria-label="Close">
              <X size={16} />
            </button>
            <h3 className={styles.modalTitle}>
              <ShieldCheck size={18} color="#ea580c" />{' '}
              {codeModal.mode === 'pickup' ? 'Verify Pickup with Donor Code' : 'Verify NGO Dropoff Code'}
            </h3>
            <p className={styles.modalDesc}>
              {codeModal.mode === 'pickup'
                ? 'Enter the 6-character pickup code shown on the donor’s screen.'
                : 'Enter the 6-character dropoff code from the receiving NGO.'}
            </p>
            <label className={styles.fieldLabel}>Verification Code</label>
            <input
              type="text"
              maxLength={6}
              className={styles.codeInput}
              placeholder="ABC123"
              value={codeModal.code}
              onChange={(e) => setCodeModal({ ...codeModal, code: e.target.value.toUpperCase(), error: '' })}
            />
            <label className={styles.fieldLabel}>Servings Count</label>
            <input
              type="number"
              min={1}
              className={styles.numInput}
              value={codeModal.servings}
              onChange={(e) => setCodeModal({ ...codeModal, servings: Math.max(1, Number(e.target.value) || 1) })}
            />
            {codeModal.error && <div className={styles.errBox}>{codeModal.error}</div>}
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setCodeModal(null)}>
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                disabled={busyId === codeModal.task.id}
                onClick={handleSubmitCodeModal}
              >
                {busyId === codeModal.task.id ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>My Deliveries</h1>
          <p className={styles.subtitle}>Manage active pickups, Google Maps navigation, donor chat & delivery history</p>
        </div>
        <button className={styles.refreshBtn} onClick={() => fetchAll(true)} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {feedback && (
        <div className={feedback.type === 'ok' ? styles.okBanner : styles.errBanner}>
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className={styles.dismissBtn}><X size={14} /></button>
        </div>
      )}

      <div className={styles.tabsBar}>
        <button
          className={`${styles.tabBtn} ${tab === 'active' ? styles.tabActive : ''}`}
          onClick={() => selectTab('active')}
        >
          Active Deliveries ({activeList.length})
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'available' ? styles.tabActive : ''}`}
          onClick={() => selectTab('available')}
        >
          Available Pickups ({available.length})
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'completed' ? styles.tabActive : ''}`}
          onClick={() => selectTab('completed')}
        >
          Completed ({completedList.length})
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'cancelled' ? styles.tabActive : ''}`}
          onClick={() => selectTab('cancelled')}
        >
          Cancelled / Reassigned ({cancelledList.length})
        </button>
      </div>

      {loading ? (
        <div className={styles.centerBox}>
          <Loader2 size={30} className="animate-spin" style={{ color: '#ea580c' }} />
        </div>
      ) : currentItems.length === 0 ? (
        <div className={styles.emptyCard}>
          <Truck size={40} color="#ea580c" />
          <h3>
            {tab === 'active'
              ? 'No active deliveries right now'
              : tab === 'available'
              ? 'No unassigned pickups waiting right now'
              : tab === 'completed'
              ? 'No completed deliveries yet'
              : 'No cancelled or reassigned deliveries'}
          </h3>
          <p>
            {tab === 'active'
              ? 'Check Available Pickups to accept a food donation near you.'
              : 'New donations appear here automatically in real time as soon as donors post food.'}
          </p>
          {tab === 'active' && available.length > 0 && (
            <button className={styles.primaryBtn} onClick={() => selectTab('available')}>
              View Available Pickups ({available.length})
            </button>
          )}
        </div>
      ) : (
        <div className={styles.cardsList}>
          {currentItems.map((task) => {
            const distKm =
              riderCoords && task.pickupLat != null && task.pickupLng != null
                ? LocationService.calculateDistance(
                    riderCoords.latitude,
                    riderCoords.longitude,
                    task.pickupLat,
                    task.pickupLng
                  )
                : task.distanceKm ?? task.estimatedKm;

            const stepIdx = getStepIndex(task.status);
            const isBusy = busyId === task.id;

            return (
              <div key={task.id} className={styles.deliveryCard}>
                <div className={styles.cardTop}>
                  <div className={styles.foodThumbWrap}>
                    {task.foodImageUrl ? (
                      <img src={task.foodImageUrl} alt={task.foodTitle} className={styles.foodThumb} />
                    ) : (
                      <div className={styles.foodThumbFallback}>🍱</div>
                    )}
                  </div>

                  <div className={styles.cardMainInfo}>
                    <div className={styles.titleRow}>
                      <h3 className={styles.foodTitle}>{task.foodTitle || 'Food Rescue Pickup'}</h3>
                      <span className={`${styles.statusBadge} ${styles[`st_${task.status}`] || ''}`}>
                        {task.status === 'awaiting_rider' ? 'AVAILABLE' : (STATUS_LABELS[task.status] || task.status)}
                      </span>
                    </div>

                    <p className={styles.donorLine}>
                      Donor: <strong>{task.donorName || 'Verified Food Donor'}</strong>
                      {' · '}
                      <Package size={13} style={{ verticalAlign: 'middle' }} />{' '}
                      <strong>
                        {task.quantityValue ?? task.servingsRequired} {task.quantityUnit}
                      </strong>
                      {` (Serves ${task.servingsRequired} people)`}
                      {task.foodType ? ` · ${task.foodType.replace('_', '-')}` : ''}
                      {distKm != null ? ` · 📍 ${distKm} km` : ''}
                    </p>

                    <div className={styles.locationsGrid}>
                      <div className={styles.locBox}>
                        <span className={styles.locLabel}>PICKUP LOCATION</span>
                        <span className={styles.locText}>
                          <MapPin size={13} color="#ea580c" /> {task.pickupAddress || 'Donor Location'}
                        </span>
                      </div>
                      <div className={styles.locBox}>
                        <span className={styles.locLabel}>DESTINATION</span>
                        <span className={styles.locText}>
                          <MapPin size={13} color="#16a34a" />{' '}
                          {task.ngoOrgName || task.ngoName || task.dropoffAddress || 'Community Distribution'}
                        </span>
                      </div>
                    </div>

                    <div className={styles.metaStrip}>
                      <span>
                        <Clock size={12} />{' '}
                        {task.riderAssignedAt
                          ? `Assigned ${formatDistanceToNow(new Date(task.riderAssignedAt), { addSuffix: true })}`
                          : task.preparationTime
                          ? `Prepared ${new Date(task.preparationTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : `Posted ${formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}`}
                      </span>
                      {task.collectionDeadline && (
                        <span>
                          Pickup deadline{' '}
                          {new Date(task.collectionDeadline).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      {(task.foodDescription || task.instructions) && (
                        <span className={styles.instructionsNote}>
                          {task.foodDescription || task.instructions}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Stepper for Assigned Deliveries */}
                {!task.isDirectFoodOpportunity && stepIdx >= 0 && (
                  <div className={styles.stepperWrap}>
                    {WORKFLOW_STEPS.map((st, idx) => {
                      const done = idx <= stepIdx;
                      return (
                        <div key={st.key} className={`${styles.stepPill} ${done ? styles.stepPillDone : ''}`}>
                          <CheckCircle2 size={13} /> {st.label}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Live Route Map for Active Deliveries */}
                {['rider_assigned', 'going_to_pickup', 'arrived_at_pickup', 'food_collected', 'in_transit'].includes(task.status) && (
                    <div style={{ marginTop: 14 }}>
                      <LiveTrackingMap
                        deliveryTaskId={task.id}
                        taskStatus={task.status}
                        pickupLat={task.pickupLat}
                        pickupLng={task.pickupLng}
                        pickupLabel={task.pickupAddress || task.donorName || 'Donor Pickup'}
                        dropoffLat={task.dropoffLat}
                        dropoffLng={task.dropoffLng}
                        dropoffLabel={task.ngoOrgName || task.dropoffAddress || 'Destination'}
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
                        donorName={task.donorName || 'Food Donor'}
                        donorPhone={task.donorPhone}
                        assignedAt={task.riderAssignedAt}
                        updatedAt={task.updatedAt}
                        onOpenChat={() => handleOpenChat(task)}
                        showTrackingPanel={true}
                        height={280}
                      />
                    </div>
                  )}

                {/* Action Buttons */}
                <div className={styles.actionsBar}>
                  {task.status === 'awaiting_rider' && (
                    <button
                      className={styles.primaryBtn}
                      disabled={isBusy}
                      onClick={() => handleAccept(task)}
                    >
                      {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
                      Accept Donation
                    </button>
                  )}

                  {task.status === 'rider_assigned' && (
                    <button
                      className={styles.primaryBtn}
                      disabled={isBusy}
                      onClick={() => handleAdvanceStatus(task, 'going_to_pickup')}
                    >
                      Start Trip — On the Way to Donor
                    </button>
                  )}

                  {task.status === 'going_to_pickup' && (
                    <button
                      className={styles.primaryBtn}
                      disabled={isBusy}
                      onClick={() => handleAdvanceStatus(task, 'arrived_at_pickup')}
                    >
                      Mark Arrived at Pickup
                    </button>
                  )}

                  {(task.status === 'arrived_at_pickup' || task.status === 'going_to_pickup' || task.status === 'rider_assigned') && (
                    <button
                      className={styles.successBtn}
                      disabled={isBusy}
                      onClick={() =>
                        setCodeModal({
                          mode: 'pickup',
                          task,
                          code: '',
                          servings: task.servingsRequired || 1,
                          error: '',
                        })
                      }
                    >
                      <ShieldCheck size={15} /> Enter Donor Code & Confirm Pickup
                    </button>
                  )}

                  {task.status === 'food_collected' && (
                    <button
                      className={styles.primaryBtn}
                      disabled={isBusy}
                      onClick={() => handleAdvanceStatus(task, 'in_transit')}
                    >
                      On the Way to Destination
                    </button>
                  )}

                  {(task.status === 'food_collected' || task.status === 'in_transit') && (
                    <>
                      <button
                        className={styles.successBtn}
                        disabled={isBusy}
                        onClick={() => handleAdvanceStatus(task, task.ngoId ? 'delivered' : 'completed')}
                      >
                        <CheckCircle2 size={15} /> {task.ngoId ? 'Mark Delivered' : 'Complete Delivery'}
                      </button>
                      {task.ngoId && (
                        <button
                          className={styles.secondaryBtn}
                          disabled={isBusy}
                          onClick={() =>
                            setCodeModal({
                              mode: 'dropoff',
                              task,
                              code: '',
                              servings: task.servingsCollected ?? task.servingsRequired,
                              error: '',
                            })
                          }
                        >
                          <ShieldCheck size={14} /> NGO Code Dropoff
                        </button>
                      )}
                    </>
                  )}

                  {task.status === 'delivered' && (
                    <button
                      className={styles.successBtn}
                      disabled={isBusy}
                      onClick={() => handleAdvanceStatus(task, 'completed')}
                    >
                      <CheckCircle2 size={15} /> Complete Delivery
                    </button>
                  )}

                  {!task.isDirectFoodOpportunity && task.status !== 'cancelled' && task.status !== 'awaiting_rider' && (
                    <button
                      type="button"
                      className={styles.navBtn}
                      onClick={() => setNavigationModalTask(task)}
                    >
                      <Navigation size={14} /> View Live Route Map
                    </button>
                  )}

                  {!task.isDirectFoodOpportunity && task.status !== 'awaiting_rider' && (
                    <button
                      className={styles.secondaryBtn}
                      onClick={() => handleOpenChat(task)}
                    >
                      <MessageSquare size={14} /> Chat with Donor
                    </button>
                  )}

                  {!task.isDirectFoodOpportunity && task.donorPhone && (
                    <a href={`tel:${task.donorPhone}`} className={styles.secondaryBtn} style={{ textDecoration: 'none' }}>
                      <Phone size={14} /> Call
                    </a>
                  )}

                  {['rider_assigned', 'going_to_pickup', 'arrived_at_pickup'].includes(task.status) && (
                    <button
                      className={styles.dangerOutlineBtn}
                      disabled={isBusy}
                      onClick={() => handleRelease(task)}
                    >
                      <AlertTriangle size={14} /> Release
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
