import { supabase } from '../lib/supabase';
import { LocationService } from './location';
import { WE_CARE_FOUNDATION } from '../config/outreachPartners';
import type { IndiaNGO, NGOCategory, NGODataSource } from '../types';

// ==============================================================================
// ShareBite — Hybrid India-Wide NGO Discovery Search Engine
//
// Data Sources (Hybrid, Deduplicated & Truthfully Labeled):
//   1. Supabase Registered NGOs (public.search_registered_ngos RPC / profiles + partners)
//      -> Labeled: "ShareBite Registered NGO"
//   2. Google Places API (New) via server-side proxy (/api/ngo-search & /api/ngo-details)
//      -> Labeled: "External NGO Listing" (never permanently stored in Supabase)
//   3. OpenStreetMap (Nominatim + Overpass India-scoped) & Verified Public NGO Directory
//      -> Labeled: "External NGO Listing"
//
// Truthfulness & Compliance Guarantees:
//   - Never invent contact numbers, addresses, or images.
//   - Never mark external NGOs as ShareBite Verified or official partners.
//   - Only mark "Government Registration Confirmed" when independently verified.
//   - External NGOs cannot receive private ShareBite messages or delivery assignments.
// ==============================================================================

export interface NGOSearchParams {
  query?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  state?: string;
  city?: string;
  categories?: NGOCategory[];
  onlyShareBiteRegistered?: boolean;
  onlyGovVerified?: boolean;
  sortBy?: 'relevance' | 'nearest' | 'name';
  pageToken?: string;
  limit?: number;
}

export interface NGOSearchResponse {
  ngos: IndiaNGO[];
  total: number;
  sources: string[];
  hasMore: boolean;
  nextPageToken: string | null;
  quotaExceeded: boolean;
  quotaMessage?: string;
  networkError: boolean;
  networkMessage?: string;
  googleAttribution: boolean;
  parsedIntent: ParsedIndiaQuery;
}

export interface ParsedIndiaQuery {
  raw: string;
  cleanQuery: string;
  detectedState?: string;
  detectedCity?: string;
  detectedPincode?: string;
  detectedCategories: NGOCategory[];
  nameTokens: string[];
  isNearbyQuery: boolean;
}

export interface SearchSuggestionItem {
  id: string;
  label: string;
  sublabel?: string;
  query: string;
  kind: 'recent' | 'ngo' | 'location' | 'category' | 'nearby';
}

export const INDIA_STATES: string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Chandigarh',
  'Jammu & Kashmir',
  'Ladakh',
  'Puducherry',
];

export const NGO_CATEGORIES: { value: NGOCategory; label: string; emoji: string }[] = [
  { value: 'food_distribution', label: 'Food Donation & Banks', emoji: '🍱' },
  { value: 'homeless_support', label: 'Shelters & Homeless Care', emoji: '🏠' },
  { value: 'child_welfare', label: 'Child Welfare', emoji: '👧' },
  { value: 'education', label: 'Education & Literacy', emoji: '📚' },
  { value: 'elderly_care', label: 'Elderly Care', emoji: '👴' },
  { value: 'healthcare', label: 'Healthcare & Relief', emoji: '🏥' },
  { value: 'women_empowerment', label: 'Women Empowerment', emoji: '👩' },
  { value: 'disaster_relief', label: 'Disaster Relief', emoji: '🆘' },
  { value: 'disability_support', label: 'Disability Support', emoji: '♿' },
  { value: 'animal_welfare', label: 'Animal Welfare', emoji: '🐾' },
  { value: 'environment', label: 'Environment', emoji: '🌿' },
  { value: 'general_charity', label: 'Community Welfare', emoji: '🤝' },
];

// Major Indian cities & districts with accurate coordinates for location-aware filtering
const INDIA_CITY_DIRECTORY: Record<string, { city: string; state: string; lat: number; lng: number }> = {
  delhi: { city: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209 },
  'new delhi': { city: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209 },
  ncr: { city: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.209 },
  najafgarh: { city: 'New Delhi', state: 'Delhi', lat: 28.6092, lng: 76.9798 },
  dwarka: { city: 'New Delhi', state: 'Delhi', lat: 28.5921, lng: 77.046 },
  gurugram: { city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  gurgaon: { city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  noida: { city: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.391 },
  faridabad: { city: 'Faridabad', state: 'Haryana', lat: 28.4089, lng: 77.3178 },
  ghaziabad: { city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538 },
  mumbai: { city: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777 },
  bombay: { city: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777 },
  pune: { city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  nagpur: { city: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882 },
  bengaluru: { city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  bangalore: { city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  hyderabad: { city: 'Hyderabad', state: 'Telangana', lat: 17.385, lng: 78.4867 },
  chennai: { city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
  coimbatore: { city: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558 },
  kolkata: { city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639 },
  ahmedabad: { city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714 },
  surat: { city: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311 },
  jaipur: { city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873 },
  lucknow: { city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
  kanpur: { city: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319 },
  chandigarh: { city: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  amritsar: { city: 'Amritsar', state: 'Punjab', lat: 31.634, lng: 74.8723 },
  ludhiana: { city: 'Ludhiana', state: 'Punjab', lat: 30.901, lng: 75.8573 },
  jalandhar: { city: 'Jalandhar', state: 'Punjab', lat: 31.326, lng: 75.5762 },
  patiala: { city: 'Patiala', state: 'Punjab', lat: 30.3398, lng: 76.3869 },
  mohali: { city: 'Mohali', state: 'Punjab', lat: 30.7046, lng: 76.7179 },
  bhopal: { city: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126 },
  indore: { city: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577 },
  patna: { city: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376 },
  kochi: { city: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673 },
  thiruvananthapuram: { city: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366 },
  guwahati: { city: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
  bhubaneswar: { city: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245 },
  dehradun: { city: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322 },
  ranchi: { city: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096 },
  raipur: { city: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296 },
};

const STATE_COORDS: Record<string, { lat: number; lng: number }> = {
  Delhi: { lat: 28.6139, lng: 77.209 },
  Haryana: { lat: 28.4595, lng: 77.0266 },
  Maharashtra: { lat: 19.076, lng: 72.8777 },
  Punjab: { lat: 31.1471, lng: 75.3412 },
  Karnataka: { lat: 12.9716, lng: 77.5946 },
  'Tamil Nadu': { lat: 13.0827, lng: 80.2707 },
  'Uttar Pradesh': { lat: 26.8467, lng: 80.9462 },
  Rajasthan: { lat: 26.9124, lng: 75.7873 },
  Gujarat: { lat: 23.0225, lng: 72.5714 },
  'West Bengal': { lat: 22.5726, lng: 88.3639 },
  Telangana: { lat: 17.385, lng: 78.4867 },
  Kerala: { lat: 10.8505, lng: 76.2711 },
  'Madhya Pradesh': { lat: 23.2599, lng: 77.4126 },
  Bihar: { lat: 25.5941, lng: 85.1376 },
  Chandigarh: { lat: 30.7333, lng: 76.7794 },
};

// ==============================================================================
// Verified Public Indian NGO Reference Listings (Real Public Data Only)
//
// Strictly:
// - Zero invented phone numbers, street numbers, or images.
// - Every entry is explicitly labeled as "external_listing" (NEVER ShareBite Verified).
// - Only includes real public organization websites & verified outreach info.
// ==============================================================================

export const PUBLIC_INDIA_NGO_DIRECTORY: IndiaNGO[] = [
  {
    id: 'pub-we-care-foundation',
    name: WE_CARE_FOUNDATION.name,
    description:
      'Community welfare and children education & nutrition center in Sector 57, Gurugram (Udaan Learning Center). Visited by the ShareBite outreach team to understand ground-level food distribution needs.',
    categories: ['food_distribution', 'child_welfare', 'education', 'general_charity'],
    address: '1321, Block H, Sector 57, Gurugram, Haryana 122003',
    city: 'Gurugram',
    district: 'Gurugram',
    state: 'Haryana',
    pincode: '122003',
    latitude: 28.428123,
    longitude: 77.077699,
    phone: '+91-9810221169',
    website: WE_CARE_FOUNDATION.websiteUrl,
    imageUrl: WE_CARE_FOUNDATION.photo,
    sourceName: 'Public Outreach Directory',
    sourceUrl: WE_CARE_FOUNDATION.websiteUrl,
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-feeding-india',
    name: 'Feeding India',
    description:
      'Non-profit organization working to eradicate hunger and malnutrition across India through daily meal programs and community food banks.',
    categories: ['food_distribution', 'child_welfare'],
    address: 'Gurugram, Haryana, India',
    city: 'Gurugram',
    district: 'Gurugram',
    state: 'Haryana',
    latitude: 28.4595,
    longitude: 77.0266,
    website: 'https://www.feedingindia.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.feedingindia.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-earth-saviours-gurugram',
    name: 'The Earth Saviours Foundation',
    description:
      'Charitable foundation providing shelter, daily meals, and care for abandoned senior citizens and homeless individuals in Gurugram.',
    categories: ['food_distribution', 'elderly_care', 'homeless_support'],
    address: 'Bandhwari Village, Gurugram, Haryana',
    city: 'Gurugram',
    district: 'Gurugram',
    state: 'Haryana',
    latitude: 28.4167,
    longitude: 77.1526,
    website: 'https://www.earthsaviours.in/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.earthsaviours.in/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-robin-hood-army-delhi',
    name: 'Robin Hood Army',
    description:
      'Volunteer-based zero-funds organization rescuing surplus food from restaurants and events to serve less fortunate communities across Indian cities.',
    categories: ['food_distribution', 'homeless_support', 'child_welfare'],
    address: 'New Delhi, Delhi, India',
    city: 'New Delhi',
    district: 'New Delhi',
    state: 'Delhi',
    latitude: 28.6139,
    longitude: 77.209,
    website: 'https://robinhoodarmy.com/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://robinhoodarmy.com/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-goonj-delhi',
    name: 'Goonj',
    description:
      'Indian social welfare NGO addressing basic civic, disaster relief, clothing, and rural community development needs from New Delhi and regional centers.',
    categories: ['disaster_relief', 'general_charity', 'women_empowerment'],
    address: 'Sarita Vihar, New Delhi, Delhi',
    city: 'New Delhi',
    district: 'South East Delhi',
    state: 'Delhi',
    latitude: 28.5322,
    longitude: 77.2943,
    website: 'https://goonj.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://goonj.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-uday-foundation-delhi',
    name: 'Uday Foundation',
    description:
      'Non-profit organization in New Delhi supporting underprivileged families, hospital patients, homeless shelters, and nutritious meal drives.',
    categories: ['food_distribution', 'healthcare', 'homeless_support', 'child_welfare'],
    address: 'Adchini, New Delhi, Delhi',
    city: 'New Delhi',
    district: 'South Delhi',
    state: 'Delhi',
    latitude: 28.5364,
    longitude: 77.2016,
    website: 'https://www.udayfoundation.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.udayfoundation.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-helpage-india-delhi',
    name: 'HelpAge India',
    description:
      'National non-profit organization working for the cause and care of disadvantaged older persons across India.',
    categories: ['elderly_care', 'healthcare', 'general_charity'],
    address: 'Qutab Institutional Area, New Delhi, Delhi',
    city: 'New Delhi',
    district: 'South Delhi',
    state: 'Delhi',
    latitude: 28.5403,
    longitude: 77.1855,
    website: 'https://www.helpageindia.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.helpageindia.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-salaam-baalak-delhi',
    name: 'Salaam Baalak Trust',
    description:
      'Non-profit trust providing shelter homes, nutritious meals, healthcare, and education for street and working children in Delhi NCR.',
    categories: ['child_welfare', 'homeless_support', 'education', 'food_distribution'],
    address: 'Paharganj, New Delhi, Delhi',
    city: 'New Delhi',
    district: 'Central Delhi',
    state: 'Delhi',
    latitude: 28.6448,
    longitude: 77.2167,
    website: 'https://www.salaambaalaktrust.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.salaambaalaktrust.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-roti-bank-mumbai',
    name: 'Roti Bank Foundation',
    description:
      'Food rescue foundation in Mumbai collecting fresh surplus food from events, hotels, and kitchens to feed hungry communities and shelters.',
    categories: ['food_distribution', 'homeless_support'],
    address: 'Mumbai, Maharashtra, India',
    city: 'Mumbai',
    district: 'Mumbai',
    state: 'Maharashtra',
    latitude: 19.076,
    longitude: 72.8777,
    website: 'https://rotibankfoundation.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://rotibankfoundation.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-khaana-chahiye-mumbai',
    name: 'Khaana Chahiye Foundation',
    description:
      'Citizen-led hunger relief foundation operating community kitchens and food distribution networks across Mumbai.',
    categories: ['food_distribution', 'homeless_support', 'disaster_relief'],
    address: 'Mumbai, Maharashtra, India',
    city: 'Mumbai',
    district: 'Mumbai',
    state: 'Maharashtra',
    latitude: 19.1136,
    longitude: 72.8697,
    website: 'https://www.khaanachahiye.com/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.khaanachahiye.com/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-cry-mumbai',
    name: 'CRY — Child Rights and You',
    description:
      'Indian NGO dedicated to ensuring happier childhoods through education, nutrition, health, and child protection programs.',
    categories: ['child_welfare', 'education', 'healthcare'],
    address: 'Mumbai, Maharashtra, India',
    city: 'Mumbai',
    district: 'Mumbai',
    state: 'Maharashtra',
    latitude: 19.0596,
    longitude: 72.8295,
    website: 'https://www.cry.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.cry.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-pingalwara-amritsar',
    name: 'All India Pingalwara Charitable Society',
    description:
      'Charitable institution in Amritsar, Punjab offering shelter, free daily meals, medical care, and rehabilitation to the destitute and differently abled.',
    categories: ['food_distribution', 'homeless_support', 'healthcare', 'disability_support'],
    address: 'G.T. Road, Amritsar, Punjab',
    city: 'Amritsar',
    district: 'Amritsar',
    state: 'Punjab',
    latitude: 31.6223,
    longitude: 74.8891,
    website: 'https://pingalwara.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://pingalwara.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-khalsa-aid-punjab',
    name: 'Khalsa Aid India',
    description:
      'Humanitarian relief organization providing langar, emergency food rations, and disaster support across Punjab and India.',
    categories: ['food_distribution', 'disaster_relief', 'general_charity'],
    address: 'Patiala, Punjab, India',
    city: 'Patiala',
    district: 'Patiala',
    state: 'Punjab',
    latitude: 30.3398,
    longitude: 76.3869,
    website: 'https://www.khalsaaid.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.khalsaaid.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-akshaya-patra-bengaluru',
    name: 'The Akshaya Patra Foundation',
    description:
      'Non-profit organization implementing mid-day meal kitchens and school nutrition programs across Indian states from its Bengaluru headquarters.',
    categories: ['food_distribution', 'child_welfare', 'education'],
    address: 'Rajajinagar, Bengaluru, Karnataka',
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    latitude: 13.0098,
    longitude: 77.5511,
    website: 'https://www.akshayapatra.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://www.akshayapatra.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-no-food-waste-tn',
    name: 'No Food Waste',
    description:
      'Food recovery and redistribution network rescuing edible surplus food and serving hunger spots across Tamil Nadu and partner cities.',
    categories: ['food_distribution', 'homeless_support'],
    address: 'Coimbatore, Tamil Nadu, India',
    city: 'Coimbatore',
    district: 'Coimbatore',
    state: 'Tamil Nadu',
    latitude: 11.0168,
    longitude: 76.9558,
    website: 'https://nofoodwaste.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://nofoodwaste.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-bhumi-chennai',
    name: 'Bhumi',
    description:
      'Youth volunteering non-profit organization supporting education, civic welfare, and community nutrition programs across India.',
    categories: ['education', 'child_welfare', 'general_charity'],
    address: 'Chennai, Tamil Nadu, India',
    city: 'Chennai',
    district: 'Chennai',
    state: 'Tamil Nadu',
    latitude: 13.0827,
    longitude: 80.2707,
    website: 'https://bhumi.ngo/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://bhumi.ngo/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsVolunteers: true,
  },
  {
    id: 'pub-annakshetra-jaipur',
    name: 'Annakshetra Foundation Trust',
    description:
      'Surplus food rescue initiative collecting excess food from weddings, restaurants, and events to feed underserved communities in Jaipur.',
    categories: ['food_distribution', 'homeless_support'],
    address: 'Jaipur, Rajasthan, India',
    city: 'Jaipur',
    district: 'Jaipur',
    state: 'Rajasthan',
    latitude: 26.9124,
    longitude: 75.7873,
    website: 'https://annakshetra.org/',
    sourceName: 'Public NGO Directory',
    sourceUrl: 'https://annakshetra.org/',
    dataSource: 'public_outreach',
    listingType: 'external_listing',
    verificationStatus: 'contact_available',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
  },
];

// ==============================================================================
// Recent Searches (localStorage) & Transient Detail Cache (sessionStorage)
// ==============================================================================

const RECENT_SEARCHES_KEY = 'sharebite_ngo_recent_searches_v1';
const SESSION_NGO_CACHE_KEY = 'sharebite_ngo_session_cache_v1';
const MAX_RECENT_SEARCHES = 6;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): string[] {
  const cleaned = query.trim();
  if (!cleaned || cleaned.length < 2) return getRecentSearches();
  const existing = getRecentSearches().filter((q) => q.toLowerCase() !== cleaned.toLowerCase());
  const next = [cleaned, ...existing].slice(0, MAX_RECENT_SEARCHES);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

function removeRecentSearch(query: string): string[] {
  const next = getRecentSearches().filter((q) => q.toLowerCase() !== query.toLowerCase());
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

// Short-lived tab-session cache strictly for smooth Details Page navigation (never persisted in Supabase)
function cacheNGOsInSession(ngos: IndiaNGO[]): void {
  try {
    const existingRaw = sessionStorage.getItem(SESSION_NGO_CACHE_KEY);
    const map: Record<string, IndiaNGO> = existingRaw ? JSON.parse(existingRaw) : {};
    for (const ngo of ngos) {
      map[ngo.id] = ngo;
    }
    const keys = Object.keys(map);
    if (keys.length > 80) {
      for (const k of keys.slice(0, keys.length - 80)) {
        delete map[k];
      }
    }
    sessionStorage.setItem(SESSION_NGO_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

function getCachedNGOFromSession(id: string): IndiaNGO | null {
  try {
    const raw = sessionStorage.getItem(SESSION_NGO_CACHE_KEY);
    if (!raw) return null;
    const map: Record<string, IndiaNGO> = JSON.parse(raw);
    return map[id] || null;
  } catch {
    return null;
  }
}

// ==============================================================================
// Smart Natural-Language Query Parser (India Scope)
// ==============================================================================

const STOP_WORDS = new Set([
  'ngo', 'ngos', 'in', 'at', 'near', 'around', 'for', 'of', 'the', 'and', 'with',
  'india', 'indian', 'list', 'find', 'search', 'best', 'top', 'charity', 'charities',
  'organization', 'organizations', 'organisation', 'organisations', 'nonprofit', 'non-profit',
  'me', 'my', 'location', 'area', 'nearby',
]);

const CATEGORY_KEYWORDS: { pattern: RegExp; category: NGOCategory; stripWords: string[] }[] = [
  {
    pattern: /\b(food\s*donation|food\s*bank|food\s*banks|food|meal|meals|hunger|ration|kitchen|feeding|roti|langar)\b/i,
    category: 'food_distribution',
    stripWords: ['food', 'donation', 'donations', 'bank', 'banks', 'meal', 'meals', 'hunger', 'ration', 'kitchen', 'feeding'],
  },
  {
    pattern: /\b(shelter|shelters|homeless|night\s*shelter|rain\s*basera|destitute)\b/i,
    category: 'homeless_support',
    stripWords: ['shelter', 'shelters', 'homeless', 'night', 'destitute'],
  },
  {
    pattern: /\b(child|children|orphan|orphanage|orphanages|kids|bal)\b/i,
    category: 'child_welfare',
    stripWords: ['child', 'children', 'orphan', 'orphanage', 'orphanages', 'kids', 'welfare'],
  },
  {
    pattern: /\b(education|school|literacy|learning)\b/i,
    category: 'education',
    stripWords: ['education', 'school', 'literacy', 'learning'],
  },
  {
    pattern: /\b(elderly|old\s*age|senior|seniors)\b/i,
    category: 'elderly_care',
    stripWords: ['elderly', 'old', 'age', 'senior', 'seniors', 'care'],
  },
  {
    pattern: /\b(women|mahila|girl|girls)\b/i,
    category: 'women_empowerment',
    stripWords: ['women', 'mahila', 'empowerment'],
  },
  {
    pattern: /\b(health|healthcare|medical|hospital|blood)\b/i,
    category: 'healthcare',
    stripWords: ['health', 'healthcare', 'medical'],
  },
  {
    pattern: /\b(disaster|relief|emergency|flood)\b/i,
    category: 'disaster_relief',
    stripWords: ['disaster', 'relief', 'emergency'],
  },
  {
    pattern: /\b(animal|animals|dog|cow|goshala|gaushala|pet)\b/i,
    category: 'animal_welfare',
    stripWords: ['animal', 'animals', 'welfare'],
  },
  {
    pattern: /\b(community\s*welfare|social\s*welfare|welfare)\b/i,
    category: 'general_charity',
    stripWords: ['community', 'social', 'welfare'],
  },
];

export function parseIndiaQuery(rawQuery: string): ParsedIndiaQuery {
  const raw = rawQuery.trim();
  const lower = raw.toLowerCase();

  const isNearbyQuery = /\b(near\s*me|nearby|around\s*me)\b/i.test(lower);
  const pincodeMatch = raw.match(/\b([1-9]\d{5})\b/);
  const detectedPincode = pincodeMatch ? pincodeMatch[1] : undefined;

  let detectedCity: string | undefined;
  let detectedState: string | undefined;

  // Match city keys (longest key first so "new delhi" beats "delhi")
  const cityKeys = Object.keys(INDIA_CITY_DIRECTORY).sort((a, b) => b.length - a.length);
  const matchedLocationWords = new Set<string>();

  for (const key of cityKeys) {
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      const entry = INDIA_CITY_DIRECTORY[key];
      detectedCity = entry.city;
      detectedState = entry.state;
      key.split(/\s+/).forEach((w) => matchedLocationWords.add(w));
      break;
    }
  }

  // Match Indian state names
  for (const st of INDIA_STATES) {
    const regex = new RegExp(`\\b${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      detectedState = st;
      st.toLowerCase().split(/\s+/).forEach((w) => matchedLocationWords.add(w));
      break;
    }
  }

  const detectedCategories: NGOCategory[] = [];
  const matchedCatWords = new Set<string>();
  for (const ck of CATEGORY_KEYWORDS) {
    if (ck.pattern.test(lower)) {
      if (!detectedCategories.includes(ck.category)) {
        detectedCategories.push(ck.category);
      }
      ck.stripWords.forEach((w) => matchedCatWords.add(w));
    }
  }

  const rawTokens = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const nameTokens = rawTokens.filter(
    (t) =>
      !STOP_WORDS.has(t) &&
      !matchedLocationWords.has(t) &&
      !matchedCatWords.has(t) &&
      t !== detectedPincode
  );

  return {
    raw,
    cleanQuery: raw,
    detectedState,
    detectedCity,
    detectedPincode,
    detectedCategories,
    nameTokens,
    isNearbyQuery,
  };
}

// ==============================================================================
// Source 1: Supabase ShareBite Registered NGOs
// ==============================================================================

let searchRpcSupported: boolean | null = null;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise)
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

async function fetchFromSupabase(
  params: NGOSearchParams,
  parsed: ParsedIndiaQuery
): Promise<IndiaNGO[]> {
  const effectiveCity = params.city || parsed.detectedCity || null;
  const effectiveState = params.state || parsed.detectedState || null;
  const searchTerm = parsed.nameTokens.length > 0 ? parsed.nameTokens.join(' ') : null;

  const fetchProfilesPromise = (async (): Promise<IndiaNGO[]> => {
    try {
      // 1. Try privacy-safe public RPC (works for both guests & authenticated users)
      if (searchRpcSupported !== false) {
        const { data: rpcRows, error: rpcError } = await supabase.rpc('search_registered_ngos', {
          p_query: searchTerm,
          p_city: effectiveCity,
          p_state: effectiveState,
          p_limit: 30,
        });

        if (!rpcError && Array.isArray(rpcRows)) {
          searchRpcSupported = true;
          return rpcRows
            .filter((row: Record<string, any>) => Boolean((row.organization_name || row.full_name || '').trim()))
            .map((row: Record<string, any>) => mapSupabaseProfileToNGO(row));
        }
        if (rpcError?.code === 'PGRST202' || rpcError?.message?.includes('Could not find the function')) {
          searchRpcSupported = false;
        }
      }

      // 2. Fallback to direct profiles query (works for authenticated sessions before RPC migration is applied)
      let query = supabase
        .from('profiles')
        .select('id, organization_name, full_name, bio, address, city, latitude, longitude, phone, operating_hours, is_verified, avatar_url, updated_at')
        .in('role', ['ngo', 'acceptor', 'receiver'])
        .limit(40);

      if (effectiveCity) {
        query = query.or(`city.ilike.%${effectiveCity}%,address.ilike.%${effectiveCity}%`);
      }

      const { data: profileRows, error: profErr } = await query;
      if (!profErr && Array.isArray(profileRows)) {
        return profileRows
          .filter((row: Record<string, any>) => Boolean((row.organization_name || row.full_name || '').trim()))
          .map((row: Record<string, any>) => mapSupabaseProfileToNGO(row));
      }
    } catch (err) {
      console.warn('[NGODiscovery] Supabase profiles query skipped:', err);
    }
    return [];
  })();

  const fetchPartnersPromise = (async (): Promise<IndiaNGO[]> => {
    try {
      const { data: partnerRows, error: partnerErr } = await supabase
        .from('partners')
        .select('id, organization_name, organization_type, description, address, city, logo_url, is_verified, updated_at')
        .eq('is_verified', true)
        .limit(30);

      if (!partnerErr && Array.isArray(partnerRows)) {
        return partnerRows
          .filter((p: Record<string, any>) => Boolean(p.organization_name))
          .map((p: Record<string, any>): IndiaNGO => ({
            id: `sb-partner-${p.id}`,
            sharebiteProfileId: p.id,
            name: p.organization_name,
            description: p.description || 'Registered community partner on ShareBite.',
            categories: ['food_distribution', 'general_charity'],
            address: p.address || undefined,
            city: p.city || undefined,
            imageUrl: p.logo_url || undefined,
            sourceName: 'ShareBite Registered Network',
            dataSource: 'sharebite',
            listingType: 'sharebite_registered',
            verificationStatus: p.is_verified ? 'sharebite_verified' : 'source_listed',
            govRegistrationVerified: false,
            acceptsFoodDonations: true,
            updatedAt: p.updated_at || undefined,
          }));
      }
    } catch {
      // Partners table optional
    }
    return [];
  })();

  const [profileNGOs, partnerNGOs] = await Promise.all([
    withTimeout(fetchProfilesPromise, 3500, []),
    withTimeout(fetchPartnersPromise, 3500, []),
  ]);

  return filterByIntent([...profileNGOs, ...partnerNGOs], params, parsed);
}

function mapSupabaseProfileToNGO(row: Record<string, any>): IndiaNGO {
  const orgName = (row.organization_name || row.full_name || 'ShareBite NGO').trim();
  const cityInfo = row.city ? INDIA_CITY_DIRECTORY[String(row.city).toLowerCase()] : undefined;

  return {
    id: `sb-${row.id}`,
    sharebiteProfileId: row.id,
    name: orgName,
    description: row.bio || 'Registered food rescue NGO active on the ShareBite platform.',
    categories: ['food_distribution', 'general_charity'],
    address: row.address || undefined,
    city: row.city || cityInfo?.city || undefined,
    state: inferStateFromText(`${row.address || ''} ${row.city || ''}`) || cityInfo?.state || undefined,
    latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
    longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
    phone: row.phone || undefined,
    operatingHours: row.operating_hours || undefined,
    imageUrl: row.avatar_url || undefined,
    sourceName: 'ShareBite Registered Network',
    dataSource: 'sharebite',
    listingType: 'sharebite_registered',
    verificationStatus: row.is_verified ? 'sharebite_verified' : 'source_listed',
    govRegistrationVerified: false,
    acceptsFoodDonations: true,
    acceptsVolunteers: true,
    updatedAt: row.updated_at || undefined,
  };
}

// ==============================================================================
// Source 2: Server-Side Google Places API (New) Proxy (/api/ngo-search)
// ==============================================================================

interface GoogleProxyResult {
  ngos: IndiaNGO[];
  nextPageToken: string | null;
  apiConfigured: boolean;
  quotaExceeded: boolean;
  quotaMessage?: string;
  networkError: boolean;
  networkMessage?: string;
}

async function fetchFromGooglePlacesProxy(
  params: NGOSearchParams,
  parsed: ParsedIndiaQuery,
  signal?: AbortSignal
): Promise<GoogleProxyResult> {
  const qs = new URLSearchParams();
  if (params.query) qs.set('q', params.query);
  if (params.city || parsed.detectedCity) qs.set('city', params.city || parsed.detectedCity || '');
  if (params.state || parsed.detectedState) qs.set('state', params.state || parsed.detectedState || '');
  const primaryCat = params.categories?.[0] || parsed.detectedCategories[0];
  if (primaryCat) qs.set('category', primaryCat);
  if (params.lat != null && params.lng != null) {
    qs.set('lat', String(params.lat));
    qs.set('lng', String(params.lng));
  }
  if (params.radiusKm && params.radiusKm < 500) {
    qs.set('radiusKm', String(params.radiusKm));
  }
  if (params.pageToken) {
    qs.set('pageToken', params.pageToken);
  }

  try {
    const res = await fetch(`/api/ngo-search?${qs.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });

    const contentType = res.headers.get('content-type') || '';

    if (res.status === 429) {
      const errBody = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
      return {
        ngos: [],
        nextPageToken: null,
        apiConfigured: true,
        quotaExceeded: true,
        quotaMessage:
          errBody.message ||
          'Google Places API search quota has been temporarily reached. Showing ShareBite registered NGOs and public listings.',
        networkError: false,
      };
    }

    // In local Vite dev/preview without Vercel serverless runtime, /api/ngo-search may return HTML or 404
    if (!contentType.includes('application/json')) {
      return {
        ngos: [],
        nextPageToken: null,
        apiConfigured: false,
        quotaExceeded: false,
        networkError: false,
      };
    }

    const data = await res.json();

    if (data.quotaExceeded) {
      return {
        ngos: [],
        nextPageToken: null,
        apiConfigured: true,
        quotaExceeded: true,
        quotaMessage:
          data.message || 'Google Places API quota reached. Showing available ShareBite & public NGO results.',
        networkError: false,
      };
    }

    if (!res.ok) {
      return {
        ngos: [],
        nextPageToken: null,
        apiConfigured: Boolean(data.apiConfigured),
        quotaExceeded: false,
        networkError: true,
        networkMessage: data.message || 'External NGO search service is temporarily unreachable.',
      };
    }

    const ngos: IndiaNGO[] = Array.isArray(data.ngos)
      ? data.ngos.map((item: IndiaNGO) => ({
          ...item,
          listingType: 'external_listing',
          dataSource: 'google_places',
          sourceName: 'Google Places',
          govRegistrationVerified: false,
        }))
      : [];

    return {
      ngos,
      nextPageToken: data.nextPageToken || null,
      apiConfigured: Boolean(data.apiConfigured),
      quotaExceeded: false,
      networkError: false,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return {
      ngos: [],
      nextPageToken: null,
      apiConfigured: false,
      quotaExceeded: false,
      networkError: true,
      networkMessage: 'Network error while contacting external NGO search service.',
    };
  }
}

// ==============================================================================
// Source 3: OpenStreetMap India-Scoped Live Fallback (Nominatim)
// ==============================================================================

async function fetchFromOpenStreetMapIndia(
  params: NGOSearchParams,
  parsed: ParsedIndiaQuery,
  signal?: AbortSignal
): Promise<{ ngos: IndiaNGO[]; networkFailed: boolean }> {
  const city = params.city || parsed.detectedCity;
  const state = params.state || parsed.detectedState;
  const locationSuffix = [city, state, parsed.detectedPincode].filter(Boolean).join(' ');

  // Build targeted India-only search query
  let q = '';
  if (parsed.nameTokens.length > 0) {
    q = `${parsed.nameTokens.join(' ')} NGO ${locationSuffix}`.trim();
  } else if (locationSuffix) {
    const catHint = parsed.detectedCategories.includes('food_distribution')
      ? 'food bank charity NGO'
      : parsed.detectedCategories.includes('homeless_support')
      ? 'shelter charity NGO'
      : 'NGO charity foundation';
    q = `${catHint} ${locationSuffix}`.trim();
  } else {
    return { ngos: [], networkFailed: false };
  }

  try {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), 5500);
    const onParentAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    const url =
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: `${q} India`,
        format: 'jsonv2',
        addressdetails: '1',
        extratags: '1',
        countrycodes: 'in',
        limit: '10',
      }).toString();

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: timeoutController.signal,
    });

    clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);

    if (!res.ok) return { ngos: [], networkFailed: false };

    const items = await res.json();
    if (!Array.isArray(items)) return { ngos: [], networkFailed: false };

    const mapped: IndiaNGO[] = [];
    for (const item of items) {
      const addr = item.address || {};
      const countryCode = (addr.country_code || '').toLowerCase();
      if (countryCode && countryCode !== 'in') continue;

      const rawName = (item.name || item.display_name?.split(',')[0] || '').trim();
      if (!rawName) continue;

      // Filter out generic administrative boundaries / roads when searching for NGOs
      const itemClass = String(item.class || '').toLowerCase();
      const itemType = String(item.type || '').toLowerCase();
      if (itemClass === 'boundary' || itemClass === 'highway' || itemType === 'administrative' || itemType === 'city' || itemType === 'state') {
        continue;
      }

      const extratags = item.extratags || {};
      const phone = extratags.phone || extratags['contact:phone'] || undefined;
      const website = extratags.website || extratags['contact:website'] || undefined;
      const email = extratags.email || extratags['contact:email'] || undefined;
      const resolvedCity = addr.city || addr.town || addr.village || addr.county || city || undefined;
      const resolvedState = addr.state || state || undefined;
      const resolvedPincode = addr.postcode || undefined;

      // If user searched a specific org name, verify at least one token matches
      if (parsed.nameTokens.length > 0) {
        const hay = `${rawName} ${item.display_name || ''}`.toLowerCase();
        const matchesName = parsed.nameTokens.some((tok) => hay.includes(tok));
        if (!matchesName) continue;
      }

      const categories = inferCategoriesFromText(`${rawName} ${itemType} ${extratags.social_facility || ''}`);

      mapped.push({
        id: `osm-${item.osm_type || 'n'}-${item.osm_id || item.place_id}`,
        osmId: String(item.osm_id || item.place_id),
        name: rawName,
        description: extratags.description || 'Public organization listing discovered via OpenStreetMap India.',
        categories,
        address: item.display_name || undefined,
        city: resolvedCity,
        district: addr.state_district || addr.county || undefined,
        state: resolvedState,
        pincode: resolvedPincode,
        latitude: item.lat ? parseFloat(item.lat) : undefined,
        longitude: item.lon ? parseFloat(item.lon) : undefined,
        phone,
        email,
        website,
        sourceName: 'OpenStreetMap',
        sourceUrl: item.osm_id
          ? `https://www.openstreetmap.org/${item.osm_type === 'W' || item.osm_type === 'way' ? 'way' : 'node'}/${item.osm_id}`
          : undefined,
        dataSource: 'openstreetmap',
        listingType: 'external_listing',
        verificationStatus: phone || website || email ? 'contact_available' : 'source_listed',
        govRegistrationVerified: false,
        acceptsFoodDonations: categories.includes('food_distribution'),
      });
    }

    return { ngos: mapped, networkFailed: false };
  } catch (err: any) {
    if (signal?.aborted) throw err;
    return { ngos: [], networkFailed: true };
  }
}

// ==============================================================================
// Filtering, Deduplication & Distance Calculation Helpers
// ==============================================================================

function inferStateFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const st of INDIA_STATES) {
    if (lower.includes(st.toLowerCase())) return st;
  }
  return undefined;
}

function inferCategoriesFromText(text: string): NGOCategory[] {
  const lower = text.toLowerCase();
  const cats: NGOCategory[] = [];
  for (const ck of CATEGORY_KEYWORDS) {
    if (ck.pattern.test(lower) && !cats.includes(ck.category)) {
      cats.push(ck.category);
    }
  }
  return cats.length > 0 ? cats : ['general_charity'];
}

const GENERIC_ORG_WORDS = new Set(['foundation', 'trust', 'society', 'charitable', 'mission', 'centre', 'center', 'india']);

function filterByIntent(list: IndiaNGO[], params: NGOSearchParams, parsed: ParsedIndiaQuery): IndiaNGO[] {
  const targetState = (params.state || parsed.detectedState || '').toLowerCase();
  const targetCity = (params.city || parsed.detectedCity || '').toLowerCase();
  const targetPin = parsed.detectedPincode || '';
  const targetCategories =
    params.categories && params.categories.length > 0
      ? params.categories
      : parsed.detectedCategories;

  const distinctiveTokens = parsed.nameTokens.filter((t) => !GENERIC_ORG_WORDS.has(t));
  const tokensToCheck = distinctiveTokens.length > 0 ? distinctiveTokens : parsed.nameTokens;

  return list.filter((ngo) => {
    const nameHaystack = ngo.name.toLowerCase();
    const haystack = [
      ngo.name,
      ngo.description,
      ngo.address,
      ngo.city,
      ngo.district,
      ngo.state,
      ngo.pincode,
      ngo.categories.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Strict word-boundary token matching: prevents unrelated/false matches for specific NGO names!
    if (tokensToCheck.length > 0) {
      const matchesToken = (text: string, tok: string) =>
        new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);
      const nameMatches = tokensToCheck.filter((tok) => matchesToken(nameHaystack, tok)).length;
      const fullMatches = tokensToCheck.filter((tok) => matchesToken(haystack, tok)).length;
      const required = tokensToCheck.length <= 2 ? tokensToCheck.length : Math.ceil(tokensToCheck.length * 0.7);
      if (nameMatches < required && fullMatches < tokensToCheck.length) return false;
    }

    if (targetPin) {
      const pinMatches = (ngo.pincode || '').includes(targetPin) || (ngo.address || '').includes(targetPin);
      if (!pinMatches && !targetCity && !targetState) return false;
    }

    if (targetState) {
      const ngoState = (ngo.state || '').toLowerCase();
      const stateMatch =
        ngoState === targetState ||
        ngoState.includes(targetState) ||
        haystack.includes(targetState);
      if (!stateMatch) return false;
    }

    if (targetCity) {
      const cityAliases =
        targetCity === 'gurugram' || targetCity === 'gurgaon'
          ? ['gurugram', 'gurgaon']
          : targetCity === 'bengaluru' || targetCity === 'bangalore'
          ? ['bengaluru', 'bangalore']
          : targetCity === 'new delhi' || targetCity === 'delhi'
          ? ['delhi', 'new delhi']
          : [targetCity];

      const cityMatch = cityAliases.some(
        (alias) => (ngo.city || '').toLowerCase().includes(alias) || haystack.includes(alias)
      );
      if (!cityMatch) return false;
    }

    if (targetCategories.length > 0) {
      const hasCat = targetCategories.some((c) => ngo.categories.includes(c));
      if (!hasCat) return false;
    }

    if (params.onlyShareBiteRegistered && ngo.listingType !== 'sharebite_registered') {
      return false;
    }

    if (params.onlyGovVerified && !ngo.govRegistrationVerified) {
      return false;
    }

    return true;
  });
}

function normalizeWebsiteHost(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizeNameCityKey(ngo: IndiaNGO): string {
  const normName = ngo.name
    .toLowerCase()
    .replace(/\b(the|ngo|trust|foundation|society|india|charitable|welfare|organization|organisation)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  const normCity = (ngo.city || ngo.state || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return `${normName || ngo.name.toLowerCase().replace(/[^a-z0-9]/g, '')}::${normCity}`;
}

const SOURCE_PRIORITY: Record<NGODataSource, number> = {
  sharebite: 4,
  google_places: 3,
  public_outreach: 2,
  openstreetmap: 1,
};

function deduplicateNGOs(items: IndiaNGO[]): IndiaNGO[] {
  const byKey = new Map<string, IndiaNGO>();
  const hostToKey = new Map<string, string>();
  const placeIdToKey = new Map<string, string>();

  for (const item of items) {
    const nameKey = normalizeNameCityKey(item);
    const host = normalizeWebsiteHost(item.website);
    const existingKey =
      (item.placeId && placeIdToKey.get(item.placeId)) ||
      (host && hostToKey.get(host)) ||
      (byKey.has(nameKey) ? nameKey : undefined);

    if (!existingKey) {
      byKey.set(nameKey, item);
      if (host) hostToKey.set(host, nameKey);
      if (item.placeId) placeIdToKey.set(item.placeId, nameKey);
      continue;
    }

    const prev = byKey.get(existingKey)!;
    const prevPriority = SOURCE_PRIORITY[prev.dataSource || 'openstreetmap'] || 0;
    const nextPriority = SOURCE_PRIORITY[item.dataSource || 'openstreetmap'] || 0;

    // Prefer ShareBite Registered > Google Places > Public Directory > OSM, merging missing contact fields
    const primary = nextPriority > prevPriority ? item : prev;
    const secondary = nextPriority > prevPriority ? prev : item;

    const merged: IndiaNGO = {
      ...secondary,
      ...primary,
      phone: primary.phone || secondary.phone,
      website: primary.website || secondary.website,
      address: primary.address || secondary.address,
      city: primary.city || secondary.city,
      district: primary.district || secondary.district,
      state: primary.state || secondary.state,
      pincode: primary.pincode || secondary.pincode,
      latitude: primary.latitude ?? secondary.latitude,
      longitude: primary.longitude ?? secondary.longitude,
      imageUrl: primary.imageUrl || secondary.imageUrl,
      googleMapsUri: primary.googleMapsUri || secondary.googleMapsUri,
      categories: Array.from(new Set([...primary.categories, ...secondary.categories])),
    };

    byKey.set(existingKey, merged);
    if (host) hostToKey.set(host, existingKey);
    if (item.placeId) placeIdToKey.set(item.placeId, existingKey);
  }

  return Array.from(byKey.values());
}

// ==============================================================================
// Public Service API
// ==============================================================================

async function geocodeSearchQuery(
  query: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number; city: string; state?: string } | null> {
  const lower = query.trim().toLowerCase();
  if (!lower) return null;

  // Instant match against India city directory
  for (const key of Object.keys(INDIA_CITY_DIRECTORY)) {
    if (lower === key || new RegExp(`\\b${key}\\b`, 'i').test(lower)) {
      const c = INDIA_CITY_DIRECTORY[key];
      return { lat: c.lat, lng: c.lng, city: c.city, state: c.state };
    }
  }

  for (const [st, coords] of Object.entries(STATE_COORDS)) {
    if (lower === st.toLowerCase() || new RegExp(`\\b${st}\\b`, 'i').test(lower)) {
      return { lat: coords.lat, lng: coords.lng, city: st, state: st };
    }
  }

  // Fallback to Nominatim for PIN codes & smaller towns/districts in India
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({
          q: `${query}, India`,
          format: 'jsonv2',
          addressdetails: '1',
          countrycodes: 'in',
          limit: '1',
        }).toString(),
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const top = data[0];
    return {
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      city: top.address?.city || top.address?.town || top.address?.state_district || query,
      state: top.address?.state,
    };
  } catch {
    return null;
  }
}

async function searchNGOs(
  params: NGOSearchParams,
  signal?: AbortSignal
): Promise<NGOSearchResponse> {
  const parsed = parseIndiaQuery(params.query || '');
  const sourcesUsed = new Set<string>();

  // If browser reports completely offline
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // 1. Run Supabase + Google Places Proxy in parallel
  const [supabaseNGOs, googleResult] = await Promise.all([
    isBrowserOffline ? Promise.resolve([] as IndiaNGO[]) : fetchFromSupabase(params, parsed),
    params.onlyShareBiteRegistered || isBrowserOffline
      ? Promise.resolve<GoogleProxyResult>({
          ngos: [],
          nextPageToken: null,
          apiConfigured: false,
          quotaExceeded: false,
          networkError: isBrowserOffline,
          networkMessage: isBrowserOffline ? 'You appear to be offline. Check your internet connection and retry.' : undefined,
        })
      : fetchFromGooglePlacesProxy(params, parsed, signal),
  ]);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (supabaseNGOs.length > 0) {
    sourcesUsed.add('ShareBite Registered Network');
  }
  if (googleResult.ngos.length > 0) {
    sourcesUsed.add('Google Places');
  }

  // 2. Local Public Reference Directory (filtered strictly by parsed intent)
  const directoryMatches = params.onlyShareBiteRegistered
    ? []
    : filterByIntent(PUBLIC_INDIA_NGO_DIRECTORY, params, parsed);
  if (directoryMatches.length > 0) {
    sourcesUsed.add('Public NGO Directory');
  }

  // 3. OpenStreetMap India fallback when Google Places is unconfigured/quota-limited or returned few results
  let osmNGOs: IndiaNGO[] = [];
  let osmNetworkFailed = false;
  const shouldQueryOsm =
    !params.onlyShareBiteRegistered &&
    !isBrowserOffline &&
    !params.pageToken &&
    (!googleResult.apiConfigured || googleResult.quotaExceeded || googleResult.ngos.length < 3) &&
    Boolean(params.query || params.city || params.state || parsed.detectedPincode);

  if (shouldQueryOsm) {
    const osmRes = await fetchFromOpenStreetMapIndia(params, parsed, signal);
    osmNGOs = filterByIntent(osmRes.ngos, params, parsed);
    osmNetworkFailed = osmRes.networkFailed;
    if (osmNGOs.length > 0) {
      sourcesUsed.add('OpenStreetMap India');
    }
  }

  // 4. Filter Google results for explicit user toggles (onlyGovVerified / category / state)
  const filteredGoogle = googleResult.ngos.filter((ngo) => {
    if (params.onlyShareBiteRegistered) return false;
    if (params.onlyGovVerified && !ngo.govRegistrationVerified) return false;
    if (params.state) {
      const st = params.state.toLowerCase();
      const hay = `${ngo.state || ''} ${ngo.address || ''}`.toLowerCase();
      if (!hay.includes(st)) return false;
    }
    return true;
  });

  // 5. Merge & Deduplicate (ShareBite Registered always prioritized)
  let combined = deduplicateNGOs([
    ...supabaseNGOs,
    ...filteredGoogle,
    ...directoryMatches,
    ...osmNGOs,
  ]);

  // 6. Compute distances when coordinates are available
  if (params.lat != null && params.lng != null) {
    combined = combined.map((ngo) => {
      if (ngo.latitude != null && ngo.longitude != null) {
        const dist = LocationService.calculateDistance(
          params.lat!,
          params.lng!,
          ngo.latitude,
          ngo.longitude
        );
        return { ...ngo, distanceKm: Math.round(dist * 10) / 10 };
      }
      return ngo;
    });

    if (params.radiusKm && params.radiusKm < 5000 && !parsed.detectedState && !params.state && !parsed.nameTokens.length) {
      combined = combined.filter(
        (ngo) => ngo.distanceKm == null || ngo.distanceKm <= params.radiusKm!
      );
    }
  }

  // 7. Sort results
  const sortMode = params.sortBy || (params.lat != null && !params.query ? 'nearest' : 'relevance');
  combined.sort((a, b) => {
    if (sortMode === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortMode === 'nearest') {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
    }

    // Relevance: ShareBite Registered first, then exact query match, then distance
    const aSb = a.listingType === 'sharebite_registered' ? 1 : 0;
    const bSb = b.listingType === 'sharebite_registered' ? 1 : 0;
    if (aSb !== bSb) return bSb - aSb;

    if (params.query) {
      const qLow = params.query.trim().toLowerCase();
      const aExact = a.name.toLowerCase().includes(qLow) ? 1 : 0;
      const bExact = b.name.toLowerCase().includes(qLow) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
    }

    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    return a.name.localeCompare(b.name);
  });

  // Cache transiently in sessionStorage for instant Details Page loading
  cacheNGOsInSession(combined);

  const networkError =
    isBrowserOffline || (googleResult.networkError && osmNetworkFailed && combined.length === 0);

  return {
    ngos: combined,
    total: combined.length,
    sources: Array.from(sourcesUsed),
    hasMore: Boolean(googleResult.nextPageToken),
    nextPageToken: googleResult.nextPageToken,
    quotaExceeded: googleResult.quotaExceeded,
    quotaMessage: googleResult.quotaMessage,
    networkError,
    networkMessage: networkError
      ? googleResult.networkMessage || 'Unable to connect to NGO search services. Please check your internet connection and retry.'
      : undefined,
    googleAttribution: combined.some((n) => n.dataSource === 'google_places'),
    parsedIntent: parsed,
  };
}

async function getNGOById(id: string, signal?: AbortSignal): Promise<IndiaNGO | null> {
  // 1. Check verified public directory
  const pubMatch = PUBLIC_INDIA_NGO_DIRECTORY.find((n) => n.id === id);
  if (pubMatch) return pubMatch;

  // 2. Check transient session cache first
  const cached = getCachedNGOFromSession(id);

  // 3. ShareBite Registered NGO (UUID or sb-<uuid>)
  if (id.startsWith('sb-') && !id.startsWith('sb-partner-')) {
    const uuid = id.replace(/^sb-/, '');
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_registered_ngo_by_id', {
        p_id: uuid,
      });
      if (!rpcErr && Array.isArray(rpcData) && rpcData[0]) {
        const mapped = mapSupabaseProfileToNGO(rpcData[0]);
        cacheNGOsInSession([mapped]);
        return mapped;
      }

      const { data: directRow } = await supabase
        .from('profiles')
        .select('id, organization_name, full_name, bio, address, city, latitude, longitude, phone, operating_hours, is_verified, avatar_url, updated_at')
        .eq('id', uuid)
        .in('role', ['ngo', 'acceptor', 'receiver'])
        .maybeSingle();

      if (directRow) {
        const mapped = mapSupabaseProfileToNGO(directRow);
        cacheNGOsInSession([mapped]);
        return mapped;
      }
    } catch {
      // Fallback to cached
    }
  }

  // 4. Google Places listing: fetch fresh live details on demand (never stored in Supabase)
  if (id.startsWith('gplace-')) {
    const placeId = id.replace(/^gplace-/, '');
    try {
      const res = await fetch(`/api/ngo-details?placeId=${encodeURIComponent(placeId)}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.ngo) {
          const merged: IndiaNGO = {
            ...(cached || {}),
            ...data.ngo,
            listingType: 'external_listing',
            dataSource: 'google_places',
            sourceName: 'Google Places',
            govRegistrationVerified: false,
          };
          cacheNGOsInSession([merged]);
          return merged;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  return cached;
}

const POPULAR_SUGGESTIONS: SearchSuggestionItem[] = [
  { id: 'sug-wecare', label: 'We Care Foundation', sublabel: 'Gurugram, Haryana · NGO Outreach', query: 'We Care Foundation', kind: 'ngo' },
  { id: 'sug-delhi', label: 'NGOs in Delhi', sublabel: 'Food banks, shelters & welfare orgs', query: 'NGOs in Delhi', kind: 'location' },
  { id: 'sug-gurugram-food', label: 'Food donation NGOs in Gurugram', sublabel: 'Haryana · Food Rescue', query: 'Food donation NGOs in Gurugram', kind: 'category' },
  { id: 'sug-mumbai', label: 'NGOs in Mumbai', sublabel: 'Maharashtra · Community & Food Relief', query: 'NGOs in Mumbai', kind: 'location' },
  { id: 'sug-punjab', label: 'NGOs in Punjab', sublabel: 'Amritsar, Patiala, Ludhiana & more', query: 'NGOs in Punjab', kind: 'location' },
  { id: 'sug-nearby', label: 'Nearby NGOs near me', sublabel: 'Uses your device location with permission', query: 'Nearby NGOs', kind: 'nearby' },
];

function getSuggestions(rawInput: string): SearchSuggestionItem[] {
  const q = rawInput.trim().toLowerCase();
  if (!q) {
    return POPULAR_SUGGESTIONS;
  }

  const suggestions: SearchSuggestionItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: SearchSuggestionItem) => {
    const key = item.query.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(item);
  };

  // 1. Matching NGOs from public directory
  for (const ngo of PUBLIC_INDIA_NGO_DIRECTORY) {
    const hay = `${ngo.name} ${ngo.city || ''} ${ngo.state || ''}`.toLowerCase();
    if (hay.includes(q)) {
      pushUnique({
        id: `dir-${ngo.id}`,
        label: ngo.name,
        sublabel: [ngo.city, ngo.state].filter(Boolean).join(', '),
        query: ngo.name,
        kind: 'ngo',
      });
    }
    if (suggestions.length >= 4) break;
  }

  // 2. Matching cities
  for (const [key, entry] of Object.entries(INDIA_CITY_DIRECTORY)) {
    if (key.includes(q) || entry.city.toLowerCase().includes(q)) {
      pushUnique({
        id: `city-${key}`,
        label: `NGOs in ${entry.city}`,
        sublabel: `${entry.state} · City search`,
        query: `NGOs in ${entry.city}`,
        kind: 'location',
      });
      pushUnique({
        id: `city-food-${key}`,
        label: `Food donation NGOs in ${entry.city}`,
        sublabel: `${entry.state} · Food Banks & Meals`,
        query: `Food donation NGOs in ${entry.city}`,
        kind: 'category',
      });
    }
    if (suggestions.length >= 7) break;
  }

  // 3. Matching Indian States
  for (const st of INDIA_STATES) {
    if (st.toLowerCase().includes(q)) {
      pushUnique({
        id: `state-${st}`,
        label: `NGOs in ${st}`,
        sublabel: 'State-wide NGO search',
        query: `NGOs in ${st}`,
        kind: 'location',
      });
    }
    if (suggestions.length >= 8) break;
  }

  // 4. Matching Categories
  for (const cat of NGO_CATEGORIES) {
    if (cat.label.toLowerCase().includes(q)) {
      pushUnique({
        id: `cat-${cat.value}`,
        label: `${cat.label} NGOs in India`,
        sublabel: 'Category filter',
        query: `${cat.label} NGOs`,
        kind: 'category',
      });
    }
  }

  // 5. 6-digit PIN code suggestion
  if (/^\d{4,6}$/.test(q)) {
    pushUnique({
      id: `pin-${q}`,
      label: `Search NGOs near PIN ${q}`,
      sublabel: 'India Postal Code Search',
      query: q,
      kind: 'location',
    });
  }

  // Always offer direct search option for custom user text
  if (suggestions.length === 0 || !seen.has(q)) {
    pushUnique({
      id: `direct-${q}`,
      label: `Search "${rawInput.trim()}" across India`,
      sublabel: 'ShareBite Registered + External NGO Listings',
      query: rawInput.trim(),
      kind: 'ngo',
    });
  }

  return suggestions.slice(0, 7);
}

export const NGODiscoveryService = {
  INDIA_STATES,
  NGO_CATEGORIES,
  PUBLIC_INDIA_NGO_DIRECTORY,
  parseIndiaQuery,
  geocodeSearchQuery,
  searchNGOs,
  getNGOById,
  getSuggestions,
  getRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
};
