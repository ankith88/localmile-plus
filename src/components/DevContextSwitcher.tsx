import React, { useState, useEffect } from 'react';
import { useLpo } from '../context/LpoContext';
import type { ImpersonationState } from '../context/LpoContext';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Settings, X, Check } from 'lucide-react';

interface CustomerOption {
  id: string;
  name: string;
  email?: string;
}

const devStyles = `
  .dev-switcher-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    background: linear-gradient(to right, #9333ea, #4f46e5);
    color: white;
    padding: 12px;
    border-radius: 50%;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
  }
  .dev-switcher-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 0 15px rgba(147, 51, 234, 0.5);
  }
  .dev-switcher-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    width: 320px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.4);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s ease;
    font-family: sans-serif;
  }
  .dev-switcher-header {
    background: linear-gradient(to right, #9333ea, #4f46e5);
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: white;
  }
  .dev-switcher-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .dev-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }
  .dev-select {
    width: 100%;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    color: #1f2937;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
  }
  .dev-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #111827;
    color: white;
    font-weight: 500;
    padding: 10px;
    border-radius: 8px;
    margin-top: 8px;
  }
  .dev-btn:hover {
    background: #1f2937;
  }
  .dev-close {
    background: rgba(255,255,255,0.2);
    padding: 4px;
    border-radius: 50%;
  }
`;

export const DevContextSwitcher: React.FC = () => {
  const { isRealSuperAdmin, impersonation, setImpersonation, allParents, loading } = useLpo();
  
  const [isOpen, setIsOpen] = useState(false);
  const [roleMode, setRoleMode] = useState<ImpersonationState['role']>('superadmin');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [fetchingCustomers, setFetchingCustomers] = useState(false);

  // Initialize local state from context
  useEffect(() => {
    if (impersonation) {
      setRoleMode(impersonation.role);
      setSelectedParentId(impersonation.parent_id || '');
      setSelectedCustomerId(impersonation.customer_id || '');
    } else {
      setRoleMode('superadmin');
      setSelectedParentId('');
      setSelectedCustomerId('');
    }
  }, [impersonation, isOpen]);

  // Fetch customers if Standalone Customer mode is selected
  useEffect(() => {
    if (roleMode === 'customer' && customers.length === 0) {
      const fetchCustomers = async () => {
        setFetchingCustomers(true);
        try {
          const q = query(collection(db, 'customers'), limit(100));
          const snapshot = await getDocs(q);
          const customerData = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Unknown Name',
            email: doc.data().email
          }));
          setCustomers(customerData);
        } catch (error) {
          console.error("Error fetching customers for dev switcher", error);
        } finally {
          setFetchingCustomers(false);
        }
      };
      fetchCustomers();
    }
  }, [roleMode, customers.length]);

  if (loading || !isRealSuperAdmin) return null;

  const handleApply = () => {
    if (roleMode === 'superadmin') {
      setImpersonation(null);
    } else if (roleMode === 'operator') {
      if (!selectedParentId) return alert('Please select a Parent LPO.');
      setImpersonation({
        role: 'operator',
        parent_id: selectedParentId,
      });
    } else if (roleMode === 'customer') {
      if (!selectedCustomerId) return alert('Please select a Customer.');
      setImpersonation({
        role: 'customer',
        customer_id: selectedCustomerId,
      });
    }
    setIsOpen(false);
  };

  const createDummyData = async () => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      
      const dummyParentId = `dummy_parent_${Date.now()}`;
      await setDoc(doc(db, 'lpo', dummyParentId), {
        name: "Dummy Parent LPO",
        email: "dummy.lpo@localmile.plus",
        phone: "0400000000",
        address: "123 Dummy St, Sydney NSW 2000"
      });

      const dummyCustomerId = `dummy_customer_${Date.now()}`;
      await setDoc(doc(db, 'customers', dummyCustomerId), {
        name: "Dummy Standalone Customer",
        email: "dummy.customer@example.com",
        phone: "0411111111",
        address: "456 Customer Ave, Melbourne VIC 3000",
        parent_id: "standalone"
      });

      alert("Dummy data created! Please refresh the page to see them in the dropdowns.");
    } catch (e) {
      console.error(e);
      alert("Error creating dummy data.");
    }
  };

  if (!isOpen) {
    return (
      <>
        <style>{devStyles}</style>
        <button
          onClick={() => setIsOpen(true)}
          className="dev-switcher-btn"
          title="Dev Context Switcher"
        >
          <Settings size={24} />
        </button>
      </>
    );
  }

  return (
    <>
      <style>{devStyles}</style>
      <div className="dev-switcher-panel">
        <div className="dev-switcher-header">
          <h3 style={{ fontSize: '14px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} /> Dev Impersonation
          </h3>
          <button onClick={() => setIsOpen(false)} className="dev-close">
            <X size={16} />
          </button>
        </div>

        <div className="dev-switcher-body">
          <div>
            <label className="dev-label">View As</label>
            <div style={{ position: 'relative' }}>
              <select
                value={roleMode}
                onChange={(e) => setRoleMode(e.target.value as any)}
                className="dev-select"
              >
                <option value="superadmin">Global Admin</option>
                <option value="operator">Parent Operator</option>
                <option value="customer">Standalone Customer</option>
              </select>
            </div>
          </div>

          {roleMode === 'operator' && (
            <div>
              <label className="dev-label">Select Parent LPO</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="dev-select"
                >
                  <option value="">-- Choose Parent --</option>
                  {allParents.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {roleMode === 'customer' && (
            <div>
              <label className="dev-label">Select Customer</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="dev-select"
                  disabled={fetchingCustomers}
                >
                  <option value="">-- Choose Customer --</option>
                  <option value="test_standalone_customer">✨ Simulate New Standalone Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ''}</option>
                  ))}
                </select>
              </div>
              {fetchingCustomers && <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Loading customers...</p>}
            </div>
          )}

          <div style={{ paddingTop: '8px', borderTop: '1px solid #f3f4f6' }}>
            <button onClick={handleApply} className="dev-btn">
              <Check size={16} /> Apply Context
            </button>
            <button onClick={createDummyData} className="dev-btn" style={{ background: '#374151', fontSize: '12px' }}>
              🛠️ Generate Dummy Records
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
