import React, { useState, useEffect } from 'react';
import { Mail, Phone, Lock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import LoadingScreen from '../../components/LoadingScreen';
import SupportEmailModal from '../../components/SupportEmailModal';


const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useLpo();
  const [loginMethod, setLoginMethod] = useState<'email' | 'mobile'>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);


  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      console.log("User already logged in, redirecting to dashboard...");
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    console.log(`Attempting sign in for ${identifier}...`);

    try {
      let emailToUse = identifier;

      if (loginMethod === 'mobile') {
        // Remove spaces and common formatting if any
        const cleanedMobile = identifier.replace(/\s+/g, '');
        
        // Query users collection for this mobile number
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('mobile', '==', cleanedMobile));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error('No account found with this mobile number. Please check or sign in with email.');
        }

        emailToUse = querySnapshot.docs[0].data().email;
      }

      await signInWithEmailAndPassword(auth, emailToUse, password);
      console.log("Sign in successful! Redirecting...");
      navigate('/dashboard');
    } catch (err: any) {
      console.error("Sign in error:", err);
      let errorMessage = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!identifier || loginMethod !== 'email') {
      setError('Please enter your email address to reset your password.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          email: identifier,
          origin: window.location.origin
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to send reset email.');
      }

      setMessage('Password reset email sent! Please check your inbox.');
    } catch (err: any) {
      console.error("Reset error:", err);
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-page">
      {loading && <LoadingScreen message="Establishing Secure Connection" />}
      <div className="signin-container">
        <div className="signin-card">
          <div className="logo-section">
            <h1 className="brand-logo">LocalMile<span className="logo-plus">.Plus</span></h1>
            <p className="powered-by">Powered by MailPlus</p>
            <p className="welcome-text">Connected Logistics for Businesses</p>
          </div>

          <form className="signin-form" onSubmit={handleSignIn}>
            <div className="method-toggle">
              <button 
                type="button"
                className={loginMethod === 'email' ? 'active' : ''}
                onClick={() => setLoginMethod('email')}
              >
                <Mail size={18} /> Email
              </button>
              <button 
                type="button"
                className={loginMethod === 'mobile' ? 'active' : ''}
                onClick={() => setLoginMethod('mobile')}
              >
                <Phone size={18} /> Mobile
              </button>
            </div>

            <div className="input-group">
              <label htmlFor="identifier">
                {loginMethod === 'email' ? 'Email Address' : 'Mobile Number'}
              </label>
              <div className="input-wrapper">
                {loginMethod === 'email' ? <Mail size={20} /> : <Phone size={20} />}
                <input 
                  id="identifier"
                  type={loginMethod === 'email' ? 'email' : 'tel'} 
                  placeholder={loginMethod === 'email' ? 'Enter your email' : 'Enter your mobile'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div className="label-row">
                <label htmlFor="password">Password</label>
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
                  id="password"
                  type="password" 
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={loginMethod === 'email' || !!password}
                />
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <button type="submit" className="signin-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight size={20} />}
            </button>
          </form>

          {/* <p className="footer-link">
            Don't have an account? <a onClick={() => navigate('/register')} style={{cursor: 'pointer'}}>Create one</a>
          </p> */}
          <p className="footer-link" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
            Trouble signing in? <a href="#" onClick={(e) => { e.preventDefault(); setIsSupportModalOpen(true); }}>Contact Support</a>
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
          margin-bottom: 40px;
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
          margin-bottom: 24px;
        }

        .welcome-text {
          color: #666;
          font-weight: 500;
          margin-top: 4px;
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
          color: #666;
          font-size: 0.9rem;
        }

        .method-toggle button.active {
          background: white;
          color: var(--ink);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
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
        }

        .label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
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
          color: #999;
        }

        .input-wrapper input {
          padding-left: 45px;
        }

        .error-message {
          color: var(--danger);
          font-size: 0.85rem;
          margin-bottom: 20px;
          padding: 10px;
          background: #ffebee;
          border-radius: 8px;
        }

        .success-message {
          color: #2e7d32;
          font-size: 0.85rem;
          margin-bottom: 20px;
          padding: 10px;
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
          font-size: 1.1rem;
          margin-bottom: 24px;
        }

        .signin-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .footer-link {
          text-align: center;
          font-size: 0.9rem;
          color: #666;
        }

        .footer-link a {
          color: var(--ink);
          font-weight: 600;
          text-decoration: none;
        }
      `}</style>
      <SupportEmailModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        to="ankith.ravindran@mailplus.com.au"
        title="Contact Support"
        defaultSubject="Trouble Signing In: Support Request"
        requireSenderInfo={true}
      />
    </div>
  );
};

export default SignIn;
