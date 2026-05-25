import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { Lock, User, Building, MapPin, Key, ArrowRight, Loader2, Smartphone, Mail } from 'lucide-react';
import { db, functions, auth } from '../../firebase/config';

const ActivateAccount: React.FC = () => {
  const { uid } = useParams<{ uid: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlCode = searchParams.get('code') || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState('');
  
  const [userData, setUserData] = useState<any>(null);
  const [companyData, setCompanyData] = useState<any>(null);

  const [code, setCode] = useState(urlCode);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!uid) {
        setError('Invalid activation link.');
        setIsLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (!userDoc.exists()) {
          setError('User not found.');
          setIsLoading(false);
          return;
        }

        const uData = userDoc.data();
        if (uData.status === 'Active') {
          navigate('/signin');
          return;
        }
        setUserData(uData);

        if (uData.companyId) {
          const compDoc = await getDoc(doc(db, 'companies', uData.companyId));
          if (compDoc.exists()) {
            setCompanyData(compDoc.data());
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load account details.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [uid, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 4) {
      setError('Please enter a valid 4-digit security code.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsActivating(true);
    setError('');

    try {
      const activateFn = httpsCallable(functions, 'activateAccount');
      const result = await activateFn({
        uid,
        code,
        newPassword: password
      });

      const data = result.data as any;
      if (data.success && data.customToken) {
        await signInWithCustomToken(auth, data.customToken);
        navigate('/dashboard');
      } else {
        throw new Error('Failed to activate account.');
      }
    } catch (err: any) {
      console.error('Activation Error:', err);
      setError(err.message || 'Activation failed. The code may be invalid or expired.');
    } finally {
      setIsActivating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="activate-page">
        <div className="loading-state">
          <Loader2 className="animate-spin" size={40} color="var(--ink)" />
          <p>Loading account details...</p>
        </div>
      </div>
    );
  }

  if (error && !userData) {
    return (
      <div className="activate-page">
        <div className="activate-card">
          <div className="error-state">
            <h2>Oops!</h2>
            <p>{error}</p>
            <button className="activate-btn" onClick={() => navigate('/signin')}>
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="activate-page">
      <div className="activate-container">
        <div className="activate-card">
          <div className="logo-section">
            <h1 className="brand-logo">LocalMile<span className="logo-plus">.Plus</span></h1>
            <p className="powered-by">Powered by MailPlus</p>
            <h2 className="welcome-text">Activate Your Account</h2>
          </div>

          <div className="readonly-details">
            <div className="detail-group">
              <div className="icon-wrapper">
                <Building size={20} />
              </div>
              <div className="detail-text">
                <span className="label">Business Name</span>
                <span className="value">{companyData?.companyName || 'Not Provided'}</span>
              </div>
            </div>
            <div className="detail-group">
              <div className="icon-wrapper">
                <User size={20} />
              </div>
              <div className="detail-text">
                <span className="label">Primary Contact</span>
                <span className="value">{userData?.first_name} {userData?.last_name}</span>
              </div>
            </div>
            <div className="detail-group">
              <div className="icon-wrapper">
                <Mail size={20} />
              </div>
              <div className="detail-text">
                <span className="label">Email Address</span>
                <span className="value">{userData?.email}</span>
              </div>
            </div>
            <div className="detail-group">
              <div className="icon-wrapper">
                <Smartphone size={20} />
              </div>
              <div className="detail-text">
                <span className="label">Mobile Number</span>
                <span className="value">{userData?.mobile || companyData?.customerPhone || 'Not Provided'}</span>
              </div>
            </div>
            <div className="detail-group full-width">
              <div className="icon-wrapper">
                <MapPin size={20} />
              </div>
              <div className="detail-text">
                <span className="label">Company Address</span>
                <span className="value">
                  {companyData ? 
                    `${companyData.street}, ${companyData.city}, ${companyData.state} ${companyData.zip}` : 
                    'Not Provided'
                  }
                </span>
              </div>
            </div>
          </div>

          <form className="activate-form" onSubmit={handleSubmit}>
            {!urlCode && (
              <div className="input-group">
                <label htmlFor="code">4-Digit Security Code</label>
                <div className="input-wrapper">
                  <Key size={20} />
                  <input 
                    id="code"
                    type="text" 
                    maxLength={4}
                    placeholder="Enter the code sent to you"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\\D/g, ''))}
                    required
                  />
                </div>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="password">Set Password</label>
              <div className="input-wrapper">
                <Lock size={20} />
                <input 
                  id="password"
                  type="password" 
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="input-wrapper">
                <Lock size={20} />
                <input 
                  id="confirmPassword"
                  type="password" 
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="activate-btn" disabled={isActivating}>
              {isActivating ? <Loader2 className="animate-spin" size={20} /> : 'Activate & Login'}
              {!isActivating && <ArrowRight size={20} />}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .activate-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at top left, #f8f9fa, #e9ecef);
          padding: 20px;
        }

        .activate-container {
          width: 100%;
          max-width: 520px;
          animation: fadeInUp 0.6s ease-out;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .activate-card {
          background: white;
          border-radius: 32px;
          padding: 48px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.03);
        }

        .logo-section {
          text-align: center;
          margin-bottom: 32px;
        }

        .brand-logo {
          font-family: var(--font-headings);
          font-size: 3rem;
          font-weight: 400;
          color: var(--ink);
          letter-spacing: -0.04em;
          margin-bottom: 4px;
        }
        
        .brand-logo .logo-plus {
          color: var(--yellow);
          font-family: var(--font-headings);
          font-weight: 500;
          font-style: italic;
        }

        .powered-by {
          font-family: var(--font-ui);
          font-size: 0.65rem;
          font-weight: 600;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 24px;
        }

        .welcome-text {
          font-family: var(--font-headings);
          font-size: 1.5rem;
          color: var(--ink);
          margin: 0;
          font-weight: 500;
        }

        .readonly-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 32px;
        }

        .detail-group {
          background: #f8f9fa;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border: 1px solid rgba(0, 0, 0, 0.04);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .detail-group.full-width {
          grid-column: 1 / -1;
        }

        .icon-wrapper {
          width: 40px;
          height: 40px;
          background: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          border: 1px solid rgba(0,0,0,0.02);
        }

        .icon-wrapper svg {
          color: var(--ink);
        }

        .detail-text {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .detail-text .label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #868e96;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .detail-text .value {
          font-size: 1rem;
          font-weight: 700;
          color: var(--ink);
          line-height: 1.4;
          word-break: break-word;
        }

        .activate-form {
          margin-top: 32px;
        }

        .input-group {
          margin-bottom: 24px;
        }

        .input-group label {
          display: block;
          font-family: var(--font-ui);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 10px;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-wrapper svg {
          position: absolute;
          left: 16px;
          color: #adb5bd;
          pointer-events: none;
        }

        .input-wrapper input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          border: 2px solid #f1f3f5;
          border-radius: 16px;
          background: #f8f9fa;
          font-family: var(--font-ui);
          font-size: 1rem;
          color: var(--ink);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .input-wrapper input:focus {
          outline: none;
          border-color: var(--yellow);
          background: white;
          box-shadow: 0 0 0 4px rgba(234, 240, 68, 0.15);
        }

        .error-message {
          color: #d63384;
          font-size: 0.9rem;
          margin-bottom: 24px;
          padding: 14px 18px;
          background: #fff0f6;
          border-radius: 14px;
          border-left: 4px solid #d63384;
          font-weight: 500;
        }

        .activate-btn {
          width: 100%;
          background: var(--ink);
          color: white;
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 1.1rem;
          border-radius: 16px;
          font-weight: 600;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          border: none;
        }

        .activate-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
        }

        .activate-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .activate-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-state, .error-state {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .loading-state p, .error-state p {
          color: #666;
          font-size: 1.1rem;
          font-weight: 500;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .activate-card {
            padding: 32px 24px;
          }
          .readonly-details {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ActivateAccount;
