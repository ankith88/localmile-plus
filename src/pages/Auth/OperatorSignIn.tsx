import React, { useState, useEffect } from 'react';
import { Mail, Phone, Lock, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useLpo, isSuperAdminUid, type UserMetadata } from '../../context/LpoContext';
import LoadingScreen from '../../components/LoadingScreen';
import {
  fetchTargetCompanyName,
  hasCompany1868657UploadAccess,
  TARGET_COMPANY_ID,
} from '../../utils/operatorAccess';

const OperatorSignIn: React.FC = () => {
  const navigate = useNavigate();
  const { user, userData, isAdmin, loading: authLoading } = useLpo();
  const [loginMethod, setLoginMethod] = useState<'email' | 'mobile'>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    fetchTargetCompanyName().then(setCompanyName);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    hasCompany1868657UploadAccess(userData, isAdmin, user.email).then((allowed) => {
      if (active && allowed) {
        navigate('/operator/upload', { replace: true });
      }
    });
    return () => {
      active = false;
    };
  }, [user, userData, isAdmin, authLoading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      let emailToUse = identifier.trim();

      if (loginMethod === 'mobile') {
        const cleanedMobile = identifier.replace(/\s+/g, '');
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('mobile', '==', cleanedMobile));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error('No account found with this mobile number. Please check or sign in with email.');
        }

        emailToUse = querySnapshot.docs[0].data().email;
      }

      const cred = await signInWithEmailAndPassword(auth, emailToUse, password);
      const signedInUser = cred.user;

      // Fetch user metadata to verify Company 1868657 upload access
      let fetchedUserData: UserMetadata | null = null;
      let userDoc = await getDoc(doc(db, 'users', signedInUser.uid));
      if (!userDoc.exists() && signedInUser.email) {
        userDoc = await getDoc(doc(db, 'users', signedInUser.email));
      }
      if (userDoc.exists()) {
        fetchedUserData = { ...(userDoc.data() as UserMetadata), uid: signedInUser.uid };
      }

      const signedInIsAdmin =
        fetchedUserData?.role === 'admin' ||
        fetchedUserData?.role === 'superadmin' ||
        isSuperAdminUid(signedInUser.uid);

      const allowed = await hasCompany1868657UploadAccess(
        fetchedUserData,
        signedInIsAdmin,
        signedInUser.email
      );

      if (!allowed) {
        await auth.signOut();
        setError(
          `Access not granted for Company ${TARGET_COMPANY_ID} Proof Upload. Please ask an Admin to add your email.`
        );
        return;
      }

      navigate('/operator/upload', { replace: true });
    } catch (err: unknown) {
      console.error('Operator sign in error:', err);
      const firebaseErr = err as { code?: string; message?: string };
      let errorMessage = 'Failed to sign in. Please check your credentials.';
      if (
        firebaseErr.code === 'auth/user-not-found' ||
        firebaseErr.code === 'auth/wrong-password' ||
        firebaseErr.code === 'auth/invalid-credential'
      ) {
        errorMessage = 'Invalid email or password.';
      } else if (firebaseErr.message) {
        errorMessage = firebaseErr.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!identifier || loginMethod !== 'email') {
      setError('Please enter your email address first to reset your password.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: identifier.trim(),
          origin: window.location.origin,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to send reset email.');
      }

      setMessage('Password reset email sent! Please check your inbox.');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-page">
      {(loading || authLoading) && <LoadingScreen message="Verifying Operator Access" />}
      <div className="signin-container">
        <div className="signin-card">
          <div className="logo-section">
            <h1 className="brand-logo">LocalMile<span className="logo-plus">.Plus</span></h1>
            <p className="powered-by">Powered by MailPlus</p>
            <h2 className="operator-title">Operator Sign In</h2>
            <p className="welcome-text">Sign in to upload Proof of Delivery &amp; Excess Weight images</p>
            <div className="portal-pill">
              <ShieldCheck size={14} />
              <span>{companyName ? `${companyName} • Proof Portal` : 'Franchisee & Operator Proof Portal'}</span>
            </div>
          </div>

          <form onSubmit={handleSignIn} className="signin-form">
            <div className="method-toggle">
              <button
                type="button"
                className={loginMethod === 'email' ? 'active' : ''}
                onClick={() => {
                  setLoginMethod('email');
                  setIdentifier('');
                  setError('');
                }}
              >
                <Mail size={18} /> Email
              </button>
              <button
                type="button"
                className={loginMethod === 'mobile' ? 'active' : ''}
                onClick={() => {
                  setLoginMethod('mobile');
                  setIdentifier('');
                  setError('');
                }}
              >
                <Phone size={18} /> Mobile
              </button>
            </div>

            <div className="input-group">
              <label htmlFor="operator-identifier">
                {loginMethod === 'email' ? 'Operator / Franchisee Email' : 'Mobile Number'}
              </label>
              <div className="input-wrapper">
                {loginMethod === 'email' ? <Mail size={20} /> : <Phone size={20} />}
                <input
                  id="operator-identifier"
                  type={loginMethod === 'email' ? 'email' : 'tel'}
                  placeholder={loginMethod === 'email' ? 'driver@mailplus.com.au' : '0400 000 000'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div className="label-row">
                <label htmlFor="operator-password">Password</label>
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={handleForgotPassword}
                  disabled={loading}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="input-wrapper">
                <Lock size={20} />
                <input
                  id="operator-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}
            {message && <div className="success-message">{message}</div>}

            <button type="submit" className="signin-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Continue to Upload Portal'}
              {!loading && <ArrowRight size={20} />}
            </button>
          </form>

          <p className="footer-link">
            Standard portal user?{' '}
            <a
              href="/signin"
              onClick={(e) => {
                e.preventDefault();
                navigate('/signin');
              }}
            >
              Go to Main Sign In
            </a>
          </p>
        </div>
      </div>

      <style>{`
        .signin-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--offwhite);
          padding: 20px;
        }

        .signin-container {
          width: 100%;
          max-width: 440px;
        }

        .signin-card {
          background: var(--paper);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 10px 40px rgba(26, 61, 51, 0.1);
        }

        .logo-section {
          text-align: center;
          margin-bottom: 32px;
        }

        .brand-logo {
          font-family: var(--font-headings);
          font-size: 2.8rem;
          font-weight: 400;
          color: var(--ink);
          letter-spacing: -0.025em;
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
          font-weight: 500;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin-bottom: 20px;
        }

        .operator-title {
          font-family: var(--font-headings);
          font-size: 1.35rem;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 4px;
        }

        .welcome-text {
          color: var(--ink-soft);
          font-size: 0.92rem;
          font-weight: 500;
          margin-top: 2px;
        }

        .portal-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--cream-warm);
          color: var(--ink);
          padding: 5px 12px;
          border-radius: 999px;
          font-family: var(--font-ui);
          font-size: 0.68rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          margin-top: 14px;
        }

        .method-toggle {
          display: flex;
          background: var(--cream-warm);
          padding: 4px;
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .method-toggle button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          background: transparent;
          color: var(--ink-soft);
          font-size: 0.9rem;
        }

        .method-toggle button.active {
          background: white;
          color: var(--ink);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .input-group {
          margin-bottom: 20px;
        }

        .input-group label {
          display: block;
          font-family: var(--font-ui);
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--ink);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          margin-bottom: 8px;
        }

        .label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .label-row label {
          margin-bottom: 0;
        }

        .forgot-password-link {
          background: none;
          border: none;
          color: var(--ink-soft);
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: color 0.2s;
        }

        .forgot-password-link:hover {
          color: var(--ink);
          text-decoration: underline;
        }

        .input-wrapper {
          position: relative;
        }

        .input-wrapper svg {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--ink-soft);
          opacity: 0.6;
          pointer-events: none;
        }

        .input-wrapper input {
          padding-left: 45px;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--danger);
          font-size: 0.85rem;
          margin-bottom: 20px;
          padding: 10px 12px;
          background: #ffebee;
          border-radius: 8px;
        }

        .success-message {
          color: #2e7d32;
          font-size: 0.85rem;
          margin-bottom: 20px;
          padding: 10px 12px;
          background: #e8f5e9;
          border-radius: 8px;
        }

        .signin-btn {
          width: 100%;
          background: var(--ink);
          color: white;
          padding: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 1.05rem;
          margin-bottom: 24px;
        }

        .signin-btn:hover:not(:disabled) {
          background: var(--ink-soft);
        }

        .signin-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .footer-link {
          text-align: center;
          font-size: 0.85rem;
          color: var(--ink-soft);
        }

        .footer-link a {
          color: var(--ink);
          font-weight: 600;
          text-decoration: none;
        }

        .footer-link a:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .signin-card {
            padding: 28px 22px;
          }
        }
      `}</style>
    </div>
  );
};

export default OperatorSignIn;
