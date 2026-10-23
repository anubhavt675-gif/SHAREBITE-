import { supabase } from '../lib/supabase';
import type { RiderLocationUpdate } from '../types';

export interface Coordinates {
  latitude: number;
  longitude: number;
  city?: string;
}

// Default center (Bhopal, MP — matching the UI prototype)
export const DEFAULT_COORDINATES: Coordinates = {
  latitude: 23.2599,
  longitude: 77.4126,
  city: 'Bhopal',
};

export class LocationService {
  /**
   * Get the current device coordinates via HTML5 Geolocation API with graceful fallback
   */
  static async getCurrentCoordinates(): Promise<Coordinates> {
    if (!navigator.geolocation) {
      return DEFAULT_COORDINATES;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Geolocation access failed or denied:', error.message);
          resolve(DEFAULT_COORDINATES);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  /**
   * Watch live location updates
   */
  static watchLocation(
    onLocation: (coords: Coordinates) => void,
    onError?: (err: GeolocationPositionError) => void
  ): number | null {
    if (!navigator.geolocation) return null;
    return navigator.geolocation.watchPosition(
      (pos) => {
        onLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }

  static clearWatch(watchId: number | null): void {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  /**
   * Haversine formula for distance calculation in kilometers
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Zomato-style realistic city delivery ETA estimate based on distance
   */
  static calculateEta(distanceKm: number, avgSpeedKmh = 25): { minutes: number; text: string } {
    if (distanceKm <= 0.1) {
      return { minutes: 1, text: 'Arriving now' };
    }
    // Urban motorbike transit with signal/traffic overhead (+2 min buffer)
    const rawMinutes = (distanceKm / avgSpeedKmh) * 60 + 2;
    const minutes = Math.max(2, Math.round(rawMinutes));
    const text = minutes < 60 ? `${minutes} mins` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return { minutes, text };
  }

  static calculateEtaBetween(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    avgSpeedKmh = 25
  ): { distanceKm: number; minutes: number; text: string } {
    const distanceKm = LocationService.calculateDistance(lat1, lon1, lat2, lon2);
    const { minutes, text } = LocationService.calculateEta(distanceKm, avgSpeedKmh);
    return { distanceKm, minutes, text };
  }

  /**
   * Broadcast rider location to database and realtime subscribers
   */
  static async updateRiderLocation(params: {
    riderId: string;
    deliveryTaskId?: string;
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
  }): Promise<void> {
    try {
      // Resolve the riders.id (PK) from the auth user UUID (user_id FK)
      // These are two different UUIDs — riders.id != auth.users.id
      let riderRowId = params.riderId; // fallback (may fail FK if wrong, but better than nothing)
      try {
        const { data: riderRow } = await supabase
          .from('riders')
          .select('id')
          .eq('user_id', params.riderId)
          .maybeSingle();
        if (riderRow?.id) riderRowId = riderRow.id;
      } catch {}

      // 1. Record historical update in rider_location_updates (uses riders.id PK)
      await supabase.from('rider_location_updates').insert({
        rider_id: riderRowId,
        delivery_task_id: params.deliveryTaskId || null,
        latitude: params.latitude,
        longitude: params.longitude,
        heading: params.heading || null,
        speed: params.speed || null,
      });

      // 2. Update current position on riders table (filter by user_id, not id)
      await supabase
        .from('riders')
        .update({
          current_lat: params.latitude,
          current_lng: params.longitude,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', params.riderId);
    } catch (err) {
      console.error('Error broadcasting rider location:', err);
    }
  }

  /**
   * Subscribe to live location updates for a specific delivery task
   */
  static subscribeToDeliveryTracking(
    deliveryTaskId: string,
    onLocation: (loc: RiderLocationUpdate) => void
  ) {
    const channel = supabase
      .channel(`rider-loc:${deliveryTaskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rider_location_updates',
          filter: `delivery_task_id=eq.${deliveryTaskId}`,
        },
        (payload) => {
          const row = payload.new as any;
          onLocation({
            id: row.id,
            riderId: row.rider_id,
            deliveryTaskId: row.delivery_task_id,
            latitude: row.latitude,
            longitude: row.longitude,
            heading: row.heading,
            speed: row.speed,
            recordedAt: row.recorded_at,
          });
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  }

  /**
   * Fetch the most recent location for a delivery task
   */
  static async getLatestDeliveryLocation(
    deliveryTaskId: string
  ): Promise<RiderLocationUpdate | null> {
    const { data, error } = await supabase
      .from('rider_location_updates')
      .select('*')
      .eq('delivery_task_id', deliveryTaskId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      riderId: data.rider_id,
      deliveryTaskId: data.delivery_task_id,
      latitude: data.latitude,
      longitude: data.longitude,
      heading: data.heading,
      speed: data.speed,
      recordedAt: data.recorded_at,
    };
  }
}
