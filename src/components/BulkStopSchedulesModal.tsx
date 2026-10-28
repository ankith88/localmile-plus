import React, { useMemo, useState } from 'react';
import { Calendar, X, RefreshCw, Trash2, Search, Building2, MapPin, Clock, AlertTriangle, CheckSquare } from 'lucide-react';
import CustomDatePicker from './CustomDatePicker';
import { formatDateForInput, parseLocalDate } from '../utils/scheduling';

export interface ServiceBadgeConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  text: string;
}

interface BulkStopSchedulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: any[];
  selectedScheduleIds: Set<string>;
  onChangeSelectedIds: (nextIds: Set<string>) => void;
  onConfirm: (stopDate: string, targetScheduleIds: string[]) => Promise<void>;
  isSubmitting: boolean;
  getServiceConfig: (serviceName: string, itemUserRole?: string) => ServiceBadgeConfig;
  getParentName: (parentId?: string) => string;
}

interface CustomerScheduleGroup {
  key: string;
  companyName: string;
  suburb: string;
  state: string;
  parentName: string;
  schedules: any[];
}

const BulkStopSchedulesModal: React.FC<BulkStopSchedulesModalProps> = ({
  isOpen,
  onClose,
  schedules,
  selectedScheduleIds,
  onChangeSelectedIds,
  onConfirm,
  isSubmitting,
  getServiceConfig,
  getParentName
}) => {
  const todayStr = formatDateForInput(new Date());
  const [stopDate, setStopDate] = useState<string>(todayStr);
  const [modalSearch, setModalSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const customerGroups = useMemo<CustomerScheduleGroup[]>(() => {
    const map = new Map<string, CustomerScheduleGroup>();

    schedules.forEach((sched) => {
      const companyName = sched.customer?.company || 'Unknown Customer';
      const key = (sched.customer_id ? `${sched.customer_id}_${companyName.toLowerCase()}` : companyName.toLowerCase()).trim();

      if (!map.has(key)) {
        map.set(key, {
          key,
          companyName,
          suburb: sched.customer?.suburb || '',
          state: sched.customer?.state || '',
          parentName: getParentName(sched.parent_id),
          schedules: []
        });
      }
      map.get(key)!.schedules.push(sched);
    });

    return Array.from(map.values()).sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [schedules, getParentName]);

  const filteredGroups = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    if (!q) return customerGroups;

    return customerGroups.filter((g) => {
      const matchesCompany = g.companyName.toLowerCase().includes(q);
      const matchesSuburb = g.suburb.toLowerCase().includes(q) || g.state.toLowerCase().includes(q);
      const matchesParent = g.parentName.toLowerCase().includes(q);
      const matchesService = g.schedules.some((s) => {
        const cfg = getServiceConfig(s.service);
        return cfg.label.toLowerCase().includes(q) || (s.service || '').toLowerCase().includes(q);
      });
      return matchesCompany || matchesSuburb || matchesParent || matchesService;
    });
  }, [customerGroups, modalSearch, getServiceConfig]);

  const visibleScheduleIds = useMemo(() => {
    const ids: string[] = [];
    filteredGroups.forEach((g) => {
      g.schedules.forEach((s) => ids.push(s.id));
    });
    return ids;
  }, [filteredGroups]);

  const allVisibleSelected = visibleScheduleIds.length > 0 && visibleScheduleIds.every((id) => selectedScheduleIds.has(id));

  const selectedCustomerCount = useMemo(() => {
    let count = 0;
    customerGroups.forEach((g) => {
      if (g.schedules.some((s) => selectedScheduleIds.has(s.id))) {
        count++;
      }
    });
    return count;
  }, [customerGroups, selectedScheduleIds]);

  if (!isOpen) return null;

  const handleToggleCustomerGroup = (group: CustomerScheduleGroup) => {
    const groupIds = group.schedules.map((s) => s.id);
    const allGroupSelected = groupIds.every((id) => selectedScheduleIds.has(id));
    const next = new Set(selectedScheduleIds);

    if (allGroupSelected) {
      groupIds.forEach((id) => next.delete(id));
    } else {
      groupIds.forEach((id) => next.add(id));
    }
    onChangeSelectedIds(next);
    if (error) setError(null);
  };

  const handleToggleSchedule = (scheduleId: string) => {
    const next = new Set(selectedScheduleIds);
    if (next.has(scheduleId)) {
      next.delete(scheduleId);
    } else {
      next.add(scheduleId);
    }
    onChangeSelectedIds(next);
    if (error) setError(null);
  };

  const handleToggleSelectAllVisible = () => {
    const next = new Set(selectedScheduleIds);
    if (allVisibleSelected) {
      visibleScheduleIds.forEach((id) => next.delete(id));
    } else {
      visibleScheduleIds.forEach((id) => next.add(id));
    }
    onChangeSelectedIds(next);
    if (error) setError(null);
  };

  const handleConfirm = async () => {
    if (selectedScheduleIds.size === 0) {
      setError('Please select at least one customer or scheduled service to stop.');
      return;
    }
    if (!stopDate) {
      setError('Please select a date from which to stop the scheduled services.');
      return;
    }

    setError(null);
    try {
      await onConfirm(stopDate, Array.from(selectedScheduleIds));
    } catch (err: any) {
      console.error('Bulk stop schedules failed:', err);
      setError(err?.message || 'Failed to stop scheduled services.');
    }
  };

  const isImmediateStop = stopDate && stopDate <= todayStr;

  return (
    <div className="modal-overlay active" style={{ zIndex: 2100 }}>
      <div
        className="modal-content glass-card fade-in"
        style={{
          maxWidth: '680px',
          width: '100%',
          padding: '28px',
          background: 'rgba(255, 255, 255, 0.96)',
          borderRadius: '24px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(26, 61, 51, 0.22)'
        }}
      >
        <div
          className="modal-header"
          style={{
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(220, 38, 38, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626'
              }}
            >
              <Trash2 size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                Bulk Stop Scheduled Services
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                Select customers and choose the date from which their recurring services should stop.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Date Picker Section */}
        <div
          style={{
            background: 'var(--offwhite, #f8f6f0)',
            padding: '16px',
            borderRadius: '16px',
            marginBottom: '16px',
            border: '1px solid rgba(26, 61, 51, 0.08)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: 'var(--ink)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Stop Scheduled Services From Date
              </label>
              <CustomDatePicker
                value={stopDate}
                onChange={(val) => {
                  setStopDate(val);
                  if (error) setError(null);
                }}
                placeholder="Select stop date"
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: isImmediateStop ? 'rgba(220, 38, 38, 0.08)' : 'rgba(217, 119, 6, 0.08)',
                border: `1px solid ${isImmediateStop ? 'rgba(220, 38, 38, 0.2)' : 'rgba(217, 119, 6, 0.2)'}`,
                color: isImmediateStop ? '#991b1b' : '#92400e',
                fontSize: '0.8rem',
                lineHeight: 1.45
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                {stopDate ? (
                  isImmediateStop ? (
                    <>
                      Services will be marked as <strong>stopped immediately</strong> (from{' '}
                      <strong>
                        {parseLocalDate(stopDate).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </strong>
                      ), and any already-generated jobs on or after this date will be cancelled.
                    </>
                  ) : (
                    <>
                      Schedules will remain <strong>active until{' '}
                      {parseLocalDate(stopDate).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}</strong>, stop generating or projecting visits from that date onwards, and any already-generated jobs on or after that date will be cancelled.
                    </>
                  )
                ) : (
                  'Select a date to stop the selected customer schedules.'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Schedule Selection Section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            border: '1px solid rgba(26, 61, 51, 0.1)',
            borderRadius: '16px',
            overflow: 'hidden',
            background: 'white'
          }}
        >
          {/* Search & Bulk Select Header */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(26, 61, 51, 0.08)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(26, 61, 51, 0.02)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'white',
                border: '1px solid rgba(26, 61, 51, 0.12)',
                borderRadius: '10px',
                padding: '6px 12px',
                flex: '1 1 220px'
              }}
            >
              <Search size={15} style={{ color: 'var(--ink-soft)' }} />
              <input
                type="text"
                placeholder="Filter customers, suburbs, parents, or services..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  color: 'var(--ink)',
                  background: 'transparent'
                }}
              />
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-soft)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink)' }}>
                {selectedCustomerCount} customer{selectedCustomerCount === 1 ? '' : 's'} ({selectedScheduleIds.size} service{selectedScheduleIds.size === 1 ? '' : 's'})
              </span>
              <button
                type="button"
                onClick={handleToggleSelectAllVisible}
                disabled={visibleScheduleIds.length === 0}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(26, 61, 51, 0.15)',
                  background: allVisibleSelected ? 'var(--ink)' : 'white',
                  color: allVisibleSelected ? 'white' : 'var(--ink)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: visibleScheduleIds.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CheckSquare size={13} />
                <span>{allVisibleSelected ? 'Deselect Visible' : `Select All (${visibleScheduleIds.length})`}</span>
              </button>
            </div>
          </div>

          {/* Scrollable Customer Groups */}
          <div style={{ overflowY: 'auto', maxHeight: '290px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredGroups.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                No matching customers with active scheduled services found.
              </div>
            ) : (
              filteredGroups.map((group) => {
                const groupIds = group.schedules.map((s) => s.id);
                const selectedInGroup = groupIds.filter((id) => selectedScheduleIds.has(id)).length;
                const allGroupSelected = selectedInGroup === groupIds.length && groupIds.length > 0;
                const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;

                return (
                  <div
                    key={group.key}
                    style={{
                      border: `1px solid ${selectedInGroup > 0 ? 'rgba(220, 38, 38, 0.35)' : 'rgba(26, 61, 51, 0.08)'}`,
                      borderRadius: '12px',
                      background: selectedInGroup > 0 ? 'rgba(254, 242, 242, 0.4)' : 'rgba(255, 255, 255, 0.9)',
                      overflow: 'hidden',
                      transition: 'all 0.15s'
                    }}
                  >
                    {/* Customer Row */}
                    <div
                      onClick={() => handleToggleCustomerGroup(group)}
                      style={{
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        cursor: 'pointer',
                        background: selectedInGroup > 0 ? 'rgba(254, 226, 226, 0.35)' : 'rgba(26, 61, 51, 0.02)',
                        borderBottom: '1px solid rgba(26, 61, 51, 0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someGroupSelected;
                          }}
                          onChange={() => {}}
                          style={{ width: '16px', height: '16px', accentColor: '#dc2626', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--ink)' }}>
                              {group.companyName}
                            </span>
                            {group.parentName && (
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  color: 'var(--ink-soft)',
                                  background: 'rgba(26, 61, 51, 0.07)',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Building2 size={10} />
                                {group.parentName}
                              </span>
                            )}
                          </div>
                          {(group.suburb || group.state) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: 'var(--ink-soft)', marginTop: '2px' }}>
                              <MapPin size={11} />
                              <span>{[group.suburb, group.state].filter(Boolean).join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: selectedInGroup > 0 ? '#dc2626' : 'var(--ink-soft)',
                          background: selectedInGroup > 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(26, 61, 51, 0.05)',
                          padding: '3px 8px',
                          borderRadius: '999px',
                          flexShrink: 0
                        }}
                      >
                        {group.schedules.length} service{group.schedules.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Services List for Customer */}
                    <div style={{ padding: '6px 12px 8px 34px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {group.schedules.map((sched) => {
                        const isChecked = selectedScheduleIds.has(sched.id);
                        const cfg = getServiceConfig(sched.service);
                        return (
                          <div
                            key={sched.id}
                            onClick={() => handleToggleSchedule(sched.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isChecked ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                              border: isChecked ? '1px solid rgba(220, 38, 38, 0.2)' : '1px solid transparent'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                style={{ width: '14px', height: '14px', accentColor: '#dc2626', cursor: 'pointer' }}
                              />
                              <span
                                style={{
                                  backgroundColor: cfg.bg,
                                  color: cfg.text,
                                  border: `1px solid ${cfg.border}`,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Clock size={10} style={{ color: cfg.color }} />
                                {cfg.label}
                              </span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink-soft)' }}>
                                {Array.isArray(sched.frequency) && sched.frequency.length > 0 ? sched.frequency.join(', ') : 'No days set'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                              {sched.stopDate && (
                                <span
                                  style={{
                                    background: 'rgba(220, 38, 38, 0.1)',
                                    color: '#dc2626',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 700
                                  }}
                                >
                                  Stops: {parseLocalDate(sched.stopDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                              <span>
                                Starts: {sched.date ? parseLocalDate(sched.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'N/A'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '0.84rem',
              marginTop: '12px',
              flexShrink: 0
            }}
          >
            {error}
          </div>
        )}

        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '18px',
            flexShrink: 0
          }}
        >
          <button
            type="button"
            className="btn-secondary-glass"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '11px 20px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.88rem',
              width: 'auto',
              height: 'auto',
              cursor: isSubmitting ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || selectedScheduleIds.size === 0 || !stopDate}
            style={{
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '11px 22px',
              fontWeight: 800,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isSubmitting || selectedScheduleIds.size === 0 || !stopDate ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)',
              opacity: isSubmitting || selectedScheduleIds.size === 0 || !stopDate ? 0.65 : 1
            }}
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={16} className="spin" />
                <span>Stopping Services...</span>
              </>
            ) : (
              <>
                <Calendar size={16} />
                <span>
                  Stop {selectedScheduleIds.size} Service{selectedScheduleIds.size === 1 ? '' : 's'} ({selectedCustomerCount} Customer{selectedCustomerCount === 1 ? '' : 's'})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkStopSchedulesModal;

