// ShareBite — Donations / Food Listings Service (Web)
import { supabase } from '../lib/supabase';
import type { FoodListing, FoodStatus, CreateFoodListingForm } from '../types';

function mapListingToFood(data: any): FoodListing {
  const donorData = data.donor;
  return {
    id: data.id,
    donorId: data.donor_id,
    donor: donorData ? {
      id: donorData.id,
      name: donorData.full_name || 'User',
      email: donorData.email || '',
      phone: donorData.phone || '',
      role: donorData.role || 'donor',
      avatar: donorData.avatar_url,
      isVerified: donorData.is_verified || false,
      totalDonations: donorData.total_donations || 0,
      totalRescues: donorData.total_rescues || 0,
      createdAt: donorData.created_at,
      updatedAt: donorData.updated_at,
    } : undefined,
    title: data.title,
    description: data.description,
    category: data.category || 'other',
    foodType: data.food_type || 'veg',
    servings: data.servings,
    availableServings: data.available_servings,
    imageUrl: data.image_url,
    pickupAddress: data.pickup_address,
    city: data.city,
    latitude: data.latitude,
    longitude: data.longitude,
    availableFrom: data.available_from,
    availableUntil: data.available_until,
    status: data.status as FoodStatus,
    isUrgent: data.is_urgent || false,
    allergens: data.allergens || [],
    storageType: data.storage_type || 'room_temp',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export const DonationService = {
  async getActiveListings(): Promise<FoodListing[]> {
    const { data, error } = await supabase
      .from('food_listings')
      .select('*, donor:profiles!food_listings_donor_id_fkey(*)')
      .in('status', ['available', 'partially_reserved'])
      .gt('available_servings', 0)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      console.warn('Error fetching food listings:', error);
      return [];
    }
    return data.map(mapListingToFood);
  },

  async getListingById(id: string): Promise<FoodListing | null> {
    const { data, error } = await supabase
      .from('food_listings')
      .select('*, donor:profiles!food_listings_donor_id_fkey(*)')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return mapListingToFood(data);
  },

  async getMyListings(donorId: string): Promise<FoodListing[]> {
    const { data, error } = await supabase
      .from('food_listings')
      .select('*, donor:profiles!food_listings_donor_id_fkey(*)')
      .eq('donor_id', donorId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(mapListingToFood);
  },

  async createListing(donorId: string, form: CreateFoodListingForm): Promise<FoodListing> {
    let imageUrl: string | null = null;

    if (form.imageFile) {
      try {
        const ext = form.imageFile.name.split('.').pop() || 'jpg';
        const filename = `${donorId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('food-images')
          .upload(filename, form.imageFile, { upsert: true });

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('food-images')
            .getPublicUrl(filename);
          imageUrl = publicUrl;
        } else {
          // If storage bucket is not configured, generate a local data URL as safe preview
          imageUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(form.imageFile!);
          });
        }
      } catch (err) {
        console.warn('Image storage handling error:', err);
      }
    }

    // Prepare enriched description with dietary & handling notes
    const extraNotes: string[] = [];
    if (form.quantityUnit && form.quantityUnit !== 'servings') {
      extraNotes.push(`Quantity: ${form.quantityValue || form.servings} ${form.quantityUnit}`);
    }
    if (form.preparationDate) extraNotes.push(`Prepared: ${new Date(form.preparationDate).toLocaleString()}`);
    if (form.packagingType) extraNotes.push(`Packaging: ${form.packagingType}`);
    if (form.packagingNotes) extraNotes.push(`Packaging Notes: ${form.packagingNotes}`);
    if (form.specialInstructions) extraNotes.push(`Pickup Instructions: ${form.specialInstructions}`);
    if (form.contactPhone) extraNotes.push(`Contact: ${form.contactPhone}`);
    if (form.directHandover) extraNotes.push(`Handover: Direct handover to rider`);

    const fullDescription = form.description
      ? (extraNotes.length > 0 ? `${form.description}\n\n---\n${extraNotes.join(' | ')}` : form.description)
      : extraNotes.join(' | ');

    // Primary insert payload with full metadata
    const payload: any = {
      donor_id: donorId,
      title: form.title,
      description: fullDescription,
      category: form.category,
      food_type: form.foodType,
      servings: form.servings,
      available_servings: form.servings,
      image_url: imageUrl,
      pickup_address: form.pickupAddress,
      city: form.city,
      latitude: form.latitude || null,
      longitude: form.longitude || null,
      available_from: form.availableFrom,
      available_until: form.availableUntil,
      status: 'available',
      is_urgent: form.isUrgent,
      allergens: form.allergens || [],
      storage_type: form.storageType || 'room_temp',
    };

    let { data: listing, error } = await supabase
      .from('food_listings')
      .insert(payload)
      .select('*, donor:profiles!food_listings_donor_id_fkey(*)')
      .maybeSingle();

    // Fallback if extended columns are not yet applied on remote instance
    if (error && (error.message?.includes('column') || error.code === '42703')) {
      delete payload.allergens;
      delete payload.storage_type;
      const retry = await supabase
        .from('food_listings')
        .insert(payload)
        .select('*, donor:profiles!food_listings_donor_id_fkey(*)')
        .single();
      listing = retry.data;
      error = retry.error;
    }

    if (error || !listing) throw error || new Error('Failed to create food listing');

    // Record impact event safely
    try {
      await supabase.from('impact_events').insert({
        user_id: donorId,
        event_type: 'food_donated',
        servings: form.servings,
      });
    } catch {}

    // Record in donations table safely
    try {
      await supabase.from('donations').insert({
        food_listing_id: listing.id,
        donor_id: donorId,
        servings: form.servings,
        status: 'active',
      });
    } catch {}

    return mapListingToFood(listing);
  },

  async reserveFood(
    foodListingId: string,
    servings: number,
    pickupTime?: string,
    notes?: string
  ): Promise<string | null> {
    const { data: reservationId, error } = await supabase.rpc('reserve_food', {
      p_food_listing_id: foodListingId,
      p_servings: servings,
      p_pickup_time: pickupTime || null,
      p_notes: notes || null,
    });

    if (error) throw new Error(error.message || 'Reservation failed');
    return reservationId as string;
  },

  async cancelListing(listingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('food_listings')
      .update({ status: 'cancelled' })
      .eq('id', listingId);
    return !error;
  },

  async updateListingStatus(listingId: string, status: FoodStatus): Promise<boolean> {
    const { error } = await supabase
      .from('food_listings')
      .update({ status })
      .eq('id', listingId);

    if (!error && (status === 'completed' || status === 'picked_up')) {
      const { data: listing } = await supabase
        .from('food_listings')
        .select('donor_id, servings')
        .eq('id', listingId)
        .single();

      if (listing && status === 'completed') {
        try {
          await supabase.from('impact_events').insert({
            user_id: listing.donor_id,
            event_type: 'food_rescued',
            servings: listing.servings,
          });
        } catch {}
      }
    }
    return !error;
  },

  async getMyReservations(userId: string) {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, food_listing:food_listings(*, donor:profiles!food_listings_donor_id_fkey(*))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.filter((r: any) => r.food_listing).map((r: any) => ({
      id: r.id,
      foodListingId: r.food_listing_id,
      foodListing: mapListingToFood(r.food_listing),
      userId: r.user_id,
      servings: r.servings,
      status: r.status,
      pickupTime: r.pickup_time,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async updateReservationStatus(reservationId: string, status: string): Promise<boolean> {
    const { error } = await supabase
      .from('reservations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reservationId);
    return !error;
  },

  subscribeToListings(callback: (listing: FoodListing) => void) {
    return supabase
      .channel('food_listings_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'food_listings',
      }, async (payload) => {
        const { data } = await supabase
          .from('food_listings')
          .select('*, donor:profiles!food_listings_donor_id_fkey(*)')
          .eq('id', payload.new.id)
          .single();
        if (data) callback(mapListingToFood(data));
      })
      .subscribe();
  },
};
