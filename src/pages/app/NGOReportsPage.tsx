import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Printer,
  RefreshCw,
  Loader2,
  BarChart3,
  Users,
  Scale,
  CheckCircle2,
  Truck,
  Building2,
  AlertTriangle,
  ClipboardCheck,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  NGOOperationsService,
  ESTIMATED_KG_PER_SERVING,
  estimateFoodWeightKg,
  type NGOFoodRequest,
} from '../../services/ngoOperations';
import type { NgoClaim, DistributionRecord } from '../../services/claims';
import styles from './NGOPortalSubpages.module.css';

type RangeKey = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

function getRangeBounds(range: RangeKey, customStart: string, customEnd: string): { start: number; end: number; label: string } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return { start, end: endOfToday, label: 'Today' };
  }
  if (range === '7d') {
    return { start: endOfToday - 7 * 86400000, end: endOfToday, label: 'Last 7 Days' };
  }
  if (range === '30d') {
    return { start: endOfToday - 30 * 86400000, end: endOfToday, label: 'Last 30 Days' };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    return { start, end: endOfToday, label: 'This Month' };
  }
  if (range === 'custom') {
    const start = customStart ? new Date(`${customStart}T00:00:00`).getTime() : 0;
    const end = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : endOfToday;
    return {
      start: Number.isNaN(start) ? 0 : start,
      end: Number.isNaN(end) ? endOfToday : end,
      label: `${customStart || 'Start'} to ${customEnd || 'Today'}`,
    };
  }
  return { start: 0, end: endOfToday, label: 'All Time' };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function NGOReportsPage() {
  const { user } = useAuth();
  const ngoId = user?.id || '';
  const orgName = user?.organizationName || user?.name || 'NGO Organization';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claims, setClaims] = useState<NgoClaim[]>([]);
  const [records, setRecords] = useState<DistributionRecord[]>([]);
  const [requests, setRequests] = useState<NGOFoodRequest[]>([]);

  const [range, setRange] = useState<RangeKey>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const loadData = useCallback(async (silent = false) => {
    if (!ngoId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const bundle = await NGOOperationsService.getDashboardBundle(ngoId);
      setClaims(bundle.claims);
      setRecords(bundle.distributionRecords);
      setRequests(bundle.foodRequests);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ngoId]);

  useEffect(() => {
    loadData(false);
    if (!ngoId) return;
    const sub = NGOOperationsService.subscribeToNgoPortal(ngoId, () => loadData(true));
    return () => sub.unsubscribe();
  }, [ngoId, loadData]);

  const bounds = useMemo(
    () => getRangeBounds(range, customStart, customEnd),
    [range, customStart, customEnd]
  );

  const filteredClaims = useMemo(
    () =>
      claims.filter((c) => {
        const ts = new Date(c.createdAt).getTime();
        return ts >= bounds.start && ts <= bounds.end;
      }),
    [claims, bounds]
  );

  const filteredRecords = useMemo(
    () =>
      records.filter((r) => {
        const ts = new Date(r.receiptConfirmedAt || r.createdAt).getTime();
        return ts >= bounds.start && ts <= bounds.end;
      }),
    [records, bounds]
  );

  const filteredRequests = useMemo(
    () =>
      requests.filter((req) => {
        const ts = new Date(req.createdAt).getTime();
        return ts >= bounds.start && ts <= bounds.end;
      }),
    [requests, bounds]
  );

  const metrics = useMemo(() => {
    const validRecords = filteredRecords.filter(
      (r) => !r.safetyConcern && r.status !== 'rejected' && r.status !== 'discarded'
    );
    const totalReceived = validRecords.reduce((sum, r) => sum + Math.max(0, r.quantityReceived - r.quantityRejected), 0);
    const totalDistributed = validRecords.reduce((sum, r) => sum + r.quantityDistributed, 0);
    const totalRejected = filteredRecords.reduce(
      (sum, r) => sum + r.quantityRejected + (r.safetyConcern ? r.quantityReceived : 0),
      0
    );

    let peopleFed = 0;
    let peopleFedEstimated = false;
    for (const r of validRecords) {
      if (r.peopleServed != null && r.peopleServed > 0) {
        peopleFed += r.peopleServed;
      } else if (r.quantityDistributed > 0) {
        peopleFed += Math.round(r.quantityDistributed);
        peopleFedEstimated = true;
      }
    }

    const { kg: foodSavedKg, isEstimated: foodSavedEstimated } = estimateFoodWeightKg(filteredRecords);

    const completedCollections = filteredClaims.filter(
      (c) => c.deliveryStatus === 'completed' || c.status === 'distributed' || c.status === 'delivered'
    ).length;

    const riderAssistedCount = filteredClaims.filter(
      (c) => c.collectionMethod !== 'direct_ngo_pickup'
    ).length;
    const directCollectionCount = filteredClaims.filter(
      (c) => c.collectionMethod === 'direct_ngo_pickup'
    ).length;

    const uniqueDonors = new Set(
      filteredClaims.map((c) => c.donorId || c.donorName).filter(Boolean)
    ).size;

    const fulfilledRequests = filteredRequests.filter((r) => r.status === 'FULFILLED').length;
    const activeRequests = filteredRequests.filter(
      (r) => r.status === 'OPEN' || r.status === 'PARTIALLY_FULFILLED'
    ).length;

    return {
      totalReceived,
      totalDistributed,
      totalRejected,
      peopleFed,
      peopleFedEstimated,
      foodSavedKg,
      foodSavedEstimated,
      completedCollections,
      riderAssistedCount,
      directCollectionCount,
      uniqueDonors,
      fulfilledRequests,
      activeRequests,
    };
  }, [filteredClaims, filteredRecords, filteredRequests]);

  // Real daily breakdown (last 7 active dates in filtered range)
  const dailyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRecords) {
      if (r.safetyConcern || r.status === 'rejected') continue;
      const dayKey = new Date(r.receiptConfirmedAt || r.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      });
      map.set(dayKey, (map.get(dayKey) || 0) + Math.max(0, r.quantityReceived - r.quantityRejected));
    }
    return Array.from(map.entries()).slice(0, 7);
  }, [filteredRecords]);

  // Real distribution method breakdown
  const methodBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRecords) {
      if (r.quantityDistributed <= 0) continue;
      const label = (r.distributionMethod || 'direct')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
      map.set(label, (map.get(label) || 0) + r.quantityDistributed);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRecords]);

  const handleExportCsv = () => {
    const headers = [
      'Record ID',
      'Date',
      'Quantity Received',
      'Quantity Distributed',
      'Quantity Remaining',
      'Quantity Rejected',
      'Unit',
      'People Served',
      'Distribution Method',
      'Location',
      'Safety Flagged',
      'Status',
    ];

    const rows = filteredRecords.map((r) => [
      r.id,
      new Date(r.receiptConfirmedAt || r.createdAt).toISOString(),
      r.quantityReceived,
      r.quantityDistributed,
      r.quantityRemaining,
      r.quantityRejected,
      r.quantityUnit,
      r.peopleServed ?? '',
      r.distributionMethod || '',
      r.distributionLocation || '',
      r.safetyConcern ? 'YES' : 'NO',
      r.status,
    ]);

    const summaryLines = [
      ['ShareBite NGO Impact Report', orgName],
      ['Date Range', bounds.label],
      ['Total Verified Received (servings)', metrics.totalReceived],
      ['Total Distributed (servings)', metrics.totalDistributed],
      ['People Fed', metrics.peopleFed],
      ['Food Saved (kg)', `${metrics.foodSavedKg}${metrics.foodSavedEstimated ? ' (est.)' : ''}`],
      ['Completed Collections', metrics.completedCollections],
      ['Rider-Assisted Collections', metrics.riderAssistedCount],
      ['Direct NGO Collections', metrics.directCollectionCount],
      ['Participating Donors', metrics.uniqueDonors],
      ['Rejected / Unsafe Qty', metrics.totalRejected],
      [],
      headers,
      ...rows,
    ];

    const csv = summaryLines.map((line) => line.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sharebite-ngo-report-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const maxDaily = Math.max(1, ...dailyBreakdown.map(([, val]) => val));
  const maxMethod = Math.max(1, ...methodBreakdown.map(([, val]) => val));
  const totalModeClaims = Math.max(1, metrics.riderAssistedCount + metrics.directCollectionCount);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Impact & Operations Reports</h1>
          <p className={styles.pageSub}>
            Real food rescue, receipt, and beneficiary distribution analytics for <strong>{orgName}</strong> ({bounds.label}).
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.outlineBtn} onClick={() => loadData(true)}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className={styles.outlineBtn}
            onClick={handleExportCsv}
            data-testid="ngo-export-csv-btn"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => window.print()}
            data-testid="ngo-print-report-btn"
          >
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Date Range Filters */}
      <div className={styles.filterBar}>
        <Calendar size={15} color="#ea580c" />
        {(
          [
            ['today', 'Today'],
            ['7d', 'Last 7 Days'],
            ['30d', 'Last 30 Days'],
            ['month', 'This Month'],
            ['all', 'All Time'],
            ['custom', 'Custom'],
          ] as [RangeKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.tabBtn} ${range === key ? styles.tabBtnActive : ''}`}
            onClick={() => setRange(key)}
            style={{ padding: '7px 12px', fontSize: 12.5 }}
          >
            {label}
          </button>
        ))}

        {range === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              className={styles.filterSelect}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              aria-label="Start date"
            />
            <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
            <input
              type="date"
              className={styles.filterSelect}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              aria-label="End date"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.emptyPanel}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#ea580c' }} />
          <p>Aggregating verified collection and distribution records...</p>
        </div>
      ) : (
        <>
          {/* Real KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><CheckCircle2 size={13} style={{ display: 'inline', marginRight: 4, color: '#16a34a' }} />Verified Food Received</div>
              <div className={styles.kpiValue} data-testid="report-kpi-received">{metrics.totalReceived}</div>
              <div className={styles.kpiSub}>servings received (excludes rejected)</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><Users size={13} style={{ display: 'inline', marginRight: 4, color: '#2563eb' }} />People Fed</div>
              <div className={styles.kpiValue} data-testid="report-kpi-people">{metrics.peopleFed}</div>
              <div className={styles.kpiSub}>
                {metrics.peopleFedEstimated ? 'Includes estimated servings-to-people' : 'Verified beneficiary count'}
              </div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><Scale size={13} style={{ display: 'inline', marginRight: 4, color: '#9333ea' }} />Food Saved from Waste</div>
              <div className={styles.kpiValue} data-testid="report-kpi-kg">{metrics.foodSavedKg} kg</div>
              <div className={styles.kpiSub}>
                {metrics.foodSavedEstimated ? `Est. at ${ESTIMATED_KG_PER_SERVING} kg/serving` : 'Verified weight'}
              </div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><Truck size={13} style={{ display: 'inline', marginRight: 4, color: '#ea580c' }} />Completed Collections</div>
              <div className={styles.kpiValue}>{metrics.completedCollections}</div>
              <div className={styles.kpiSub}>{filteredClaims.length} total claims in range</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><Building2 size={13} style={{ display: 'inline', marginRight: 4, color: '#0f766e' }} />Participating Donors</div>
              <div className={styles.kpiValue}>{metrics.uniqueDonors}</div>
              <div className={styles.kpiSub}>Unique donors rescued from</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><ClipboardCheck size={13} style={{ display: 'inline', marginRight: 4, color: '#16a34a' }} />Food Requests Fulfilled</div>
              <div className={styles.kpiValue}>{metrics.fulfilledRequests}</div>
              <div className={styles.kpiSub}>{metrics.activeRequests} open / partially fulfilled</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><BarChart3 size={13} style={{ display: 'inline', marginRight: 4, color: '#f97316' }} />Total Distributed</div>
              <div className={styles.kpiValue}>{metrics.totalDistributed}</div>
              <div className={styles.kpiSub}>servings distributed to community</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}><AlertTriangle size={13} style={{ display: 'inline', marginRight: 4, color: '#dc2626' }} />Rejected / Unsafe Qty</div>
              <div className={styles.kpiValue} style={{ color: metrics.totalRejected > 0 ? '#dc2626' : '#192538' }}>
                {metrics.totalRejected}
              </div>
              <div className={styles.kpiSub}>Excluded from saved & fed metrics</div>
            </div>
          </div>

          {/* Data-Driven Visualizations */}
          <div className={styles.chartsGrid}>
            {/* Daily Collections */}
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Daily Verified Food Received (servings)</h3>
              {dailyBreakdown.length === 0 ? (
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  No verified food receipts recorded in this date range.
                </p>
              ) : (
                dailyBreakdown.map(([day, qty]) => (
                  <div key={day} className={styles.barRow}>
                    <span className={styles.barLabel}>{day}</span>
                    <div className={styles.barTrack}>
                      <div className={styles.barFill} style={{ width: `${Math.max(4, (qty / maxDaily) * 100)}%` }} />
                    </div>
                    <span className={styles.barVal}>{qty}</span>
                  </div>
                ))
              )}
            </div>

            {/* Collection Mode Split */}
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Collection Mode Breakdown</h3>
              {filteredClaims.length === 0 ? (
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  No claims recorded in this date range.
                </p>
              ) : (
                <>
                  <div className={styles.barRow}>
                    <span className={styles.barLabel}>Rider-Assisted</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${(metrics.riderAssistedCount / totalModeClaims) * 100}%`,
                          background: '#2563eb',
                        }}
                      />
                    </div>
                    <span className={styles.barVal}>{metrics.riderAssistedCount}</span>
                  </div>
                  <div className={styles.barRow}>
                    <span className={styles.barLabel}>Direct NGO</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${(metrics.directCollectionCount / totalModeClaims) * 100}%`,
                          background: '#16a34a',
                        }}
                      />
                    </div>
                    <span className={styles.barVal}>{metrics.directCollectionCount}</span>
                  </div>
                </>
              )}

              <h3 className={styles.chartTitle} style={{ marginTop: 22 }}>Distribution Channel Breakdown</h3>
              {methodBreakdown.length === 0 ? (
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  Record distributions in Received Food to see channel breakdowns.
                </p>
              ) : (
                methodBreakdown.map(([method, qty]) => (
                  <div key={method} className={styles.barRow}>
                    <span className={styles.barLabel} title={method}>{method}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${Math.max(4, (qty / maxMethod) * 100)}%`,
                          background: '#ea580c',
                        }}
                      />
                    </div>
                    <span className={styles.barVal}>{qty}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
