import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Clock, Package, Truck, CheckCircle, AlertTriangle,
  Navigation, Phone, ChevronRight, X, Loader2, RefreshCw, MessageSquare, RotateCcw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ClaimsService, type DeliveryTask } from '../../services/claims';
import { LocationService, type Coordinates } from '../../services/location';
import { ChatService } from '../../services/chat';
import { supabase } from '../../lib/supabase';
import LiveTrackingMap from '../../components/map/LiveTrackingMap';
import { formatDistanceToNow } from 'date-fns';
import styles from './RiderDashboard.module.css';

const STATUS_LABELS: Record<string, string> = {
  awaiting_rider: 'Available',
  rider_assigned: 'Assigned to You',
  going_to_pickup: 'Going to Pickup',
  food_collected: 'Food Collected',
  in_transit: 'In Transit',
  delivered: 'Delivered — Pending NGO Confirm',
  completed: 'Completed',
  incident: 'Incident Reported',
  cancelled: 'Cancelled',
};

interface PickupModalProps {
  task: DeliveryTask;
  onClose: () => void;
  onSuccess: () => void;
}

function PickupConfirmModal({ task, onClose, onSuccess }: PickupModalProps) {
  const [code, setCode] = useState('');
  const [servings, setServings] = useState(task.servingsRequired);
  const [discrepancy, setDiscrepancy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!code.trim()) { setError('Enter the pickup verification code'); return; }
    setLoading(true);
    try {
      await ClaimsService.confirmPickup(task.id, code, servings, discrepancy || undefined);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modal}>
      <div className={styles.modalCard}>
        <button className={styles.modalClose} onClick={onClose}><X size={14} /></button>
        <h3 className={styles.modalTitle}>Confirm Food Pickup</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Get the 6-character code from the donor to verify the handover.
        </p>
        <label className={styles.modalLabel}>Pickup Verification Code</label>
        <input
          className={styles.modalInput}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          style={{ letterSpacing: 4, fontFamily: 'monospace', fontSize: 18 }}
        />
        <label className={styles.modalLabel}>Servings Actually Collected</label>
        <input
          className={styles.modalInput}
          type="number"
          min={1}
          value={servings}
          onChange={e => setServings(parseInt(e.target.value) || 1)}
        />
        {servings !== task.servingsRequired && (
          <>
            <label className={styles.modalLabel}>Discrepancy Reason</label>
            <textarea
              className={`${styles.modalInput} ${styles.incidentTextarea}`}
              value={discrepancy}
              onChange={e => setDiscrepancy(e.target.value)}
              placeholder="Explain the quantity difference..."
            />
          </>
        )}
        {error && <div className={styles.errorMsg}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={onClose}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Confirm Pickup
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeliveryModalProps {
  task: DeliveryTask;
  onClose: () => void;
  onSuccess: () => void;
}

function DeliveryConfirmModal({ task, onClose, onSuccess }: DeliveryModalProps) {
  const [code, setCode] = useState('');
  const [servings, setServings] = useState(task.servingsCollected || task.servingsRequired);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (task.ngoId && !code.trim()) { setError('Enter the delivery verification code from the NGO'); return; }
    setLoading(true);
    try {
      await ClaimsService.confirmDeliveryToNgo(task.id, code, servings);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modal}>
      <div className={styles.modalCard}>
        <button className={styles.modalClose} onClick={onClose}><X size={14} /></button>
        <h3 className={styles.modalTitle}>Confirm Delivery to NGO</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Get the 6-character code from the NGO staff to confirm the handover.
        </p>
        <label className={styles.modalLabel}>Delivery Verification Code</label>
        <input
          className={styles.modalInput}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="XYZ456"
          maxLength={6}
          style={{ letterSpacing: 4, fontFamily: 'monospace', fontSize: 18 }}
        />
        <label className={styles.modalLabel}>Servings Actually Delivered</label>
        <input
          className={styles.modalInput}
          type="number"
          min={1}
          value={servings}
          onChange={e => setServings(parseInt(e.target.value) || 1)}
        />
        {error && <div className={styles.errorMsg}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={onClose}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={14} /> : <CheckCircle size={14} />} Confirm Delivery
          </button>
        </div>
      </div>
    </div>
  );
}

interface IncidentModalProps {
  task: DeliveryTask;
  onClose: () => void;
  onSuccess: () => void;
}

function IncidentModal({ task, onClose, onSuccess }: IncidentModalProps) {
  const [type, setType] = useState('vehicle_issue');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!notes.trim()) { setError('Please describe the incident'); return; }
    setLoading(true);
    try {
      await ClaimsService.reportIncident(task.id, type, notes);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modal}>
      <div className={styles.modalCard}>
        <button className={styles.modalClose} onClick={onClose}><X size={14} /></button>
        <h3 className={styles.modalTitle}>Report Incident</h3>
        <label className={styles.modalLabel}>Incident Type</label>
        <select className={styles.incidentSelect} value={type} onChange={e => setType(e.target.value)}>
          <option value="vehicle_issue">Vehicle Issue</option>
          <option value="donor_unavailable">Donor Unavailable</option>
          <option value="ngo_unavailable">NGO Unavailable</option>
          <option value="quantity_mismatch">Quantity Mismatch</option>
          <option value="food_damaged">Food Packaging Damaged</option>
          <option value="delivery_delayed">Delivery Delayed</option>
          <option value="cannot_complete">Cannot Complete Delivery</option>
          <option value="other">Other</option>
        </select>
        <label className={styles.modalLabel}>Describe the Incident</label>
        <textarea
          className={styles.incidentTextarea}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Provide details about what happened..."
          rows={4}
        />
        {error && <div className={styles.errorMsg}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={onClose}>Cancel</button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={14} /> : <AlertTriangle size={14} />} Report Incident
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  userId,
  riderCoords,
  onRefresh,
}: {
  task: DeliveryTask;
  userId?: string;
  riderCoords: Coordinates | null;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const acceptJob = async () => {
    setError('');
    setLoading(true);
    try {
      if (task.isDirectFoodOpportunity) {
        await ClaimsService.acceptDonation(task.foodListingId);
        setSuccess('Pickup accepted! Navigate to the donor location.');
      } else {
        await ClaimsService.acceptDeliveryJob(task.id);
        setSuccess('Delivery job accepted! Navigate to pickup.');
      }
      onRefresh();
    } catch (e: any) {
      setError(e.message || 'This opportunity was already claimed by another user.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = async () => {
    if (!userId) return;
    const isCollected = ['food_collected', 'in_transit'].includes(task.status);
    const recipient = (isCollected && task.ngoId) ? task.ngoId : task.donorId;
    if (!recipient) {
      navigate('/chat');
      return;
    }
    try {
      const conv = await ChatService.getOrCreateDirectConversation(userId, recipient, {
        type: 'delivery',
        relatedListingId: task.foodListingId,
        relatedTaskId: task.isDirectFoodOpportunity ? undefined : task.id,
        title: task.foodTitle || 'Delivery Coordination',
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      navigate('/chat');
    }
  };

  const handleReleaseTask = async () => {
    if (!window.confirm('Release this pickup so another rider can take it?')) return;
    setError('');
    setLoading(true);
    try {
      await ClaimsService.reassignDeliveryTask(task.id, 'Released by rider before pickup');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startTransit = async () => {
    setError(''); setLoading(true);
    try {
      await ClaimsService.updateDeliveryTaskStatus(task.id, 'in_transit');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const markArrived = async () => {
    setError(''); setLoading(true);
    try {
      await ClaimsService.updateDeliveryTaskStatus(task.id, 'going_to_pickup');
      setSuccess("Arrival recorded! Request the 6-digit pickup code from donor.");
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deadline = task.collectionDeadline
    ? formatDistanceToNow(new Date(task.collectionDeadline), { addSuffix: true })
    : 'No deadline';

  const isOverdue = task.collectionDeadline && new Date(task.collectionDeadline) < new Date();

  // Calculated distance & ETA using actual rider GPS coordinates (never hardcoded fallback)
  const etaInfo =
    riderCoords && task.pickupLat && task.pickupLng
      ? LocationService.calculateEtaBetween(
          riderCoords.latitude,
          riderCoords.longitude,
          task.pickupLat,
          task.pickupLng
        )
      : task.distanceKm != null
      ? { distanceKm: task.distanceKm, ...LocationService.calculateEta(task.distanceKm) }
      : null;

  const isActiveAssignment = ['rider_assigned', 'going_to_pickup', 'food_collected', 'in_transit'].includes(task.status);
  const contactPhone = ['food_collected', 'in_transit'].includes(task.status)
    ? task.ngoPhone || task.donorPhone
    : task.donorPhone || task.ngoPhone;

  return (
    <div className={styles.taskCard}>
      {showPickupModal && <PickupConfirmModal task={task} onClose={() => setShowPickupModal(false)} onSuccess={onRefresh} />}
      {showDeliveryModal && <DeliveryConfirmModal task={task} onClose={() => setShowDeliveryModal(false)} onSuccess={onRefresh} />}
      {showIncident && <IncidentModal task={task} onClose={() => setShowIncident(false)} onSuccess={onRefresh} />}

      <div className={styles.taskCardHeader}>
        <div>
          <h3 className={styles.taskTitle}>{task.foodTitle || 'Food Delivery'}</h3>
          <div className={styles.taskMeta}>
            <span className={styles.taskMetaItem}><Package size={12} /> {task.servingsRequired} {task.quantityUnit}</span>
            <span className={styles.taskMetaItem}>
              <Clock size={12} />
              <span style={{ color: isOverdue ? '#dc2626' : undefined }}>
                Deadline {deadline}
              </span>
            </span>
            {etaInfo && (
              <span className={styles.taskMetaItem} style={{ color: '#0284c7', fontWeight: 600 }}>
                📍 ~{etaInfo.distanceKm} km ({etaInfo.text})
              </span>
            )}
          </div>
        </div>
        <span className={`${styles.statusBadge} ${styles[`status_${task.status}`] || styles.status_pending}`}>
          {task.isDirectFoodOpportunity ? 'Direct Pickup' : (STATUS_LABELS[task.status] || task.status)}
        </span>
      </div>

      <div className={styles.routeRow}>
        <div className={styles.locationPin}>
          <MapPin size={12} color="#ea580c" style={{ marginRight: 4 }} />
          <strong>Pickup:</strong> {task.pickupAddress || task.donorName || 'Donor location'}
        </div>
        <span className={styles.arrow}><ChevronRight size={16} /></span>
        <div className={styles.locationPin}>
          <MapPin size={12} color="#10b981" style={{ marginRight: 4 }} />
          <strong>Deliver:</strong> {task.dropoffAddress || task.ngoOrgName || task.ngoName || 'Community destination'}
        </div>
      </div>

      {/* Live GPS Route Map for active rider deliveries (OTP codes never exposed on rider screen) */}
      {isActiveAssignment && !task.isDirectFoodOpportunity && (
        <LiveTrackingMap
          deliveryTaskId={task.id}
          taskStatus={task.status}
          pickupLat={task.pickupLat}
          pickupLng={task.pickupLng}
          pickupLabel={task.pickupAddress || task.donorName || 'Donor Pickup'}
          dropoffLat={task.dropoffLat}
          dropoffLng={task.dropoffLng}
          dropoffLabel={task.ngoOrgName || task.ngoName || task.dropoffAddress || 'Destination'}
          height={200}
        />
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}
      {success && <div className={styles.successMsg}>{success}</div>}

      <div className={styles.actionsRow}>
        {/* Accept job or direct pickup */}
        {task.status === 'awaiting_rider' && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={acceptJob} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            {task.isDirectFoodOpportunity ? 'Accept Pickup' : 'Accept Job'}
          </button>
        )}

        {/* Navigate to pickup */}
        {(task.status === 'rider_assigned' || task.status === 'going_to_pickup') && task.pickupLat && task.pickupLng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${task.pickupLat},${task.pickupLng}`}
            target="_blank" rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnWarning}`}
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Navigation size={14} /> Navigate to Pickup
          </a>
        )}

        {/* I've Arrived */}
        {task.status === 'rider_assigned' && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={markArrived} disabled={loading}>
            <CheckCircle size={14} /> I've Arrived
          </button>
        )}

        {/* Confirm pickup */}
        {(task.status === 'rider_assigned' || task.status === 'going_to_pickup') && (
          <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => setShowPickupModal(true)}>
            <CheckCircle size={14} /> Confirm Pickup
          </button>
        )}

        {/* Start transit */}
        {task.status === 'food_collected' && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={startTransit} disabled={loading}>
            <Truck size={14} /> Start Delivery
          </button>
        )}

        {/* Navigate to NGO */}
        {(task.status === 'food_collected' || task.status === 'in_transit') && task.dropoffLat && task.dropoffLng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${task.dropoffLat},${task.dropoffLng}`}
            target="_blank" rel="noopener noreferrer"
            className={`${styles.btn} ${styles.btnWarning}`}
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Navigation size={14} /> Navigate to NGO
          </a>
        )}

        {/* Confirm delivery */}
        {(task.status === 'food_collected' || task.status === 'in_transit') && (
          <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => setShowDeliveryModal(true)}>
            <CheckCircle size={14} /> Confirm Delivery
          </button>
        )}

        {/* Chat with donor / NGO */}
        {task.status !== 'completed' && task.status !== 'cancelled' && !task.isDirectFoodOpportunity && (
          <button
            type="button"
            onClick={handleOpenChat}
            className={`${styles.btn} ${styles.btnOutline}`}
          >
            <MessageSquare size={14} /> Chat
          </button>
        )}

        {/* Release assignment before pickup */}
        {['rider_assigned', 'going_to_pickup'].includes(task.status) && (
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={handleReleaseTask} disabled={loading}>
            <RotateCcw size={14} /> Release
          </button>
        )}

        {/* Report incident */}
        {['rider_assigned', 'going_to_pickup', 'food_collected', 'in_transit'].includes(task.status) && (
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setShowIncident(true)} style={{ marginLeft: 'auto' }}>
            <AlertTriangle size={14} /> Report Issue
          </button>
        )}

        {/* Contact Donor / NGO (fixed: never dials rider's own number) */}
        {contactPhone && task.status !== 'completed' && task.status !== 'cancelled' && !task.isDirectFoodOpportunity && (
          <a
            href={`tel:${contactPhone}`}
            className={`${styles.btn} ${styles.btnOutline}`}
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Phone size={14} /> Call
          </a>
        )}
      </div>

      {task.incidentReported && (
        <div className={styles.errorMsg} style={{ marginTop: 10 }}>
          <AlertTriangle size={14} style={{ marginRight: 4 }} />
          <strong>Incident reported:</strong> {task.incidentType?.replace(/_/g, ' ')} — {task.incidentNotes}
        </div>
      )}
    </div>
  );
}

export default function RiderDashboardPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [tab, setTab] = useState<'available' | 'mine' | 'history'>('available');
  const [availableTasks, setAvailableTasks] = useState<DeliveryTask[]>([]);
  const [myTasks, setMyTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [riderCoords, setRiderCoords] = useState<Coordinates | null>(null);
  const [gpsError, setGpsError] = useState('');

  const fetchData = useCallback(async (isSilent = false) => {
    if (!userId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [available, mine] = await Promise.all([
        ClaimsService.getAvailableDeliveryTasks(riderCoords?.latitude, riderCoords?.longitude),
        ClaimsService.getMyDeliveryTasks(userId),
      ]);
      setAvailableTasks(available);
      setMyTasks(mine);

      const { data: riderData } = await supabase
        .from('riders')
        .select('is_online')
        .eq('user_id', userId)
        .maybeSingle();
      if (riderData) setIsOnline(riderData.is_online);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, riderCoords?.latitude, riderCoords?.longitude]);

  useEffect(() => {
    fetchData(false);
    const sub = ClaimsService.subscribeToAvailableTasks(() => {
      fetchData(true);
    });
    return () => { sub.unsubscribe(); };
  }, [fetchData]);

  // Live GPS Tracking: Broadcast rider coordinates whenever online (idle or active task)
  useEffect(() => {
    if (!isOnline || !userId) return;
    setGpsError('');
    const activeTask = myTasks.find(t => ['rider_assigned', 'going_to_pickup', 'food_collected', 'in_transit'].includes(t.status));

    const stopWatching = LocationService.watchAndBroadcastRiderLocation({
      riderUserId: userId,
      deliveryTaskId: activeTask?.id,
      minIntervalMs: 5000,
      minDistanceMeters: 15,
      onPosition: (coords) => {
        setRiderCoords(coords);
        setGpsError('');
      },
      onError: (err) => {
        setGpsError(err.message || 'Location permission denied. Enable GPS to share live location.');
      },
    });

    return () => {
      stopWatching();
    };
  }, [isOnline, myTasks, userId]);

  const toggleOnline = async () => {
    if (!userId) return;
    setTogglingOnline(true);
    setGpsError('');
    try {
      const nextOnline = !isOnline;
      if (nextOnline) {
        const gps = await LocationService.detectCurrentGPS();
        if (gps.status === 'granted' && gps.latitude !== null && gps.longitude !== null) {
          setRiderCoords({ latitude: gps.latitude, longitude: gps.longitude, accuracy: gps.accuracy ?? undefined });
          await LocationService.updateRiderLocation({
            riderId: userId,
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracyM: gps.accuracy ?? undefined,
          });
        } else {
          setGpsError(gps.errorMessage || 'GPS unavailable. Enable location permissions.');
        }
      }

      const activeTask = myTasks.find(t => ['rider_assigned', 'going_to_pickup', 'food_collected', 'in_transit'].includes(t.status));
      await supabase
        .from('riders')
        .update({ is_online: nextOnline, is_available: nextOnline && !activeTask })
        .eq('user_id', userId);
      setIsOnline(nextOnline);
    } finally {
      setTogglingOnline(false);
    }
  };

  const activeTasks = myTasks.filter(t => !['completed', 'cancelled'].includes(t.status));
  const historyTasks = myTasks.filter(t => ['completed', 'cancelled', 'incident'].includes(t.status));
  const displayTasks = tab === 'available' ? availableTasks : tab === 'mine' ? activeTasks : historyTasks;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Rider Dashboard</h1>
        <p className={styles.pageSubtitle}>Manage your food delivery assignments</p>
      </div>

      {/* Online Status */}
      <div className={styles.statusRow}>
        <div className={isOnline ? styles.onlineDot : styles.offlineDot} />
        <span className={styles.statusText}>
          {isOnline
            ? riderCoords
              ? `You are online · GPS active (${riderCoords.latitude.toFixed(4)}, ${riderCoords.longitude.toFixed(4)})`
              : 'You are online — sharing live location for nearby pickups'
            : 'You are offline — go online to receive nearby pickup alerts'}
        </span>
        <button
          className={`${styles.toggleBtn} ${isOnline ? styles.goOffline : styles.goOnline}`}
          onClick={toggleOnline}
          disabled={togglingOnline}
        >
          {isOnline ? 'Go Offline' : 'Go Online'}
        </button>
      </div>
      {gpsError && <div className={styles.errorMsg} style={{ marginBottom: 12 }}>{gpsError}</div>}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'available' ? styles.tabActive : ''}`} onClick={() => setTab('available')}>
          Available Jobs {availableTasks.length > 0 && `(${availableTasks.length})`}
        </button>
        <button className={`${styles.tab} ${tab === 'mine' ? styles.tabActive : ''}`} onClick={() => setTab('mine')}>
          My Active Jobs {activeTasks.length > 0 && `(${activeTasks.length})`}
        </button>
        <button className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`} onClick={() => setTab('history')}>
          History
        </button>
        <button
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: '#6b7280' }}
          onClick={() => fetchData(false)}
          title="Refresh tasks"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Loader2 size={32} className="animate-spin" style={{ color: '#ea580c' }} /></div>
      ) : displayTasks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>{tab === 'available' ? '🚴' : tab === 'mine' ? '📦' : '📋'}</div>
          <h3 className={styles.emptyTitle}>
            {tab === 'available' ? 'No available jobs right now' : tab === 'mine' ? 'No active deliveries' : 'No delivery history yet'}
          </h3>
          <p className={styles.emptyText}>
            {tab === 'available' ? 'Check back soon — new delivery tasks appear when NGOs claim food.' : tab === 'mine' ? 'Accept a job from the Available tab to get started.' : 'Your completed deliveries will appear here.'}
          </p>
        </div>
      ) : (
        displayTasks.map(task => (
          <TaskCard key={task.id} task={task} userId={userId} riderCoords={riderCoords} onRefresh={fetchData} />
        ))
      )}
    </div>
  );
}
