import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { Clock, Navigation } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LocationService, type RoadRouteResult } from '../../services/location';
import type { RiderLocationUpdate } from '../../types';
import 'leaflet/dist/leaflet.css';
import '../../styles/leaflet-fix.css';

interface Props {
  deliveryTaskId: string;
  taskStatus: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel?: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  dropoffLabel?: string;
  height?: number;
}

function createPin(color: string, emoji: string, pulse = false) {
  return divIcon({
    className: '',
    html: `<div style="
      position:relative;width:32px;height:32px;background:${color};
      border-radius:50%;border:2.5px solid #fff;
      box-shadow:0 3px 10px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;font-size:15px;
      ${pulse ? 'outline:4px solid rgba(37,99,235,0.25);' : ''}
    ">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function FitMapBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join('|');
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length >= 2) {
      map.fitBounds(points, { padding: [36, 36], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
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
  height = 240,
}: Props) {
  const [riderLoc, setRiderLoc] = useState<RiderLocationUpdate | null>(null);
  const [route, setRoute] = useState<RoadRouteResult | null>(null);

  const hasPickup = typeof pickupLat === 'number' && typeof pickupLng === 'number' && !isNaN(pickupLat) && !isNaN(pickupLng);
  const hasDropoff = typeof dropoffLat === 'number' && typeof dropoffLng === 'number' && !isNaN(dropoffLat) && !isNaN(dropoffLng);

  // 1. Load latest real rider GPS and subscribe to live Supabase Realtime updates
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

  // Target coordinate depends on lifecycle stage: going to pickup vs heading to NGO
  const headingToDropoff = ['food_collected', 'in_transit', 'delivered'].includes(taskStatus);
  const targetLat = headingToDropoff && hasDropoff ? dropoffLat! : hasPickup ? pickupLat! : null;
  const targetLng = headingToDropoff && hasDropoff ? dropoffLng! : hasPickup ? pickupLng! : null;

  // 2. Fetch real road route polyline between rider (or pickup) and destination
  useEffect(() => {
    let active = true;
    const fromLat = riderLoc?.latitude ?? (hasPickup ? pickupLat! : null);
    const fromLng = riderLoc?.longitude ?? (hasPickup ? pickupLng! : null);
    const toLat = riderLoc ? targetLat : hasDropoff ? dropoffLat! : null;
    const toLng = riderLoc ? targetLng : hasDropoff ? dropoffLng! : null;

    if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
      setRoute(null);
      return;
    }

    LocationService.fetchRoadRoute(fromLat, fromLng, toLat, toLng).then((res) => {
      if (active) setRoute(res);
    });

    return () => {
      active = false;
    };
  }, [riderLoc?.latitude, riderLoc?.longitude, targetLat, targetLng, hasPickup, hasDropoff, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (hasPickup) pts.push([pickupLat!, pickupLng!]);
    if (hasDropoff) pts.push([dropoffLat!, dropoffLng!]);
    if (riderLoc) pts.push([riderLoc.latitude, riderLoc.longitude]);
    return pts;
  }, [hasPickup, pickupLat, pickupLng, hasDropoff, dropoffLat, dropoffLng, riderLoc]);

  if (points.length === 0) {
    return (
      <div style={{ padding: '12px 14px', background: '#f9fafb', borderRadius: 10, fontSize: 13, color: '#6b7280' }}>
        Waiting for GPS coordinates for this delivery...
      </div>
    );
  }

  const navLat = targetLat ?? dropoffLat ?? pickupLat;
  const navLng = targetLng ?? dropoffLng ?? pickupLng;

  return (
    <div style={{ marginTop: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8, fontSize: 12, color: '#4b5563' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} color={riderLoc ? '#16a34a' : '#d97706'} />
          {riderLoc ? (
            <span>
              <strong style={{ color: '#16a34a' }}>Live GPS</strong> · Updated{' '}
              {formatDistanceToNow(new Date(riderLoc.recordedAt), { addSuffix: true })}
              {route ? ` · ${route.distanceKm} km (~${route.durationMin} mins)` : ''}
            </span>
          ) : (
            <span style={{ color: '#92400e' }}>
              Waiting for rider&apos;s live GPS signal
              {route ? ` · Route ${route.distanceKm} km (~${route.durationMin} mins)` : ''}
            </span>
          )}
        </div>
        {navLat != null && navLng != null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${navLat},${navLng}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#ea580c', fontWeight: 600, textDecoration: 'none' }}
          >
            <Navigation size={12} /> Open in Google Maps
          </a>
        )}
      </div>

      <div style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        <MapContainer center={points[0]} zoom={14} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitMapBounds points={points} />

          {hasPickup && (
            <Marker position={[pickupLat!, pickupLng!]} icon={createPin('#ea580c', '🍱')}>
              <Popup>
                <strong>Pickup:</strong> {pickupLabel}
              </Popup>
            </Marker>
          )}

          {hasDropoff && (
            <Marker position={[dropoffLat!, dropoffLng!]} icon={createPin('#16a34a', '🏛️')}>
              <Popup>
                <strong>Destination:</strong> {dropoffLabel}
              </Popup>
            </Marker>
          )}

          {riderLoc && (
            <Marker position={[riderLoc.latitude, riderLoc.longitude]} icon={createPin('#2563eb', '🛵', true)}>
              <Popup>
                <strong>Rider Live Location</strong>
                <br />
                Updated {formatDistanceToNow(new Date(riderLoc.recordedAt), { addSuffix: true })}
              </Popup>
            </Marker>
          )}

          {route && route.coordinates.length >= 2 && (
            <Polyline
              positions={route.coordinates}
              pathOptions={{ color: '#ea580c', weight: 4, opacity: 0.85, dashArray: route.isRoadRoute ? undefined : '6, 8' }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
