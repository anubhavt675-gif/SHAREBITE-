import { supabase } from '../lib/supabase';
import { isValidUUID } from '../lib/uuid';
import { ChatService } from './chat';
import { ClaimsService, type NgoClaim, type DistributionRecord } from './claims';
import { DonationService } from './donations';
import { NGOService } from './ngo';
import type { FoodListing } from '../types';

export type FoodRequestStatus =
  | 'OPEN'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface NGOFoodRequest {
  id: string;
  ngoId: string;
  ngoName?: string;
  title: string;
  foodType: string;
  dietaryPreference: 'veg' | 'non_veg' | 'both';
  peopleCount: number;
  requiredQuantity: number;
  fulfilledQuantity: number;
  quantityUnit: string;
  neededBy?: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  collectionPreference: 'rider_delivery' | 'direct_collection' | 'either';
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  storageRequirements?: string;
  instructions?: string;
  status: FoodRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NGOVolunteer {
  id: string;
  ngoId: string;
  profileId?: string;
  fullName: string;
  email?: string;
  phone?: string;
  volunteerRole: 'collector' | 'coordinator' | 'distributor' | 'driver';
  isActive: boolean;
  isAvailable: boolean;
  assignedClaimId?: string;
  assignedTaskLabel?: string;
  completedCollections: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NGOActivityItem {
  id: string;
  kind:
    | 'food_collected'
    | 'rider_assigned'
    | 'new_food'
    | 'request_created'
    | 'delivery_completed'
    | 'food_distributed'
    | 'receipt_recorded'
    | 'message';
  description: string;
  reference?: string;
  timestamp: string;
  actionUrl?: string;
}

export interface NGODashboardStats {
  availableFoodCount: number;
  availableTodayCount: number;
  activeCollectionsCount: number;
  peopleFedThisMonth: number;
  peopleFedIsEstimated: boolean;
  foodSavedKg: number;
  foodSavedIsEstimated: boolean;
}

function mapFoodRequest(row: any): NGOFoodRequest {
  const neededBy = row.needed_by || undefined;
  let status = (row.status || 'OPEN').toUpperCase() as FoodRequestStatus;
  if (
    (status === 'OPEN' || status === 'PARTIALLY_FULFILLED') &&
    neededBy &&
    new Date(neededBy).getTime() < Date.now()
  ) {
    status = 'EXPIRED';
  }
  return {
    id: row.id,
    ngoId: row.ngo_id || row.requester_id || '',
    ngoName: row.ngo?.organization_name || row.ngo?.full_name || undefined,
    title: row.title || row.food_type || 'Food Request',
    foodType: row.food_type || 'Cooked Meals',
    dietaryPreference: row.dietary_preference || 'veg',
    peopleCount: Number(row.people_count ?? row.servings_needed ?? 0),
    requiredQuantity: Number(row.required_quantity ?? row.servings_needed ?? 0),
    fulfilledQuantity: Number(row.fulfilled_quantity ?? 0),
    quantityUnit: row.quantity_unit || 'servings',
    neededBy,
    urgency: row.urgency || 'normal',
    collectionPreference: row.collection_preference || 'either',
    address: row.address || undefined,
    city: row.city || undefined,
    latitude: row.latitude != null ? Number(row.latitude) : undefined,
    longitude: row.longitude != null ? Number(row.longitude) : undefined,
    storageRequirements: row.storage_requirements || undefined,
    instructions: row.instructions || row.description || undefined,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function mapVolunteer(row: any): NGOVolunteer {
  return {
    id: row.id,
    ngoId: row.ngo_id,
    profileId: row.profile_id || undefined,
    fullName: row.full_name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    volunteerRole: row.volunteer_role || 'collector',
    isActive: row.is_active !== false,
    isAvailable: row.is_available !== false,
    assignedClaimId: row.assigned_claim_id || undefined,
    assignedTaskLabel: row.assigned_task_label || undefined,
    completedCollections: Number(row.completed_collections ?? 0),
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

// Conservative standard conversion when weight isn't explicitly entered in kg: 1 serving ≈ 0.35 kg (clearly labeled as estimated)
export const ESTIMATED_KG_PER_SERVING = 0.35;

export function estimateFoodWeightKg(
  records: DistributionRecord[]
): { kg: number; isEstimated: boolean } {
  let totalKg = 0;
  let usedEstimate = false;

  for (const r of records) {
    if (r.safetyConcern || r.status === 'rejected' || r.status === 'discarded') continue;
    const validQty = Math.max(0, r.quantityReceived - r.quantityRejected);
    if (validQty <= 0) continue;
    const unit = (r.quantityUnit || 'servings').toLowerCase();
    if (unit === 'kg' || unit === 'kilograms' || unit === 'kgs') {
      totalKg += validQty;
    } else if (unit === 'g' || unit === 'grams') {
      totalKg += validQty / 1000;
    } else {
      totalKg += validQty * ESTIMATED_KG_PER_SERVING;
      usedEstimate = true;
    }
  }

  return { kg: Number(totalKg.toFixed(1)), isEstimated: usedEstimate && totalKg > 0 };
}

export class NGOOperationsService {
  // ── 1. Dashboard Summary & Real Metrics ──────────────────────────────────
  static async getDashboardBundle(ngoId: string): Promise<{
    stats: NGODashboardStats;
    availableListings: FoodListing[];
    claims: NgoClaim[];
    activeCollections: NgoClaim[];
    distributionRecords: DistributionRecord[];
    foodRequests: NGOFoodRequest[];
    recentActivity: NGOActivityItem[];
    isOnline: boolean;
  }> {
    if (!isValidUUID(ngoId)) {
      return {
        stats: {
          availableFoodCount: 0,
          availableTodayCount: 0,
          activeCollectionsCount: 0,
          peopleFedThisMonth: 0,
          peopleFedIsEstimated: false,
          foodSavedKg: 0,
          foodSavedIsEstimated: false,
        },
        availableListings: [],
        claims: [],
        activeCollections: [],
        distributionRecords: [],
        foodRequests: [],
        recentActivity: [],
        isOnline: true,
      };
    }

    const [availableListings, claims, distributionRecords, foodRequests, profileRes, notifsRes] =
      await Promise.all([
        DonationService.getActiveListings().catch(() => [] as FoodListing[]),
        ClaimsService.getMyClaims(ngoId).catch(() => [] as NgoClaim[]),
        ClaimsService.getDistributionRecords(ngoId).catch(() => [] as DistributionRecord[]),
        this.getMyFoodRequests(ngoId).catch(() => [] as NGOFoodRequest[]),
        supabase.from('profiles').select('is_available').eq('id', ngoId).maybeSingle(),
        supabase
          .from('notifications')
          .select('id, type, title, message, created_at, action_url')
          .eq('user_id', ngoId)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const eligibleAvailable = availableListings.filter(
      (l) =>
        (l.status === 'available' || l.status === 'partially_reserved') &&
        l.availableServings > 0 &&
        (!l.availableUntil || new Date(l.availableUntil).getTime() > Date.now())
    );

    const availableTodayCount = eligibleAvailable.filter(
      (l) => new Date(l.createdAt).getTime() >= startOfToday
    ).length;

    const activeCollections = claims.filter(
      (c) =>
        !['distributed', 'cancelled', 'expired'].includes(c.status) &&
        !(c.collectionMethod === 'direct_ngo_pickup' && c.status === 'delivered') &&
        !(c.deliveryStatus === 'completed' && Boolean(c.distributionRecordId))
    );

    // Real People Fed this month (from actual distribution records, excluding rejected food)
    let peopleFedThisMonth = 0;
    let peopleFedIsEstimated = false;
    const monthRecords = distributionRecords.filter(
      (r) =>
        !r.safetyConcern &&
        r.status !== 'rejected' &&
        new Date(r.createdAt).getTime() >= startOfMonth
    );

    for (const r of monthRecords) {
      if (r.peopleServed != null && r.peopleServed > 0) {
        peopleFedThisMonth += r.peopleServed;
      } else if (r.quantityDistributed > 0) {
        peopleFedThisMonth += Math.round(r.quantityDistributed);
        peopleFedIsEstimated = true;
      }
    }

    const { kg: foodSavedKg, isEstimated: foodSavedIsEstimated } =
      estimateFoodWeightKg(distributionRecords);

    // Build genuine Recent Activity feed from real DB events
    const activity: NGOActivityItem[] = [];

    for (const r of distributionRecords.slice(0, 5)) {
      if (r.quantityDistributed > 0) {
        activity.push({
          id: `dist-${r.id}`,
          kind: 'food_distributed',
          description: `Distributed ${r.quantityDistributed} ${r.quantityUnit}${r.peopleServed ? ` to ${r.peopleServed} people` : ''}`,
          reference: r.distributionLocation || 'Distribution Log',
          timestamp: r.updatedAt || r.createdAt,
          actionUrl: '/ngo/received-food',
        });
      } else if (r.receiptConfirmedAt) {
        activity.push({
          id: `rec-${r.id}`,
          kind: 'receipt_recorded',
          description: `Recorded receipt of ${r.quantityReceived} ${r.quantityUnit}`,
          reference: r.safetyConcern ? 'Safety Flagged' : 'Verified Receipt',
          timestamp: r.receiptConfirmedAt,
          actionUrl: '/ngo/received-food',
        });
      }
    }

    for (const c of claims.slice(0, 5)) {
      const kind: NGOActivityItem['kind'] =
        c.deliveryStatus === 'completed'
          ? 'delivery_completed'
          : c.status === 'food_collected' || c.deliveryStatus === 'food_collected'
          ? 'food_collected'
          : 'rider_assigned';

      activity.push({
        id: `claim-${c.id}`,
        kind,
        description:
          kind === 'delivery_completed'
            ? `Collection completed: ${c.foodTitle || 'Food Donation'}`
            : kind === 'food_collected'
            ? `Food collected from ${c.donorName || 'Donor'} (${c.foodTitle || 'Donation'})`
            : c.riderName
            ? `Rider ${c.riderName} assigned for ${c.foodTitle || 'Food Donation'}`
            : `Claimed ${c.foodTitle || 'Food Donation'} (${c.collectionMethod === 'direct_ngo_pickup' ? 'Direct Collection' : 'Rider Delivery'})`,
        reference: c.donorName,
        timestamp: c.updatedAt || c.createdAt,
        actionUrl: '/ngo/collections',
      });
    }

    for (const req of foodRequests.slice(0, 3)) {
      activity.push({
        id: `req-${req.id}`,
        kind: 'request_created',
        description: `Food request posted: ${req.title} (${req.requiredQuantity} ${req.quantityUnit})`,
        reference: req.status,
        timestamp: req.createdAt,
        actionUrl: '/ngo/food-requests',
      });
    }

    for (const n of notifsRes.data || []) {
      activity.push({
        id: `notif-${n.id}`,
        kind: n.type === 'new_message' ? 'message' : 'new_food',
        description: n.title || n.message || 'System update',
        reference: n.message ? n.message.slice(0, 60) : undefined,
        timestamp: n.created_at,
        actionUrl: n.action_url || '/notifications',
      });
    }

    // Deduplicate and sort newest first
    const seen = new Set<string>();
    const recentActivity = activity
      .filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return {
      stats: {
        availableFoodCount: eligibleAvailable.length,
        availableTodayCount,
        activeCollectionsCount: activeCollections.length,
        peopleFedThisMonth,
        peopleFedIsEstimated,
        foodSavedKg,
        foodSavedIsEstimated,
      },
      availableListings: eligibleAvailable,
      claims,
      activeCollections,
      distributionRecords,
      foodRequests,
      recentActivity,
      isOnline: profileRes.data?.is_available !== false,
    };
  }

  // ── 2. NGO Availability Toggle (Persisted in DB) ─────────────────────────
  static async setOnlineStatus(ngoId: string, isOnline: boolean): Promise<boolean> {
    const ok = await NGOService.updateAvailability(ngoId, { isAvailable: isOnline });
    window.dispatchEvent(new CustomEvent('sharebite:ngo-online', { detail: { isOnline } }));
    return ok;
  }

  // ── 3. Mode A & Mode B Atomic Collection Actions ─────────────────────────
  static async acceptDonationForNGO(
    foodListingId: string,
    mode: 'rider_delivery' | 'direct_collection',
    servings?: number,
    notes?: string
  ) {
    const collectionMethod = mode === 'direct_collection' ? 'direct_ngo_pickup' : 'ngo_delivery';
    return ClaimsService.acceptDonation(foodListingId, servings, undefined, notes, collectionMethod);
  }

  static async confirmIncomingCapacity(claimId: string): Promise<{ confirmed: boolean; conversationId?: string }> {
    if (!isValidUUID(claimId)) throw new Error('Invalid claim ID');
    const { data, error } = await supabase.rpc('ngo_confirm_incoming_capacity', {
      p_claim_id: claimId,
    });
    if (!error) {
      if (data && typeof data === 'object') {
        return {
          confirmed: Boolean((data as any).confirmed ?? true),
          conversationId: (data as any).conversation_id || undefined,
        };
      }
      return { confirmed: Boolean(data) };
    }

    // Fallback direct update if migration not yet applied
    const { error: updErr } = await supabase
      .from('ngo_claims')
      .update({
        ngo_capacity_confirmed: true,
        ngo_capacity_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', claimId);
    if (updErr && !/column/i.test(updErr.message || '')) {
      throw new Error(updErr.message);
    }
    return { confirmed: true };
  }

  static async declineIncomingAssignment(
    claimId: string,
    reason?: string
  ): Promise<{ declined: boolean; reassigned: boolean; nextNgoName?: string }> {
    if (!isValidUUID(claimId)) throw new Error('Invalid claim ID');
    const { data, error } = await supabase.rpc('ngo_decline_incoming_assignment', {
      p_claim_id: claimId,
      p_reason: reason || 'Capacity currently unavailable',
    });
    if (!error && data && typeof data === 'object') {
      return {
        declined: Boolean((data as any).declined ?? true),
        reassigned: Boolean((data as any).reassigned),
        nextNgoName: (data as any).next_ngo_name || undefined,
      };
    }
    if (error && error.code !== 'PGRST202') {
      throw new Error(error.message || 'Could not decline incoming assignment');
    }
    // Fallback if new RPC not yet applied
    await ClaimsService.cancelClaim(claimId, reason || 'Declined by NGO');
    return { declined: true, reassigned: false };
  }

  /**
   * Mode B: Complete an NGO Direct Collection, record receipt, and auto-close Donor-NGO chat.
   */
  static async completeDirectCollection(params: {
    claimId: string;
    foodListingId: string;
    ngoId: string;
    quantityReceived: number;
    conditionNotes?: string;
    safetyConcern?: boolean;
    safetyNotes?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('ngo_complete_direct_collection', {
      p_claim_id: params.claimId,
      p_quantity_received: params.quantityReceived,
      p_condition_notes: params.conditionNotes || null,
      p_safety_concern: !!params.safetyConcern,
      p_safety_notes: params.safetyNotes || null,
    });

    if (!error && data) {
      await ChatService.closeConversationForDelivery(null, params.foodListingId, params.ngoId).catch(
        () => {}
      );
      return data as string;
    }

    if (error && error.code !== 'PGRST202' && /Rider-assisted|Unauthorized/i.test(error.message || '')) {
      throw new Error(error.message);
    }

    // Fallback using existing confirmNgoReceipt + chat closure
    const distId = await ClaimsService.confirmNgoReceipt(
      null,
      params.quantityReceived,
      params.conditionNotes,
      params.safetyConcern,
      params.safetyNotes,
      params.claimId
    );
    await ChatService.closeConversationForDelivery(null, params.foodListingId, params.ngoId).catch(
      () => {}
    );
    return distId;
  }

  // ── 4. Food Requests CRUD (Real Supabase) ────────────────────────────────
  static async getMyFoodRequests(ngoId: string): Promise<NGOFoodRequest[]> {
    if (!isValidUUID(ngoId)) return [];
    const { data, error } = await supabase
      .from('food_requests')
      .select('*')
      .eq('ngo_id', ngoId)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback if existing table uses requester_id instead of ngo_id
      if (error.code === '42703' || /ngo_id/i.test(error.message || '')) {
        const retry = await supabase
          .from('food_requests')
          .select('*')
          .eq('requester_id', ngoId)
          .order('created_at', { ascending: false });
        return (retry.data || []).map(mapFoodRequest);
      }
      return [];
    }

    return (data || []).map(mapFoodRequest);
  }

  static async getOpenFoodRequests(): Promise<NGOFoodRequest[]> {
    const { data, error } = await supabase
      .from('food_requests')
      .select('*, ngo:ngo_id(id, organization_name, full_name, city, address)')
      .in('status', ['OPEN', 'PARTIALLY_FULFILLED'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !data) return [];
    return data.map(mapFoodRequest).filter((r) => r.status !== 'EXPIRED');
  }

  static async createFoodRequest(
    ngoId: string,
    form: {
      title: string;
      foodType: string;
      dietaryPreference: 'veg' | 'non_veg' | 'both';
      peopleCount: number;
      requiredQuantity: number;
      quantityUnit: string;
      neededBy: string;
      urgency: 'low' | 'normal' | 'high' | 'urgent';
      collectionPreference: 'rider_delivery' | 'direct_collection' | 'either';
      address: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      storageRequirements?: string;
      instructions?: string;
    }
  ): Promise<NGOFoodRequest> {
    if (!isValidUUID(ngoId)) throw new Error('Authentication required');
    if (!form.title.trim()) throw new Error('Request title is required');
    if (form.requiredQuantity <= 0 || form.peopleCount <= 0) {
      throw new Error('People count and required quantity must be positive');
    }

    const payload: Record<string, any> = {
      ngo_id: ngoId,
      title: form.title.trim(),
      food_type: form.foodType.trim(),
      dietary_preference: form.dietaryPreference,
      people_count: Math.round(form.peopleCount),
      required_quantity: form.requiredQuantity,
      fulfilled_quantity: 0,
      quantity_unit: form.quantityUnit || 'servings',
      needed_by: form.neededBy || null,
      urgency: form.urgency,
      collection_preference: form.collectionPreference,
      address: form.address.trim(),
      city: form.city?.trim() || null,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      storage_requirements: form.storageRequirements?.trim() || null,
      instructions: form.instructions?.trim() || null,
      status: 'OPEN',
    };

    const { data, error } = await supabase
      .from('food_requests')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        error?.message?.includes('column')
          ? 'Please run the NGO migration SQL (20261128_ngo_portal_complete.sql) in Supabase SQL Editor to enable full Food Requests.'
          : error?.message || 'Failed to create food request'
      );
    }

    return mapFoodRequest(data);
  }

  static async updateFoodRequest(
    requestId: string,
    ngoId: string,
    updates: Partial<{
      title: string;
      foodType: string;
      peopleCount: number;
      requiredQuantity: number;
      neededBy: string;
      urgency: string;
      instructions: string;
      status: FoodRequestStatus;
    }>
  ): Promise<NGOFoodRequest> {
    if (!isValidUUID(requestId) || !isValidUUID(ngoId)) {
      throw new Error('Invalid request ID');
    }

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) payload.title = updates.title.trim();
    if (updates.foodType !== undefined) payload.food_type = updates.foodType.trim();
    if (updates.peopleCount !== undefined) payload.people_count = updates.peopleCount;
    if (updates.requiredQuantity !== undefined) payload.required_quantity = updates.requiredQuantity;
    if (updates.neededBy !== undefined) payload.needed_by = updates.neededBy;
    if (updates.urgency !== undefined) payload.urgency = updates.urgency;
    if (updates.instructions !== undefined) payload.instructions = updates.instructions.trim();
    if (updates.status !== undefined) payload.status = updates.status;

    const { data, error } = await supabase
      .from('food_requests')
      .update(payload)
      .eq('id', requestId)
      .eq('ngo_id', ngoId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update food request');
    }
    return mapFoodRequest(data);
  }

  // ── 5. Volunteer Management (Strict Organization Scope) ──────────────────
  static async getVolunteers(ngoId: string): Promise<{ volunteers: NGOVolunteer[]; tableMissing: boolean }> {
    if (!isValidUUID(ngoId)) return { volunteers: [], tableMissing: false };
    const { data, error } = await supabase
      .from('ngo_volunteers')
      .select('*')
      .eq('ngo_id', ngoId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || /ngo_volunteers/i.test(error.message || '')) {
        return { volunteers: [], tableMissing: true };
      }
      throw new Error(error.message);
    }

    return { volunteers: (data || []).map(mapVolunteer), tableMissing: false };
  }

  static async addVolunteer(
    ngoId: string,
    form: {
      fullName: string;
      email?: string;
      phone?: string;
      volunteerRole: 'collector' | 'coordinator' | 'distributor' | 'driver';
      notes?: string;
    }
  ): Promise<NGOVolunteer> {
    if (!isValidUUID(ngoId)) throw new Error('Authentication required');
    if (!form.fullName.trim()) throw new Error('Volunteer name is required');

    const { data, error } = await supabase
      .from('ngo_volunteers')
      .insert({
        ngo_id: ngoId,
        full_name: form.fullName.trim(),
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        volunteer_role: form.volunteerRole,
        notes: form.notes?.trim() || null,
        is_active: true,
        is_available: true,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        error?.code === 'PGRST205'
          ? 'Please run 20261128_ngo_portal_complete.sql in Supabase SQL Editor to enable Volunteer Management.'
          : error?.message || 'Failed to add volunteer'
      );
    }

    return mapVolunteer(data);
  }

  static async updateVolunteer(
    volunteerId: string,
    ngoId: string,
    updates: Partial<{
      isActive: boolean;
      isAvailable: boolean;
      assignedClaimId: string | null;
      assignedTaskLabel: string | null;
      completedCollections: number;
      notes: string;
    }>
  ): Promise<NGOVolunteer> {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.isAvailable !== undefined) payload.is_available = updates.isAvailable;
    if (updates.assignedClaimId !== undefined) payload.assigned_claim_id = updates.assignedClaimId;
    if (updates.assignedTaskLabel !== undefined) payload.assigned_task_label = updates.assignedTaskLabel;
    if (updates.completedCollections !== undefined) payload.completed_collections = updates.completedCollections;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    const { data, error } = await supabase
      .from('ngo_volunteers')
      .update(payload)
      .eq('id', volunteerId)
      .eq('ngo_id', ngoId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update volunteer');
    }
    return mapVolunteer(data);
  }

  // ── 6. Scoped Real-Time Subscription for NGO Portal ──────────────────────
  static subscribeToNgoPortal(ngoId: string, onRefresh: () => void) {
    if (!isValidUUID(ngoId)) {
      return { unsubscribe: () => {} };
    }

    let timer: any = null;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(onRefresh, 400);
    };

    const channel = supabase
      .channel(`ngo_portal_${ngoId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_listings' }, debounced)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ngo_claims', filter: `ngo_id=eq.${ngoId}` },
        debounced
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_tasks', filter: `ngo_id=eq.${ngoId}` },
        debounced
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'distribution_records', filter: `ngo_id=eq.${ngoId}` },
        debounced
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'food_requests', filter: `ngo_id=eq.${ngoId}` },
        debounced
      )
      .subscribe();

    return {
      unsubscribe: () => {
        clearTimeout(timer);
        supabase.removeChannel(channel);
      },
    };
  }
}
