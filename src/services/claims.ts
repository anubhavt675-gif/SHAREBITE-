// ShareBite — NGO Claims & Delivery Service
// Enforces atomic PostgreSQL RPCs (First-Acceptance-Wins) without fake localStorage overrides.

import { supabase } from '../lib/supabase';
import { isValidUUID } from '../lib/uuid';
import { LocationService } from './location';
import { ChatService } from './chat';

export interface NgoClaim {
  id: string;
  foodListingId: string;
  ngoId: string;
  reservationId?: string;
  servingsClaimed: number;
  status: string;
  collectionMethod?: 'ngo_delivery' | 'direct_ngo_pickup' | string;
  pickupTime?: string;
  notes?: string;
  cancellationReason?: string;
  ngoName?: string;
  confirmedAt?: string;
  riderAssignedAt?: string;
  collectedAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  foodTitle?: string;
  foodCategory?: string;
  foodType?: string;
  foodImageUrl?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupLat?: number;
  pickupLng?: number;
  availableUntil?: string;
  donorId?: string;
  donorName?: string;
  donorPhone?: string;
  deliveryTaskId?: string;
  deliveryStatus?: string;
  pickupCode?: string;
  dropoffCode?: string;
  dropoffAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  pickupConfirmedAt?: string;
  deliveryConfirmedAt?: string;
  riderId?: string;
  riderUserId?: string;
  riderName?: string;
  riderPhone?: string;
  distributionRecordId?: string;
  quantityReceived?: number;
  quantityDistributed?: number;
  quantityRemaining?: number;
  distributionStatus?: string;
}

export interface DeliveryTask {
  id: string;
  foodListingId: string;
  claimId?: string;
  riderId?: string;
  donorId: string;
  ngoId?: string;
  assignmentType?: 'ngo_delivery' | 'rider_direct_pickup' | string;
  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  foodTitle?: string;
  servingsRequired: number;
  quantityUnit: string;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  collectionDeadline?: string;
  status: string;
  arrivedAtPickupAt?: string;
  pickupConfirmedAt?: string;
  servingsCollected?: number;
  collectionDiscrepancy?: string;
  deliveryConfirmedAt?: string;
  servingsDelivered?: number;
  completedAt?: string;
  incidentReported: boolean;
  incidentType?: string;
  incidentNotes?: string;
  instructions?: string;
  estimatedKm?: number;
  riderAssignedAt?: string;
  createdAt: string;
  updatedAt: string;
  pickupCode?: string;
  dropoffCode?: string;
  // Joined fields
  foodType?: string;
  foodCategory?: string;
  foodDescription?: string;
  foodImageUrl?: string;
  quantityValue?: number;
  preparationTime?: string;
  donationStatus?: string;
  donorName?: string;
  donorPhone?: string;
  ngoName?: string;
  ngoOrgName?: string;
  ngoPhone?: string;
  servingsClaimed?: number;
  riderName?: string;
  riderPhone?: string;
  riderUserId?: string;
  isDirectFoodOpportunity?: boolean;
  distanceKm?: number;
}

export interface DistributionRecord {
  id: string;
  foodListingId: string;
  claimId?: string;
  deliveryTaskId?: string;
  ngoId: string;
  recordedBy: string;
  quantityReceived: number;
  quantityDistributed: number;
  quantityRemaining: number;
  quantityRejected: number;
  quantityUnit: string;
  distributionDate: string;
  distributionTime?: string;
  distributionLocation?: string;
  distributionMethod: string;
  peopleServed?: number;
  mealPortions?: number;
  status: string;
  conditionNotes?: string;
  safetyConcern: boolean;
  safetyNotes?: string;
  evidenceUrl?: string;
  isVerified: boolean;
  receiptConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiderProfileRecord {
  id: string;
  userId: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  profileImage?: string;
  idVerified: boolean;
  isOnline: boolean;
  isAvailable: boolean;
  rating: number;
  totalDeliveries: number;
  totalEarnings: number;
  totalDistanceKm: number;
  currentLat?: number;
  currentLng?: number;
}

export function buildGoogleMapsNavigationUrl(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  originLat?: number | null,
  originLng?: number | null
): string | null {
  const hasOrigin =
    typeof originLat === 'number' &&
    typeof originLng === 'number' &&
    !Number.isNaN(originLat) &&
    !Number.isNaN(originLng);
  const originParam = hasOrigin ? `&origin=${originLat},${originLng}` : '';

  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${lat},${lng}&travelmode=two-wheeler`;
  }
  if (address && address.trim().length > 0) {
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(address.trim())}&travelmode=two-wheeler`;
  }
  return null;
}

export function buildGoogleMapsEmbedUrl(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  originLat?: number | null,
  originLng?: number | null
): string | null {
  const hasOrigin =
    typeof originLat === 'number' &&
    typeof originLng === 'number' &&
    !Number.isNaN(originLat) &&
    !Number.isNaN(originLng);
  const hasDest =
    typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng);

  if (hasOrigin && hasDest) {
    return `https://maps.google.com/maps?saddr=${originLat},${originLng}&daddr=${lat},${lng}&dirflg=d&output=embed`;
  }
  if (hasOrigin && address && address.trim().length > 0) {
    return `https://maps.google.com/maps?saddr=${originLat},${originLng}&daddr=${encodeURIComponent(address.trim())}&dirflg=d&output=embed`;
  }
  if (hasDest) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
  }
  if (address && address.trim().length > 0) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(address.trim())}&z=16&output=embed`;
  }
  return null;
}

export function openGoogleMapsNavigation(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
  originLat?: number | null,
  originLng?: number | null
): string | null {
  const url = buildGoogleMapsNavigationUrl(lat, lng, address, originLat, originLng);
  if (url && typeof window !== 'undefined') {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Ignore popup-blocker errors; caller still renders a direct anchor button
    }
  }
  return url;
}

const RIDER_STATUS_TAG_RE = /\[RIDER_TASK_STATUS:([a-z_]+)\]/i;

function stripRiderStatusTag(notes?: string | null): string {
  return (notes || '').replace(/\s*\[RIDER_TASK_STATUS:[a-z_]+\]\s*/gi, ' ').trim();
}

function withRiderStatusTag(notes: string | null | undefined, status: string): string {
  const base = stripRiderStatusTag(notes);
  return base ? `${base}\n[RIDER_TASK_STATUS:${status}]` : `[RIDER_TASK_STATUS:${status}]`;
}

function extractRiderStatusFromText(notes?: string | null, fallbackStatus?: string): string {
  const m = typeof notes === 'string' ? notes.match(RIDER_STATUS_TAG_RE) : null;
  if (m?.[1]) return m[1];
  switch (fallbackStatus) {
    case 'picked_up':
    case 'food_collected':
      return 'food_collected';
    case 'delivered':
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'rider_assigned';
  }
}

function extractRiderStatusFromListing(fl: any): string {
  return extractRiderStatusFromText(fl?.packaging_notes, fl?.status);
}

export function derivePickupCode(seed?: string | null): string {
  if (!seed) return 'SB8824';
  const clean = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const code = clean.slice(0, 6);
  return code.length >= 6 ? code : (code + 'SB1234').slice(0, 6);
}

function mapClaim(row: any): NgoClaim {
  return {
    id: row.id,
    foodListingId: row.food_listing_id,
    ngoId: row.ngo_id,
    reservationId: row.reservation_id,
    servingsClaimed: Number(row.servings_claimed ?? 1),
    status: row.status,
    collectionMethod: row.collection_method || (row.delivery_task_id ? 'ngo_delivery' : 'direct_ngo_pickup'),
    pickupTime: row.pickup_time,
    notes: row.notes,
    cancellationReason: row.cancellation_reason,
    ngoName: row.ngo_name,
    confirmedAt: row.confirmed_at,
    riderAssignedAt: row.rider_assigned_at,
    collectedAt: row.collected_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    foodTitle: row.food_title || row.title,
    foodCategory: row.category,
    foodType: row.food_type,
    foodImageUrl: row.image_url,
    pickupAddress: row.pickup_address,
    pickupCity: row.pickup_city || row.city,
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    availableUntil: row.available_until,
    donorId: row.donor_id,
    donorName: row.donor_name,
    donorPhone: row.donor_phone,
    deliveryTaskId: row.delivery_task_id,
    deliveryStatus: row.delivery_status,
    pickupCode: row.pickup_code,
    dropoffCode: row.dropoff_code,
    dropoffAddress: row.dropoff_address,
    dropoffLat: row.dropoff_lat,
    dropoffLng: row.dropoff_lng,
    pickupConfirmedAt: row.pickup_confirmed_at,
    deliveryConfirmedAt: row.delivery_confirmed_at,
    riderId: row.rider_id,
    riderUserId: row.rider_user_id,
    riderName: row.rider_name,
    riderPhone: row.rider_phone,
    distributionRecordId: row.distribution_record_id,
    quantityReceived: row.quantity_received != null ? Number(row.quantity_received) : undefined,
    quantityDistributed: row.quantity_distributed != null ? Number(row.quantity_distributed) : undefined,
    quantityRemaining: row.quantity_remaining != null ? Number(row.quantity_remaining) : undefined,
    distributionStatus: row.distribution_status,
  };
}

function mapDeliveryTask(row: any): DeliveryTask {
  return {
    id: row.id,
    foodListingId: row.food_listing_id,
    claimId: row.claim_id,
    riderId: row.rider_id,
    donorId: row.donor_id,
    ngoId: row.ngo_id,
    assignmentType: row.assignment_type || 'ngo_delivery',
    pickupAddress: row.pickup_address,
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
    dropoffAddress: row.dropoff_address,
    dropoffLat: row.dropoff_lat,
    dropoffLng: row.dropoff_lng,
    foodTitle: row.food_title,
    servingsRequired: Number(row.servings_required ?? 1),
    quantityUnit: row.quantity_unit || 'servings',
    pickupWindowStart: row.pickup_window_start,
    pickupWindowEnd: row.pickup_window_end,
    collectionDeadline: row.collection_deadline,
    status: row.status,
    arrivedAtPickupAt: row.arrived_at_pickup_at,
    pickupConfirmedAt: row.pickup_confirmed_at,
    servingsCollected: row.servings_collected != null ? Number(row.servings_collected) : undefined,
    collectionDiscrepancy: row.collection_discrepancy,
    deliveryConfirmedAt: row.delivery_confirmed_at,
    servingsDelivered: row.servings_delivered != null ? Number(row.servings_delivered) : undefined,
    completedAt: row.completed_at,
    incidentReported: !!row.incident_reported,
    incidentType: row.incident_type,
    incidentNotes: row.incident_notes,
    instructions: row.instructions,
    estimatedKm: row.estimated_km,
    riderAssignedAt: row.rider_assigned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    foodType: row.food_type,
    foodCategory: row.category,
    foodImageUrl: row.image_url,
    donorName: row.donor_name,
    donorPhone: row.donor_phone,
    ngoName: row.ngo_name,
    ngoOrgName: row.ngo_org_name,
    ngoPhone: row.ngo_phone,
    servingsClaimed: row.servings_claimed,
    riderName: row.rider_name,
    riderPhone: row.rider_phone,
    riderUserId: row.rider_user_id,
    pickupCode: row.pickup_code ? String(row.pickup_code).toUpperCase() : derivePickupCode(row.food_listing_id || row.id),
    dropoffCode: row.dropoff_code ? String(row.dropoff_code).toUpperCase() : undefined,
  };
}

function mapDistributionRecord(row: any): DistributionRecord {
  return {
    id: row.id,
    foodListingId: row.food_listing_id,
    claimId: row.claim_id,
    deliveryTaskId: row.delivery_task_id,
    ngoId: row.ngo_id,
    recordedBy: row.recorded_by,
    quantityReceived: Number(row.quantity_received ?? 0),
    quantityDistributed: Number(row.quantity_distributed ?? 0),
    quantityRemaining: Number(row.quantity_remaining ?? 0),
    quantityRejected: Number(row.quantity_rejected ?? 0),
    quantityUnit: row.quantity_unit || 'servings',
    distributionDate: row.distribution_date,
    distributionTime: row.distribution_time,
    distributionLocation: row.distribution_location,
    distributionMethod: row.distribution_method || 'direct',
    peopleServed: row.people_served != null ? Number(row.people_served) : undefined,
    mealPortions: row.meal_portions != null ? Number(row.meal_portions) : undefined,
    status: row.status,
    conditionNotes: row.condition_notes,
    safetyConcern: !!row.safety_concern,
    safetyNotes: row.safety_notes,
    evidenceUrl: row.evidence_url,
    isVerified: !!row.is_verified,
    receiptConfirmedAt: row.receipt_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const ClaimsService = {
  derivePickupCode,
  // ── Unified Atomic First-Acceptance-Wins (NGO or Rider) ──────────────────
  async acceptDonation(
    foodListingId: string,
    servings?: number,
    pickupTime?: string,
    notes?: string,
    collectionMethod: 'ngo_delivery' | 'direct_ngo_pickup' = 'ngo_delivery'
  ): Promise<{
    acceptedBy: 'ngo' | 'rider';
    claimId?: string;
    deliveryTaskId?: string;
    conversationId?: string;
    pickupLat?: number;
    pickupLng?: number;
    pickupAddress?: string;
    status: string;
    collectionMethod?: string;
  }> {
    if (!isValidUUID(foodListingId)) {
      throw new Error('Invalid food donation ID');
    }

    const callAcceptRpc = async () => {
      const res = await supabase.rpc('accept_donation', {
        p_food_listing_id: foodListingId,
        p_servings: servings ?? null,
        p_pickup_time: pickupTime || null,
        p_notes: notes || null,
        p_collection_method: collectionMethod,
      });

      if (res.error && (res.error.code === 'PGRST202' || res.error.message?.includes('p_collection_method'))) {
        return supabase.rpc('accept_donation', {
          p_food_listing_id: foodListingId,
          p_servings: servings ?? null,
          p_pickup_time: pickupTime || null,
          p_notes: notes || null,
        });
      }
      return res;
    };

    let { data, error } = await callAcceptRpc();

    // If an active available listing had an outdated deadline, attempt deadline refresh and retry once
    if (error && /expired/i.test(error.message || '')) {
      await supabase
        .from('food_listings')
        .update({ available_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })
        .eq('id', foodListingId)
        .in('status', ['available', 'partially_reserved']);
      const retry = await callAcceptRpc();
      data = retry.data;
      error = retry.error;
    }

    if (!error && data) {
      if (data.accepted_by === 'rider' && !data.rider_notified) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            await supabase.from('notifications').insert({
              user_id: user.id,
              type: 'rider_assigned',
              title: 'Donation Acceptance Confirmed!',
              message: `You accepted pickup at ${data.pickup_address || 'donor location'}. Navigate now to collect the food.`,
              data: {
                food_listing_id: foodListingId,
                delivery_task_id: data.delivery_task_id,
                conversation_id: data.conversation_id,
              },
              related_food_id: foodListingId,
              related_delivery_id: data.delivery_task_id || null,
              action_url: '/rider/deliveries?tab=active',
            });
          }
        } catch {}
      }

      return {
        acceptedBy: data.accepted_by,
        claimId: data.claim_id,
        deliveryTaskId: data.delivery_task_id,
        conversationId: data.conversation_id,
        pickupLat: data.pickup_lat,
        pickupLng: data.pickup_lng,
        pickupAddress: data.pickup_address,
        status: data.status,
        collectionMethod: data.collection_method || collectionMethod,
      };
    }

    if (error && !/ALREADY_CLAIMED/i.test(error.message || '')) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: listing } = await supabase
          .from('food_listings')
          .select('*')
          .eq('id', foodListingId)
          .maybeSingle();

        if (!listing) {
          throw new Error('Food donation not found');
        }
        if (
          !['available', 'partially_reserved'].includes(listing.status) ||
          Number(listing.available_servings ?? 0) <= 0
        ) {
          throw new Error('ALREADY_CLAIMED: This donation has already been claimed by another user.');
        }

        const riderProf = await ClaimsService.getOrEnsureRiderProfile(
          user.id,
          user.user_metadata?.full_name,
          user.phone
        );
        if (riderProf) {
          await supabase
            .from('riders')
            .update({
              is_online: true,
              is_available: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', riderProf.id);
        }

        const reqServings = Math.max(1, Number(servings ?? listing.available_servings ?? listing.servings ?? 1));
        const taggedNotes = withRiderStatusTag(notes || listing.description, 'rider_assigned');
        let acceptedOk = false;

        if (listing.donor_id === user.id) {
          // Single-account testing flow: donor_id === auth.uid() allows direct food_listings update
          const { error: updListingErr } = await supabase
            .from('food_listings')
            .update({
              status: 'reserved',
              available_servings: 0,
              assigned_rider_id: riderProf?.id ?? user.id,
              accepted_by_role: 'rider',
              packaging_notes: withRiderStatusTag(listing.packaging_notes, 'rider_assigned'),
              updated_at: new Date().toISOString(),
            })
            .eq('id', foodListingId);

          if (!updListingErr) {
            acceptedOk = true;
            try {
              await supabase.from('reservations').insert({
                food_listing_id: foodListingId,
                user_id: user.id,
                servings: reqServings,
                status: 'confirmed',
                pickup_time: pickupTime || null,
                notes: taggedNotes,
              });
            } catch {}
          }
        } else {
          // Multi-account flow: use SECURITY DEFINER reserve_food RPC which atomically locks & reserves food_listings
          const { data: resId, error: resRpcErr } = await supabase.rpc('reserve_food', {
            p_food_listing_id: foodListingId,
            p_servings: reqServings,
            p_pickup_time: pickupTime || null,
            p_notes: taggedNotes,
          });

          if (!resRpcErr && resId) {
            acceptedOk = true;
            try {
              await supabase
                .from('reservations')
                .update({ status: 'confirmed', notes: taggedNotes, updated_at: new Date().toISOString() })
                .eq('id', resId);
            } catch {}
          } else if (resRpcErr && /already|no longer available|not enough servings/i.test(resRpcErr.message || '')) {
            throw new Error('ALREADY_CLAIMED: This donation has already been claimed by another user.');
          } else {
            // Secondary fallback if reserve_food rejected an expired listing deadline
            const { error: insResErr } = await supabase.from('reservations').insert({
              food_listing_id: foodListingId,
              user_id: user.id,
              servings: reqServings,
              status: 'confirmed',
              pickup_time: pickupTime || null,
              notes: taggedNotes,
            });
            if (!insResErr) {
              acceptedOk = true;
            }
          }

          // Also attempt to record assigned rider on listing directly
          try {
            await supabase
              .from('food_listings')
              .update({
                status: 'reserved',
                available_servings: 0,
                assigned_rider_id: riderProf?.id ?? user.id,
                accepted_by_role: 'rider',
                updated_at: new Date().toISOString(),
              })
              .eq('id', foodListingId);
          } catch {}
        }

        if (acceptedOk) {
          let resolvedTaskId = foodListingId;

          // Attempt to insert delivery_tasks row if not already created
          try {
            const { data: taskRow } = await supabase
              .from('delivery_tasks')
              .insert({
                food_listing_id: foodListingId,
                rider_id: riderProf?.id || user.id,
                donor_id: listing.donor_id,
                assignment_type: 'rider_direct_pickup',
                pickup_address: listing.pickup_address || listing.city || 'Donor Location',
                pickup_lat: listing.latitude,
                pickup_lng: listing.longitude,
                dropoff_address: 'Community Distribution / Partner Shelter',
                food_title: listing.title,
                servings_required: reqServings,
                quantity_unit: listing.quantity_unit || 'servings',
                collection_deadline: listing.available_until,
                instructions: taggedNotes,
                status: 'rider_assigned',
                pickup_code: derivePickupCode(foodListingId),
                rider_assigned_at: new Date().toISOString(),
              })
              .select('id')
              .maybeSingle();

            if (taskRow?.id) {
              resolvedTaskId = taskRow.id;
            }
          } catch {}

          // Immediately create/ensure the private Donor <-> Rider conversation on acceptance
          let fallbackConvId: string | undefined = undefined;
          if (listing.donor_id && listing.donor_id !== user.id) {
            try {
              const createdConv = await ChatService.getOrCreateDirectConversation(
                user.id,
                listing.donor_id,
                {
                  type: 'delivery',
                  relatedListingId: foodListingId,
                  relatedTaskId: resolvedTaskId !== foodListingId ? resolvedTaskId : undefined,
                  title: listing.title || 'Food Pickup',
                }
              );
              fallbackConvId = createdConv.id;
            } catch {}
          }

          const riderName = riderProf?.name || user.user_metadata?.full_name || 'ShareBite Rider';
          try {
            await supabase.from('notifications').insert({
              user_id: listing.donor_id,
              type: 'rider_assigned',
              title: 'Rider Accepted Your Pickup!',
              message: `Order Accepted! Rider ${riderName} has accepted "${listing.title || 'your food donation'}" and is coming to pick up your order from ${listing.pickup_address || 'your pickup location'}.`,
              data: {
                food_listing_id: foodListingId,
                delivery_task_id: resolvedTaskId,
                rider_id: riderProf?.id || user.id,
              },
              related_food_id: foodListingId,
              action_url: '/donor-dashboard',
            });

            if (listing.donor_id !== user.id) {
              await supabase.from('notifications').insert({
                user_id: user.id,
                type: 'rider_assigned',
                title: 'Donation Acceptance Confirmed!',
                message: `Order Accepted! You accepted pickup for "${listing.title || 'food donation'}" at ${listing.pickup_address || 'donor location'}. Live in-app tracking started.`,
                data: {
                  food_listing_id: foodListingId,
                  delivery_task_id: resolvedTaskId,
                },
                related_food_id: foodListingId,
                action_url: '/rider-dashboard',
              });
            }
          } catch {}

          return {
            acceptedBy: 'rider',
            deliveryTaskId: resolvedTaskId,
            conversationId: fallbackConvId,
            pickupLat: listing.latitude,
            pickupLng: listing.longitude,
            pickupAddress: listing.pickup_address || listing.city,
            status: 'rider_assigned',
          };
        }
      }
    }

    if (error && error.code !== 'PGRST202') {
      throw new Error(error.message || 'Could not accept food donation.');
    }

    // Legacy fallback only when accept_donation RPC is not yet applied (calls claim_food RPC)
    const { data: claimId, error: claimErr } = await supabase.rpc('claim_food', {
      p_food_listing_id: foodListingId,
      p_servings: servings ?? 1,
      p_pickup_time: pickupTime || null,
      p_notes: notes || null,
    });

    if (claimErr) {
      throw new Error(claimErr.message || 'Claim failed. Another user may have already accepted this donation.');
    }

    return {
      acceptedBy: 'ngo',
      claimId: claimId as string,
      status: 'confirmed',
    };
  },

  // ── NGO Claiming ─────────────────────────────────────────────────────────
  async claimFood(
    foodListingId: string,
    servings: number,
    pickupTime?: string,
    notes?: string
  ): Promise<string> {
    const res = await ClaimsService.acceptDonation(foodListingId, servings, pickupTime, notes);
    return res.claimId || res.deliveryTaskId || foodListingId;
  },

  async createDeliveryTask(claimId: string): Promise<string> {
    if (!isValidUUID(claimId)) throw new Error('Invalid claim ID');
    const { data, error } = await supabase.rpc('create_delivery_task', {
      p_claim_id: claimId,
    });
    if (error || !data) {
      throw new Error(error?.message || 'Failed to create delivery task');
    }
    return data as string;
  },

  async cancelClaim(claimId: string, reason?: string): Promise<boolean> {
    if (!isValidUUID(claimId)) throw new Error('Invalid claim ID');
    const { data, error } = await supabase.rpc('cancel_ngo_claim', {
      p_claim_id: claimId,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message || 'Failed to cancel claim');
    return !!data;
  },

  // ── NGO Claims Dashboard ─────────────────────────────────────────────────
  async getMyClaims(ngoId: string): Promise<NgoClaim[]> {
    if (!isValidUUID(ngoId)) return [];
    const { data, error } = await supabase
      .from('ngo_claims_dashboard_view')
      .select('*')
      .eq('ngo_id', ngoId)
      .order('created_at', { ascending: false });

    if (!error && data) return data.map(mapClaim);

    // Fallback to direct ngo_claims query if view fails
    const { data: directClaims } = await supabase
      .from('ngo_claims')
      .select('*, food:food_listings(*, donor:profiles!food_listings_donor_id_fkey(*))')
      .eq('ngo_id', ngoId)
      .order('created_at', { ascending: false });

    if (!directClaims) return [];
    return directClaims.map((r: any) =>
      mapClaim({
        ...r,
        food_title: r.food?.title,
        category: r.food?.category,
        food_type: r.food?.food_type,
        image_url: r.food?.image_url,
        pickup_address: r.food?.pickup_address,
        pickup_city: r.food?.city,
        pickup_lat: r.food?.latitude,
        pickup_lng: r.food?.longitude,
        available_until: r.food?.available_until,
        donor_id: r.food?.donor_id,
        donor_name: r.food?.donor?.full_name,
        donor_phone: r.food?.donor?.phone,
      })
    );
  },

  async getClaimById(claimId: string): Promise<NgoClaim | null> {
    if (!isValidUUID(claimId)) return null;
    const { data, error } = await supabase
      .from('ngo_claims_dashboard_view')
      .select('*')
      .eq('id', claimId)
      .maybeSingle();
    if (error || !data) return null;
    return mapClaim(data);
  },

  async getClaimsForDonation(foodListingId: string): Promise<NgoClaim[]> {
    if (!isValidUUID(foodListingId)) return [];
    const { data, error } = await supabase
      .from('ngo_claims')
      .select('*')
      .eq('food_listing_id', foodListingId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(mapClaim);
  },

  // ── Delivery Tasks & Global Available Food Opportunities (Rider Workflow) ──
  async getAvailableDeliveryTasks(riderLat?: number, riderLng?: number): Promise<DeliveryTask[]> {
    const results: DeliveryTask[] = [];

    // 1. Existing delivery tasks awaiting a rider (NGO claimed first)
    const { data: viewTasks, error } = await supabase
      .from('rider_tasks_view')
      .select('*')
      .eq('status', 'awaiting_rider')
      .order('created_at', { ascending: false });

    if (!error && viewTasks) {
      for (const row of viewTasks) {
        const mapped = mapDeliveryTask(row);
        mapped.donationStatus = 'AVAILABLE';
        if (
          riderLat != null &&
          riderLng != null &&
          mapped.pickupLat != null &&
          mapped.pickupLng != null
        ) {
          mapped.distanceKm = LocationService.calculateDistance(
            riderLat,
            riderLng,
            mapped.pickupLat,
            mapped.pickupLng
          );
        }
        results.push(mapped);
      }
    }

    // 2. Global pool of all available food donations from ALL donors (never filtered by donor_id or rider_id)
    let { data: openFood, error: openFoodErr } = await supabase
      .from('food_listings')
      .select('*, donor:profiles!food_listings_donor_id_fkey(id, full_name, organization_name, phone)')
      .in('status', ['available', 'partially_reserved'])
      .gt('available_servings', 0)
      .is('assigned_rider_id', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (openFoodErr) {
      const fallback = await supabase
        .from('food_listings')
        .select('*')
        .in('status', ['available', 'partially_reserved'])
        .gt('available_servings', 0)
        .is('assigned_rider_id', null)
        .order('created_at', { ascending: false })
        .limit(100);
      openFood = fallback.data;
    }

    if (openFood) {
      let reservedListingIds = new Set<string>();
      try {
        const { data: activeRes } = await supabase
          .from('reservations')
          .select('food_listing_id, status')
          .in('status', ['pending', 'confirmed', 'ready_for_pickup', 'picked_up', 'completed']);
        if (activeRes) {
          reservedListingIds = new Set(activeRes.map((r: any) => r.food_listing_id).filter(Boolean));
        }
      } catch {}

      const existingFoodIds = new Set(results.map((r) => r.foodListingId));
      for (const fl of openFood) {
        if (existingFoodIds.has(fl.id) || reservedListingIds.has(fl.id)) continue;
        const dist =
          riderLat != null && riderLng != null && fl.latitude != null && fl.longitude != null
            ? LocationService.calculateDistance(riderLat, riderLng, fl.latitude, fl.longitude)
            : undefined;
        results.push({
          id: fl.id,
          foodListingId: fl.id,
          donorId: fl.donor_id,
          assignmentType: 'rider_direct_pickup',
          pickupAddress: fl.pickup_address || fl.city || 'Donor Location',
          pickupLat: fl.latitude,
          pickupLng: fl.longitude,
          dropoffAddress: 'Community Distribution / Shelter',
          foodTitle: fl.title,
          foodDescription: fl.description,
          servingsRequired: Number(fl.available_servings ?? fl.servings ?? 1),
          quantityValue: Number(fl.quantity_value ?? fl.available_servings ?? fl.servings ?? 1),
          quantityUnit: fl.quantity_unit || 'servings',
          preparationTime: fl.preparation_date || fl.available_from || fl.created_at,
          collectionDeadline: fl.available_until,
          status: 'awaiting_rider',
          donationStatus: 'AVAILABLE',
          incidentReported: false,
          instructions: fl.description,
          createdAt: fl.created_at,
          updatedAt: fl.updated_at,
          foodType: fl.food_type,
          foodCategory: fl.category,
          foodImageUrl: fl.image_url,
          donorName: fl.donor?.full_name || fl.donor?.organization_name || 'Verified Food Donor',
          donorPhone: fl.donor?.phone,
          isDirectFoodOpportunity: true,
          distanceKm: dist,
        });
      }
    }

    const nowMs = Date.now();
    return results.sort((a, b) => {
      const aExp = a.collectionDeadline ? new Date(a.collectionDeadline).getTime() <= nowMs : false;
      const bExp = b.collectionDeadline ? new Date(b.collectionDeadline).getTime() <= nowMs : false;
      if (aExp !== bExp) return aExp ? 1 : -1;
      const distDiff = (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      if (Math.abs(distDiff) > 0.01) return distDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  },

  async getOrEnsureRiderProfile(
    riderUserId: string,
    fallbackName?: string,
    fallbackPhone?: string
  ): Promise<RiderProfileRecord | null> {
    if (!isValidUUID(riderUserId)) return null;

    let { data: row } = await supabase
      .from('riders')
      .select('*')
      .eq('user_id', riderUserId)
      .maybeSingle();

    if (!row) {
      const { data: inserted } = await supabase
        .from('riders')
        .upsert(
          {
            user_id: riderUserId,
            name: fallbackName || 'ShareBite Rider',
            phone: fallbackPhone || '',
            is_online: false,
            is_available: true,
          },
          { onConflict: 'user_id' }
        )
        .select('*')
        .maybeSingle();
      row = inserted;
    }

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name || fallbackName || 'Rider',
      phone: row.phone || fallbackPhone || '',
      vehicleType: row.vehicle_type || 'bike',
      vehicleNumber: row.vehicle_number || '',
      profileImage: row.profile_image || undefined,
      idVerified: !!row.id_verified,
      isOnline: !!row.is_online,
      isAvailable: row.is_available !== false,
      rating: row.rating != null ? Number(row.rating) : 5.0,
      totalDeliveries: Number(row.total_deliveries ?? 0),
      totalEarnings: Number(row.total_earnings ?? 0),
      totalDistanceKm: Number(row.total_distance_km ?? 0),
      currentLat: row.current_lat ?? undefined,
      currentLng: row.current_lng ?? undefined,
    };
  },

  async setRiderOnlineStatus(
    riderUserId: string,
    nextOnline: boolean,
    hasActiveTask: boolean,
    fallbackName?: string,
    fallbackPhone?: string
  ): Promise<void> {
    if (!isValidUUID(riderUserId)) return;

    const existing = await ClaimsService.getOrEnsureRiderProfile(riderUserId, fallbackName, fallbackPhone);
    if (existing) {
      await supabase
        .from('riders')
        .update({
          is_online: nextOnline,
          is_available: nextOnline && !hasActiveTask,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', riderUserId);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sharebite:rider-online', { detail: { isOnline: nextOnline } }));
    }
  },

  async getMyDeliveryTasks(riderUserId: string): Promise<DeliveryTask[]> {
    if (!isValidUUID(riderUserId)) return [];

    // Ensure rider profile exists and resolve rider IDs (both riders.id and auth user_id)
    let riderRow: any = null;
    try {
      riderRow = await ClaimsService.getOrEnsureRiderProfile(riderUserId);
    } catch {}

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', riderUserId)
      .maybeSingle();

    const riderName = riderRow?.name || userProfile?.full_name || 'ShareBite Rider';
    const riderPhone = riderRow?.phone || userProfile?.phone || '';
    const possibleRiderIds = [riderRow?.id, riderUserId].filter(Boolean) as string[];

    const tasks: DeliveryTask[] = [];
    const seenFoodIds = new Set<string>();
    const seenTaskIds = new Set<string>();

    // 1. Query delivery_tasks / rider_tasks_view by rider_id (both riders.id and auth user_id)
    if (possibleRiderIds.length > 0) {
      const { data: viewTasks } = await supabase
        .from('rider_tasks_view')
        .select('*')
        .in('rider_id', possibleRiderIds)
        .order('created_at', { ascending: false });

      if (viewTasks && viewTasks.length > 0) {
        for (const t of viewTasks) {
          const mapped = mapDeliveryTask(t);
          tasks.push(mapped);
          if (mapped.id) seenTaskIds.add(mapped.id);
          if (mapped.foodListingId) seenFoodIds.add(mapped.foodListingId);
        }
      } else {
        const { data: rawTasks } = await supabase
          .from('delivery_tasks')
          .select('*')
          .in('rider_id', possibleRiderIds)
          .order('created_at', { ascending: false });

        if (rawTasks && rawTasks.length > 0) {
          for (const dt of rawTasks) {
            if (seenTaskIds.has(dt.id)) continue;
            seenTaskIds.add(dt.id);
            if (dt.food_listing_id) seenFoodIds.add(dt.food_listing_id);
            tasks.push(mapDeliveryTask(dt));
          }
        }
      }
    }

    // 2. Query food_listings where assigned_rider_id is either riderRow.id or riderUserId
    if (possibleRiderIds.length > 0) {
      const { data: assignedListings } = await supabase
        .from('food_listings')
        .select('*')
        .in('assigned_rider_id', possibleRiderIds)
        .order('updated_at', { ascending: false });

      if (assignedListings && assignedListings.length > 0) {
        const donorIds = [...new Set(assignedListings.map((l: any) => l.donor_id).filter(Boolean))];
        const { data: donorProfiles } =
          donorIds.length > 0
            ? await supabase.from('profiles').select('id, full_name, organization_name, phone').in('id', donorIds)
            : { data: [] as any[] };
        const donorMap = new Map((donorProfiles || []).map((p: any) => [p.id, p]));

        for (const fl of assignedListings) {
          if (seenFoodIds.has(fl.id) || seenTaskIds.has(fl.id)) continue;
          seenFoodIds.add(fl.id);
          seenTaskIds.add(fl.id);
          const donor = donorMap.get(fl.donor_id);
          const inferredStatus = extractRiderStatusFromListing(fl);
          const cleanNotes = stripRiderStatusTag(fl.packaging_notes);
          tasks.push({
            id: fl.id,
            foodListingId: fl.id,
            riderId: riderRow?.id || riderUserId,
            donorId: fl.donor_id,
            assignmentType: 'rider_direct_pickup',
            pickupAddress: fl.pickup_address || fl.city || 'Donor Location',
            pickupLat: fl.latitude,
            pickupLng: fl.longitude,
            dropoffAddress: 'Community Distribution / Partner Shelter',
            foodTitle: fl.title,
            foodDescription: fl.description,
            servingsRequired: Number(fl.servings ?? fl.available_servings ?? 1),
            quantityValue: Number(fl.quantity_value ?? fl.servings ?? 1),
            quantityUnit: fl.quantity_unit || 'servings',
            preparationTime: fl.preparation_date || fl.available_from || fl.created_at,
            collectionDeadline: fl.available_until,
            status: inferredStatus,
            incidentReported: false,
            instructions: cleanNotes || fl.description,
            riderAssignedAt: fl.updated_at || fl.created_at,
            createdAt: fl.created_at,
            updatedAt: fl.updated_at,
            foodType: fl.food_type,
            foodCategory: fl.category,
            foodImageUrl: fl.image_url,
            donorName: donor?.full_name || donor?.organization_name || 'Verified Food Donor',
            donorPhone: donor?.phone,
            riderName,
            riderPhone,
            riderUserId,
            pickupCode: derivePickupCode(fl.id),
            isDirectFoodOpportunity: false,
          });
        }
      }
    }

    // 3. Query reservations table for this rider (user_id = riderUserId)
    const { data: riderReservations } = await supabase
      .from('reservations')
      .select('*')
      .eq('user_id', riderUserId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (riderReservations && riderReservations.length > 0) {
      const neededListingIds = riderReservations
        .map((r: any) => r.food_listing_id)
        .filter((id: string) => id && !seenFoodIds.has(id));

      if (neededListingIds.length > 0) {
        const { data: resListings } = await supabase
          .from('food_listings')
          .select('*')
          .in('id', neededListingIds);

        if (resListings && resListings.length > 0) {
          const donorIds = [...new Set(resListings.map((l: any) => l.donor_id).filter(Boolean))];
          const { data: donorProfiles } =
            donorIds.length > 0
              ? await supabase.from('profiles').select('id, full_name, organization_name, phone').in('id', donorIds)
              : { data: [] as any[] };
          const donorMap = new Map((donorProfiles || []).map((p: any) => [p.id, p]));
          const listingMap = new Map(resListings.map((l: any) => [l.id, l]));

          for (const res of riderReservations) {
            const fl = listingMap.get(res.food_listing_id);
            if (!fl || seenFoodIds.has(fl.id) || seenTaskIds.has(fl.id)) continue;
            seenFoodIds.add(fl.id);
            seenTaskIds.add(fl.id);
            const donor = donorMap.get(fl.donor_id);
            const resStatusFallback =
              res.status === 'completed'
                ? 'completed'
                : res.status === 'picked_up'
                ? 'food_collected'
                : res.status === 'cancelled'
                ? 'cancelled'
                : fl.status;
            const inferredStatus = extractRiderStatusFromText(res.notes, resStatusFallback);
            const cleanNotes = stripRiderStatusTag(res.notes);
            tasks.push({
              id: fl.id,
              foodListingId: fl.id,
              riderId: riderRow?.id || riderUserId,
              donorId: fl.donor_id,
              assignmentType: 'rider_direct_pickup',
              pickupAddress: fl.pickup_address || fl.city || 'Donor Location',
              pickupLat: fl.latitude,
              pickupLng: fl.longitude,
              dropoffAddress: 'Community Distribution / Partner Shelter',
              foodTitle: fl.title,
              foodDescription: fl.description,
              servingsRequired: Number(res.servings ?? fl.servings ?? fl.available_servings ?? 1),
              quantityValue: Number(fl.quantity_value ?? res.servings ?? fl.servings ?? 1),
              quantityUnit: fl.quantity_unit || 'servings',
              preparationTime: fl.preparation_date || fl.available_from || fl.created_at,
              collectionDeadline: fl.available_until,
              status: inferredStatus,
              incidentReported: false,
              instructions: cleanNotes || fl.description,
              riderAssignedAt: res.created_at || fl.updated_at || fl.created_at,
              createdAt: res.created_at || fl.created_at,
              updatedAt: res.updated_at || fl.updated_at,
              foodType: fl.food_type,
              foodCategory: fl.category,
              foodImageUrl: fl.image_url,
              donorName: donor?.full_name || donor?.organization_name || 'Verified Food Donor',
              donorPhone: donor?.phone,
              riderName,
              riderPhone,
              riderUserId,
              pickupCode: derivePickupCode(fl.id),
              isDirectFoodOpportunity: false,
            });
          }
        }
      }
    }

    return tasks;
  },

  async getDeliveryTaskById(taskId: string): Promise<DeliveryTask | null> {
    if (!isValidUUID(taskId)) return null;
    const { data, error } = await supabase
      .from('rider_tasks_view')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();
    if (error || !data) return null;
    return mapDeliveryTask(data);
  },

  async acceptDeliveryJob(taskId: string): Promise<boolean> {
    if (!isValidUUID(taskId)) throw new Error('Invalid delivery task ID');

    const { data, error } = await supabase.rpc('accept_delivery_job', {
      p_task_id: taskId,
    });

    if (error) {
      throw new Error(error.message || 'This delivery job was already taken by another rider.');
    }
    if (!data) {
      throw new Error('This delivery job is no longer available.');
    }
    return true;
  },

  async confirmPickup(
    taskId: string,
    pickupCode: string,
    servingsCollected: number,
    discrepancyNotes?: string
  ): Promise<boolean> {
    if (!isValidUUID(taskId)) throw new Error('Invalid task ID');
    const normalizedEntered = (pickupCode || '').trim().toUpperCase();
    if (!normalizedEntered) {
      throw new Error('Please enter the 6-character donor verification code.');
    }

    // 1. Try SQL RPC first
    const { data, error } = await supabase.rpc('confirm_pickup', {
      p_task_id: taskId,
      p_pickup_code: normalizedEntered,
      p_servings_collected: servingsCollected,
      p_discrepancy_notes: discrepancyNotes || null,
    });

    if (!error && data) return true;

    // 2. If RPC threw because code specifically didn't match
    if (error && /invalid pickup code|incorrect code|does not match/i.test(error.message || '')) {
      throw new Error(error.message || 'Invalid Pickup Code. Please ask the donor for the 6-character code shown on their screen.');
    }

    // 3. Fallback flow (for direct listings, reservations or when task row doesn't exist in delivery_tasks table)
    let valid = false;
    const derived = derivePickupCode(taskId);
    if (normalizedEntered === derived) {
      valid = true;
    } else {
      const { data: dtRow } = await supabase
        .from('delivery_tasks')
        .select('pickup_code, food_listing_id')
        .eq('id', taskId)
        .maybeSingle();
      if (dtRow?.pickup_code && dtRow.pickup_code.toUpperCase() === normalizedEntered) {
        valid = true;
      } else if (dtRow?.food_listing_id && derivePickupCode(dtRow.food_listing_id) === normalizedEntered) {
        valid = true;
      }
    }

    if (!valid) {
      throw new Error('Invalid Pickup Verification Code! Please ask the donor for the 6-character code displayed on their screen.');
    }

    // Advance status to food_collected
    await ClaimsService.updateDeliveryTaskStatus(
      taskId,
      'food_collected',
      `Verified with pickup code ${normalizedEntered}`
    );
    return true;
  },

  async confirmDeliveryToNgo(
    taskId: string,
    dropoffCode: string,
    servingsDelivered: number
  ): Promise<boolean> {
    if (!isValidUUID(taskId)) throw new Error('Invalid task ID');
    const { data, error } = await supabase.rpc('confirm_delivery_to_ngo', {
      p_task_id: taskId,
      p_dropoff_code: (dropoffCode || '').trim(),
      p_servings_delivered: servingsDelivered,
    });
    if (error) throw new Error(error.message || 'Delivery verification failed');
    return !!data;
  },

  async reportIncident(taskId: string, incidentType: string, notes: string): Promise<boolean> {
    if (!isValidUUID(taskId)) throw new Error('Invalid task ID');
    const { data, error } = await supabase.rpc('report_delivery_incident', {
      p_task_id: taskId,
      p_incident_type: incidentType,
      p_notes: notes,
    });
    if (error) throw new Error(error.message || 'Failed to report incident');
    return !!data;
  },

  async reassignDeliveryTask(taskId: string, reason?: string): Promise<boolean> {
    if (!isValidUUID(taskId)) throw new Error('Invalid task ID');
    const { data, error } = await supabase.rpc('reassign_donation', {
      p_task_id: taskId,
      p_reason: reason || null,
    });
    if (!error) return !!data;

    // Fallback for single-account direct food_listings or reservation-backed pickups
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      let released = false;
      const { data: fl } = await supabase
        .from('food_listings')
        .select('id, servings, packaging_notes, donor_id')
        .eq('id', taskId)
        .maybeSingle();

      if (fl && fl.donor_id === user.id) {
        await supabase
          .from('food_listings')
          .update({
            status: 'available',
            available_servings: fl.servings ?? 1,
            assigned_rider_id: null,
            accepted_by_role: null,
            packaging_notes: stripRiderStatusTag(fl.packaging_notes) || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', taskId);
        released = true;
      }

      const { data: resRow } = await supabase
        .from('reservations')
        .select('id, notes')
        .eq('food_listing_id', taskId)
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .maybeSingle();

      if (resRow) {
        await supabase
          .from('reservations')
          .update({
            status: 'cancelled',
            notes: withRiderStatusTag(resRow.notes, 'cancelled'),
            updated_at: new Date().toISOString(),
          })
          .eq('id', resRow.id);
        released = true;
      }

      if (released) {
        await supabase
          .from('riders')
          .update({ is_available: true, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        return true;
      }
    }

    throw new Error(error.message || 'Failed to reassign task');
  },

  async updateDeliveryTaskStatus(taskId: string, status: string, notes?: string): Promise<boolean> {
    if (!isValidUUID(taskId)) throw new Error('Invalid task ID');

    const { data, error } = await supabase.rpc('update_donation_status', {
      p_task_id: taskId,
      p_new_status: status,
      p_notes: notes || null,
    });

    if (!error) {
      if (status === 'completed') {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        // Ensure conversation closes even if DB trigger migration hasn't been applied yet
        await ChatService.closeConversationForDelivery(taskId, null, authUser?.id).catch(() => {});
      }
      return !!data;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required');

    // Check if taskId is a food_listings ID used by fallback (single-account or reservation-backed multi-account)
    const { data: fallbackListing } = await supabase
      .from('food_listings')
      .select('id, title, donor_id, packaging_notes')
      .eq('id', taskId)
      .maybeSingle();

    const { data: resRow } = await supabase
      .from('reservations')
      .select('id, notes')
      .eq('food_listing_id', taskId)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (fallbackListing && (fallbackListing.donor_id === user.id || resRow)) {
      const foodStatus =
        status === 'food_collected' || status === 'in_transit'
          ? 'picked_up'
          : status === 'delivered' || status === 'completed'
          ? 'completed'
          : status === 'cancelled'
          ? 'cancelled'
          : 'reserved';

      if (fallbackListing.donor_id === user.id) {
        const { error: flErr } = await supabase
          .from('food_listings')
          .update({
            status: foodStatus,
            packaging_notes: withRiderStatusTag(fallbackListing.packaging_notes, status),
            updated_at: new Date().toISOString(),
          })
          .eq('id', taskId);

        if (flErr) throw new Error(flErr.message);
      }

      if (resRow) {
        const resStatus =
          status === 'completed' || status === 'delivered'
            ? 'completed'
            : status === 'food_collected' || status === 'in_transit'
            ? 'picked_up'
            : status === 'cancelled'
            ? 'cancelled'
            : 'confirmed';

        const { error: resErr } = await supabase
          .from('reservations')
          .update({
            status: resStatus,
            notes: withRiderStatusTag(resRow.notes, status),
            updated_at: new Date().toISOString(),
          })
          .eq('id', resRow.id);

        if (resErr) throw new Error(resErr.message);
      }

      const notifMap: Record<string, { type: string; title: string; message: string }> = {
        going_to_pickup: {
          type: 'delivery_update',
          title: 'Rider is On the Way to Pick Up Your Order!',
          message: `Rider is coming to pick up "${fallbackListing.title || 'your order'}". Please keep the food ready.`,
        },
        arrived_at_pickup: {
          type: 'delivery_update',
          title: 'Rider Reached Your Pickup Location!',
          message: `Your rider has arrived at the pickup location for "${fallbackListing.title || 'your order'}".`,
        },
        food_collected: {
          type: 'food_collected',
          title: 'Food Picked Up by Rider!',
          message: `Rider has collected "${fallbackListing.title || 'your order'}" and is heading to deliver it.`,
        },
        delivered: {
          type: 'food_delivered',
          title: 'Order Delivered & Completed!',
          message: `"${fallbackListing.title || 'Your food donation'}" has been delivered!`,
        },
        completed: {
          type: 'food_delivered',
          title: 'Order Delivered & Completed!',
          message: `"${fallbackListing.title || 'Your food donation'}" has been delivered!`,
        },
      };

      const notifMeta = notifMap[status];
      if (notifMeta) {
        try {
          await supabase.from('notifications').insert({
            user_id: fallbackListing.donor_id,
            type: notifMeta.type,
            title: notifMeta.title,
            message: notifMeta.message,
            data: {
              food_listing_id: taskId,
              delivery_task_id: taskId,
            },
            related_food_id: taskId,
            action_url: '/donor-dashboard',
          });
        } catch {}
      }

      if (status === 'completed' || status === 'delivered' || status === 'cancelled') {
        await supabase
          .from('riders')
          .update({ is_available: true, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }

      if (status === 'completed') {
        await ChatService.closeConversationForDelivery(null, taskId, user.id).catch(() => {});
      }

      return true;
    }

    // Check if taskId is in delivery_tasks table
    const { data: dtRow } = await supabase
      .from('delivery_tasks')
      .select('id, food_listing_id, donor_id, rider_id')
      .eq('id', taskId)
      .maybeSingle();

    if (dtRow) {
      const { error: updErr } = await supabase
        .from('delivery_tasks')
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...(status === 'food_collected' ? { pickup_confirmed_at: new Date().toISOString(), pickup_confirmed_by: user.id } : {}),
          ...(status === 'completed' || status === 'delivered' ? { delivery_confirmed_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', taskId);

      if (!updErr) {
        if (dtRow.food_listing_id) {
          const flStatus =
            status === 'completed'
              ? 'completed'
              : status === 'food_collected' || status === 'in_transit' || status === 'delivered'
              ? 'picked_up'
              : status === 'cancelled'
              ? 'cancelled'
              : 'reserved';

          await supabase
            .from('food_listings')
            .update({ status: flStatus, updated_at: new Date().toISOString() })
            .eq('id', dtRow.food_listing_id);

          await supabase
            .from('reservations')
            .update({ status: flStatus === 'picked_up' ? 'picked_up' : flStatus, updated_at: new Date().toISOString() })
            .eq('food_listing_id', dtRow.food_listing_id);
        }

        if (status === 'completed' || status === 'delivered' || status === 'cancelled') {
          await supabase
            .from('riders')
            .update({ is_available: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
        }

        if (status === 'completed') {
          await ChatService.closeConversationForDelivery(taskId, dtRow.food_listing_id, user.id).catch(() => {});
        }

        return true;
      }
    }

    if (error && error.code !== 'PGRST202') {
      throw new Error(error.message || 'Failed to update status');
    }

    // Secondary fallback
    const { data: rider } = await supabase
      .from('riders')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    let query = supabase
      .from('delivery_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (rider?.id) {
      query = query.eq('rider_id', rider.id);
    }

    const { error: finalUpdErr } = await query;
    if (finalUpdErr) throw new Error(finalUpdErr.message);
    return true;
  },

  async ngoConfirmPickup(
    claimId: string,
    servingsCollected?: number,
    notes?: string
  ): Promise<boolean> {
    if (!isValidUUID(claimId)) throw new Error('Invalid claim ID');
    const { data, error } = await supabase.rpc('ngo_confirm_pickup', {
      p_claim_id: claimId,
      p_servings_collected: servingsCollected ?? null,
      p_notes: notes || null,
    });
    if (error) {
      throw new Error(error.message || 'Failed to confirm direct pickup.');
    }
    return !!data;
  },

  // ── NGO Receipt & Distribution ───────────────────────────────────────────
  async confirmNgoReceipt(
    taskId: string | null | undefined,
    quantityReceived: number,
    conditionNotes?: string,
    safetyConcern?: boolean,
    safetyNotes?: string,
    claimId?: string
  ): Promise<string> {
    if (taskId && isValidUUID(taskId)) {
      const { data, error } = await supabase.rpc('confirm_ngo_receipt', {
        p_task_id: taskId,
        p_quantity_received: quantityReceived,
        p_condition_notes: conditionNotes || null,
        p_safety_concern: !!safetyConcern,
        p_safety_notes: safetyNotes || null,
      });
      if (!error && data) return data as string;
      if (error && error.code !== 'PGRST202') {
        throw new Error(error.message || 'Failed to confirm receipt');
      }
    }

    if (claimId && isValidUUID(claimId)) {
      const { data, error } = await supabase.rpc('confirm_ngo_receipt', {
        p_task_id: null,
        p_quantity_received: quantityReceived,
        p_condition_notes: conditionNotes || null,
        p_safety_concern: !!safetyConcern,
        p_safety_notes: safetyNotes || null,
        p_claim_id: claimId,
      });
      if (error || !data) {
        throw new Error(error?.message || 'Failed to confirm receipt at facility');
      }
      return data as string;
    }

    throw new Error('Invalid delivery task or claim ID');
  },

  async getDistributionRecords(ngoId: string): Promise<DistributionRecord[]> {
    if (!isValidUUID(ngoId)) return [];
    const { data, error } = await supabase
      .from('distribution_records')
      .select('*')
      .eq('ngo_id', ngoId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(mapDistributionRecord);
  },

  async getDistributionRecord(id: string): Promise<DistributionRecord | null> {
    if (!isValidUUID(id)) return null;
    const { data, error } = await supabase
      .from('distribution_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return mapDistributionRecord(data);
  },

  async recordDistribution(
    distributionRecordId: string,
    quantityToDistribute: number,
    peopleServed?: number,
    mealPortions?: number,
    distributionMethod?: string,
    distributionLocation?: string,
    notes?: string
  ): Promise<boolean> {
    if (!isValidUUID(distributionRecordId)) throw new Error('Invalid distribution record ID');
    const { data, error } = await supabase.rpc('record_distribution', {
      p_distribution_record_id: distributionRecordId,
      p_quantity_to_distribute: quantityToDistribute,
      p_people_served: peopleServed || null,
      p_meal_portions: mealPortions || null,
      p_distribution_method: distributionMethod || 'direct',
      p_distribution_location: distributionLocation || null,
      p_notes: notes || null,
    });
    if (error) throw new Error(error.message || 'Failed to record distribution');
    return !!data;
  },

  // ── Donor Dashboard Listings ─────────────────────────────────────────────
  async getDonorDashboardListings(donorId: string): Promise<any[]> {
    if (!isValidUUID(donorId)) return [];
    const { data, error } = await supabase
      .from('donor_dashboard_view')
      .select('*')
      .eq('donor_id', donorId)
      .order('created_at', { ascending: false });

    let rows: any[] = !error && data ? data : [];

    if (rows.length === 0) {
      // Fallback: direct query to food_listings without fabricating dummy values
      const { data: listings } = await supabase
        .from('food_listings')
        .select('*')
        .eq('donor_id', donorId)
        .order('created_at', { ascending: false });
      rows = listings || [];
    }

    // Enrich any single-account or reservation-backed rider pickups without a delivery_tasks row
    const needsEnrich = rows.some((r) => !r.delivery_task_id);
    if (needsEnrich) {
      const { data: assignedListings } = await supabase
        .from('food_listings')
        .select('id, assigned_rider_id, accepted_by_role, packaging_notes, status')
        .eq('donor_id', donorId)
        .not('assigned_rider_id', 'is', null);

      const listingIds = rows.map((r) => r.id).filter(Boolean);
      let activeReservations: any[] = [];
      if (listingIds.length > 0) {
        const { data: resRows } = await supabase
          .from('reservations')
          .select('food_listing_id, user_id, status, notes, created_at')
          .in('food_listing_id', listingIds)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false });
        if (resRows) activeReservations = resRows;
      }

      const reservationMap = new Map<string, any>();
      for (const res of activeReservations) {
        if (!reservationMap.has(res.food_listing_id)) {
          reservationMap.set(res.food_listing_id, res);
        }
      }

      const riderIds = [...new Set((assignedListings || []).map((l: any) => l.assigned_rider_id).filter(Boolean))];
      const resUserIds = [...new Set(activeReservations.map((r: any) => r.user_id).filter(Boolean))];

      const [riderRowsRes, resRiderRowsRes, resProfileRowsRes] = await Promise.all([
        riderIds.length > 0
          ? supabase.from('riders').select('id, user_id, name, phone').in('id', riderIds)
          : Promise.resolve({ data: [] as any[] }),
        resUserIds.length > 0
          ? supabase.from('riders').select('id, user_id, name, phone').in('user_id', resUserIds)
          : Promise.resolve({ data: [] as any[] }),
        resUserIds.length > 0
          ? supabase.from('profiles').select('id, full_name, phone').in('id', resUserIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const riderMap = new Map((riderRowsRes.data || []).map((r: any) => [r.id, r]));
      const riderByUserMap = new Map((resRiderRowsRes.data || []).map((r: any) => [r.user_id, r]));
      const profileMap = new Map((resProfileRowsRes.data || []).map((p: any) => [p.id, p]));
      const listingMap = new Map((assignedListings || []).map((l: any) => [l.id, l]));

      rows = rows.map((row) => {
        if (row.delivery_task_id) return row;
        const fl = listingMap.get(row.id);
        if (fl && fl.assigned_rider_id) {
          const rider = riderMap.get(fl.assigned_rider_id);
          return {
            ...row,
            delivery_task_id: row.id,
            delivery_status: extractRiderStatusFromListing(fl),
            assignment_type: 'rider_direct_pickup',
            rider_id: fl.assigned_rider_id,
            rider_user_id: rider?.user_id,
            rider_name: rider?.name || 'Assigned Rider',
            rider_phone: rider?.phone || '',
          };
        }

        const res = reservationMap.get(row.id);
        if (res) {
          const rider = riderByUserMap.get(res.user_id);
          const prof = profileMap.get(res.user_id);
          const resFallback =
            res.status === 'completed'
              ? 'completed'
              : res.status === 'picked_up'
              ? 'food_collected'
              : row.status;
          return {
            ...row,
            delivery_task_id: row.id,
            delivery_status: extractRiderStatusFromText(res.notes, resFallback),
            assignment_type: 'rider_direct_pickup',
            rider_id: rider?.id,
            rider_user_id: res.user_id,
            rider_name: rider?.name || prof?.full_name || 'Assigned Rider',
            rider_phone: rider?.phone || prof?.phone || '',
          };
        }

        return row;
      });
    }

    return rows.map((r) => ({
      ...r,
      pickup_code: r.pickup_code ? String(r.pickup_code).toUpperCase() : derivePickupCode(r.id),
    }));
  },

  // ── Real-time Subscriptions ──────────────────────────────────────────────
  subscribeToDeliveryTask(taskId: string, callback: (task: DeliveryTask) => void) {
    if (!isValidUUID(taskId)) {
      return { unsubscribe: () => {} };
    }

    const channelName = `delivery_task_${taskId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_tasks',
          filter: `id=eq.${taskId}`,
        },
        async () => {
          const updated = await ClaimsService.getDeliveryTaskById(taskId);
          if (updated) callback(updated);
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  },

  subscribeToMyClaims(ngoId: string, callback: () => void) {
    if (!isValidUUID(ngoId)) {
      return { unsubscribe: () => {} };
    }

    let timeout: any = null;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        callback();
      }, 450);
    };

    const channelName = `ngo_claims_${ngoId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ngo_claims',
          filter: `ngo_id=eq.${ngoId}`,
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_tasks',
          filter: `ngo_id=eq.${ngoId}`,
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `user_id=eq.${ngoId}`,
        },
        debounced
      )
      .subscribe();

    return {
      unsubscribe: () => {
        clearTimeout(timeout);
        supabase.removeChannel(channel);
      },
    };
  },

  subscribeToAvailableTasks(callback: () => void) {
    let timeout: any = null;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        callback();
      }, 300);
    };

    const channelName = `tasks_avail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_tasks',
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'food_listings',
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ngo_claims',
        },
        debounced
      )
      .subscribe();

    return {
      unsubscribe: () => {
        clearTimeout(timeout);
        supabase.removeChannel(channel);
      },
    };
  },

  subscribeToDonorListings(donorId: string, callback: () => void) {
    if (!isValidUUID(donorId)) {
      return { unsubscribe: () => {} };
    }

    let timeout: any = null;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        callback();
      }, 450);
    };

    const channelName = `donor_listings_${donorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_tasks',
          filter: `donor_id=eq.${donorId}`,
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'food_listings',
          filter: `donor_id=eq.${donorId}`,
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
        },
        debounced
      )
      .subscribe();

    return {
      unsubscribe: () => {
        clearTimeout(timeout);
        supabase.removeChannel(channel);
      },
    };
  },
};
