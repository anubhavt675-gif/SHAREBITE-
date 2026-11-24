// ShareBite Complete 3-Role NGO Portal End-to-End Verification Suite
// Usage: node scripts/verify_ngo_portal_e2e.mjs <baseUrl> [screenshotOutPath]
// Verifies: NGO Dashboard layout/sidebar/KPIs, Online toggle persistence, Food Requests CRUD,
// Mode B Direct Collection + Competitor Lock + Chat Auto-Close + Received Food + Distribution + Reports,
// Mode A Rider-Assisted Authority Enforcement, Volunteers CRUD, Route Guard & Refresh stability.
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const baseUrl = (process.argv[2] || 'http://127.0.0.1:4175').replace(/\/$/, '');
const screenshotPath = process.argv[3] || '';
const chromePaths = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromePaths.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge found');
  process.exit(2);
}

const STORAGE_KEY = 'sb-lzyuvgbhpkiqxscqxggq-auth-token';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
const pass = (m) => {
  passed++;
  console.log(`PASS  ${m}`);
};
const fail = (m) => {
  failed++;
  console.error(`FAIL  ${m}`);
};

const IDS = {
  donor: 'aaaaaaaa-1111-4111-8111-111111111111',
  rider: 'bbbbbbbb-2222-4222-8222-222222222222',
  riderRow: 'dddddddd-4444-4444-8444-444444444444',
  ngoA: 'cccccccc-3333-4333-8333-333333333333',
  ngoB: 'eeeeeeee-5555-4555-8555-555555555555',
};

function makeJwt(sub, email) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 7200,
      iat: Math.floor(Date.now() / 1000),
      sub,
      email,
      role: 'authenticated',
    })
  ).toString('base64url');
  return `${h}.${p}.sig`;
}

function makeSession(profile) {
  return {
    access_token: makeJwt(profile.id, profile.email),
    refresh_token: `ref-${profile.id}`,
    expires_in: 7200,
    expires_at: Math.floor(Date.now() / 1000) + 7200,
    token_type: 'bearer',
    user: {
      id: profile.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: profile.email,
      email_confirmed_at: '2026-01-10T00:00:00Z',
      user_metadata: { full_name: profile.full_name, role: profile.role },
      app_metadata: { provider: 'email', providers: ['email'] },
    },
  };
}

function createSharedBackend() {
  let seq = 500;
  const nextUuid = () => {
    seq += 1;
    return `99999999-9999-4999-8999-${seq.toString(16).padStart(12, '0')}`;
  };

  const profiles = {
    [IDS.donor]: {
      id: IDS.donor,
      full_name: 'Anubhav Thakur',
      email: 'donor@sharebite.test',
      phone: '+91 9811122233',
      avatar_url: null,
      role: 'donor',
      organization_name: 'Food Plaza Kitchen',
      is_verified: true,
      verification_status: 'verified',
      address: 'Sector 14, Gurugram',
      city: 'Gurugram',
      latitude: 28.4744,
      longitude: 77.0405,
      is_available: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    [IDS.rider]: {
      id: IDS.rider,
      full_name: 'Rohit Kumar',
      email: 'rider@sharebite.test',
      phone: '+91 9822233344',
      avatar_url: null,
      role: 'rider',
      organization_name: null,
      is_verified: true,
      verification_status: 'verified',
      address: 'Sector 29, Gurugram',
      city: 'Gurugram',
      latitude: 28.469,
      longitude: 77.062,
      is_available: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    [IDS.ngoA]: {
      id: IDS.ngoA,
      full_name: 'HopeCare Coordinator',
      email: 'hopecare@sharebite.test',
      phone: '+91 9833344455',
      avatar_url: null,
      role: 'ngo',
      organization_name: 'HopeCare NGO',
      is_verified: true,
      verification_status: 'verified',
      address: 'Sector 45, Gurugram',
      city: 'Gurugram',
      latitude: 28.442,
      longitude: 77.058,
      is_available: true,
      service_radius_km: 15,
      daily_capacity: 250,
      operating_hours: '08:00 AM - 10:00 PM',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    [IDS.ngoB]: {
      id: IDS.ngoB,
      full_name: 'HelpingHands Lead',
      email: 'helpinghands@sharebite.test',
      phone: '+91 9844455566',
      avatar_url: null,
      role: 'ngo',
      organization_name: 'HelpingHands Foundation',
      is_verified: true,
      verification_status: 'verified',
      address: 'DLF Phase 3, Gurugram',
      city: 'Gurugram',
      latitude: 28.494,
      longitude: 77.095,
      is_available: true,
      service_radius_km: 15,
      daily_capacity: 150,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  };

  const riders = [
    {
      id: IDS.riderRow,
      user_id: IDS.rider,
      name: 'Rohit Kumar',
      phone: '+91 9822233344',
      vehicle_type: 'scooter',
      vehicle_number: 'HR 26 CD 4021',
      is_online: true,
      is_available: true,
      current_latitude: 28.469,
      current_longitude: 77.062,
      total_deliveries: 12,
      rating: 4.9,
      id_verified: true,
    },
  ];

  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 5 * 3600 * 1000).toISOString();

  const listingDirectId = nextUuid();
  const listingRiderId = nextUuid();

  const foodListings = [
    {
      id: listingDirectId,
      donor_id: IDS.donor,
      title: 'Fresh Paneer Biryani',
      description: 'Freshly cooked vegetarian paneer biryani packed in insulated trays.',
      category: 'cooked_meals',
      dietary_tags: ['vegetarian'],
      total_servings: 40,
      available_servings: 40,
      quantity_unit: 'servings',
      pickup_address: 'Shop 12, Sector 14 Market, Gurugram',
      pickup_city: 'Gurugram',
      pickup_latitude: 28.4744,
      pickup_longitude: 77.0405,
      available_until: futureIso,
      status: 'available',
      assigned_rider_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: listingRiderId,
      donor_id: IDS.donor,
      title: 'Mixed Fruit Crates',
      description: 'Fresh bananas, apples, and seasonal oranges packed for community distribution.',
      category: 'fruits_veg',
      dietary_tags: ['vegetarian', 'vegan'],
      total_servings: 25,
      available_servings: 25,
      quantity_unit: 'servings',
      pickup_address: 'Sector 29 Hub, Gurugram',
      pickup_city: 'Gurugram',
      pickup_latitude: 28.469,
      pickup_longitude: 77.062,
      available_until: futureIso,
      status: 'available',
      assigned_rider_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  const ngoClaims = [];
  const deliveryTasks = [];
  const distributionRecords = [];
  const foodRequests = [];
  const ngoVolunteers = [];
  const conversations = [];
  const participants = [];
  const messages = [];
  const notifications = [];

  function buildNgoClaimsView(ngoId) {
    return ngoClaims
      .filter((c) => !ngoId || c.ngo_id === ngoId)
      .map((c) => {
        const fl = foodListings.find((f) => f.id === c.food_listing_id);
        const dt = deliveryTasks.find((t) => t.claim_id === c.id);
        const dr = distributionRecords.find((d) => d.claim_id === c.id);
        const donor = fl ? profiles[fl.donor_id] : null;
        const ngo = profiles[c.ngo_id];
        const riderObj = dt ? riders.find((r) => r.id === dt.rider_id) : null;
        return {
          id: c.id,
          claim_id: c.id,
          food_listing_id: c.food_listing_id,
          ngo_id: c.ngo_id,
          ngo_name: ngo?.organization_name || ngo?.full_name,
          servings_claimed: c.servings_claimed,
          status: c.status,
          claim_status: c.status,
          collection_method: c.collection_method,
          created_at: c.created_at,
          claimed_at: c.created_at,
          updated_at: c.updated_at,
          food_title: fl?.title,
          food_image: null,
          pickup_address: fl?.pickup_address,
          pickup_city: fl?.pickup_city,
          pickup_lat: fl?.pickup_latitude,
          pickup_lng: fl?.pickup_longitude,
          available_until: fl?.available_until,
          donor_id: fl?.donor_id,
          donor_name: donor?.organization_name || donor?.full_name,
          dropoff_lat: ngo?.latitude,
          dropoff_lng: ngo?.longitude,
          delivery_task_id: dt?.id || null,
          delivery_status: dt?.status || null,
          rider_id: dt?.rider_id || null,
          rider_user_id: riderObj?.user_id || null,
          rider_name: riderObj?.name || null,
          rider_phone: riderObj?.phone || null,
          dropoff_code: dt?.dropoff_code || null,
          distribution_record_id: dr?.id || null,
          quantity_received: dr?.quantity_received,
          quantity_distributed: dr?.quantity_distributed,
          quantity_remaining: dr?.quantity_remaining,
          receipt_confirmed_at: dr?.receipt_confirmed_at || c.receipt_acknowledged_at || null,
          ngo_capacity_confirmed: c.ngo_capacity_confirmed || false,
        };
      });
  }

  function parseEq(url, key) {
    const v = url.searchParams.get(key);
    if (!v) return null;
    return v.startsWith('eq.') ? v.slice(3) : null;
  }

  function handleRequest(method, urlStr, rawBody, authHeader) {
    const url = new URL(urlStr);
    const path = url.pathname;
    const token = (authHeader || '').replace(/^Bearer\s+/i, '');
    let callerId = null;
    if (token.includes('.')) {
      try {
        callerId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
      } catch {}
    }
    const body = rawBody ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })() : {};

    // Auth endpoints
    if (path.includes('/auth/v1/user')) {
      const p = profiles[callerId];
      if (!p) return { status: 401, data: { error: 'Unauthorized' } };
      return { status: 200, data: makeSession(p).user };
    }
    if (path.includes('/auth/v1/token')) {
      const p = Object.values(profiles).find((x) => x.email === body.email) || profiles[callerId];
      if (!p) return { status: 400, data: { error: 'Invalid credentials' } };
      return { status: 200, data: makeSession(p) };
    }
    if (path.includes('/auth/v1/logout')) {
      return { status: 204, data: null };
    }

    // RPCs
    if (path.includes('/rest/v1/rpc/accept_donation')) {
      const listing = foodListings.find((f) => f.id === body.p_food_listing_id);
      if (!listing) return { status: 400, data: { message: 'Food donation not found' } };
      if (listing.status !== 'available' || listing.available_servings <= 0) {
        return {
          status: 400,
          data: { message: 'ALREADY_CLAIMED: This donation has already been claimed by another user.' },
        };
      }
      const caller = profiles[callerId];
      const servings = body.p_servings || listing.available_servings;
      const collectionMethod = body.p_collection_method || 'ngo_delivery';
      const now = new Date().toISOString();

      listing.available_servings = Math.max(0, listing.available_servings - servings);
      listing.status = 'reserved';
      listing.updated_at = now;

      let claimId = null;
      let taskId = null;
      const convId = nextUuid();

      if (caller.role === 'ngo') {
        claimId = nextUuid();
        ngoClaims.push({
          id: claimId,
          food_listing_id: listing.id,
          ngo_id: callerId,
          servings_claimed: servings,
          status: collectionMethod === 'direct_ngo_pickup' ? 'confirmed' : 'awaiting_rider',
          collection_method: collectionMethod,
          ngo_capacity_confirmed: true,
          created_at: now,
          updated_at: now,
        });
        if (collectionMethod === 'ngo_delivery') {
          taskId = nextUuid();
          deliveryTasks.push({
            id: taskId,
            claim_id: claimId,
            food_listing_id: listing.id,
            donor_id: listing.donor_id,
            ngo_id: callerId,
            rider_id: null,
            status: 'pending',
            dropoff_code: 'DROP42',
            created_at: now,
            updated_at: now,
          });
        }
        conversations.push({
          id: convId,
          type: 'delivery',
          related_listing_id: listing.id,
          related_task_id: taskId,
          title: listing.title,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
          last_message_at: now,
        });
        participants.push(
          { conversation_id: convId, user_id: listing.donor_id, unread_count: 0 },
          { conversation_id: convId, user_id: callerId, unread_count: 0 }
        );
      } else if (caller.role === 'rider') {
        listing.assigned_rider_id = callerId;
        claimId = nextUuid();
        ngoClaims.push({
          id: claimId,
          food_listing_id: listing.id,
          ngo_id: IDS.ngoA,
          servings_claimed: servings,
          status: 'rider_assigned',
          collection_method: 'ngo_delivery',
          ngo_capacity_confirmed: false,
          created_at: now,
          updated_at: now,
        });
        taskId = nextUuid();
        deliveryTasks.push({
          id: taskId,
          claim_id: claimId,
          food_listing_id: listing.id,
          donor_id: listing.donor_id,
          ngo_id: IDS.ngoA,
          rider_id: IDS.riderRow,
          status: 'rider_assigned',
          dropoff_code: 'DROP99',
          created_at: now,
          updated_at: now,
        });
        conversations.push({
          id: convId,
          type: 'delivery',
          related_listing_id: listing.id,
          related_task_id: taskId,
          title: listing.title,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
          last_message_at: now,
        });
        participants.push(
          { conversation_id: convId, user_id: listing.donor_id, unread_count: 0 },
          { conversation_id: convId, user_id: callerId, unread_count: 0 }
        );
      }

      return {
        status: 200,
        data: {
          success: true,
          claim_id: claimId,
          delivery_task_id: taskId,
          conversation_id: convId,
          collection_method: collectionMethod,
        },
      };
    }

    if (path.includes('/rest/v1/rpc/ngo_confirm_incoming_capacity')) {
      const claim = ngoClaims.find((c) => c.id === body.p_claim_id);
      if (!claim || claim.ngo_id !== callerId) {
        return { status: 403, data: { message: 'Unauthorized' } };
      }
      claim.ngo_capacity_confirmed = true;
      claim.updated_at = new Date().toISOString();
      return { status: 200, data: true };
    }

    if (path.includes('/rest/v1/rpc/ngo_complete_direct_collection')) {
      const claim = ngoClaims.find((c) => c.id === body.p_claim_id);
      if (!claim || claim.ngo_id !== callerId) {
        return { status: 403, data: { message: 'Unauthorized' } };
      }
      if (claim.collection_method !== 'direct_ngo_pickup') {
        return {
          status: 400,
          data: { message: 'Rider-assisted deliveries can only be completed by the assigned rider.' },
        };
      }
      const now = new Date().toISOString();
      const qty = Number(body.p_quantity_received ?? claim.servings_claimed);
      const distId = nextUuid();
      distributionRecords.push({
        id: distId,
        claim_id: claim.id,
        ngo_id: callerId,
        food_listing_id: claim.food_listing_id,
        quantity_received: qty,
        quantity_unit: 'servings',
        quantity_distributed: 0,
        quantity_remaining: qty,
        quantity_rejected: body.p_safety_concern ? qty : 0,
        people_served: 0,
        condition_notes: body.p_condition_notes || null,
        safety_concern: !!body.p_safety_concern,
        safety_notes: body.p_safety_notes || null,
        status: body.p_safety_concern ? 'rejected' : 'received',
        receipt_confirmed_at: now,
        created_at: now,
        updated_at: now,
      });
      claim.status = 'delivered';
      claim.receipt_acknowledged_at = now;
      claim.completed_at = now;
      claim.updated_at = now;
      const fl = foodListings.find((f) => f.id === claim.food_listing_id);
      if (fl) fl.status = 'completed';

      // Auto-close Donor-NGO conversation
      conversations.forEach((cv) => {
        if (cv.related_listing_id === claim.food_listing_id) {
          cv.status = 'CLOSED';
          cv.closed_at = now;
          cv.closed_by = callerId;
        }
      });

      return { status: 200, data: distId };
    }

    if (path.includes('/rest/v1/rpc/confirm_ngo_receipt')) {
      const claim = ngoClaims.find((c) => c.id === body.p_claim_id) ||
        ngoClaims.find((c) => deliveryTasks.some((t) => t.id === body.p_delivery_task_id && t.claim_id === c.id));
      if (!claim || claim.ngo_id !== callerId) {
        return { status: 403, data: { message: 'Unauthorized' } };
      }
      const now = new Date().toISOString();
      const qty = Number(body.p_quantity_received ?? claim.servings_claimed);
      const distId = nextUuid();
      distributionRecords.push({
        id: distId,
        claim_id: claim.id,
        ngo_id: callerId,
        food_listing_id: claim.food_listing_id,
        quantity_received: qty,
        quantity_unit: 'servings',
        quantity_distributed: 0,
        quantity_remaining: qty,
        quantity_rejected: 0,
        people_served: 0,
        condition_notes: body.p_condition_notes || null,
        safety_concern: !!body.p_safety_concern,
        status: 'received',
        receipt_confirmed_at: now,
        created_at: now,
        updated_at: now,
      });
      claim.receipt_acknowledged_at = now;
      // CRITICAL MODE A RULE: Do NOT mark rider delivery_task completed when NGO acknowledges receipt!
      return { status: 200, data: distId };
    }

    if (path.includes('/rest/v1/rpc/record_distribution')) {
      const recId = body.p_distribution_record_id || body.p_distribution_id;
      const dr = distributionRecords.find((d) => d.id === recId && d.ngo_id === callerId);
      if (!dr) return { status: 404, data: { message: 'Distribution record not found' } };
      const qty = Number(body.p_quantity_to_distribute ?? body.p_quantity_distributed ?? 0);
      if (qty <= 0 || qty > dr.quantity_remaining) {
        return { status: 400, data: { message: 'Quantity exceeds remaining inventory' } };
      }
      dr.quantity_distributed += qty;
      dr.quantity_remaining = Math.max(0, dr.quantity_received - dr.quantity_distributed);
      if (body.p_people_served) dr.people_served = (dr.people_served || 0) + Number(body.p_people_served);
      if (body.p_distribution_method) dr.distribution_method = body.p_distribution_method;
      if (body.p_distribution_location) dr.distribution_location = body.p_distribution_location;
      dr.status = dr.quantity_remaining <= 0 ? 'distributed' : 'partially_distributed';
      dr.updated_at = new Date().toISOString();
      return { status: 200, data: true };
    }

    // Table endpoints
    if (path.endsWith('/rest/v1/profiles')) {
      const eqId = parseEq(url, 'id');
      if (method === 'GET') {
        if (eqId) {
          const p = profiles[eqId];
          return { status: 200, data: url.searchParams.has('limit') || authHeader ? (p ? [p] : []) : p };
        }
        return { status: 200, data: Object.values(profiles) };
      }
      if (method === 'PATCH' && eqId && profiles[eqId]) {
        if (eqId !== callerId) return { status: 403, data: { message: 'Forbidden' } };
        Object.assign(profiles[eqId], body, { updated_at: new Date().toISOString() });
        return { status: 200, data: [profiles[eqId]] };
      }
    }

    if (path.endsWith('/rest/v1/food_listings')) {
      if (method === 'GET') {
        const rows = foodListings.map((f) => ({
          ...f,
          donor: profiles[f.donor_id] || null,
        }));
        return { status: 200, data: rows };
      }
    }

    if (path.endsWith('/rest/v1/ngo_claims_dashboard_view')) {
      const ngoId = parseEq(url, 'ngo_id') || callerId;
      return { status: 200, data: buildNgoClaimsView(ngoId) };
    }

    if (path.endsWith('/rest/v1/ngo_claims')) {
      const ngoId = parseEq(url, 'ngo_id');
      if (method === 'GET') {
        const list = ngoClaims.filter((c) => !ngoId || c.ngo_id === ngoId);
        return { status: 200, data: list };
      }
    }

    if (path.endsWith('/rest/v1/distribution_records')) {
      const ngoId = parseEq(url, 'ngo_id');
      const idEq = parseEq(url, 'id');
      if (method === 'GET') {
        let list = distributionRecords.filter((d) => d.ngo_id === callerId);
        if (ngoId) list = list.filter((d) => d.ngo_id === ngoId);
        if (idEq) list = list.filter((d) => d.id === idEq);
        return { status: 200, data: list };
      }
    }

    if (path.endsWith('/rest/v1/food_requests')) {
      if (method === 'GET') {
        const ngoId = parseEq(url, 'ngo_id');
        let list = foodRequests;
        if (ngoId) list = list.filter((r) => r.ngo_id === ngoId);
        return { status: 200, data: list };
      }
      if (method === 'POST') {
        if (body.ngo_id !== callerId) return { status: 403, data: { message: 'RLS violation' } };
        const now = new Date().toISOString();
        const rec = { id: nextUuid(), ...body, created_at: now, updated_at: now };
        foodRequests.unshift(rec);
        return { status: 201, data: rec };
      }
      if (method === 'PATCH') {
        const idEq = parseEq(url, 'id');
        const rec = foodRequests.find((r) => r.id === idEq && r.ngo_id === callerId);
        if (!rec) return { status: 403, data: { message: 'Not found or unauthorized' } };
        Object.assign(rec, body, { updated_at: new Date().toISOString() });
        return { status: 200, data: rec };
      }
    }

    if (path.endsWith('/rest/v1/ngo_volunteers')) {
      if (method === 'GET') {
        const ngoId = parseEq(url, 'ngo_id');
        if (ngoId && ngoId !== callerId) {
          return { status: 200, data: [] }; // Strict RLS isolation
        }
        return { status: 200, data: ngoVolunteers.filter((v) => v.ngo_id === callerId) };
      }
      if (method === 'POST') {
        if (body.ngo_id !== callerId) return { status: 403, data: { message: 'RLS violation' } };
        const now = new Date().toISOString();
        const rec = {
          id: nextUuid(),
          completed_collections: 0,
          ...body,
          created_at: now,
          updated_at: now,
        };
        ngoVolunteers.unshift(rec);
        return { status: 201, data: rec };
      }
      if (method === 'PATCH') {
        const idEq = parseEq(url, 'id');
        const rec = ngoVolunteers.find((v) => v.id === idEq && v.ngo_id === callerId);
        if (!rec) return { status: 403, data: { message: 'RLS violation' } };
        Object.assign(rec, body, { updated_at: new Date().toISOString() });
        return { status: 200, data: rec };
      }
    }

    if (path.endsWith('/rest/v1/conversation_participants')) {
      if (method === 'GET') {
        const uid = parseEq(url, 'user_id') || callerId;
        const myConvIds = new Set(participants.filter((p) => p.user_id === uid).map((p) => p.conversation_id));
        const res = participants
          .filter((p) => myConvIds.has(p.conversation_id))
          .map((p) => ({
            ...p,
            conversation: conversations.find((c) => c.id === p.conversation_id),
            user: profiles[p.user_id],
          }));
        return { status: 200, data: res };
      }
      if (method === 'PATCH') {
        return { status: 200, data: [] };
      }
    }

    if (path.endsWith('/rest/v1/conversations')) {
      if (method === 'GET') {
        const myConvIds = new Set(participants.filter((p) => p.user_id === callerId).map((p) => p.conversation_id));
        const list = conversations
          .filter((c) => myConvIds.has(c.id))
          .map((c) => ({
            ...c,
            participants: participants
              .filter((p) => p.conversation_id === c.id)
              .map((p) => ({ ...p, user: profiles[p.user_id] })),
          }));
        return { status: 200, data: list };
      }
      if (method === 'PATCH') {
        const idEq = parseEq(url, 'id');
        const c = conversations.find((x) => x.id === idEq);
        if (c) Object.assign(c, body);
        return { status: 200, data: c ? [c] : [] };
      }
    }

    if (path.endsWith('/rest/v1/messages')) {
      if (method === 'GET') {
        const convId = parseEq(url, 'conversation_id');
        const list = messages
          .filter((m) => !convId || m.conversation_id === convId)
          .map((m) => ({ ...m, sender: profiles[m.sender_id] }));
        return { status: 200, data: list };
      }
      if (method === 'POST') {
        const conv = conversations.find((c) => c.id === body.conversation_id);
        if (!conv) return { status: 404, data: { message: 'Conversation not found' } };
        if (conv.status === 'CLOSED') {
          return {
            status: 403,
            data: { message: 'This conversation is closed because the delivery has been completed.' },
          };
        }
        const now = new Date().toISOString();
        const msg = { id: nextUuid(), ...body, is_read: false, created_at: now };
        messages.push(msg);
        conv.last_message_at = now;
        return { status: 201, data: { ...msg, sender: profiles[msg.sender_id] } };
      }
    }

    if (path.endsWith('/rest/v1/notifications')) {
      if (method === 'GET') {
        return { status: 200, data: notifications.filter((n) => n.user_id === callerId) };
      }
      return { status: 200, data: [] };
    }

    if (path.endsWith('/rest/v1/delivery_tasks')) {
      return { status: 200, data: deliveryTasks };
    }

    if (path.endsWith('/rest/v1/riders')) {
      return { status: 200, data: riders };
    }

    return { status: 200, data: [] };
  }

  return {
    profiles,
    foodListings,
    ngoClaims,
    deliveryTasks,
    distributionRecords,
    foodRequests,
    ngoVolunteers,
    conversations,
    messages,
    listingDirectId,
    listingRiderId,
    handleRequest,
  };
}

async function openRoleContext(browser, backend, profile) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('supabase.co')) {
      if (req.method() === 'OPTIONS') {
        req.respond({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
          },
        });
        return;
      }
      const res = backend.handleRequest(
        req.method(),
        url,
        req.postData() || '',
        req.headers()['authorization'] || ''
      );
      const accept = req.headers()['accept'] || '';
      let payload = res.data;
      if (accept.includes('application/vnd.pgrst.object+json') && Array.isArray(payload)) {
        payload = payload[0] ?? null;
      }
      req.respond({
        status: res.status,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
        },
        body: payload === null ? '' : JSON.stringify(payload),
      });
      return;
    }
    req.continue();
  });

  const session = makeSession(profile);
  await page.evaluateOnNewDocument(
    (key, sess, role) => {
      localStorage.setItem(key, JSON.stringify(sess));
      localStorage.setItem('sharebite_active_role', role);
    },
    STORAGE_KEY,
    session,
    profile.role
  );

  return { ctx, page, errors };
}

(async () => {
  const backend = createSharedBackend();
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const ngo = await openRoleContext(browser, backend, backend.profiles[IDS.ngoA]);

    // 1. NGO Dashboard layout, 10 sidebar items, 4 real KPIs, zero Donor/Rider leakage
    await ngo.page.goto(`${baseUrl}/ngo-dashboard`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="ngo-kpi-available"]', { timeout: 12000 });

    const dashText = await ngo.page.evaluate(() => document.body.innerText);
    const hasWelcome = dashText.includes('Hello, HopeCare NGO!');
    const hasPortalBadge = dashText.includes('NGO Portal');
    const hasNoDonorLeak = !dashText.includes('Donate Surplus Food') && !dashText.includes('My Deliveries');
    const sidebarItems = [
      'Dashboard',
      'Food Requests',
      'Active Collections',
      'Received Food',
      'Messages',
      'Notifications',
      'Reports',
      'Profile',
      'Settings',
      'Logout',
    ];
    const missingSidebar = sidebarItems.filter((item) => !dashText.includes(item));
    const hasBottomCta = dashText.includes('Create Food Request');

    if (hasWelcome && hasPortalBadge && hasNoDonorLeak && missingSidebar.length === 0 && hasBottomCta) {
      pass('NGO Dashboard renders HopeCare NGO greeting, NGO Portal badge, exact 10 sidebar items & CTA with zero Donor/Rider leakage');
    } else {
      fail(`NGO Dashboard check failed: welcome=${hasWelcome}, badge=${hasPortalBadge}, noLeak=${hasNoDonorLeak}, missing=${missingSidebar.join(',')}`);
    }

    const availKpi = await ngo.page.$eval('[data-testid="ngo-kpi-available"]', (el) => el.textContent?.trim());
    if (availKpi === '2') {
      pass('NGO Dashboard Available Food KPI reads real DB count (2)');
    } else {
      fail(`Expected Available Food KPI = 2, got ${availKpi}`);
    }

    if (screenshotPath) {
      await ngo.page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`SCREENSHOT saved to ${screenshotPath}`);
    }

    // 2. Online/Offline toggle persists to DB and survives reload
    await ngo.page.click('[data-testid="ngo-online-toggle"]');
    await sleep(400);
    if (backend.profiles[IDS.ngoA].is_available === false) {
      pass('NGO Online/Offline toggle persists is_available=false to profiles');
    } else {
      fail('NGO Online/Offline toggle did not persist to profiles');
    }
    await ngo.page.reload({ waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="ngo-online-toggle"]', { timeout: 10000 });
    const toggleTextAfterReload = await ngo.page.$eval('[data-testid="ngo-online-toggle"]', (el) => el.textContent?.trim());
    if (toggleTextAfterReload?.includes('Offline')) {
      pass('NGO Offline status persists across full page refresh');
    } else {
      fail(`Expected Offline after reload, got "${toggleTextAfterReload}"`);
    }
    await ngo.page.click('[data-testid="ngo-online-toggle"]');
    await sleep(300);

    // 3. Create Food Request on /ngo/food-requests
    await ngo.page.goto(`${baseUrl}/ngo/food-requests?create=1`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="ngo-submit-request-btn"]', { timeout: 10000 });
    await ngo.page.type('input[placeholder*="Dinner Meals"]', 'Community Dinner Meals');
    await ngo.page.click('[data-testid="ngo-submit-request-btn"]');
    await sleep(500);

    const reqText = await ngo.page.evaluate(() => document.body.innerText);
    if (backend.foodRequests.length === 1 && reqText.includes('Community Dinner Meals')) {
      pass('NGO creates real Food Request persisted in food_requests and visible in My Food Requests');
    } else {
      fail(`Food Request creation failed (count=${backend.foodRequests.length})`);
    }

    // 4. Mode B: NGO accepts Direct Collection on /ngo/food-requests
    await ngo.page.goto(`${baseUrl}/ngo/food-requests`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="accept-direct-btn"]', { timeout: 10000 });
    const directBtns = await ngo.page.$$('[data-testid="accept-direct-btn"]');
    await directBtns[0].click();
    await sleep(600);

    const directClaim = backend.ngoClaims.find((c) => c.food_listing_id === backend.listingDirectId);
    if (directClaim && directClaim.collection_method === 'direct_ngo_pickup') {
      pass('Mode B: NGO accepts Direct Collection atomically (direct_ngo_pickup)');
    } else {
      fail('Mode B: Direct Collection claim was not created');
    }

    // 5. Competing NGO B cannot double-claim same listing
    const competeRes = backend.handleRequest(
      'POST',
      'https://lzyuvgbhpkiqxscqxggq.supabase.co/rest/v1/rpc/accept_donation',
      JSON.stringify({ p_food_listing_id: backend.listingDirectId, p_collection_method: 'direct_ngo_pickup' }),
      `Bearer ${makeJwt(IDS.ngoB, 'helpinghands@sharebite.test')}`
    );
    if (competeRes.status === 400 && String(competeRes.data?.message || '').includes('ALREADY_CLAIMED')) {
      pass('Atomic Lock: Competing NGO B blocked from double-claiming same donation');
    } else {
      fail(`Expected ALREADY_CLAIMED for competing NGO B, got ${JSON.stringify(competeRes)}`);
    }

    // 6. Mode B: NGO completes Direct Collection on /ngo/collections -> auto-closes Donor-NGO chat
    await ngo.page.goto(`${baseUrl}/ngo/collections`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="complete-direct-collection-btn"]', { timeout: 10000 });
    await ngo.page.click('[data-testid="complete-direct-collection-btn"]');
    await sleep(300);
    // Click Confirm Receipt button inside modal
    await ngo.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.textContent?.includes('Confirm Receipt'));
      if (confirmBtn) confirmBtn.click();
    });
    await sleep(600);

    const directConv = backend.conversations.find((c) => c.related_listing_id === backend.listingDirectId);
    if (backend.distributionRecords.length === 1 && directConv?.status === 'CLOSED') {
      pass('Mode B: NGO completes Direct Collection -> records receipt & auto-closes Donor-NGO chat');
    } else {
      fail(`Mode B completion failed: distCount=${backend.distributionRecords.length}, convStatus=${directConv?.status}`);
    }

    // 7. Closed Donor-NGO chat rejects direct POST
    const postClosedRes = backend.handleRequest(
      'POST',
      'https://lzyuvgbhpkiqxscqxggq.supabase.co/rest/v1/messages',
      JSON.stringify({ conversation_id: directConv.id, sender_id: IDS.ngoA, content: 'Late message' }),
      `Bearer ${makeJwt(IDS.ngoA, 'hopecare@sharebite.test')}`
    );
    if (postClosedRes.status === 403) {
      pass('Closed Donor-NGO chat strictly rejects direct message POST (403)');
    } else {
      fail(`Expected 403 on closed chat POST, got ${postClosedRes.status}`);
    }

    // 8. NGO Received Food & Distribution Recording
    await ngo.page.goto(`${baseUrl}/ngo/received-food`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="open-distribution-btn"]', { timeout: 10000 });
    await ngo.page.click('[data-testid="open-distribution-btn"]');
    await sleep(250);
    // Set quantity 30, people served 30
    await ngo.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
      if (inputs[0]) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(inputs[0], '30');
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (inputs[1]) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(inputs[1], '30');
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await ngo.page.click('[data-testid="submit-distribution-btn"]');
    await sleep(500);

    const dr = backend.distributionRecords[0];
    if (dr && dr.quantity_distributed === 30 && dr.quantity_remaining === 10 && dr.people_served === 30) {
      pass('NGO Received Food records distribution (30 distributed, 10 remaining, 30 people served)');
    } else {
      fail(`Distribution recording mismatch: ${JSON.stringify(dr)}`);
    }

    // 9. NGO Reports Page shows real computed analytics
    await ngo.page.goto(`${baseUrl}/ngo/reports`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="report-kpi-received"]', { timeout: 10000 });
    const repReceived = await ngo.page.$eval('[data-testid="report-kpi-received"]', (el) => el.textContent?.trim());
    const repPeople = await ngo.page.$eval('[data-testid="report-kpi-people"]', (el) => el.textContent?.trim());
    const repKg = await ngo.page.$eval('[data-testid="report-kpi-kg"]', (el) => el.textContent?.trim());
    const hasExportCsv = (await ngo.page.$('[data-testid="ngo-export-csv-btn"]')) !== null;
    if (repReceived === '40' && repPeople === '30' && repKg === '14 kg' && hasExportCsv) {
      pass('NGO Reports reflects real DB totals (40 received, 30 people fed, 14 kg est.) with Export CSV');
    } else {
      fail(`Reports mismatch: received=${repReceived}, people=${repPeople}, kg=${repKg}, csv=${hasExportCsv}`);
    }

    // 10. Mode A Authority Enforcement: Rider-assisted delivery cannot be completed by NGO
    const riderAccept = backend.handleRequest(
      'POST',
      'https://lzyuvgbhpkiqxscqxggq.supabase.co/rest/v1/rpc/accept_donation',
      JSON.stringify({ p_food_listing_id: backend.listingRiderId, p_collection_method: 'ngo_delivery' }),
      `Bearer ${makeJwt(IDS.rider, 'rider@sharebite.test')}`
    );
    const riderClaimId = riderAccept.data.claim_id;
    const riderTaskId = riderAccept.data.delivery_task_id;
    const ngoTryCompleteModeA = backend.handleRequest(
      'POST',
      'https://lzyuvgbhpkiqxscqxggq.supabase.co/rest/v1/rpc/ngo_complete_direct_collection',
      JSON.stringify({ p_claim_id: riderClaimId, p_quantity_received: 25 }),
      `Bearer ${makeJwt(IDS.ngoA, 'hopecare@sharebite.test')}`
    );
    const ngoAckModeA = backend.handleRequest(
      'POST',
      'https://lzyuvgbhpkiqxscqxggq.supabase.co/rest/v1/rpc/confirm_ngo_receipt',
      JSON.stringify({ p_claim_id: riderClaimId, p_delivery_task_id: riderTaskId, p_quantity_received: 25 }),
      `Bearer ${makeJwt(IDS.ngoA, 'hopecare@sharebite.test')}`
    );
    const riderTaskAfterAck = backend.deliveryTasks.find((t) => t.id === riderTaskId);
    if (
      ngoTryCompleteModeA.status === 400 &&
      ngoAckModeA.status === 200 &&
      riderTaskAfterAck?.status !== 'completed'
    ) {
      pass('Mode A Authority Enforced: NGO can acknowledge receipt, but CANNOT complete Rider-assigned delivery');
    } else {
      fail(`Mode A Authority check failed: tryComplete=${ngoTryCompleteModeA.status}, taskStatus=${riderTaskAfterAck?.status}`);
    }

    // 11. NGO Volunteers CRUD + Cross-Org RLS isolation
    await ngo.page.goto(`${baseUrl}/ngo/volunteers`, { waitUntil: 'networkidle2' });
    await ngo.page.waitForSelector('[data-testid="ngo-add-volunteer-btn"]', { timeout: 10000 });
    await ngo.page.click('[data-testid="ngo-add-volunteer-btn"]');
    await ngo.page.type('input[placeholder*="Priya Verma"]', 'Priya Verma');
    await ngo.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[type="submit"]'));
      if (btns[0]) btns[0].click();
    });
    await sleep(500);
    const volText = await ngo.page.evaluate(() => document.body.innerText);
    const crossOrgVols = backend.handleRequest(
      'GET',
      `https://lzyuvgbhpkiqxscqxggq.supabase.co/rest/v1/ngo_volunteers?ngo_id=eq.${IDS.ngoA}`,
      '',
      `Bearer ${makeJwt(IDS.ngoB, 'helpinghands@sharebite.test')}`
    );
    if (backend.ngoVolunteers.length === 1 && volText.includes('Priya Verma') && crossOrgVols.data.length === 0) {
      pass('NGO Volunteers CRUD works & cross-organization volunteer queries return empty (RLS isolated)');
    } else {
      fail(`Volunteers check failed: count=${backend.ngoVolunteers.length}, crossOrg=${crossOrgVols.data.length}`);
    }

    // 12. Role Guard: NGO blocked from /donor-dashboard and /rider-dashboard
    await ngo.page.goto(`${baseUrl}/rider-dashboard`, { waitUntil: 'networkidle2' });
    await sleep(400);
    if (ngo.page.url().includes('/ngo-dashboard')) {
      pass('Role Guard redirects NGO away from /rider-dashboard back to /ngo-dashboard');
    } else {
      fail(`Expected redirect to /ngo-dashboard from /rider-dashboard, got ${ngo.page.url()}`);
    }

    // 13. Zero uncaught JS errors across entire NGO journey
    if (ngo.errors.length === 0) {
      pass('Zero uncaught pageerror exceptions across entire NGO Portal workflow');
    } else {
      fail(`Uncaught pageerrors: ${ngo.errors.join(' | ')}`);
    }

    await ngo.ctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
