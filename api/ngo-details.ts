// ==============================================================================
// ShareBite — External NGO Details Proxy (Google Places API New)
// Vercel Serverless Function: GET /api/ngo-details?placeId=...
//
// Security & Compliance:
// - Server-side API key only (process.env.GOOGLE_MAPS_SERVER_API_KEY)
// - Strict X-Goog-FieldMask
// - Per-IP rate limiting
// - Fetches live details on demand without storing Google Places data in Supabase
// ==============================================================================

import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const ipHits = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const fresh = (ipHits.get(ip) || []).filter((ts) => ts > cutoff);
  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipHits.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  ipHits.set(ip, fresh);
  return false;
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

function extractPart(components: AddressComponent[] | undefined, type: string): string | undefined {
  if (!Array.isArray(components)) return undefined;
  const match = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
  return match?.longText || match?.shortText;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET requests are supported.' });
  }

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    'unknown';

  if (checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'RATE_LIMITED',
      quotaExceeded: true,
      message: 'Rate limit exceeded. Please try again in a moment.',
    });
  }

  const rawPlaceId = getParam(req, 'placeId').replace(/^gplace-/, '');
  if (!rawPlaceId || !/^[A-Za-z0-9_-]{8,160}$/.test(rawPlaceId)) {
    return res.status(400).json({ error: 'INVALID_PLACE_ID', message: 'A valid Google Place ID is required.' });
  }

  const apiKey = (
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    return res.status(200).json({
      ngo: null,
      apiConfigured: false,
      message: 'Google Places API (New) server key is not configured.',
    });
  }

  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'addressComponents',
    'location',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'websiteUri',
    'regularOpeningHours.weekdayDescriptions',
    'primaryTypeDisplayName',
    'types',
    'googleMapsUri',
    'businessStatus',
    'editorialSummary',
  ].join(',');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const googleRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(rawPlaceId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    const p = (await googleRes.json().catch(() => ({}))) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: AddressComponent[];
      location?: { latitude?: number; longitude?: number };
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      regularOpeningHours?: { weekdayDescriptions?: string[] };
      primaryTypeDisplayName?: { text?: string };
      types?: string[];
      googleMapsUri?: string;
      businessStatus?: string;
      editorialSummary?: { text?: string };
      error?: { status?: string; message?: string };
    };

    if (googleRes.status === 429 || p.error?.status === 'RESOURCE_EXHAUSTED') {
      return res.status(429).json({
        error: 'QUOTA_EXCEEDED',
        quotaExceeded: true,
        message: 'Google Places API quota reached.',
      });
    }

    if (!googleRes.ok || !p.id) {
      return res.status(404).json({
        ngo: null,
        error: 'NOT_FOUND',
        message: 'External NGO listing could not be found.',
      });
    }

    const phone = p.nationalPhoneNumber || p.internationalPhoneNumber || undefined;
    const website = p.websiteUri || undefined;
    const hours = p.regularOpeningHours?.weekdayDescriptions?.join(' | ');

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      apiConfigured: true,
      ngo: {
        id: `gplace-${p.id}`,
        placeId: p.id,
        name: p.displayName?.text || 'External NGO Listing',
        description: p.editorialSummary?.text || p.primaryTypeDisplayName?.text || undefined,
        categories: ['general_charity'],
        address: p.formattedAddress || undefined,
        city:
          extractPart(p.addressComponents, 'locality') ||
          extractPart(p.addressComponents, 'administrative_area_level_2'),
        district: extractPart(p.addressComponents, 'administrative_area_level_2'),
        state: extractPart(p.addressComponents, 'administrative_area_level_1'),
        pincode: extractPart(p.addressComponents, 'postal_code'),
        latitude: p.location?.latitude,
        longitude: p.location?.longitude,
        phone,
        website,
        operatingHours: hours || undefined,
        sourceName: 'Google Places',
        sourceUrl: p.googleMapsUri || undefined,
        googleMapsUri: p.googleMapsUri || undefined,
        dataSource: 'google_places',
        listingType: 'external_listing',
        verificationStatus: phone || website ? 'contact_available' : 'source_listed',
        govRegistrationVerified: false,
        businessStatus: p.businessStatus || undefined,
      },
    });
  } catch {
    return res.status(503).json({
      error: 'NETWORK_ERROR',
      message: 'Failed to load external NGO details.',
      ngo: null,
    });
  }
}
