import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Plus,
  RefreshCw,
  Loader2,
  Phone,
  Mail,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  ClipboardList,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  NGOOperationsService,
  type NGOVolunteer,
} from '../../services/ngoOperations';
import type { NgoClaim } from '../../services/claims';
import styles from './NGOPortalSubpages.module.css';

const ROLE_LABELS: Record<NGOVolunteer['volunteerRole'], string> = {
  collector: 'Food Collector',
  coordinator: 'Coordinator',
  distributor: 'Distributor',
  driver: 'NGO Driver',
};

export default function NGOVolunteersPage() {
  const { user } = useAuth();
  const ngoId = user?.id || '';
  const orgName = user?.organizationName || user?.name || 'Your NGO';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [volunteers, setVolunteers] = useState<NGOVolunteer[]>([]);
  const [activeCollections, setActiveCollections] = useState<NgoClaim[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [volunteerRole, setVolunteerRole] = useState<NGOVolunteer['volunteerRole']>('collector');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async (silent = false) => {
    if (!ngoId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [volRes, bundle] = await Promise.all([
        NGOOperationsService.getVolunteers(ngoId),
        NGOOperationsService.getDashboardBundle(ngoId),
      ]);
      setVolunteers(volRes.volunteers);
      setTableMissing(volRes.tableMissing);
      setActiveCollections(bundle.activeCollections);
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Failed to load volunteers.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ngoId]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const handleAddVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ngoId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const created = await NGOOperationsService.addVolunteer(ngoId, {
        fullName,
        email,
        phone,
        volunteerRole,
        notes,
      });
      setVolunteers((prev) => [created, ...prev]);
      setFullName('');
      setEmail('');
      setPhone('');
      setVolunteerRole('collector');
      setNotes('');
      setShowAddForm(false);
      setFeedback({ type: 'ok', text: `${created.fullName} added to ${orgName}'s volunteer roster.` });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Could not add volunteer.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (v: NGOVolunteer) => {
    if (!ngoId) return;
    setBusyId(v.id);
    setFeedback(null);
    try {
      const updated = await NGOOperationsService.updateVolunteer(v.id, ngoId, {
        isAvailable: !v.isAvailable,
      });
      setVolunteers((prev) => prev.map((item) => (item.id === v.id ? updated : item)));
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Could not update availability.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (v: NGOVolunteer) => {
    if (!ngoId) return;
    setBusyId(v.id);
    setFeedback(null);
    try {
      const updated = await NGOOperationsService.updateVolunteer(v.id, ngoId, {
        isActive: !v.isActive,
        isAvailable: v.isActive ? false : v.isAvailable,
      });
      setVolunteers((prev) => prev.map((item) => (item.id === v.id ? updated : item)));
      setFeedback({
        type: 'ok',
        text: updated.isActive ? `${v.fullName} reactivated.` : `${v.fullName} deactivated.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Could not update volunteer status.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleAssignTask = async (v: NGOVolunteer, claimId: string) => {
    if (!ngoId) return;
    setBusyId(v.id);
    setFeedback(null);
    try {
      const chosen = activeCollections.find((c) => c.id === claimId);
      const updated = await NGOOperationsService.updateVolunteer(v.id, ngoId, {
        assignedClaimId: claimId || null,
        assignedTaskLabel: chosen ? `${chosen.foodTitle || 'Food Collection'} (${chosen.servingsClaimed} servings)` : null,
      });
      setVolunteers((prev) => prev.map((item) => (item.id === v.id ? updated : item)));
      setFeedback({
        type: 'ok',
        text: chosen
          ? `Assigned ${v.fullName} to "${chosen.foodTitle || 'Food Collection'}".`
          : `Cleared active assignment for ${v.fullName}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Could not assign task.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkTaskDone = async (v: NGOVolunteer) => {
    if (!ngoId) return;
    setBusyId(v.id);
    setFeedback(null);
    try {
      const updated = await NGOOperationsService.updateVolunteer(v.id, ngoId, {
        assignedClaimId: null,
        assignedTaskLabel: null,
        completedCollections: v.completedCollections + 1,
      });
      setVolunteers((prev) => prev.map((item) => (item.id === v.id ? updated : item)));
      setFeedback({
        type: 'ok',
        text: `Logged completed collection for ${v.fullName} (Total: ${updated.completedCollections}).`,
      });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Could not log completion.' });
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = volunteers.filter((v) => v.isActive).length;
  const availableCount = volunteers.filter((v) => v.isActive && v.isAvailable).length;
  const totalVolCollections = volunteers.reduce((sum, v) => sum + v.completedCollections, 0);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Volunteer Management</h1>
          <p className={styles.pageSub}>
            Manage {orgName}'s collection and distribution volunteers with strict organization-scoped access.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.outlineBtn} onClick={() => loadData(true)}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setShowAddForm((prev) => !prev)}
            data-testid="ngo-add-volunteer-btn"
          >
            {showAddForm ? <X size={15} /> : <Plus size={15} />}
            {showAddForm ? 'Close Form' : 'Add Volunteer'}
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className={styles.bannerWarn}>
          <AlertTriangle size={18} />
          <span>
            The <code>ngo_volunteers</code> table is not active on Supabase yet. Run{' '}
            <strong>supabase/migrations/20261128_ngo_portal_complete.sql</strong> in your Supabase SQL Editor to enable full volunteer persistence.
          </span>
        </div>
      )}

      {feedback && (
        <div className={feedback.type === 'ok' ? styles.bannerOk : styles.bannerErr}>
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Active Volunteers</div>
          <div className={styles.kpiValue}>{activeCount}</div>
          <div className={styles.kpiSub}>of {volunteers.length} registered</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Available Right Now</div>
          <div className={styles.kpiValue} style={{ color: '#16a34a' }}>{availableCount}</div>
          <div className={styles.kpiSub}>Ready for pickup & distribution</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Volunteer Collections Logged</div>
          <div className={styles.kpiValue}>{totalVolCollections}</div>
          <div className={styles.kpiSub}>Verified handoffs completed</div>
        </div>
      </div>

      {showAddForm && (
        <form className={styles.formCard} onSubmit={handleAddVolunteer}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: '#192538' }}>
            Register Organization Volunteer
          </h3>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Full Name *</label>
              <input
                className={styles.input}
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Priya Verma"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Role</label>
              <select
                className={styles.select}
                value={volunteerRole}
                onChange={(e) => setVolunteerRole(e.target.value as NGOVolunteer['volunteerRole'])}
              >
                <option value="collector">Food Collector</option>
                <option value="coordinator">Coordinator</option>
                <option value="distributor">Distributor</option>
                <option value="driver">NGO Driver</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Phone</label>
              <input
                className={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98XXXXXXXX"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email</label>
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="volunteer@ngo.org"
              />
            </div>
          </div>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.fieldLabel}>Notes / Shift Availability</label>
            <textarea
              className={styles.textarea}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Available evenings 6 PM - 10 PM, owns scooter"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" className={styles.outlineBtn} onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Volunteer
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={styles.emptyPanel}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#ea580c' }} />
          <p>Loading organization volunteers...</p>
        </div>
      ) : volunteers.length === 0 ? (
        <div className={styles.emptyPanel}>
          <Users size={34} color="#ea580c" />
          <h3>No volunteers registered yet</h3>
          <p>
            Add your NGO's food collectors, drivers, and distribution coordinators to assign active pickups and track completed handoffs.
          </p>
          <button type="button" className={styles.primaryBtn} onClick={() => setShowAddForm(true)}>
            <Plus size={14} /> Add Your First Volunteer
          </button>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {volunteers.map((v) => (
            <div key={v.id} className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.cardTitleRow}>
                  <div>
                    <h3 className={styles.cardTitle}>{v.fullName}</h3>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                      {ROLE_LABELS[v.volunteerRole]} · {v.completedCollections} completed
                    </span>
                  </div>
                  <span
                    className={`${styles.pill} ${
                      !v.isActive
                        ? styles.pillMuted
                        : v.isAvailable
                        ? styles.pillGreen
                        : styles.pillAmber
                    }`}
                  >
                    {!v.isActive ? 'Inactive' : v.isAvailable ? 'Available' : 'Busy'}
                  </span>
                </div>

                <div className={styles.metaGrid}>
                  {v.phone && (
                    <span className={styles.metaItem}><Phone size={12} /> {v.phone}</span>
                  )}
                  {v.email && (
                    <span className={styles.metaItem}><Mail size={12} /> {v.email}</span>
                  )}
                </div>

                {v.notes && (
                  <p style={{ margin: 0, fontSize: 12.5, color: '#475569' }}>{v.notes}</p>
                )}

                {v.assignedTaskLabel && (
                  <div
                    style={{
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      borderRadius: 10,
                      padding: '8px 10px',
                      fontSize: 12.5,
                      color: '#9a3412',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ClipboardList size={13} /> <strong>Assigned:</strong> {v.assignedTaskLabel}
                    </span>
                    <button
                      type="button"
                      className={styles.outlineBtn}
                      style={{ padding: '4px 8px', fontSize: 11.5 }}
                      disabled={busyId === v.id}
                      onClick={() => handleMarkTaskDone(v)}
                    >
                      <CheckCircle2 size={12} /> Done
                    </button>
                  </div>
                )}

                {v.isActive && activeCollections.length > 0 && (
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Assign Collection Task</label>
                    <select
                      className={styles.select}
                      value={v.assignedClaimId || ''}
                      disabled={busyId === v.id}
                      onChange={(e) => handleAssignTask(v, e.target.value)}
                    >
                      <option value="">-- No active task --</option>
                      {activeCollections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.foodTitle || 'Food Collection'} ({c.servingsClaimed} servings)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.cardActions}>
                  {v.isActive && (
                    <button
                      type="button"
                      className={styles.outlineBtn}
                      disabled={busyId === v.id}
                      onClick={() => handleToggleAvailability(v)}
                    >
                      <UserCheck size={13} />
                      {v.isAvailable ? 'Mark Busy' : 'Mark Available'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={v.isActive ? styles.dangerBtn : styles.outlineBtn}
                    disabled={busyId === v.id}
                    onClick={() => handleToggleActive(v)}
                  >
                    {v.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                    {v.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
