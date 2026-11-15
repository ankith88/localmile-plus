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
        <div className="signin-card glass fade-in">
          <div className="signin-header">
            <div className="brand-logo">
              <span className="logo-lpo">LocalMile</span>
              <span className="logo-plus">.Plus</span>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(20, 41, 95, 0.08)',
                color: 'var(--navy, #14295f)',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                marginBottom: '12px',
              }}
            >
              <ShieldCheck size={15} />
              <span>{companyName ? `${companyName} • Proof Portal` : 'Franchisee & Operator Proof Portal'}</span>
            </div>
            <h1>Operator Sign In</h1>
            <p className="subtitle">Sign in to upload Proof of Delivery & Excess Weight images</p>
          </div>

          <div className="login-tabs">
            <button
              type="button"
              className={`tab-btn ${loginMethod === 'email' ? 'active' : ''}`}
              onClick={() => {
                setLoginMethod('email');
                setIdentifier('');
                setError('');
              }}
            >
              <Mail size={16} />
              <span>Email</span>
            </button>
            <button
              type="button"
              className={`tab-btn ${loginMethod === 'mobile' ? 'active' : ''}`}
              onClick={() => {
                setLoginMethod('mobile');
                setIdentifier('');
                setError('');
              }}
            >
              <Phone size={16} />
              <span>Mobile</span>
            </button>
          </div>

          {error && (
            <div
              className="error-banner"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
          {message && <div className="success-banner">{message}</div>}

          <form onSubmit={handleSignIn} className="signin-form">
            <div className="input-group">
              <label>{loginMethod === 'email' ? 'Operator / Franchisee Email' : 'Mobile Number'}</label>
              <div className="input-wrapper">
                {loginMethod === 'email' ? (
                  <Mail size={18} className="input-icon" />
                ) : (
                  <Phone size={18} className="input-icon" />
                )}
                <input
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
                <label>Password</label>
                {loginMethod === 'email' && (
                  <button
                    type="button"
                    className="forgot-link"
                    onClick={handleForgotPassword}
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary signin-btn" disabled={loading}>
              <span>{loading ? 'Signing In...' : 'Continue to Upload Portal'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(15, 23, 42, 0.08)',
              textAlign: 'center',
              fontSize: '0.82rem',
              color: '#64748b',
            }}
          >
            Standard portal user?{' '}
            <button
              type="button"
              onClick={() => navigate('/signin')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--navy, #14295f)',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Go to Main Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperatorSignIn;
