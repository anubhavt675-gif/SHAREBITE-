// ==============================================================================
// ShareBite — India-Wide NGO Search Proxy (Google Places API New)
// Vercel Serverless Function: GET /api/ngo-search
//
// Security & Compliance:
// - Server-side API key only (process.env.GOOGLE_MAPS_SERVER_API_KEY)
// - Strict X-Goog-FieldMask to control API billing costs
// - Strictly scoped to India (regionCode: "IN" + addressComponents validation)
// - Per-IP rate limiting (sliding 60s window)
// - Never stores Google Places records permanently in Supabase
// - All results strictly labeled as External NGO Listing (never ShareBite Verified)
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

// Per-IP sliding window rate limiter (25 requests / 60 seconds)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 25;
const ipRequestTimestamps = new Map<string, number[]>();

function isRateLimited(ip: string): { limited: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = (ipRequestTimestamps.get(ip) || []).filter((ts) => ts > cutoff);

  if (existing.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = existing[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    ipRequestTimestamps.set(ip, existing);
    return { limited: true, retryAfterSec };
  }

  existing.push(now);
  ipRequestTimestamps.set(ip, existing);

  // Prevent unbounded memory growth across warm invocations
  if (ipRequestTimestamps.size > 500) {
    for (const [key, timestamps] of ipRequestTimestamps.entries()) {
      const fresh = timestamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) ipRequestTimestamps.delete(key);
      else ipRequestTimestamps.set(key, fresh);
    }
  }

  return { limited: false, retryAfterSec: 0 };
}

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function getParam(req: VercelRequest, key: string): string {
  const qVal = req.query?.[key];
  if (typeof qVal === 'string') return qVal.trim();
  if (Array.isArray(qVal) && typeof qVal[0] === 'string') return qVal[0].trim();

  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      return (parsed.searchParams.get(key) || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GooglePlaceItem {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  googleMapsUri?: string;
  businessStatus?: string;
}

function extractAddressPart(components: AddressComponent[] | undefined, targetType: string): string | undefined {
  if (!Array.isArray(components)) return undefined;
  const found = components.find((c) => Array.isArray(c.types) && c.types.includes(targetType));
  return found?.longText || found?.shortText;
}

function isIndianPlace(place: GooglePlaceItem): boolean {
  const components = place.addressComponents || [];
  const country = components.find((c) => Array.isArray(c.types) && c.types.includes('country'));
  if (country) {
    return country.shortText === 'IN' || (country.longText || '').toLowerCase() === 'india';
  }
  const addr = (place.formattedAddress || '').toLowerCase();
  if (addr.includes('india')) return true;

  // Fallback coordinate bounding box for India
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return lat >= 6.0 && lat <= 37.5 && lng >= 68.0 && lng <= 97.5;
  }
  return false;
}

function inferCategories(place: GooglePlaceItem, userCategory?: string): string[] {
  const hay = [
    place.displayName?.text || '',
    place.primaryTypeDisplayName?.text || '',
    ...(place.types || []),
    userCategory || '',
  ]
    .join(' ')
    .toLowerCase();

  const cats = new Set<string>();
  if (/food|annakshetra|meal|kitchen|hunger|feeding|ration|bhojan|langar|roti|bank/.test(hay)) {
    cats.add('food_distribution');
  }
  if (/child|orphan|bal |shishu|bachpan|kids|youth/.test(hay)) cats.add('child_welfare');
  if (/educat|school|vidya|literacy|learning|udaan/.test(hay)) cats.add('education');
  if (/women|mahila|nari|girl/.test(hay)) cats.add('women_empowerment');
  if (/elder|old age|senior|vriddh/.test(hay)) cats.add('elderly_care');
  if (/shelter|homeless|ashram|rain basera|destitute/.test(hay)) cats.add('homeless_support');
  if (/health|medical|hospital|clinic|blood|eye/.test(hay)) cats.add('healthcare');
  if (/animal|goshala|gaushala|dog|pet|wildlife/.test(hay)) cats.add('animal_welfare');
  if (/disaster|relief|rescue/.test(hay)) cats.add('disaster_relief');
  if (/disab|blind|deaf|divyang|handicap/.test(hay)) cats.add('disability_support');
  if (/environment|green|tree|climate|eco/.test(hay)) cats.add('environment');

  if (cats.size === 0) cats.add('general_charity');
  return Array.from(cats);
}

const CATEGORY_QUERY_HINTS: Record<string, string> = {
  food_distribution: 'food bank food donation NGO',
  child_welfare: 'child welfare orphanage NGO',
  education: 'education literacy NGO',
  women_empowerment: 'women empowerment NGO',
  elderly_care: 'old age home elderly care NGO',
  disability_support: 'disability support NGO',
  animal_welfare: 'animal welfare shelter NGO',
  healthcare: 'healthcare charity NGO',
  disaster_relief: 'disaster relief NGO',
  homeless_support: 'homeless shelter charity NGO',
  environment: 'environment conservation NGO',
  general_charity: 'NGO charitable trust foundation',
};

function buildIndiaTextQuery(q: string, city: string, state: string, category: string): string {
  const parts: string[] = [];
  const trimmedQ = q.trim();

  if (trimmedQ) {
    const hasNgoWord = /\b(ngo|ngos|foundation|trust|charity|charities|shelter|shelters|food bank|food banks|welfare|society|seva|sewa|ashram|orphanage|mission|helpage|akshaya|goonj|robin hood|feeding)\b/i.test(
      trimmedQ
    );
    parts.push(hasNgoWord ? trimmedQ : `${trimmedQ} NGO charity`);
  } else if (category && CATEGORY_QUERY_HINTS[category]) {
    parts.push(CATEGORY_QUERY_HINTS[category]);
  } else {
    parts.push('food donation NGO charity shelter');
  }

  if (city && !trimmedQ.toLowerCase().includes(city.toLowerCase())) {
    parts.push(city);
  }
  if (state && !trimmedQ.toLowerCase().includes(state.toLowerCase())) {
    parts.push(state);
  }
  if (!parts.join(' ').toLowerCase().includes('india')) {
    parts.push('India');
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET requests are supported.' });
  }

  const clientIp = getClientIp(req);
  const rate = isRateLimited(clientIp);
  if (rate.limited) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({
      error: 'RATE_LIMITED',
      quotaExceeded: true,
      message: `Too many searches from this connection. Please wait ${rate.retryAfterSec}s before retrying.`,
      ngos: [],
    });
  }

  // Strictly read server-side environment variables — never rely on client-exposed secrets
  const apiKey = (
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({
      ngos: [],
      apiConfigured: false,
      source: 'google_places',
      message: 'Google Places API (New) server key is not configured.',
    });
  }

  const q = getParam(req, 'q').slice(0, 160);
  const city = getParam(req, 'city').slice(0, 80);
  const state = getParam(req, 'state').slice(0, 80);
  const category = getParam(req, 'category').slice(0, 50);
  const pageToken = getParam(req, 'pageToken').slice(0, 400);
  const latRaw = parseFloat(getParam(req, 'lat'));
  const lngRaw = parseFloat(getParam(req, 'lng'));
  const radiusKmRaw = parseFloat(getParam(req, 'radiusKm'));

  const textQuery = buildIndiaTextQuery(q, city, state, category);

  const requestBody: Record<string, unknown> = {
    textQuery,
    regionCode: 'IN',
    languageCode: 'en',
    pageSize: 12,
  };

  if (pageToken) {
    requestBody.pageToken = pageToken;
  }

  // Apply locationBias only when valid India coordinates are supplied
  if (
    Number.isFinite(latRaw) &&
    Number.isFinite(lngRaw) &&
    latRaw >= 6 &&
    latRaw <= 38 &&
    lngRaw >= 68 &&
    lngRaw <= 98
  ) {
    const radiusMeters = Math.min(
      50_000,
      Math.max(2_000, (Number.isFinite(radiusKmRaw) && radiusKmRaw > 0 ? radiusKmRaw : 25) * 1000)
    );
    requestBody.locationBias = {
      circle: {
        center: { latitude: latRaw, longitude: lngRaw },
        radius: radiusMeters,
      },
    };
  }

  // Minimal FieldMask: only basic + contact fields (omits photos/reviews to protect quota/cost)
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.addressComponents',
    'places.location',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.primaryTypeDisplayName',
    'places.types',
    'places.googleMapsUri',
    'places.businessStatus',
    'nextPageToken',
  ].join(',');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const googleRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const payload = (await googleRes.json().catch(() => ({}))) as {
      places?: GooglePlaceItem[];
      nextPageToken?: string;
      error?: { code?: number; status?: string; message?: string };
    };

    if (
      googleRes.status === 429 ||
      payload.error?.status === 'RESOURCE_EXHAUSTED' ||
      payload.error?.status === 'OVER_QUERY_LIMIT'
    ) {
      return res.status(429).json({
        error: 'QUOTA_EXCEEDED',
        quotaExceeded: true,
        apiConfigured: true,
        message: 'Google Places API quota has been temporarily reached. Showing ShareBite registered NGOs and public listings.',
        ngos: [],
      });
    }

    if (!googleRes.ok) {
      return res.status(200).json({
        ngos: [],
        apiConfigured: true,
        apiError: payload.error?.status || `HTTP_${googleRes.status}`,
        message: 'External Google Places lookup is temporarily unavailable.',
      });
    }

    const places = Array.isArray(payload.places) ? payload.places : [];
    const indianPlaces = places.filter(isIndianPlace);

    const normalized = indianPlaces
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => {
        const components = p.addressComponents;
        const resolvedCity =
          extractAddressPart(components, 'locality') ||
          extractAddressPart(components, 'administrative_area_level_3') ||
          extractAddressPart(components, 'administrative_area_level_2');
        const resolvedDistrict = extractAddressPart(components, 'administrative_area_level_2');
        const resolvedState = extractAddressPart(components, 'administrative_area_level_1');
        const resolvedPincode = extractAddressPart(components, 'postal_code');
        const phone = p.nationalPhoneNumber || p.internationalPhoneNumber || undefined;
        const website = p.websiteUri || undefined;
        const categories = inferCategories(p, category);

        return {
          id: `gplace-${p.id}`,
          placeId: p.id,
          name: p.displayName?.text || '',
          description: p.primaryTypeDisplayName?.text
            ? `${p.primaryTypeDisplayName.text} listed on Google Maps.`
            : undefined,
          categories,
          address: p.formattedAddress || undefined,
          city: resolvedCity || undefined,
          district: resolvedDistrict || undefined,
          state: resolvedState || undefined,
          pincode: resolvedPincode || undefined,
          latitude: p.location?.latitude,
          longitude: p.location?.longitude,
          phone,
          website,
          sourceName: 'Google Places',
          sourceUrl: p.googleMapsUri || undefined,
          googleMapsUri: p.googleMapsUri || undefined,
          dataSource: 'google_places',
          listingType: 'external_listing',
          verificationStatus: phone || website ? 'contact_available' : 'source_listed',
          govRegistrationVerified: false,
          acceptsFoodDonations: categories.includes('food_distribution'),
          businessStatus: p.businessStatus || undefined,
        };
      });

    // Short edge cache (5 minutes) — never stored permanently in database
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      ngos: normalized,
      nextPageToken: payload.nextPageToken || null,
      apiConfigured: true,
      source: 'google_places',
      attribution: 'Powered by Google Maps / Places',
    });
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return res.status(503).json({
      error: isAbort ? 'UPSTREAM_TIMEOUT' : 'NETWORK_ERROR',
      apiConfigured: true,
      message: isAbort
        ? 'External NGO lookup timed out. Please try again.'
        : 'Could not reach external NGO search service.',
      ngos: [],
    });
  }
}
