import React, { useState } from 'react';
import { Calendar, X, RefreshCw } from 'lucide-react';
import CustomDatePicker from './CustomDatePicker';
import { formatDateForInput } from '../utils/scheduling';

interface BulkUpdateDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (newDate: string) => Promise<void>;
  isUpdating: boolean;
}

const BulkUpdateDateModal: React.FC<BulkUpdateDateModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  onConfirm,
  isUpdating
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(formatDateForInput(new Date()));
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) {
      setError("Please select a valid start date.");
      return;
    }
    setError(null);
    try {
      await onConfirm(selectedDate);
    } catch (err: any) {
      console.error("Bulk date update failed:", err);
      setError(err?.message || "Failed to update start date for selected requests.");
    }
  };

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`} style={{ zIndex: 1100 }}>
      <div className="modal-content card glass fade-in" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
        <div className="modal-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb'
            }}>
              <Calendar size={20} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              Bulk Update Start Date
            </h2>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isUpdating} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Select a new start date for the <strong style={{ color: 'var(--ink)' }}>{selectedCount}</strong> selected pending request{selectedCount > 1 ? 's' : ''}.
            </p>

            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              New Start Date
            </label>
            <CustomDatePicker
              value={selectedDate}
              onChange={(val) => {
                setSelectedDate(val);
                if (error) setError(null);
              }}
              min={formatDateForInput(new Date())}
              placeholder="Select start date"
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '0.85rem',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn-secondary-glass"
              onClick={onClose}
              disabled={isUpdating}
              style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: isUpdating ? 'not-allowed' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating || !selectedDate}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: isUpdating ? 'wait' : 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                opacity: isUpdating ? 0.8 : 1
              }}
            >
              {isUpdating ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Calendar size={16} />
                  <span>Update Start Date ({selectedCount})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkUpdateDateModal;
