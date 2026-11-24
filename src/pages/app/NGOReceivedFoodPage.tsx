import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  CheckCircle2,
  AlertTriangle,
  PieChart,
  Users,
  Clock,
  Loader2,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import {
  ClaimsService,
  type DistributionRecord,
  type NgoClaim,
} from '../../services/claims';
import { NGOOperationsService } from '../../services/ngoOperations';
import styles from './NGOPortalSubpages.module.css';

function getInventoryStatus(rec: DistributionRecord): {
  label: string;
  tone: string;
} {
  if (rec.safetyConcern || rec.status === 'rejected') {
    return { label: 'REJECTED', tone: styles.pillRed };
  }
  if (rec.status === 'discarded') {
    return { label: 'DISCARDED', tone: styles.pillMuted };
  }
  if (rec.quantityRemaining <= 0 && rec.quantityDistributed > 0) {
    return { label: 'DISTRIBUTED', tone: styles.pillGreen };
  }
  if (rec.quantityDistributed > 0 && rec.quantityRemaining > 0) {
    return { label: 'PARTIALLY DISTRIBUTED', tone: styles.pillBlue };
  }
  return { label: 'AVAILABLE FOR DISTRIBUTION', tone: styles.pillOrange };
}

export default function NGOReceivedFoodPage() {
  const { user } = useAuth();
  const userId = user?.id;

  const [records, setRecords] = useState<DistributionRecord[]>([]);
  const [claimsById, setClaimsById] = useState<Record<string, NgoClaim>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Active distribution recorder state per record
  const [activeRecId, setActiveRecId] = useState<string | null>(null);
  const [distQty, setDistQty] = useState<number>(0);
  const [peopleServed, setPeopleServed] = useState<string>('');
  const [distMethod, setDistMethod] = useState<string>('shelter_meal');
  const [distLocation, setDistLocation] = useState<string>('');
  const [distNotes, setDistNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(
    async (silent = false) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      try {
        const [distRecs, claims] = await Promise.all([
          ClaimsService.getDistributionRecords(userId),
          ClaimsService.getMyClaims(userId),
        ]);
        setRecords(distRecs);
        const map: Record<string, NgoClaim> = {};
        for (const c of claims) {
          map[c.id] = c;
          if (c.foodListingId) map[c.foodListingId] = c;
        }
        setClaimsById(map);
      } catch (e: any) {
        if (!silent) setBanner({ kind: 'err', text: e?.message || 'Failed to load received food records.' });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    loadData(false);
    if (!userId) return;
    const sub = NGOOperationsService.subscribeToNgoPortal(userId, () => loadData(true));
    return () => sub.unsubscribe();
  }, [userId, loadData]);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const inv = getInventoryStatus(rec);
      if (statusFilter !== 'all' && inv.label !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const claim = (rec.claimId && claimsById[rec.claimId]) || claimsById[rec.foodListingId];
        const hay = `${claim?.foodTitle || ''} ${claim?.donorName || ''} ${rec.distributionLocation || ''} ${rec.conditionNotes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, statusFilter, searchQuery, claimsById]);

  const openDistributor = (rec: DistributionRecord) => {
    setActiveRecId(rec.id);
    setDistQty(rec.quantityRemaining);
    setPeopleServed(rec.quantityRemaining > 0 ? String(Math.round(rec.quantityRemaining)) : '');
    setDistMethod('shelter_meal');
    setDistLocation(rec.distributionLocation || user?.location?.address || '');
    setDistNotes('');
  };

  const handleRecordDistribution = async (rec: DistributionRecord) => {
    if (submitting) return;
    if (distQty <= 0) {
      setBanner({ kind: 'err', text: 'Distribution quantity must be greater than 0.' });
      return;
    }
    if (distQty > rec.quantityRemaining) {
      setBanner({
        kind: 'err',
        text: `Distributed quantity (${distQty}) cannot exceed available remaining quantity (${rec.quantityRemaining}).`,
      });
      return;
    }

    setSubmitting(true);
    setBanner(null);
    try {
      await ClaimsService.recordDistribution(
        rec.id,
        distQty,
        peopleServed ? Number(peopleServed) : undefined,
        undefined,
        distMethod,
        distLocation || undefined,
        distNotes || undefined
      );
      setBanner({
        kind: 'ok',
        text: `✓ Recorded distribution of ${distQty} ${rec.quantityUnit}. Impact statistics updated.`,
      });
      setActiveRecId(null);
      await loadData(true);
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Failed to record distribution.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Summary inventory totals (excluding safety-flagged / rejected food)
  const validRecords = records.filter((r) => !r.safetyConcern && r.status !== 'rejected');
  const totalReceived = validRecords.reduce((s, r) => s + r.quantityReceived, 0);
  const totalDistributed = validRecords.reduce((s, r) => s + r.quantityDistributed, 0);
  const totalRemaining = validRecords.reduce((s, r) => s + r.quantityRemaining, 0);
  const totalRejected = records.reduce(
    (s, r) => s + (r.safetyConcern || r.status === 'rejected' ? r.quantityReceived : r.quantityRejected),
    0
  );

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Received Food & Distribution Inventory</h1>
          <p className={styles.pageSub}>
            Verified food receipts, safety status, remaining inventory, and beneficiary distribution logs
          </p>
        </div>
      </div>

      {banner && (
        <div className={banner.kind === 'ok' ? styles.bannerOk : styles.bannerErr}>
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Real Inventory KPI Strip */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Verified Received</div>
          <div className={styles.kpiValue}>{totalReceived}</div>
          <div className={styles.kpiSub}>Accepted units across {validRecords.length} receipts</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Distributed</div>
          <div className={styles.kpiValue} style={{ color: '#16A34A' }}>{totalDistributed}</div>
          <div className={styles.kpiSub}>Served to beneficiaries</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Available in Inventory</div>
          <div className={styles.kpiValue} style={{ color: '#EA580C' }}>{totalRemaining}</div>
          <div className={styles.kpiSub}>Ready for distribution</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Rejected / Unsafe</div>
          <div className={styles.kpiValue} style={{ color: '#B91C1C' }}>{totalRejected}</div>
          <div className={styles.kpiSub}>Excluded from impact totals</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={15} color="#94a3b8" />
          <input
            className={styles.searchInput}
            placeholder="Search received food, donor, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Inventory Statuses</option>
          <option value="AVAILABLE FOR DISTRIBUTION">Available for Distribution</option>
          <option value="PARTIALLY DISTRIBUTED">Partially Distributed</option>
          <option value="DISTRIBUTED">Fully Distributed</option>
          <option value="REJECTED">Rejected / Safety Flagged</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.emptyPanel}>
          <Loader2 size={28} className="animate-spin" color="#EA580C" />
          <p>Loading received food inventory...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className={styles.emptyPanel}>
          <ShoppingBag size={36} color="#CBD5E1" />
          <h3>No received food records yet</h3>
          <p>
            Once your NGO acknowledges receipt on an Active Collection, it appears here so you can manage inventory and log beneficiary distribution.
          </p>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {filteredRecords.map((rec) => {
            const claim = (rec.claimId && claimsById[rec.claimId]) || claimsById[rec.foodListingId];
            const inv = getInventoryStatus(rec);
            const pct =
              rec.quantityReceived > 0
                ? Math.min(100, Math.round((rec.quantityDistributed / rec.quantityReceived) * 100))
                : 0;
            const isRecording = activeRecId === rec.id;

            return (
              <div key={rec.id} className={styles.card}>
                <div className={styles.cardBody}>
                  <div className={styles.cardTitleRow}>
                    <h3 className={styles.cardTitle}>
                      {claim?.foodTitle || 'Verified Food Receipt'}
                    </h3>
                    <span className={`${styles.pill} ${inv.tone}`}>{inv.label}</span>
                  </div>

                  <div className={styles.metaGrid}>
                    <span className={styles.metaItem}>
                      Donor: <strong>{claim?.donorName || 'Verified Donor'}</strong>
                    </span>
                    <span className={styles.metaItem}>
                      Mode:{' '}
                      <strong>
                        {claim?.collectionMethod === 'direct_ngo_pickup'
                          ? 'Direct NGO Collection'
                          : 'Rider-Assisted'}
                      </strong>
                    </span>
                    {claim?.riderName && (
                      <span className={styles.metaItem}>Rider: {claim.riderName}</span>
                    )}
                    <span className={styles.metaItem}>
                      <Clock size={12} />{' '}
                      {formatDistanceToNow(new Date(rec.receiptConfirmedAt || rec.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  {rec.safetyConcern ? (
                    <div className={styles.bannerErr} style={{ padding: '8px 12px', fontSize: 12 }}>
                      <AlertTriangle size={14} />
                      <span>
                        Safety Concern Flagged — Distribution blocked & excluded from impact stats.
                        {rec.safetyNotes ? ` (${rec.safetyNotes})` : ''}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: '#64748b',
                            marginBottom: 4,
                          }}
                        >
                          <span>
                            Distributed: <strong>{rec.quantityDistributed}</strong> / {rec.quantityReceived}{' '}
                            {rec.quantityUnit}
                          </span>
                          <span>
                            Remaining: <strong>{rec.quantityRemaining}</strong>
                          </span>
                        </div>
                        <div className={styles.progressTrack}>
                          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      {rec.peopleServed != null && rec.peopleServed > 0 && (
                        <div style={{ fontSize: 12.5, color: '#15803d', fontWeight: 700, display: 'flex', gap: 5, alignItems: 'center' }}>
                          <Users size={13} /> {rec.peopleServed} beneficiaries served
                        </div>
                      )}
                    </>
                  )}

                  {rec.conditionNotes && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Condition notes: {rec.conditionNotes}
                    </div>
                  )}

                  {/* Inline Distribution Form */}
                  {isRecording && !rec.safetyConcern && rec.quantityRemaining > 0 && (
                    <div
                      style={{
                        background: '#faf7f2',
                        border: '1px solid #f1e4d3',
                        borderRadius: 12,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div className={styles.formGrid} style={{ gap: 10 }}>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>
                            Quantity to Distribute (max {rec.quantityRemaining})
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={rec.quantityRemaining}
                            className={styles.input}
                            value={distQty}
                            onChange={(e) => setDistQty(Number(e.target.value) || 0)}
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Beneficiaries Served (count)</label>
                          <input
                            type="number"
                            min={0}
                            className={styles.input}
                            value={peopleServed}
                            onChange={(e) => setPeopleServed(e.target.value)}
                            placeholder="e.g., 30"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Distribution Category</label>
                          <select
                            className={styles.select}
                            value={distMethod}
                            onChange={(e) => setDistMethod(e.target.value)}
                          >
                            <option value="shelter_meal">Shelter Meal Service</option>
                            <option value="community_kitchen">Community Kitchen</option>
                            <option value="direct">Direct Handout</option>
                            <option value="food_bank">Food Bank Distribution</option>
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Location / Area</label>
                          <input
                            className={styles.input}
                            value={distLocation}
                            onChange={(e) => setDistLocation(e.target.value)}
                            placeholder="e.g., Main shelter dining hall"
                          />
                        </div>
                      </div>
                      <input
                        className={styles.input}
                        value={distNotes}
                        onChange={(e) => setDistNotes(e.target.value)}
                        placeholder="Operational distribution notes (optional)"
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className={styles.outlineBtn}
                          onClick={() => setActiveRecId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          data-testid="submit-distribution-btn"
                          disabled={submitting}
                          onClick={() => handleRecordDistribution(rec)}
                        >
                          {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Save Distribution
                        </button>
                      </div>
                    </div>
                  )}

                  {!rec.safetyConcern && rec.quantityRemaining > 0 && !isRecording && (
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        data-testid="open-distribution-btn"
                        onClick={() => openDistributor(rec)}
                        style={{ padding: '8px 14px', fontSize: 12.5 }}
                      >
                        <PieChart size={14} /> Record Distribution
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
