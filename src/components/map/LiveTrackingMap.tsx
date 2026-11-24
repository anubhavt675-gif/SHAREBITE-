import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { Clock, MapPin, Phone, MessageSquare, LocateFixed, Plus, Minus, Radio, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LocationService, type RoadRouteResult } from '../../services/location';
import type { RiderLocationUpdate } from '../../types';
import 'leaflet/dist/leaflet.css';
import '../../styles/leaflet-fix.css';

export interface LiveTrackingMapProps {
  deliveryTaskId: string;
  taskStatus: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel?: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  dropoffLabel?: string;
  height?: number;
  viewerRole?: 'donor' | 'rider';
  riderCoordOverride?: { latitude: number; longitude: number; recordedAt?: string } | null;
  riderName?: string;
  riderPhone?: string;
  donorName?: string;
  donorPhone?: string;
  foodTitle?: string;
  servings?: number;
  quantityUnit?: string;
  assignedAt?: string;
  updatedAt?: string;
  onOpenChat?: () => void;
  showTrackingPanel?: boolean;
  actionSlot?: React.ReactNode;
}

function createDonorHomeIcon(title: string, subtitle: string) {
  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSub = subtitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;align-items:center;pointer-events:auto;">
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:40px;height:40px;border-radius:50% 50% 50% 0;
          background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);
          transform:rotate(-45deg);
          border:2.5px solid #ffffff;
          box-shadow:0 6px 16px rgba(234,88,12,0.38);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" style="transform:rotate(45deg);">
            <path d="M12 3L4 9v12h5v-7h6v7h5V9z"/>
          </svg>
        </div>
        <div style="width:10px;height:10px;border-radius:50%;background:#ea580c;border:2px solid #fff;margin-top:2px;box-shadow:0 2px 6px rgba(234,88,12,0.4);"></div>
      </div>
      <div style="
        margin-left:8px;background:#ffffff;border-radius:12px;
        padding:6px 11px;box-shadow:0 6px 18px rgba(15,23,42,0.14);
        border:1px solid #f1f5f9;white-space:nowrap;
        font-family:system-ui,-apple-system,sans-serif;
      ">
        <div style="font-size:12px;font-weight:800;color:#1e293b;line-height:1.2;">${safeTitle}</div>
        <div style="font-size:11px;font-weight:600;color:#64748b;line-height:1.2;">${safeSub}</div>
      </div>
    </div>`,
    iconSize: [180, 56],
    iconAnchor: [20, 48],
    popupAnchor: [0, -44],
  });
}

function createDestinationIcon(label: string) {
  const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;">
      <div style="
        width:36px;height:36px;border-radius:50%;
        background:#16a34a;border:2.5px solid #fff;
        box-shadow:0 4px 12px rgba(22,163,74,0.35);
        display:flex;align-items:center;justify-content:center;font-size:16px;
      ">🏛️</div>
      <div style="
        margin-left:6px;background:#ffffff;border-radius:10px;
        padding:4px 9px;box-shadow:0 4px 12px rgba(15,23,42,0.12);
        border:1px solid #e2e8f0;white-space:nowrap;font-size:11px;font-weight:700;color:#15803d;
      ">${safeLabel}</div>
    </div>`,
    iconSize: [150, 40],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function createRiderScooterIcon(statusBadgeText: string) {
  const safeStatus = statusBadgeText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;align-items:center;pointer-events:auto;">
      <div style="
        width:52px;height:52px;border-radius:50%;
        background:#ffffff;border:2.5px solid #fed7aa;
        box-shadow:0 8px 22px rgba(234,88,12,0.28);
        display:flex;align-items:center;justify-content:center;
        outline:6px solid rgba(249,115,22,0.14);
      ">
        <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="48" r="8" fill="#1E293B" stroke="#475569" stroke-width="2"/>
          <circle cx="18" cy="48" r="3.5" fill="#F8FAFC"/>
          <circle cx="48" cy="48" r="8" fill="#1E293B" stroke="#475569" stroke-width="2"/>
          <circle cx="48" cy="48" r="3.5" fill="#F8FAFC"/>
          <rect x="10" y="24" width="14" height="12" rx="3" fill="#EA580C" stroke="#FFFFFF" stroke-width="1.5"/>
          <path d="M18 36H38L44 26H39L35 33H22L18 36Z" fill="#F97316"/>
          <path d="M14 44C14 38 20 35 28 35H38L46 44H14Z" fill="#DC2626"/>
          <circle cx="31" cy="16" r="6" fill="#EA580C"/>
          <path d="M26 23C26 20 35 20 36 24L40 31H27L26 23Z" fill="#1E293B"/>
          <circle cx="50" cy="27" r="3" fill="#FACC15"/>
        </svg>
      </div>
      <div style="
        margin-left:8px;background:#ffffff;border-radius:12px;
        padding:6px 12px;box-shadow:0 6px 18px rgba(15,23,42,0.15);
        border:1px solid #e2e8f0;white-space:nowrap;
        font-family:system-ui,-apple-system,sans-serif;
      ">
        <div style="font-size:11px;font-weight:800;color:#2563eb;line-height:1.2;">Rider</div>
        <div style="font-size:12px;font-weight:800;color:#1e293b;line-height:1.25;">${safeStatus}</div>
      </div>
    </div>`,
    iconSize: [185, 58],
    iconAnchor: [26, 26],
    popupAnchor: [0, -26],
  });
}

function MapViewportController({
  points,
  recenterSignal,
  zoomDeltaSignal,
}: {
  points: [number, number][];
  recenterSignal: number;
  zoomDeltaSignal: { seq: number; delta: number };
}) {
  const map = useMap();
  const initialKeyRef = useRef('');
  const key = points.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('|');

  useEffect(() => {
    if (!key) return;
    // Auto-fit when points first become available or when number of markers changes
    const prevCount = initialKeyRef.current ? initialKeyRef.current.split('|').length : 0;
    if (!initialKeyRef.current || prevCount !== points.length) {
      initialKeyRef.current = key;
      if (points.length === 1) {
        map.setView(points[0], 15);
      } else if (points.length >= 2) {
        map.fitBounds(points, { padding: [52, 52], maxZoom: 16 });
      }
    }
  }, [key, points, map]);

  useEffect(() => {
    if (recenterSignal === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
    } else if (points.length >= 2) {
      map.fitBounds(points, { padding: [52, 52], maxZoom: 16, animate: true });
    }
  }, [recenterSignal, points, map]);

  useEffect(() => {
    if (zoomDeltaSignal.seq === 0) return;
    map.setZoom(map.getZoom() + zoomDeltaSignal.delta);
  }, [zoomDeltaSignal, map]);

  return null;
}

export default function LiveTrackingMap({
  deliveryTaskId,
  taskStatus,
  pickupLat,
  pickupLng,
  pickupLabel = 'Donor Pickup',
  dropoffLat,
  dropoffLng,
  dropoffLabel = 'NGO Destination',
  height = 310,
  viewerRole = 'donor',
  riderCoordOverride = null,
  riderName = 'Assigned Rider',
  riderPhone,
  donorName = 'Food Donor',
  donorPhone,
  assignedAt,
  updatedAt,
  onOpenChat,
  showTrackingPanel = false,
  actionSlot,
}: LiveTrackingMapProps) {
  const [riderLoc, setRiderLoc] = useState<RiderLocationUpdate | null>(null);
  const [route, setRoute] = useState<RoadRouteResult | null>(null);
  const [recenterSeq, setRecenterSeq] = useState(0);
  const [zoomSignal, setZoomSignal] = useState<{ seq: number; delta: number }>({ seq: 0, delta: 0 });

  const hasPickup =
    typeof pickupLat === 'number' &&
    typeof pickupLng === 'number' &&
    !Number.isNaN(pickupLat) &&
    !Number.isNaN(pickupLng);
  const hasDropoff =
    typeof dropoffLat === 'number' &&
    typeof dropoffLng === 'number' &&
    !Number.isNaN(dropoffLat) &&
    !Number.isNaN(dropoffLng);

  // 1. Load latest rider GPS from Supabase & subscribe to realtime location broadcasts
  useEffect(() => {
    if (!deliveryTaskId) return;
    let active = true;

    const loadLatest = () => {
      LocationService.getLatestDeliveryLocation(deliveryTaskId).then((loc) => {
        if (active && loc) setRiderLoc(loc);
      });
    };

    loadLatest();
    const sub = LocationService.subscribeToDeliveryTracking(
      deliveryTaskId,
      (loc) => {
        if (active) setRiderLoc(loc);
      },
      loadLatest
    );

    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [deliveryTaskId]);

  const rawRiderLat = riderLoc?.latitude ?? riderCoordOverride?.latitude ?? null;
  const rawRiderLng = riderLoc?.longitude ?? riderCoordOverride?.longitude ?? null;
  const rawRecordedAt = riderLoc?.recordedAt ?? riderCoordOverride?.recordedAt ?? null;

  // Smooth marker coordinate interpolation between GPS updates
  const [animRiderPos, setAnimRiderPos] = useState<[number, number] | null>(
    rawRiderLat != null && rawRiderLng != null ? [rawRiderLat, rawRiderLng] : null
  );
  const prevRiderPosRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (rawRiderLat == null || rawRiderLng == null) return;
    const nextPos: [number, number] = [rawRiderLat, rawRiderLng];
    const startPos = prevRiderPosRef.current;
    prevRiderPosRef.current = nextPos;

    if (!startPos || (Math.abs(startPos[0] - nextPos[0]) < 0.00001 && Math.abs(startPos[1] - nextPos[1]) < 0.00001)) {
      setAnimRiderPos(nextPos);
      return;
    }

    let frameId = 0;
    const startTime = performance.now();
    const durationMs = 550;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = startPos[0] + (nextPos[0] - startPos[0]) * ease;
      const lng = startPos[1] + (nextPos[1] - startPos[1]) * ease;
      setAnimRiderPos([lat, lng]);
      if (t < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [rawRiderLat, rawRiderLng]);

  const headingToDropoff = ['food_collected', 'in_transit', 'delivered'].includes(taskStatus);
  const targetLat = headingToDropoff && hasDropoff ? dropoffLat! : hasPickup ? pickupLat! : null;
  const targetLng = headingToDropoff && hasDropoff ? dropoffLng! : hasPickup ? pickupLng! : null;

  const originPosLat = rawRiderLat ?? (hasPickup ? pickupLat! : null);
  const originPosLng = rawRiderLng ?? (hasPickup ? pickupLng! : null);
  const destLat = rawRiderLat != null ? targetLat : hasDropoff ? dropoffLat! : null;
  const destLng = rawRiderLng != null ? targetLng : hasDropoff ? dropoffLng! : null;
  const canComputeRoute =
    originPosLat != null && originPosLng != null && destLat != null && destLng != null;

  // 2. Fetch real road route polyline + distance + ETA
  useEffect(() => {
    if (!canComputeRoute || originPosLat == null || originPosLng == null || destLat == null || destLng == null) {
      return;
    }
    let active = true;

    LocationService.fetchRoadRoute(originPosLat, originPosLng, destLat, destLng).then((res) => {
      if (active) setRoute(res);
    });

    return () => {
      active = false;
    };
  }, [canComputeRoute, originPosLat, originPosLng, destLat, destLng]);

  const directDistanceKm = useMemo(() => {
    if (rawRiderLat != null && rawRiderLng != null && targetLat != null && targetLng != null) {
      return LocationService.calculateDistance(rawRiderLat, rawRiderLng, targetLat, targetLng);
    }
    return null;
  }, [rawRiderLat, rawRiderLng, targetLat, targetLng]);

  const effectiveRoute = canComputeRoute ? route : null;
  const distanceRemainingKm = effectiveRoute?.distanceKm ?? directDistanceKm ?? 1.2;
  const computedEta = useMemo(
    () =>
      effectiveRoute?.durationMin != null
        ? { minutes: effectiveRoute.durationMin, text: `${effectiveRoute.durationMin} min` }
        : LocationService.calculateEta(distanceRemainingKm),
    [effectiveRoute, distanceRemainingKm]
  );

  const isNearby =
    ['rider_assigned', 'going_to_pickup'].includes(taskStatus) &&
    directDistanceKm !== null &&
    directDistanceKm <= 0.3;

  const riderCalloutStatus = useMemo(() => {
    if (taskStatus === 'completed' || taskStatus === 'delivered') return 'Pickup Complete';
    if (taskStatus === 'food_collected' || taskStatus === 'in_transit') return 'Food Collected';
    if (taskStatus === 'arrived_at_pickup') return 'Reached Donor';
    if (isNearby) return 'Nearby';
    if (taskStatus === 'going_to_pickup') return 'On the Way';
    return 'On the Way';
  }, [taskStatus, isNearby]);

  const bannerInfo = useMemo(() => {
    const actor = riderName || 'Assigned Rider';
    if (taskStatus === 'completed' || taskStatus === 'delivered') {
      return {
        headline: 'Pickup completed!',
        subtext: `${actor} has completed the food pickup and delivery.`,
        pill: 'Done',
      };
    }
    if (taskStatus === 'food_collected' || taskStatus === 'in_transit') {
      return {
        headline: 'Food collected!',
        subtext: `${actor} has collected the food donation from the pickup location.`,
        pill: `${computedEta.minutes} min`,
      };
    }
    if (taskStatus === 'arrived_at_pickup') {
      return {
        headline: 'Rider reached donor location!',
        subtext: `${actor} is at the pickup location ready for food handover.`,
        pill: 'Arrived',
      };
    }
    if (isNearby) {
      return {
        headline: 'Rider is nearby!',
        subtext: `${actor} is less than 300m away and arriving shortly.`,
        pill: `${Math.min(2, computedEta.minutes)} min`,
      };
    }
    if (taskStatus === 'going_to_pickup') {
      return {
        headline: 'Rider is on the way!',
        subtext:
          viewerRole === 'donor'
            ? `${actor} will reach you soon to collect your food.`
            : `Heading to ${pickupLabel || 'donor pickup location'} for food collection.`,
        pill: `${computedEta.minutes} min`,
      };
    }
    return {
      headline: 'Rider is on the way!',
      subtext:
        viewerRole === 'donor'
          ? `${actor} has accepted your donation and is heading to your location.`
          : `Donation accepted — proceed to ${pickupLabel || 'donor pickup location'}.`,
      pill: `${computedEta.minutes} min`,
    };
  }, [taskStatus, isNearby, riderName, viewerRole, pickupLabel, computedEta.minutes]);

  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (hasPickup) pts.push([pickupLat!, pickupLng!]);
    if (hasDropoff && headingToDropoff) pts.push([dropoffLat!, dropoffLng!]);
    if (animRiderPos) pts.push(animRiderPos);
    else if (hasDropoff) pts.push([dropoffLat!, dropoffLng!]);
    return pts;
  }, [hasPickup, pickupLat, pickupLng, hasDropoff, dropoffLat, dropoffLng, headingToDropoff, animRiderPos]);

  const donorMarkerIcon = useMemo(
    () =>
      createDonorHomeIcon(
        viewerRole === 'donor' ? 'Your Location' : 'Pickup Location',
        viewerRole === 'donor' ? '(Donor)' : '(Donor)'
      ),
    [viewerRole]
  );

  const riderMarkerIcon = useMemo(
    () => createRiderScooterIcon(riderCalloutStatus),
    [riderCalloutStatus]
  );

  const destMarkerIcon = useMemo(
    () => createDestinationIcon(dropoffLabel || 'Destination'),
    [dropoffLabel]
  );

  const liveTimestampLabel = useMemo(() => {
    if (rawRecordedAt) {
      return `Live • ${formatDistanceToNow(new Date(rawRecordedAt), { addSuffix: true })}`;
    }
    return 'Live • GPS Active';
  }, [rawRecordedAt]);

  // 5-stage Zomato vertical timeline stage index (0..4)
  const activeStageIndex = useMemo(() => {
    switch (taskStatus) {
      case 'rider_assigned':
        return 0;
      case 'going_to_pickup':
        return 1;
      case 'arrived_at_pickup':
        return 2;
      case 'food_collected':
      case 'in_transit':
        return 3;
      case 'delivered':
      case 'completed':
        return 4;
      default:
        return 0;
    }
  }, [taskStatus]);

  const timelineStages = useMemo(() => {
    const fmtTime = (iso?: string) =>
      iso
        ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return [
      {
        key: 'accepted',
        label: 'Rider Accepted',
        time: activeStageIndex >= 0 ? fmtTime(assignedAt) : '',
      },
      {
        key: 'on_the_way',
        label: isNearby ? 'Rider is Nearby' : 'On the Way',
        time: activeStageIndex >= 1 ? fmtTime(rawRecordedAt || updatedAt) : '',
      },
      {
        key: 'reached',
        label: 'Reached Donor',
        time: activeStageIndex >= 2 ? fmtTime(updatedAt) : '',
      },
      {
        key: 'collected',
        label: 'Food Collected',
        time: activeStageIndex >= 3 ? fmtTime(updatedAt) : '',
      },
      {
        key: 'completed',
        label: 'Pickup Complete',
        time: activeStageIndex >= 4 ? fmtTime(updatedAt) : '',
      },
    ];
  }, [activeStageIndex, isNearby, assignedAt, rawRecordedAt, updatedAt]);

  if (points.length === 0) {
    return (
      <div
        style={{
          padding: '16px 18px',
          background: '#fffaf5',
          border: '1px solid #fed7aa',
          borderRadius: 14,
          fontSize: 13,
          color: '#9a3412',
        }}
      >
        Initializing live pickup coordinates on ShareBite Map...
      </div>
    );
  }

  const counterpartName = viewerRole === 'donor' ? riderName || 'Assigned Rider' : donorName || 'Food Donor';
  const counterpartPhone = viewerRole === 'donor' ? riderPhone : donorPhone;
  const counterpartSubtitle =
    viewerRole === 'donor' ? '4.9 (Verified ShareBite Rider)' : pickupLabel || 'Donor Pickup Point';

  const mapAndBanner = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minWidth: 0 }}>
      {/* Interactive Embedded Map Canvas */}
      <div
        style={{
          position: 'relative',
          height,
          width: '100%',
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid #f1e4d3',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
          background: '#f8fafc',
        }}
      >
        {/* Top-Left Live Status Pill Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            zIndex: 500,
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            borderRadius: 999,
            padding: '6px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
            border: '1px solid #fed7aa',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#1e293b',
          }}
        >
          <Radio size={14} color="#ea580c" />
          <span>{liveTimestampLabel}</span>
        </div>

        {/* Top-Right Custom Zoom & Recenter Controls */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 500,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <button
              type="button"
              aria-label="Zoom in map"
              onClick={() => setZoomSignal((s) => ({ seq: s.seq + 1, delta: 1 }))}
              style={{
                width: 36,
                height: 36,
                border: 'none',
                borderBottom: '1px solid #f1f5f9',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              aria-label="Zoom out map"
              onClick={() => setZoomSignal((s) => ({ seq: s.seq + 1, delta: -1 }))}
              style={{
                width: 36,
                height: 36,
                border: 'none',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Minus size={16} />
            </button>
          </div>

          <button
            type="button"
            aria-label="Recenter live tracking map"
            title="Fit rider and donor on map"
            onClick={() => setRecenterSeq((c) => c + 1)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#ea580c',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LocateFixed size={16} />
          </button>
        </div>

        {/* Bottom-Left Google Maps Cartography Watermark Badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 12,
            zIndex: 500,
            background: 'rgba(255,255,255,0.9)',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: -0.2,
            pointerEvents: 'none',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
          aria-hidden="true"
        >
          <span style={{ color: '#4285F4' }}>G</span>
          <span style={{ color: '#EA4335' }}>o</span>
          <span style={{ color: '#FBBC05' }}>o</span>
          <span style={{ color: '#4285F4' }}>g</span>
          <span style={{ color: '#34A853' }}>l</span>
          <span style={{ color: '#EA4335' }}>e</span>
        </div>

        <MapContainer
          center={points[0]}
          zoom={14}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution="&copy; Google Maps"
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />
          <MapViewportController
            points={points}
            recenterSignal={recenterSeq}
            zoomDeltaSignal={zoomSignal}
          />

          {hasPickup && (
            <Marker position={[pickupLat!, pickupLng!]} icon={donorMarkerIcon}>
              <Popup>
                <strong>Donor Pickup Location</strong>
                <br />
                {pickupLabel}
              </Popup>
            </Marker>
          )}

          {hasDropoff && headingToDropoff && (
            <Marker position={[dropoffLat!, dropoffLng!]} icon={destMarkerIcon}>
              <Popup>
                <strong>Destination:</strong> {dropoffLabel}
              </Popup>
            </Marker>
          )}

          {animRiderPos && (
            <Marker position={animRiderPos} icon={riderMarkerIcon}>
              <Popup>
                <strong>{riderName || 'ShareBite Rider'}</strong> · {riderCalloutStatus}
                <br />
                {rawRecordedAt
                  ? `Updated ${formatDistanceToNow(new Date(rawRecordedAt), { addSuffix: true })}`
                  : 'Live GPS Tracking'}
              </Popup>
            </Marker>
          )}

          {effectiveRoute && effectiveRoute.coordinates.length >= 2 && (
            <>
              <Polyline
                positions={effectiveRoute.coordinates}
                pathOptions={{
                  color: '#93c5fd',
                  weight: 9,
                  opacity: 0.45,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={effectiveRoute.coordinates}
                pathOptions={{
                  color: '#2563eb',
                  weight: 4.5,
                  opacity: 0.96,
                  lineCap: 'round',
                  lineJoin: 'round',
                  dashArray: effectiveRoute.isRoadRoute ? undefined : '8, 8',
                }}
              />
            </>
          )}
        </MapContainer>
      </div>

      {/* Bottom Zomato-Style Peach Live Status & ETA Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #fff4e6 0%, #ffe8cc 100%)',
          border: '1px solid #fed7aa',
          borderRadius: 18,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, flex: 1 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#ffffff',
              border: '1px solid #fed7aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(234, 88, 12, 0.12)',
            }}
            aria-hidden="true"
          >
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
              <circle cx="18" cy="48" r="8" fill="#1E293B" />
              <circle cx="48" cy="48" r="8" fill="#1E293B" />
              <rect x="10" y="24" width="14" height="12" rx="3" fill="#EA580C" />
              <path d="M14 44C14 38 20 35 28 35H38L46 44H14Z" fill="#EA580C" />
              <circle cx="31" cy="16" r="6" fill="#F97316" />
              <path d="M26 23C26 20 35 20 36 24L40 31H27L26 23Z" fill="#1E293B" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', lineHeight: 1.25 }}>
              {bannerInfo.headline}
            </div>
            <div style={{ fontSize: 13, color: '#57534e', marginTop: 2 }}>
              {bannerInfo.subtext}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            borderRadius: 999,
            padding: '9px 18px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            boxShadow: '0 4px 12px rgba(234, 88, 12, 0.12)',
            border: '1px solid #fed7aa',
            fontWeight: 800,
            fontSize: 16,
            color: '#1e293b',
            flexShrink: 0,
          }}
        >
          <Clock size={17} color="#ea580c" />
          <span>{bannerInfo.pill}</span>
        </div>
      </div>
    </div>
  );

  if (!showTrackingPanel) {
    return <div style={{ marginTop: 10, marginBottom: 10 }}>{mapAndBanner}</div>;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
        gap: 18,
        alignItems: 'start',
        marginTop: 10,
        marginBottom: 10,
      }}
    >
      <div style={{ gridColumn: 'span 1', minWidth: 0 }}>{mapAndBanner}</div>

      {/* Right Column: Zomato-Style Tracking Information Panel */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1px solid #f1e4d3',
          padding: '20px 22px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Rider / Donor Profile Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: 19,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
            }}
          >
            {counterpartName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#1e293b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {counterpartName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
              <Star size={13} fill="#f59e0b" color="#f59e0b" />
              <span>{counterpartSubtitle}</span>
            </div>
          </div>
        </div>

        {/* Call & Chat Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {counterpartPhone ? (
            <a
              href={`tel:${counterpartPhone}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '10px 12px',
                borderRadius: 14,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#c2410c',
                fontWeight: 700,
                fontSize: 12.5,
                textDecoration: 'none',
              }}
            >
              <Phone size={17} color="#ea580c" />
              <span>Call</span>
            </a>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '10px 12px',
                borderRadius: 14,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#94a3b8',
                fontWeight: 700,
                fontSize: 12.5,
              }}
            >
              <Phone size={17} />
              <span>Call</span>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenChat}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '10px 12px',
              borderRadius: 14,
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              color: '#c2410c',
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            <MessageSquare size={17} color="#ea580c" />
            <span>Chat</span>
          </button>
        </div>

        {/* Distance Remaining & Estimated Arrival Metrics */}
        <div
          style={{
            borderTop: '1px solid #f1f5f9',
            borderBottom: '1px solid #f1f5f9',
            padding: '14px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#fff7ed',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MapPin size={17} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Distance Remaining</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {taskStatus === 'arrived_at_pickup' || taskStatus === 'completed'
                  ? '0.0 km'
                  : `${distanceRemainingKm} km`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#fff7ed',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={17} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Estimated Arrival</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {taskStatus === 'arrived_at_pickup'
                  ? 'Reached Donor'
                  : taskStatus === 'completed' || taskStatus === 'delivered'
                  ? 'Completed'
                  : `${computedEta.minutes} min`}
              </div>
            </div>
          </div>
        </div>

        {/* 5-Stage Zomato Vertical Pickup Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {timelineStages.map((stage, idx) => {
            const isCompleted = idx < activeStageIndex;
            const isCurrent = idx === activeStageIndex;
            const isLast = idx === timelineStages.length - 1;

            return (
              <div key={stage.key} style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 22 }}>
                  <div
                    style={{
                      width: isCurrent ? 18 : 13,
                      height: isCurrent ? 18 : 13,
                      borderRadius: '50%',
                      background: isCompleted || isCurrent ? '#ea580c' : '#e2e8f0',
                      border: isCurrent ? '3px solid #ffedd5' : '2px solid #ffffff',
                      boxShadow: isCurrent ? '0 0 0 2px #ea580c' : 'none',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  {!isLast && (
                    <div
                      style={{
                        width: 2,
                        flex: 1,
                        minHeight: 22,
                        background: isCompleted ? '#ea580c' : '#e2e8f0',
                        margin: '3px 0',
                      }}
                    />
                  )}
                </div>

                <div style={{ paddingBottom: isLast ? 2 : 14, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: isCurrent ? 800 : isCompleted ? 700 : 600,
                      color: isCurrent ? '#ea580c' : isCompleted ? '#1e293b' : '#94a3b8',
                      lineHeight: 1.25,
                    }}
                  >
                    {stage.label}
                  </div>
                  {stage.time && (
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{stage.time}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {actionSlot && <div style={{ paddingTop: 4 }}>{actionSlot}</div>}
      </div>
    </div>
  );
}
