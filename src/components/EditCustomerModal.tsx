import React, { useState, useEffect } from 'react';
import { X, Save, User, Mail, Phone, MapPin, Building2, RefreshCw } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface EditCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: any;
  onUpdate: (updatedCustomer: any) => void;
}

const EditCustomerModal: React.FC<EditCustomerModalProps> = ({ 
  isOpen, 
  onClose, 
  customer,
  onUpdate
}) => {
  const [formData, setFormData] = useState({
    companyName: '',
    firstName: '',
    lastName: '',
    customerEmail: '',
    customerPhone: '',
    address1: '',
    city: '',
    state: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        companyName: customer.companyName || customer.company_name || '',
        firstName: customer.firstName || customer.first_name || '',
        lastName: customer.lastName || customer.last_name || '',
        customerEmail: customer.customerEmail || customer.email || '',
        customerPhone: customer.customerPhone || customer.phone || '',
        address1: customer.address1 || customer.address?.street || '',
        city: customer.city || customer.address?.suburb || '',
        state: customer.state || customer.address?.state || ''
      });
    }
  }, [customer]);

  const handleSave = async () => {
    if (!customer?.id) return;
    // For regular customers, parent_id is required. For address book, it's not.
    if (customer.role !== 'customer' && !customer?.parent_id) return;

    setIsSaving(true);
    try {
      let customerRef;
      if (customer.role === 'customer' && customer.customer_id) {
        customerRef = doc(db, `companies/${customer.customer_id}/address_book`, customer.id);
      } else if (customer.role === 'customer' && customer.uid) {
        customerRef = doc(db, `users/${customer.uid}/address_book`, customer.id);
      } else {
        customerRef = doc(db, `lpo/${customer.parent_id}/customers`, customer.id);
      }
      
      // We update both versions of the fields to be safe, as the codebase seems to use both
      const updates: any = {
        companyName: formData.companyName,
        company_name: formData.companyName,
        firstName: formData.firstName,
        first_name: formData.firstName,
        lastName: formData.lastName,
        last_name: formData.lastName,
        customerEmail: formData.customerEmail,
        email: formData.customerEmail,
        customerPhone: formData.customerPhone,
        phone: formData.customerPhone,
        address1: formData.address1,
        city: formData.city,
        state: formData.state,
        // Also update the address object if it exists (used in address book)
        address: {
          street: formData.address1,
          suburb: formData.city,
          state: formData.state,
          postcode: customer.address?.postcode || '' // keep existing postcode if not in form
        }
      };

      await updateDoc(customerRef, updates);
      
      onUpdate({ ...customer, ...updates });
      onClose();
    } catch (error) {
      console.error("Error updating customer:", error);
      alert("Failed to update customer. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !customer) return null;

  return (
    <div className="modal-overlay active">
      <div className="modal-content glass-card fade-in" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <div className="header-title">
            <Building2 size={20} />
            <h2>Edit Customer Details</h2>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="edit-form-grid">
            <div className="form-group full-width">
              <label>Company Name</label>
              <div className="input-wrapper">
                <Building2 size={16} />
                <input 
                  type="text" 
                  value={formData.companyName}
                  onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  placeholder="Enter company name"
                />
              </div>
            </div>

            <div className="form-group">
              <label>First Name</label>
              <div className="input-wrapper">
                <User size={16} />
                <input 
                  type="text" 
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  placeholder="First Name"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Last Name</label>
              <div className="input-wrapper">
                <User size={16} />
                <input 
                  type="text" 
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  placeholder="Last Name"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <div className="input-wrapper">
                <Mail size={16} />
                <input 
                  type="email" 
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({...formData, customerEmail: e.target.value})}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <div className="input-wrapper">
                <Phone size={16} />
                <input 
                  type="text" 
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({...formData, customerPhone: e.target.value})}
                  placeholder="Phone number"
                />
              </div>
            </div>

            <div className="form-group full-width">
              <label>Street Address</label>
              <div className="input-wrapper">
                <MapPin size={16} />
                <input 
                  type="text" 
                  value={formData.address1}
                  onChange={(e) => setFormData({...formData, address1: e.target.value})}
                  placeholder="123 Street Name"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Suburb / City</label>
              <div className="input-wrapper">
                <MapPin size={16} />
                <input 
                  type="text" 
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  placeholder="Suburb"
                />
              </div>
            </div>

            <div className="form-group">
              <label>State</label>
              <div className="input-wrapper">
                <MapPin size={16} />
                <input 
                  type="text" 
                  value={formData.state}
                  onChange={(e) => setFormData({...formData, state: e.target.value})}
                  placeholder="State"
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
              Cancel
            </button>
            <button 
              className="btn-primary-glass" 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? <RefreshCw size={18} className="spin" /> : <><Save size={18} /> Save Changes</>}
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
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-title { display: flex; align-items: center; gap: 12px; color: var(--ink); }
        .header-title h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); opacity: 0.6; cursor: pointer; }
        
        .edit-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .form-group.full-width { grid-column: span 2; }
        
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
        .input-wrapper:focus-within {
          background: white;
          border-color: var(--ink);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .input-wrapper svg { color: var(--ink-soft); opacity: 0.5; }
        .input-wrapper input {
          border: none;
          background: transparent;
          width: 100%;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--ink);
          outline: none;
        }

        .modal-actions { display: flex; gap: 12px; margin-top: 8px; }
        .btn-secondary-glass {
          flex: 1; padding: 14px; border-radius: 14px; fontWeight: 700;
          border: 1px solid rgba(0,0,0,0.1); background: transparent;
          color: var(--ink); cursor: pointer; transition: all 0.2s;
        }
        .btn-secondary-glass:hover { background: rgba(0,0,0,0.05); }
        
        .btn-primary-glass {
          flex: 1; padding: 14px; border-radius: 14px; fontWeight: 700;
          background: var(--ink); color: white; border: none;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; transition: all 0.2s;
        }
        .btn-primary-glass:hover { opacity: 0.9; transform: translateY(-2px); }
        .btn-primary-glass:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 600px) {
          .edit-form-grid { grid-template-columns: 1fr; }
          .form-group.full-width { grid-column: span 1; }
          .modal-content { padding: 20px; }
        }
      `}</style>
    </div>
  );
};

export default EditCustomerModal;
