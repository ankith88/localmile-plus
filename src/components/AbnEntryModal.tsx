import React, { useState } from 'react';
import { useLpo } from '../context/LpoContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

// ABN validation using official algorithm
export function validateABN(abn: string): boolean {
  const cleanAbn = abn.replace(/\s+/g, '').replace(/-/g, '');
  if (!/^\d{11}$/.test(cleanAbn)) {
    return false;
  }
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let digit = parseInt(cleanAbn[i], 10);
    if (i === 0) {
      digit -= 1;
    }
    sum += digit * weights[i];
  }
  return sum % 89 === 0;
}

const AbnEntryModal: React.FC = () => {
  const { userData, companyData, updateCompanyData } = useLpo();
  const [abnValue, setAbnValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal condition:
  // 1. Logged in customer role
  // 2. Completed free trials (trial_credits_balance <= 0)
  // 3. Doesn't have a valid ABN already
  const hasFinishedTrials = userData?.role === 'customer' && 
    typeof companyData?.trial_credits_balance === 'number' && 
    companyData.trial_credits_balance <= 0;

  const hasValidAbn = companyData?.abn && validateABN(companyData.abn);

  if (!hasFinishedTrials || hasValidAbn) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const cleanedAbn = abnValue.replace(/\s+/g, '').replace(/-/g, '');

    if (!validateABN(cleanedAbn)) {
      setError('Please enter a valid 11-digit Australian Business Number.');
      setIsSubmitting(false);
      return;
    }

    try {
      const customerId = userData.customer_id || '';
      
      // 1. Sync with NetSuite API (using callNetSuiteProxy)
      // Base NetSuite update scriptlet URL
      const NETSUITE_API_URL = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2165&deploy=1&compid=1048144&ns-at=AAEJ7tMQjAoBac5NMovu7TgzYYUBTkw80-MtaJaID2gsRUcr0hs";
      const nsUrl = `${NETSUITE_API_URL}&leadID=${encodeURIComponent(customerId)}&custentity_abn=${encodeURIComponent(cleanedAbn)}&abn=${encodeURIComponent(cleanedAbn)}`;
      
      console.log(`[ABN Sync] Syncing with NetSuite: ${nsUrl}`);
      const callNetSuite = httpsCallable(functions, 'callNetSuiteProxy');
      const nsResponse = await callNetSuite({ url: nsUrl });
      console.log("[ABN Sync] NetSuite response:", nsResponse.data);

      // 2. Sync with ProspectPlus API
      console.log(`[ABN Sync] Syncing with ProspectPlus for customer ID: ${customerId}`);
      const syncProspectPlusABN = httpsCallable(functions, 'syncProspectPlusABN');
      await syncProspectPlusABN({ customer_id: customerId, abn: cleanedAbn });

      // 3. Update local Firestore company document and Context state
      await updateCompanyData({ abn: cleanedAbn });

    } catch (err: any) {
      console.error("Error updating ABN:", err);
      setError(err?.message || "An error occurred while updating the ABN. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="abn-modal-overlay">
      <div className="abn-modal-content glass">
        <h2>Enter Australian ABN</h2>
        <p>
          You have completed your 5 free trials. To continue booking jobs and using our premium services, please enter your valid 11-digit Australian Business Number (ABN).
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              placeholder="12 345 678 901"
              value={abnValue}
              onChange={(e) => setAbnValue(e.target.value)}
              disabled={isSubmitting}
              className="abn-input"
              required
            />
          </div>

          {error && <div className="abn-error">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="abn-submit-btn"
          >
            {isSubmitting ? 'Verifying ABN...' : 'Submit & Upgrade'}
          </button>
        </form>
      </div>

      <style>{`
        .abn-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }

        .abn-modal-content {
          background: white;
          padding: 40px;
          border-radius: 16px;
          max-width: 480px;
          width: 90%;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }

        .abn-modal-content h2 {
          font-family: var(--font-headings);
          color: var(--ink);
          margin-bottom: 16px;
          font-size: 1.8rem;
        }

        .abn-modal-content p {
          color: #666;
          margin-bottom: 24px;
          line-height: 1.5;
          font-size: 0.95rem;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .abn-input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 500;
          text-align: center;
          outline: none;
          transition: border-color 0.2s;
        }

        .abn-input:focus {
          border-color: #095c7b;
        }

        .abn-error {
          color: #e53e3e;
          font-size: 0.9rem;
          margin-bottom: 20px;
          font-weight: 500;
        }

        .abn-submit-btn {
          width: 100%;
          background: #095c7b;
          color: white;
          padding: 14px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .abn-submit-btn:hover:not(:disabled) {
          background: #07465e;
        }

        .abn-submit-btn:disabled {
          background: #cbd5e0;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default AbnEntryModal;
