import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ChevronLeft, ChevronRight, Check, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DonationService } from '../../services/donations';
import type { CreateFoodListingForm, FoodType } from '../../types';
import styles from './CreateDonationPage.module.css';

const CATEGORIES = [
  'Rice', 'Roti', 'Sabzi', 'Dal', 'Biryani', 'Curry',
  'Snacks', 'Sweets', 'Fruits', 'Bakery', 'Beverages', 'Other'
];

const FOOD_TYPES: { value: FoodType; label: string }[] = [
  { value: 'veg', label: 'Vegetarian (Pure Veg)' },
  { value: 'non_veg', label: 'Non-Vegetarian' },
  { value: 'vegan', label: 'Vegan (Plant-based)' },
  { value: 'other', label: 'Special / Other' },
];

const QUANTITY_UNITS = [
  { value: 'servings', label: 'Servings / Meals' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'boxes', label: 'Meal Boxes / Packets' },
  { value: 'litres', label: 'Litres (L)' },
  { value: 'trays', label: 'Catering Trays' },
];

const STORAGE_TYPES = [
  { value: 'room_temp', label: 'Room Temperature (Ambient)' },
  { value: 'refrigerated', label: 'Refrigerated / Chilled (< 5°C)' },
  { value: 'frozen', label: 'Frozen (Below -18°C)' },
  { value: 'hot_holding', label: 'Hot Holding (Ready-to-eat > 60°C)' },
];

const PACKAGING_TYPES = [
  { value: 'sealed_boxes', label: 'Sealed Individual Meal Boxes' },
  { value: 'cater_trays', label: 'Large Catering / Aluminium Trays' },
  { value: 'packaged_clean', label: 'Food-grade Packaged & Labeled' },
  { value: 'containers_needed', label: 'Bulk / Bring Your Own Containers' },
];

const ALLERGEN_OPTIONS = ['Dairy', 'Gluten', 'Nuts', 'Peanuts', 'Soy', 'Eggs', 'Seafood', 'Mustard', 'None'];

const STEPS = ['Food Details', 'Pickup & Safety', 'Review & Publish'];

export default function CreateDonationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState<CreateFoodListingForm>({
    title: '',
    description: '',
    category: 'Rice',
    foodType: 'veg',
    servings: 10,
    quantityUnit: 'servings',
    quantityValue: 10,
    preparationDate: new Date().toISOString().slice(0, 16),
    packagingType: 'sealed_boxes',
    packagingNotes: '',
    pickupAddress: user?.location?.address || '',
    city: user?.location?.city || '',
    contactPhone: user?.phone || '',
    specialInstructions: '',
    directHandover: true,
    availableFrom: new Date().toISOString().slice(0, 16),
    availableUntil: new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16),
    isUrgent: false,
    storageType: 'room_temp',
    allergens: [],
    safetyDeclarationSigned: false,
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (key: keyof CreateFoodListingForm, value: any) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo exceeds 5MB limit. Please choose a smaller image.');
      return;
    }
    update('imageFile', file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const canNext = () => {
    if (step === 0) {
      return !!form.title.trim() && form.servings > 0 && !!form.category;
    }
    if (step === 1) {
      return (
        !!form.pickupAddress.trim() &&
        !!form.city.trim() &&
        !!form.availableUntil &&
        new Date(form.availableUntil).getTime() > Date.now() &&
        !!form.safetyDeclarationSigned
      );
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!user || loading) return;
    if (!form.safetyDeclarationSigned) {
      setError('You must sign the Food Safety Declaration before publishing.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await DonationService.createListing(user.id, form);
      // Navigate to donor tracking page
      navigate('/donor-donations');
    } catch (err: any) {
      setError(err.message || 'Failed to create food donation listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Donate Surplus Food</h1>
        <p className={styles.subtitle}>
          List surplus meals quickly to connect with verified NGOs and volunteer riders
        </p>
      </div>

      {/* Step Indicator */}
      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <div
            key={i}
            className={`${styles.step} ${i === step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}
          >
            <div className={styles.stepBubble}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <span className={styles.stepLabel}>{s}</span>
            {i < STEPS.length - 1 && (
              <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ''}`} />
            )}
          </div>
        ))}
      </div>

      <div className={styles.card}>
        {error && (
          <div className={styles.errorBanner} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 0: Food Details */}
        {step === 0 && (
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>1. Food & Dietary Information</h2>

            <div className={styles.field}>
              <label className={styles.label}>Food Title *</label>
              <input
                className={styles.input}
                value={form.title}
                onChange={e => update('title', e.target.value)}
                placeholder="e.g., Vegetable Dum Biryani, Mixed Dal & Roti"
                required
              />
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Category *</label>
                <select
                  className={styles.input}
                  value={form.category}
                  onChange={e => update('category', e.target.value)}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Dietary Classification *</label>
                <select
                  className={styles.input}
                  value={form.foodType}
                  onChange={e => update('foodType', e.target.value as FoodType)}
                >
                  {FOOD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Estimated Servings / Meals *</label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={form.servings}
                  onChange={e => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    update('servings', val);
                    update('quantityValue', val);
                  }}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Quantity Unit</label>
                <select
                  className={styles.input}
                  value={form.quantityUnit || 'servings'}
                  onChange={e => update('quantityUnit', e.target.value)}
                >
                  {QUANTITY_UNITS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Prepared / Cooked Time</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={form.preparationDate || ''}
                  onChange={e => update('preparationDate', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Storage & Holding Condition *</label>
                <select
                  className={styles.input}
                  value={form.storageType}
                  onChange={e => update('storageType', e.target.value)}
                >
                  {STORAGE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Packaging Type</label>
                <select
                  className={styles.input}
                  value={form.packagingType}
                  onChange={e => update('packagingType', e.target.value)}
                >
                  {PACKAGING_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Packaging Notes (Optional)</label>
                <input
                  className={styles.input}
                  value={form.packagingNotes || ''}
                  onChange={e => update('packagingNotes', e.target.value)}
                  placeholder="e.g., Packed in 5 large foil trays with lids"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Allergens / Dietary Warnings</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {ALLERGEN_OPTIONS.map(a => {
                  const active = (form.allergens || []).includes(a);
                  return (
                    <button
                      type="button"
                      key={a}
                      onClick={() => {
                        const current = form.allergens || [];
                        const next = active ? current.filter(x => x !== a) : [...current, a];
                        update('allergens', next);
                      }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        border: `1.5px solid ${active ? '#ea580c' : '#d1d5db'}`,
                        background: active ? '#fff7ed' : '#ffffff',
                        color: active ? '#ea580c' : '#4b5563',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {a} {active && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Description & Ingredients</label>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="Include dish contents, spiciness, heating suggestions, or handling instructions..."
                rows={3}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Food Photograph (Recommended)</label>
              <label className={styles.uploadArea}>
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
                ) : (
                  <div className={styles.uploadPlaceholder}>
                    <Upload size={24} />
                    <span>Click or drag image to upload photo</span>
                    <span className={styles.uploadHint}>JPG, PNG, WEBP up to 5MB</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className={styles.fileInput}
                />
              </label>
            </div>

            <div className={styles.checkRow}>
              <input
                type="checkbox"
                id="urgent"
                checked={form.isUrgent}
                onChange={e => update('isUrgent', e.target.checked)}
              />
              <label htmlFor="urgent" className={styles.checkLabel} style={{ fontWeight: 600, color: '#dc2626' }}>
                🚨 Mark as Urgent (Requires rapid pickup within 1-2 hours)
              </label>
            </div>
          </div>
        )}

        {/* STEP 1: Pickup Details & Safety Declaration */}
        {step === 1 && (
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>2. Pickup Logistics & Safety Declaration</h2>

            <div className={styles.field}>
              <label className={styles.label}>Pickup Address *</label>
              <input
                className={styles.input}
                value={form.pickupAddress}
                onChange={e => update('pickupAddress', e.target.value)}
                placeholder="e.g., 42 Kitchen Garden Road, Bandra West"
                required
              />
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>City *</label>
                <input
                  className={styles.input}
                  value={form.city}
                  onChange={e => update('city', e.target.value)}
                  placeholder="e.g., Mumbai"
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Contact Phone for Rider Coordination</label>
                <input
                  className={styles.input}
                  value={form.contactPhone || ''}
                  onChange={e => update('contactPhone', e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Available From *</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={form.availableFrom}
                  onChange={e => update('availableFrom', e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Latest Collection Deadline (Expiry) *</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={form.availableUntil}
                  onChange={e => update('availableUntil', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Special Pickup Instructions</label>
              <input
                className={styles.input}
                value={form.specialInstructions || ''}
                onChange={e => update('specialInstructions', e.target.value)}
                placeholder="e.g., Ask for Chef Rohan at kitchen door #2, call when 5 mins away"
              />
            </div>

            <div className={styles.checkRow} style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                id="directHandover"
                checked={form.directHandover}
                onChange={e => update('directHandover', e.target.checked)}
              />
              <label htmlFor="directHandover" className={styles.checkLabel}>
                Staff will be on-site to hand over food directly to the rider or NGO representative
              </label>
            </div>

            {/* MANDATORY FOOD SAFETY DECLARATION */}
            <div style={{
              marginTop: 18,
              padding: 18,
              background: '#fef2f2',
              borderRadius: 12,
              border: '1.5px solid #fecaca',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <ShieldCheck size={22} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#991b1b' }}>
                  Mandatory Food Safety Certification
                </h3>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#7f1d1d', lineHeight: 1.5 }}>
                ShareBite connects donors directly with communities in need. To ensure consumer safety, all donors must verify that surplus food meets health & sanitation standards.
              </p>
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#1f2937',
              }}>
                <input
                  type="checkbox"
                  checked={!!form.safetyDeclarationSigned}
                  onChange={e => update('safetyDeclarationSigned', e.target.checked)}
                  style={{ marginTop: 3, width: 17, height: 17, accentColor: '#ea580c' }}
                />
                <span>
                  I declare under penalty of platform suspension that this food has been prepared hygienically, stored at appropriate temperatures, is not expired, and is safe and fit for human consumption. *
                </span>
              </label>
            </div>
          </div>
        )}

        {/* STEP 2: Review & Submit */}
        {step === 2 && (
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>3. Review Your Food Donation</h2>
            <div className={styles.reviewGrid}>
              {imagePreview && (
                <img src={imagePreview} alt="Food" className={styles.reviewImage} />
              )}
              <div className={styles.reviewDetails}>
                <div className={styles.reviewRow}>
                  <span>Title</span>
                  <strong>{form.title}</strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Category</span>
                  <strong>{form.category}</strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Dietary Type</span>
                  <strong style={{ textTransform: 'capitalize' }}>
                    {FOOD_TYPES.find(t => t.value === form.foodType)?.label || form.foodType}
                  </strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Total Servings</span>
                  <strong>{form.servings} portions ({form.quantityUnit})</strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Storage Condition</span>
                  <strong>
                    {STORAGE_TYPES.find(s => s.value === form.storageType)?.label || form.storageType}
                  </strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Packaging</span>
                  <strong>
                    {PACKAGING_TYPES.find(p => p.value === form.packagingType)?.label || form.packagingType}
                  </strong>
                </div>
                {form.allergens && form.allergens.length > 0 && (
                  <div className={styles.reviewRow}>
                    <span>Allergens</span>
                    <strong style={{ color: '#ea580c' }}>{form.allergens.join(', ')}</strong>
                  </div>
                )}
                <div className={styles.reviewRow}>
                  <span>Pickup Location</span>
                  <strong>{form.pickupAddress}, {form.city}</strong>
                </div>
                <div className={styles.reviewRow}>
                  <span>Collection Deadline</span>
                  <strong>{new Date(form.availableUntil).toLocaleString()}</strong>
                </div>
                {form.isUrgent && (
                  <div className={styles.urgentTag}>⚠️ Urgent Listing (Priority Pickup)</div>
                )}
                <div style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#16a34a',
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  <ShieldCheck size={16} /> Food Safety Declaration Signed
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className={styles.navBtns}>
          {step > 0 && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setStep(s => s - 1)}
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}

          {step < 2 ? (
            <button
              type="button"
              className={styles.nextBtn}
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              style={{
                opacity: canNext() ? 1 : 0.6,
                cursor: canNext() ? 'pointer' : 'not-allowed',
              }}
            >
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className={styles.nextBtn}
              onClick={handleSubmit}
              disabled={loading || !form.safetyDeclarationSigned}
              style={{
                background: '#ea580c',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? 'Publishing to Network...' : 'Publish Food Donation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
