import { useEffect, useState, useMemo } from 'react';
import {
  MapPin,
  Utensils,
  Layers,
  Clock,
  Navigation,
  Sparkles,
  RotateCcw,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DonationService } from '../../services/donations';
import { LocationService, type Coordinates } from '../../services/location';
import { NGOService } from '../../services/ngo';
import DiscoverFoodMap from '../../components/map/DiscoverFoodMap';
import DiscoverFoodItem from '../../components/food/DiscoverFoodItem';
import { SkeletonCard } from '../../components/states/LoadingState';
import { EmptyState } from '../../components/states/EmptyState';
import type { FoodListing, NearbyNGO } from '../../types';
import styles from './DiscoverPage.module.css';

// Fallback high-fidelity listings matching the screenshot
const MOCK_LISTINGS: FoodListing[] = [
  {
    id: 'bhopal-food-1',
    donorId: 'mock-donor-1',
    title: 'Vegetable Rice + Dal',
    description: 'Freshly prepared vegetable pulao with yellow dal tadka in food grade containers.',
    category: 'cooked_meals',
    foodType: 'veg',
    servings: 25,
    availableServings: 25,
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
    pickupAddress: 'Malviya Nagar, Near New Market',
    city: 'Bhopal',
    latitude: 23.2384,
    longitude: 77.4042,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
    status: 'available',
    isUrgent: false,
    allergens: [],
    storageType: 'hot_insulated',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceKm: 1.8,
  },
  {
    id: 'bhopal-food-2',
    donorId: 'mock-donor-2',
    title: 'Fresh Fruits',
    description: 'Seasonal apples, bananas, and oranges surplus from hostel mess.',
    category: 'fruits_veg',
    foodType: 'veg',
    servings: 30,
    availableServings: 30,
    imageUrl: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80',
    pickupAddress: 'MANIT Campus, Link Road 3',
    city: 'Bhopal',
    latitude: 23.2185,
    longitude: 77.4082,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    status: 'available',
    isUrgent: false,
    allergens: [],
    storageType: 'room_temp',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceKm: 2.4,
  },
  {
    id: 'bhopal-food-3',
    donorId: 'mock-donor-3',
    title: 'Bread & Bakery Items',
    description: 'Whole wheat bread loaves, croissants, and dinner rolls baked this morning.',
    category: 'bakery',
    foodType: 'veg',
    servings: 20,
    availableServings: 20,
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80',
    pickupAddress: 'Arera Colony, E-3 Sector',
    city: 'Bhopal',
    latitude: 23.2145,
    longitude: 77.4285,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 1.5 * 3600 * 1000).toISOString(),
    status: 'available',
    isUrgent: true,
    allergens: ['gluten'],
    storageType: 'room_temp',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceKm: 3.1,
  },
  {
    id: 'bhopal-food-4',
    donorId: 'mock-donor-4',
    title: 'Packed Meals',
    description: 'Sealed buffet packages containing roti, sabzi, rice, and curd.',
    category: 'cooked_meals',
    foodType: 'veg',
    servings: 24,
    availableServings: 24,
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80',
    pickupAddress: 'MP Nagar Zone 1, Near DB City Mall',
    city: 'Bhopal',
    latitude: 23.2334,
    longitude: 77.4342,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    status: 'available',
    isUrgent: false,
    allergens: [],
    storageType: 'room_temp',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceKm: 4.7,
  },
  {
    id: 'bhopal-food-5',
    donorId: 'mock-donor-5',
    title: 'Paneer Butter Masala & Roti',
    description: 'Catering event surplus, safely kept in insulated food containers.',
    category: 'cooked_meals',
    foodType: 'veg',
    servings: 35,
    availableServings: 35,
    imageUrl: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80',
    pickupAddress: 'Shahpura Lake Road',
    city: 'Bhopal',
    latitude: 23.1950,
    longitude: 77.4250,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    status: 'available',
    isUrgent: false,
    allergens: ['dairy'],
    storageType: 'hot_insulated',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    distanceKm: 5.2,
  },
];

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Coordinates: initialize from authenticated user location if available, otherwise null until acquired
  const [userCoords, setUserCoords] = useState<Coordinates | null>(
    user?.location?.latitude && user?.location?.longitude
      ? { latitude: user.location.latitude, longitude: user.location.longitude, city: user.location.city }
      : null
  );

  // Data states
  const [rawListings, setRawListings] = useState<FoodListing[]>([]);
  const [ngos, setNgos] = useState<NearbyNGO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  // Filters
  const [foodType, setFoodType] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [dietary, setDietary] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'nearest' | 'expiring' | 'servings'>('nearest');

  // Search query from URL or state
  const queryParam = searchParams.get('q') || '';

  // 1. Acquire location & initial data
  useEffect(() => {
    let isMounted = true;

    async function initLocationAndData() {
      try {
        let coords: Coordinates | null = null;
        if (user?.location?.latitude && user?.location?.longitude) {
          coords = {
            latitude: user.location.latitude,
            longitude: user.location.longitude,
            city: user.location.city,
          };
        }

        try {
          const deviceCoords = await LocationService.getCurrentCoordinates();
          if (deviceCoords && typeof deviceCoords.latitude === 'number' && !isNaN(deviceCoords.latitude)) {
            coords = deviceCoords;
          }
        } catch {}

        if (isMounted && coords) setUserCoords(coords);

        // Fetch DB listings
        const dbListings = await DonationService.getActiveListings();

        if (isMounted) {
          // If DB has listings, use them; if empty, use the rich mockup listings
          const combined = dbListings.length > 0 ? dbListings : MOCK_LISTINGS;

          // Calculate real distances if coords are available
          const withDist = combined.map((item) => {
            if (coords && item.latitude && item.longitude) {
              const d = LocationService.calculateDistance(
                coords.latitude,
                coords.longitude,
                item.latitude,
                item.longitude
              );
              return { ...item, distanceKm: d };
            }
            return item;
          });

          setRawListings(withDist);

          // Fetch nearby NGOs
          if (coords) {
            const nearbyNGOList = await NGOService.getNearbyNGOs(
              coords.latitude,
              coords.longitude,
              radiusKm
            );
            setNgos(nearbyNGOList);
          }
        }
      } catch (err) {
        console.error('Error initializing Discover page:', err);
        if (isMounted) setRawListings(MOCK_LISTINGS);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initLocationAndData();

    // Subscribe to realtime new listings
    const sub = DonationService.subscribeToListings((newListing) => {
      setRawListings((prev) => [newListing, ...prev]);
    });

    return () => {
      isMounted = false;
      sub.unsubscribe();
    };
  }, [radiusKm]);

  // 2. Filter & Sort
  const filteredListings = useMemo(() => {
    let list = [...rawListings];

    // Search query
    if (queryParam) {
      const q = queryParam.toLowerCase();
      list = list.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q)
      );
    }

    // Food Type
    if (foodType !== 'all') {
      list = list.filter((l) => l.foodType === foodType);
    }

    // Category
    if (category !== 'all') {
      list = list.filter((l) => l.category === category);
    }

    // Availability / Time
    if (timeFilter === 'urgent') {
      list = list.filter((l) => l.isUrgent);
    }

    // Distance Radius
    if (radiusKm < 50) {
      list = list.filter((l) => (l.distanceKm != null ? l.distanceKm <= radiusKm : true));
    }

    // Dietary
    if (dietary !== 'all') {
      if (dietary === 'jain') {
        list = list.filter((l) => l.foodType === 'veg' && !(l.allergens || []).includes('root_veg'));
      } else if (dietary === 'gluten_free') {
        list = list.filter((l) => !(l.allergens || []).includes('gluten'));
      }
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'nearest') {
        return (a.distanceKm || 99) - (b.distanceKm || 99);
      }
      if (sortBy === 'expiring') {
        return new Date(a.availableUntil).getTime() - new Date(b.availableUntil).getTime();
      }
      if (sortBy === 'servings') {
        return b.availableServings - a.availableServings;
      }
      return 0;
    });

    return list;
  }, [rawListings, queryParam, foodType, category, timeFilter, radiusKm, dietary, sortBy]);

  const handleResetFilters = () => {
    setFoodType('all');
    setCategory('all');
    setTimeFilter('all');
    setRadiusKm(10);
    setDietary('all');
    setSortBy('nearest');
  };

  const isFilterActive =
    foodType !== 'all' ||
    category !== 'all' ||
    timeFilter !== 'all' ||
    radiusKm !== 10 ||
    dietary !== 'all';

  return (
    <div className={styles.page}>
      {/* Header Banner matching screenshot */}
      <div className={styles.headerBanner}>
        <div className={styles.findFoodBadge}>
          <MapPin size={12} />
          <span>FIND FOOD NEAR YOU</span>
        </div>
        <h1 className={styles.title}>
          Good food is meant to be <span className={styles.serifTerracotta}>shared.</span>
        </h1>
        <p className={styles.subtitle}>
          Discover surplus food from restaurants, hostels, caterers and more — near you.
        </p>
      </div>

      {/* Filter Bar with pill dropdowns */}
      <div className={styles.filterBar}>
        {/* Food Types */}
        <div className={`${styles.filterPill} ${foodType !== 'all' ? styles.filterPillActive : ''}`}>
          <Utensils size={14} />
          <span>{foodType === 'all' ? 'All Food Types' : foodType.replace('_', '-')}</span>
          <ChevronDown size={13} />
          <select
            className={styles.filterSelect}
            value={foodType}
            onChange={(e) => setFoodType(e.target.value)}
          >
            <option value="all">All Food Types</option>
            <option value="veg">Vegetarian</option>
            <option value="non_veg">Non-Vegetarian</option>
            <option value="vegan">Vegan</option>
          </select>
        </div>

        {/* Categories */}
        <div className={`${styles.filterPill} ${category !== 'all' ? styles.filterPillActive : ''}`}>
          <Layers size={14} />
          <span>
            {category === 'all'
              ? 'All Categories'
              : category === 'cooked_meals'
              ? 'Cooked Meals'
              : category === 'bakery'
              ? 'Bakery'
              : category === 'fruits_veg'
              ? 'Fruits & Veg'
              : category}
          </span>
          <ChevronDown size={13} />
          <select
            className={styles.filterSelect}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="cooked_meals">Cooked Meals</option>
            <option value="bakery">Bakery</option>
            <option value="fruits_veg">Fruits & Veg</option>
            <option value="packaged">Packaged Goods</option>
          </select>
        </div>

        {/* Availability */}
        <div className={`${styles.filterPill} ${timeFilter !== 'all' ? styles.filterPillActive : ''}`}>
          <Clock size={14} />
          <span>{timeFilter === 'all' ? 'Available Now' : 'Expiring Soon'}</span>
          <ChevronDown size={13} />
          <select
            className={styles.filterSelect}
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
          >
            <option value="all">Available Now</option>
            <option value="urgent">Expiring Soon (Urgent)</option>
          </select>
        </div>

        {/* Radius */}
        <div className={`${styles.filterPill} ${radiusKm !== 10 ? styles.filterPillActive : ''}`}>
          <Navigation size={14} />
          <span>Within {radiusKm} km</span>
          <ChevronDown size={13} />
          <select
            className={styles.filterSelect}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
          >
            <option value={5}>Within 5 km</option>
            <option value={10}>Within 10 km</option>
            <option value={20}>Within 20 km</option>
            <option value={50}>Within 50 km</option>
          </select>
        </div>

        {/* Dietary */}
        <div className={`${styles.filterPill} ${dietary !== 'all' ? styles.filterPillActive : ''}`}>
          <Sparkles size={14} />
          <span>{dietary === 'all' ? 'Dietary Needs' : dietary.replace('_', ' ')}</span>
          <ChevronDown size={13} />
          <select
            className={styles.filterSelect}
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
          >
            <option value="all">Dietary Needs</option>
            <option value="jain">Jain Friendly</option>
            <option value="gluten_free">Gluten Free</option>
          </select>
        </div>

        {/* Reset button */}
        {isFilterActive && (
          <button className={styles.resetBtn} onClick={handleResetFilters}>
            <RotateCcw size={13} />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Split Layout: Map Left (58%) | Food List Right (42%) */}
      <div className={styles.splitLayout}>
        {/* Left Map Column */}
        <div className={styles.mapCol}>
          <DiscoverFoodMap
            listings={filteredListings}
            ngos={ngos}
            userCoords={userCoords}
            selectedListingId={selectedListingId}
            onSelectListing={(id) => {
              setSelectedListingId(id);
              // Scroll card into view on right
              const el = document.getElementById(`food-card-${id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
            onSelectNGO={(ngoId) => {
              navigate(`/profile?ngo=${ngoId}`);
            }}
          />
        </div>

        {/* Right List Column */}
        <div className={styles.listCol}>
          {/* Header row above cards */}
          <div className={styles.listHeader}>
            <div className={styles.listTitleWrap}>
              <h2>Available Food Nearby</h2>
              <p className={styles.listCount}>
                {loading
                  ? 'Finding donations...'
                  : `${filteredListings.length} results found near ${userCoords?.city || 'Bhopal'}`}
              </p>
            </div>

            {/* Sort by pill */}
            <div className={styles.sortSelectWrap}>
              <ArrowUpDown size={13} />
              <span>
                {sortBy === 'nearest'
                  ? 'Nearest First'
                  : sortBy === 'expiring'
                  ? 'Expiring Soonest'
                  : 'Most Servings'}
              </span>
              <ChevronDown size={12} />
              <select
                className={styles.sortSelect}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="nearest">Nearest First</option>
                <option value="expiring">Expiring Soonest</option>
                <option value="servings">Most Servings</option>
              </select>
            </div>
          </div>

          {/* Cards List */}
          <div className={styles.cardsList}>
            {loading ? (
              <SkeletonCard count={4} />
            ) : filteredListings.length === 0 ? (
              <EmptyState
                icon={<Utensils size={32} />}
                title="No food matches your filters"
                description="Try expanding your distance radius or changing your food type filter."
                action={
                  <button className={styles.resetBtn} onClick={handleResetFilters}>
                    Clear all filters
                  </button>
                }
              />
            ) : (
              filteredListings.map((item) => (
                <div key={item.id} id={`food-card-${item.id}`}>
                  <DiscoverFoodItem
                    listing={item}
                    isActive={item.id === selectedListingId}
                    onSelect={() => setSelectedListingId(item.id)}
                    onViewDetails={() => navigate(`/donations/${item.id}`)}
                    onClaim={() => {
                      if (user?.role === 'ngo' || user?.role === 'volunteer') {
                        navigate(`/donations/${item.id}?action=claim`);
                      } else {
                        navigate(`/donations/${item.id}`);
                      }
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
