import React, { useState } from 'react';
import { X, AlertTriangle, RefreshCw, MessageSquare, Trash2 } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

interface CancelCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any;
  onUpdate: (updatedCustomer: any) => void;
}

const CANCEL_REASONS = [
  "Service no longer required",
  "Switching to another provider",
  "Pricing concerns",
  "Moving location",
  "Dissatisfied with service",
  "Other"
];

const CancelCustomerModal: React.FC<CancelCustomerModalProps> = ({ 
  isOpen, 
  onClose, 
  customer,
  onUpdate
}) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleCancel = async () => {
    if (!customer?.id) return;
    
    // Prevent deleting default Australia Post for customer role
    if (customer.role === 'customer') {
      const name = (customer.companyName || customer.company_name || '').toLowerCase();
      if (name.includes('australia post')) {
        alert("You cannot delete the default Australia Post entry.");
        return;
      }
    }

    if (customer.role !== 'customer' && !customer?.parent_id) return;
    
    if (!reason && customer.role !== 'customer') {
      alert("Please select a reason for cancellation.");
      return;
    }

    setIsSaving(true);
    try {
      if (customer.role === 'customer' && (customer.customer_id || customer.uid)) {
        // For address book, we just delete it
        const { deleteDoc } = await import('firebase/firestore');
        const refPath = customer.customer_id 
            ? `companies/${customer.customer_id}/address_book` 
            : `users/${customer.uid}/address_book`;
        await deleteDoc(doc(db, refPath, customer.id));
        onUpdate({ ...customer, id: 'deleted' }); // Signal deletion
      } else {
        const customerRef = doc(db, `companies/${customer.parent_id}/customers`, customer.id);
        
        const updates: any = {
          status: 'cancelled',
          cancellationReason: reason,
          cancellationNotes: notes,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await updateDoc(customerRef, updates);
        onUpdate({ ...customer, ...updates });
      }
      
      onClose();
    } catch (error) {
      console.error("Error cancelling customer:", error);
      alert("Failed to cancel customer. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !customer) return null;

  return (
    <div className="modal-overlay active">
      <div className="modal-content glass-card fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div className="header-title" style={{ color: '#dc2626' }}>
            <Trash2 size={20} />
            <h2>Cancel Customer</h2>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="warning-banner">
            <AlertTriangle size={20} />
            <p>You are about to cancel <strong>{customer.companyName || customer.company_name}</strong>. This will mark them as inactive in the system.</p>
          </div>

          <div className="cancel-form">
            <div className="form-group">
              <label>Reason for Cancellation</label>
              <div className="input-wrapper">
                <AlertTriangle size={16} />
                <select 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="premium-select"
                >
                  <option value="">Select a reason...</option>
                  {CANCEL_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Additional Notes</label>
              <div className="input-wrapper align-start">
                <MessageSquare size={16} style={{ marginTop: '12px' }} />
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide any additional context for this cancellation..."
                  rows={4}
                />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button 
              className="btn-secondary-glass" 
              onClick={onClose}
              disabled={isSaving}
            >
              Go Back
            </button>
            <button 
              className="btn-danger-premium" 
              onClick={handleCancel}
              disabled={isSaving}
            >
              {isSaving ? <RefreshCw size={18} className="spin" /> : <>Confirm Cancellation</>}
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(26, 61, 51, 0.4); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 3000;
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
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .header-title { display: flex; align-items: center; gap: 12px; }
        .header-title h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); opacity: 0.6; cursor: pointer; }
        
        .warning-banner {
          background: #fef2f2;
          border: 1px solid #fee2e2;
          color: #991b1b;
          padding: 16px;
          border-radius: 12px;
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .warning-banner svg { flex-shrink: 0; }

        .cancel-form { display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px; }
        
        .form-group label {
          display: block; 
          font-size: 0.7rem; 
          font-weight: 800; 
          text-transform: uppercase; 
          color: var(--ink-soft); 
          marginBottom: 6px;
          opacity: 0.6;
          letter-spacing: 0.05em;
        }
        
        .input-wrapper {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(0,0,0,0.03);
          border: 1px solid rgba(0,0,0,0.05);
          padding: 10px 14px;
          border-radius: 12px;
          transition: all 0.2s;
        }
        .input-wrapper.align-start { align-items: flex-start; }
        .input-wrapper:focus-within {
          background: white;
          border-color: #dc2626;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.05);
        }
        .input-wrapper svg { color: var(--ink-soft); opacity: 0.5; }
        
        .premium-select {
          border: none;
          background: transparent;
          width: 100%;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--ink);
          outline: none;
          cursor: pointer;
        }

        .input-wrapper textarea {
          border: none;
          background: transparent;
          width: 100%;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--ink);
          outline: none;
          resize: none;
          padding: 10px 0;
        }

        .modal-actions { display: flex; gap: 12px; margin-top: 8px; }
        .btn-secondary-glass {
          flex: 1; padding: 14px; border-radius: 14px; fontWeight: 700;
          border: 1px solid rgba(0,0,0,0.1); background: transparent;
          color: var(--ink); cursor: pointer; transition: all 0.2s;
        }
        .btn-secondary-glass:hover { background: rgba(0,0,0,0.05); }
        
        .btn-danger-premium {
          flex: 2; padding: 14px; border-radius: 14px; fontWeight: 700;
          background: #dc2626; color: white; border: none;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; transition: all 0.2s;
        }
        .btn-danger-premium:hover { background: #b91c1c; transform: translateY(-2px); }
        .btn-danger-premium:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default CancelCustomerModal;
