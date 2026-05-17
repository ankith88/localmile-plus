import React, { useState } from 'react';
import { X, Trash2, RefreshCw, AlertTriangle, Send } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface CancelJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  onSuccess: () => void;
}

const CancelJobModal: React.FC<CancelJobModalProps> = ({ isOpen, onClose, job, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasons = [
    "Customer Cancelled",
    "Duplicate Booking",
    "Service No Longer Required",
    "Change of Plans",
    "Error in Booking",
    "Other"
  ];

  const handleSubmit = async () => {
    if (!reason) {
      alert("Please select a reason.");
      return;
    }

    setIsSubmitting(true);
    const functions = getFunctions();
    const cancelJobFn = httpsCallable(functions, 'cancelJob');

    try {
      await cancelJobFn({
        jobId: job.id,
        reason,
        notes,
        metadata: {
          companyName: job.customer?.company,
          serviceType: job.service,
          date: job.date,
          parentId: job.parent_id,
          customerId: job.netsuiteCustomerId || job.customer?.netsuiteId || ""
        }
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error canceling job:", err);
      alert("Failed to cancel job. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div className="modal-overlay active">
      <div className="modal-content glass-card fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div className="header-title" style={{ color: '#ff4757' }}>
            <Trash2 size={20} />
            <h2>Cancel Scheduled Job</h2>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="warning-banner" style={{ 
            background: 'rgba(255, 71, 87, 0.1)', 
            padding: '12px 16px', 
            borderRadius: '12px', 
            marginBottom: '24px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#ff4757',
            border: '1px solid rgba(255, 71, 87, 0.2)'
          }}>
            <AlertTriangle size={20} />
            <span>This will cancel the scheduled job and notify the dispatch team immediately.</span>
          </div>

          <div className="job-summary-mini" style={{ 
            background: 'var(--offwhite)', 
            padding: '16px', 
            borderRadius: '16px', 
            marginBottom: '24px',
            fontSize: '0.9rem'
          }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>{job.customer?.company}</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: '0.8rem' }}>{job.service?.replace(/-/g, ' ')} • {job.date}</div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              textTransform: 'uppercase', 
              color: 'var(--ink-soft)', 
              marginBottom: '8px',
              opacity: 0.6
            }}>
              Cancellation Reason <span style={{ color: '#ff4757' }}>*</span>
            </label>
            <select 
              value={reason} 
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(255,255,255,0.5)',
                fontSize: '1rem',
                outline: 'none'
              }}
              disabled={isSubmitting}
            >
              <option value="">-- Select a reason --</option>
              {reasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              textTransform: 'uppercase', 
              color: 'var(--ink-soft)', 
              marginBottom: '8px',
              opacity: 0.6
            }}>
              Additional Notes
            </label>
            <textarea
              placeholder="Provide any additional context for the dispatch team..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(255,255,255,0.5)',
                fontSize: '1rem',
                outline: 'none',
                resize: 'none'
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-secondary-glass" 
              onClick={onClose}
              style={{ flex: 1, padding: '14px', borderRadius: '14px', fontWeight: 700 }}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button 
              className="btn-primary-glass" 
              onClick={handleSubmit}
              disabled={isSubmitting || !reason}
              style={{ 
                flex: 1, 
                padding: '14px', 
                borderRadius: '14px', 
                fontWeight: 700,
                background: '#ff4757',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                border: 'none',
                cursor: (isSubmitting || !reason) ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? <RefreshCw size={18} className="spin" /> : <><Send size={18} /> Confirm Cancellation</>}
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(26, 61, 51, 0.4); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 4000;
          padding: 24px;
        }
        .modal-content { 
          width: 100%; 
          background: white;
          padding: 32px; 
          border-radius: 24px;
          position: relative;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-title { display: flex; align-items: center; gap: 12px; }
        .header-title h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); opacity: 0.6; cursor: pointer; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default CancelJobModal;
