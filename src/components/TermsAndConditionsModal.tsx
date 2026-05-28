import React, { useState } from 'react';
import { useLpo } from '../context/LpoContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

const TermsAndConditionsModal: React.FC = () => {
  const { userData, updateUserData } = useLpo();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  if (!userData || !userData.customer_id || userData.hasAcceptedTC === true) {
    return null;
  }

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);

    try {
      // NetSuite API call
      const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2651&deploy=1&compid=1048144&ns-at=AAEJ7tMQw7tByDrNz9mBKJClYrkviPQk8RDvPIPPvfM4H6eU7vo";
      const customerId = userData.customer_id || "";
      const url = `${NETSUITE_API}&customer_id=${encodeURIComponent(customerId)}`;
      
      const callNetSuite = httpsCallable(functions, 'callNetSuiteProxy');
      const response = await callNetSuite({ url });
      
      let data = response.data as any;
      console.log("NetSuite T&C Acceptance Sync:", data);

      // Handle the case where our backend had to pass back raw text
      if (data && typeof data._rawText === 'string') {
        try {
          data = JSON.parse(data._rawText.trim());
        } catch(e) {
          // ignore
        }
      }

      if (
        (data.success === true || data.success === "true") && 
        data.message && 
        data.message.includes("Status Updated Successfully")
      ) {
        // Update user metadata in Firestore only on success
        await updateUserData({ hasAcceptedTC: true });
      } else {
        throw new Error(data.message || "Failed to update status in NetSuite");
      }

    } catch (err) {
      console.error("Error accepting Terms & Conditions:", err);
      setError("An error occurred while accepting the Terms & Conditions. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="tc-modal-overlay">
      <div className="tc-modal-content">
        <h2>Welcome to LocalMile</h2>
        <p>
          Before you can start using the application, you must review and accept our Terms & Conditions.
        </p>
        <a 
          href="https://mailplus.com.au/terms-conditions/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="tc-link"
        >
          Read Terms & Conditions
        </a>
        
        {error && <div className="tc-error">{error}</div>}
        
        <button 
          onClick={handleAccept} 
          disabled={isAccepting}
          className="tc-accept-btn"
        >
          {isAccepting ? 'Accepting...' : 'Accept Terms & Conditions'}
        </button>
      </div>

      <style>{`
        .tc-modal-overlay {
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

        .tc-modal-content {
          background: white;
          padding: 40px;
          border-radius: 16px;
          max-width: 480px;
          width: 90%;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }

        .tc-modal-content h2 {
          font-family: var(--font-headings);
          color: var(--ink);
          margin-bottom: 16px;
          font-size: 1.8rem;
        }

        .tc-modal-content p {
          color: #666;
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .tc-link {
          display: inline-block;
          color: var(--ink);
          font-weight: 600;
          text-decoration: underline;
          margin-bottom: 32px;
          transition: color 0.2s;
        }

        .tc-link:hover {
          color: #000;
        }

        .tc-error {
          color: var(--danger);
          font-size: 0.9rem;
          margin-bottom: 20px;
          padding: 10px;
          background: #ffebee;
          border-radius: 8px;
        }

        .tc-accept-btn {
          width: 100%;
          background: var(--ink);
          color: white;
          border: none;
          padding: 14px 24px;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s, opacity 0.2s;
        }

        .tc-accept-btn:hover:not(:disabled) {
          background: #000;
        }

        .tc-accept-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default TermsAndConditionsModal;
