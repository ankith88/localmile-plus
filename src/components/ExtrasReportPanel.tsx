import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Scale,
  Search,
  RefreshCw,
  Building2,
  Truck,
  Calendar,
  FileSpreadsheet,
  List,
  Layers,
} from 'lucide-react';
import {
  buildExtrasSummary,
  computeExtrasTotals,
  exportExtrasDetailedCsv,
  exportExtrasSummaryCsv,
  fetchCapturedExtras,
  type ExtrasProofRecord,
} from '../utils/extrasReport';

interface ExtrasReportPanelProps {
  /** If provided, uses these records instead of fetching from Firestore. */
  records?: ExtrasProofRecord[];
  /** Optional external loading indicator when records are managed by parent. */
  externalLoading?: boolean;
  /** Optional variant to match parent page styling. */
  variant?: 'glass' | 'card';
}

const ExtrasReportPanel: React.FC<ExtrasReportPanelProps> = ({
  records: externalRecords,
  externalLoading = false,
  variant = 'glass',
}) => {
  const [internalRecords, setInternalRecords] = useState<ExtrasProofRecord[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(!externalRecords);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [subcustomerFilter, setSubcustomerFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');

  const loadExtras = async () => {
    setInternalLoading(true);
    setError(null);
    try {
      const data = await fetchCapturedExtras();
      setInternalRecords(data);
    } catch (err) {
      console.error('Error loading captured extras:', err);
      setError('Failed to load captured extras. Please try again.');
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (!externalRecords) {
      loadExtras();
    }
  }, [externalRecords]);

  const rawRecords = externalRecords ?? internalRecords;
  const isLoading = externalRecords ? externalLoading : internalLoading;

  const subcustomerOptions = useMemo(() => {
    const map = new Map<string, string>();
    rawRecords.forEach((r) => {
      const key = r.subcustomerId || r.subcustomerName;
      if (key && !map.has(key)) {
        map.set(key, r.subcustomerName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawRecords]);

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    rawRecords.forEach((r) => {
      if (r.serviceName) set.add(r.serviceName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawRecords]);

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rawRecords.filter((r) => {
      const subKey = r.subcustomerId || r.subcustomerName;
      if (subcustomerFilter !== 'all' && subKey !== subcustomerFilter) return false;
      if (serviceFilter !== 'all' && r.serviceName !== serviceFilter) return false;
      if (dateFrom && r.deliveryDate && r.deliveryDate < dateFrom) return false;
      if (dateTo && r.deliveryDate && r.deliveryDate > dateTo) return false;
      if (term) {
        const haystack = [
          r.subcustomerName,
          r.serviceName,
          r.notes || '',
          r.uploadedByName || '',
          r.uploadedByEmail || '',
          r.deliveryDate || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rawRecords, subcustomerFilter, serviceFilter, dateFrom, dateTo, searchTerm]);

  const summaryRows = useMemo(() => buildExtrasSummary(filteredRecords), [filteredRecords]);
  const totals = useMemo(() => computeExtrasTotals(filteredRecords), [filteredRecords]);

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    subcustomerFilter !== 'all' ||
    serviceFilter !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '';

  const resetFilters = () => {
    setSearchTerm('');
    setSubcustomerFilter('all');
    setServiceFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const containerStyle: React.CSSProperties =
    variant === 'glass'
      ? {
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
          marginBottom: '32px',
        }
      : {
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
          marginBottom: '20px',
        };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
    background: '#ffffff',
    color: '#0f172a',
    boxSizing: 'border-box',
  };

  return (
    <section style={containerStyle} aria-label="Captured Extras Report and Export">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: '#fef3c7',
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Scale size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              Captured Extras Report &amp; Export
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
              Count of excess weight extras captured by subcustomer and service.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!externalRecords && (
            <button
              type="button"
              onClick={loadExtras}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => exportExtrasSummaryCsv(summaryRows, totals)}
            disabled={isLoading || summaryRows.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              background: summaryRows.length === 0 ? '#cbd5e1' : '#0f172a',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: summaryRows.length === 0 ? 'not-allowed' : 'pointer',
            }}
            title="Export grouped count by subcustomer and service as CSV"
          >
            <FileSpreadsheet size={14} />
            <span>Export Summary CSV</span>
          </button>

          <button
            type="button"
            onClick={() => exportExtrasDetailedCsv(filteredRecords)}
            disabled={isLoading || filteredRecords.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #0f172a',
              background: '#ffffff',
              color: filteredRecords.length === 0 ? '#94a3b8' : '#0f172a',
              borderColor: filteredRecords.length === 0 ? '#cbd5e1' : '#0f172a',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: filteredRecords.length === 0 ? 'not-allowed' : 'pointer',
            }}
            title="Export every captured extra submission as CSV"
          >
            <Download size={14} />
            <span>Export Detailed CSV</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: '10px',
          marginBottom: '18px',
          padding: '12px',
          borderRadius: '14px',
          background: 'rgba(248, 250, 252, 0.9)',
          border: '1px solid #e2e8f0',
          alignItems: 'end',
        }}
      >
        <div>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#475569',
              display: 'block',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            Search
          </label>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
            />
            <input
              type="text"
              placeholder="Subcustomer, service, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '30px' }}
            />
          </div>
        </div>

        <div>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            <Building2 size={12} />
            <span>Subcustomer</span>
          </label>
          <select
            value={subcustomerFilter}
            onChange={(e) => setSubcustomerFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All Subcustomers</option>
            {subcustomerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            <Truck size={12} />
            <span>Service</span>
          </label>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All Services</option>
            {serviceOptions.map((svc) => (
              <option key={svc} value={svc}>
                {svc}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            <Calendar size={12} />
            <span>From Date</span>
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
              textTransform: 'uppercase',
            }}
          >
            <Calendar size={12} />
            <span>To Date</span>
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </div>

        {hasActiveFilters && (
          <div>
            <button
              type="button"
              onClick={resetFilters}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* KPI Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '14px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
            Extras Count (Qty)
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#92400e', marginTop: '2px' }}>
            {totals.totalExtrasQty}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: '2px' }}>
            {totals.totalWeightKg} kg total extra weight
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: '14px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
            Total Captures
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
            {totals.totalCaptures}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#2563eb', marginTop: '2px' }}>
            Proof submissions
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: '14px',
            background: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.22)',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase' }}>
            Subcustomers / Services
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#6d28d9', marginTop: '2px' }}>
            {totals.uniqueSubcustomers}{' '}
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>/ {totals.uniqueServices}</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#7c3aed', marginTop: '2px' }}>
            Distinct groups
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: '14px',
            background: 'rgba(39, 174, 96, 0.1)',
            border: '1px solid rgba(39, 174, 96, 0.25)',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
            Total Value (Inc GST)
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
            A${totals.totalAmountIncGst.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#16a34a', marginTop: '2px' }}>
            Across filtered extras
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div
          style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            borderRadius: '10px',
            padding: '3px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('summary')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'summary' ? '#ffffff' : 'transparent',
              color: viewMode === 'summary' ? '#0f172a' : '#64748b',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: viewMode === 'summary' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Layers size={14} />
            <span>By Subcustomer &amp; Service ({summaryRows.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('detailed')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'detailed' ? '#ffffff' : 'transparent',
              color: viewMode === 'detailed' ? '#0f172a' : '#64748b',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: viewMode === 'detailed' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <List size={14} />
            <span>Individual Captures ({filteredRecords.length})</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.85rem',
            marginBottom: '12px',
          }}
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: '28px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
          Loading captured extras...
        </div>
      ) : filteredRecords.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: '#64748b',
            background: '#f8fafc',
            borderRadius: '14px',
            border: '1px dashed #cbd5e1',
          }}
        >
          No captured extras match the selected filters.
        </div>
      ) : viewMode === 'summary' ? (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', background: '#ffffff' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Subcustomer</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Service</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Extras Count (Qty)
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Captures
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Extra Weight
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Total (Inc GST)
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Last Captured</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                    {row.subcustomerName}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>{row.serviceName}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>
                    {row.totalExtrasQty}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                    {row.captureCount}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                    {row.totalWeightKg} kg
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                    A${row.totalAmountIncGst.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>
                    {row.lastCapturedDate || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                <td style={{ padding: '10px 14px', color: '#0f172a' }}>Total</td>
                <td style={{ padding: '10px 14px', color: '#64748b' }}>
                  {totals.uniqueSubcustomers} subcustomer(s)
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#b45309' }}>
                  {totals.totalExtrasQty}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0f172a' }}>
                  {totals.totalCaptures}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0f172a' }}>
                  {totals.totalWeightKg} kg
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#15803d' }}>
                  A${totals.totalAmountIncGst.toFixed(2)}
                </td>
                <td style={{ padding: '10px 14px' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', background: '#ffffff' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Date &amp; Time</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Subcustomer</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Service</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Qty
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Weight
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>
                  Total (Inc GST)
                </th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Captured By</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#475569' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec) => (
                <tr key={rec.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap' }}>
                    {rec.deliveryDate || '-'} {rec.deliveryTime ? `• ${rec.deliveryTime}` : ''}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                    {rec.subcustomerName}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155' }}>{rec.serviceName}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>
                    {rec.excessWeightQty}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                    {rec.excessWeightQty * rec.excessWeightUnitKg} kg
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>
                    A${rec.excessWeightTotalIncGst.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569' }}>
                    {rec.uploadedByName || rec.uploadedByEmail || 'Operator'}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: '220px' }}>
                    {rec.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default ExtrasReportPanel;
