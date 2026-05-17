import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  verifyPasswordResetCode, 
  confirmPasswordReset 
} from 'firebase/auth';
import { auth } from '../../firebase/config';
import { Lock, CheckCircle, AlertCircle, ArrowRight, Key } from 'lucide-react';
import LoadingScreen from '../../components/LoadingScreen';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const verifyCode = async () => {
      if (mode !== 'resetPassword' || !oobCode) {
        setError('Invalid or expired reset link. Please request a new one from the sign-in page.');
        setVerifying(false);
        setLoading(false);
        return;
      }

      try {
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
        setVerifying(false);
        setLoading(false);
      } catch (err: any) {
        console.error("Verification error:", err);
        setError('This reset link has expired or has already been used.');
        setVerifying(false);
        setLoading(false);
      }
    };

    verifyCode();
  }, [mode, oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await confirmPasswordReset(auth, oobCode!, newPassword);
      setSuccess(true);
    } catch (err: any) {
      console.error("Reset error:", err);
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && verifying) {
    return <LoadingScreen message="Verifying Security Code" />;
  }

  return (
    <div className="reset-page-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <div className="reset-container">
        <div className="reset-card glass fade-in">
          <div className="logo-section">
            <h1 className="brand-logo">LocalMile<span className="logo-plus">.Plus</span></h1>
            <p className="powered-by font-ui">Powered by MailPlus</p>
          </div>

          {!success ? (
            <>
              <div className="header-text">
                <div className="icon-badge">
                  <Key size={24} />
                </div>
                <h2>Secure Password Reset</h2>
                {email ? (
                  <p className="email-hint">
                    Set a new password for <span className="highlight">{email}</span>
                  </p>
                ) : (
                  <p className="email-hint">Secure your account with a new password</p>
                )}
              </div>

              {error ? (
                <div className="error-state-premium">
                  <div className="error-message-glass">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                  </div>
                  <Link to="/signin" className="btn-secondary-glass full-width">
                    Return to Sign In
                  </Link>
                </div>
              ) : (
                <form className="reset-form" onSubmit={handleResetPassword}>
                  <div className="input-group">
                    <label className="label-eyebrow" htmlFor="newPassword">New Password</label>
                    <div className="input-wrapper-glass">
                      <Lock size={18} />
                      <input 
                        id="newPassword"
                        type="password" 
                        placeholder="Min. 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="label-eyebrow" htmlFor="confirmPassword">Confirm Password</label>
                    <div className="input-wrapper-glass">
                      <Lock size={18} />
                      <input 
                        id="confirmPassword"
                        type="password" 
                        placeholder="Re-enter new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary-glass full-width" disabled={loading}>
                    <span>{loading ? 'Updating Security...' : 'Reset Password'}</span>
                    {!loading && <ArrowRight size={20} />}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="success-state-premium fade-in">
              <div className="success-icon-badge">
                <CheckCircle size={40} />
              </div>
              <h2>Password Updated</h2>
              <p>Your password has been reset successfully. You can now access your account with the new credentials.</p>
              <button 
                onClick={() => navigate('/signin')} 
                className="btn-primary-glass full-width"
              >
                <span>Sign In Now</span>
                <ArrowRight size={20} />
              </button>
            </div>
          )}
        </div>
        
        <div className="reset-footer font-ui">
          &copy; {new Date().getFullYear()} LocalMile.Plus Security Protocol
        </div>
      </div>

      <style>{`
        .reset-page-premium {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--offwhite);
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .mesh-bg {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 0;
          filter: blur(100px);
          opacity: 0.4;
        }

        .blob {
          position: absolute;
          border-radius: 50%;
          width: 500px;
          height: 500px;
          background: var(--cream-warm);
          animation: blobPulse 10s infinite alternate;
        }

        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -100px; left: -100px; background: var(--yellow); opacity: 0.3; }

        @keyframes blobPulse {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.2) translate(50px, 50px); }
        }

        .reset-container {
          width: 100%;
          max-width: 460px;
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .reset-card.glass {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(15px);
          border-radius: 32px;
          padding: 48px;
          box-shadow: 0 20px 60px rgba(26, 61, 51, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }

        .logo-section {
          text-align: center;
          margin-bottom: 40px;
        }

        .brand-logo {
          font-family: var(--font-headings);
          font-size: 2.4rem;
          font-weight: 400;
          color: var(--ink);
          letter-spacing: -0.025em;
          margin-bottom: 6px;
        }
        
        .brand-logo .logo-plus {
          color: var(--yellow);
          font-family: var(--font-headings);
          font-weight: 500;
          font-style: italic;
        }

        .powered-by {
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.2em;
          opacity: 0.6;
        }

        .header-text {
          text-align: center;
          margin-bottom: 36px;
        }

        .icon-badge {
          width: 56px;
          height: 56px;
          background: var(--offwhite);
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          color: var(--gold);
          box-shadow: 0 8px 20px rgba(168, 118, 58, 0.15);
        }

        .header-text h2 {
          font-family: var(--font-headings);
          font-size: 1.8rem;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 12px;
        }

        .email-hint {
          font-size: 0.95rem;
          color: var(--ink-soft);
          line-height: 1.5;
        }

        .email-hint .highlight {
          color: var(--ink);
          font-weight: 700;
        }

        .input-group {
          margin-bottom: 24px;
        }

        .label-eyebrow {
          display: block;
          font-size: 0.65rem;
          margin-bottom: 10px;
          color: var(--gold);
        }

        .input-wrapper-glass {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-wrapper-glass svg {
          position: absolute;
          left: 18px;
          color: var(--ink-soft);
          opacity: 0.5;
        }

        .input-wrapper-glass input {
          width: 100%;
          padding: 16px 16px 16px 52px;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.06);
          background: white;
          font-size: 1rem;
          font-weight: 500;
          transition: all 0.3s;
          color: var(--ink);
        }

        .input-wrapper-glass input:focus {
          border-color: var(--gold);
          box-shadow: 0 0 0 4px rgba(168, 118, 58, 0.1);
          outline: none;
        }

        .full-width {
          width: 100%;
        }

        .error-message-glass {
          color: #b71c1c;
          font-size: 0.9rem;
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(255, 235, 238, 0.5);
          border-radius: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(183, 28, 28, 0.1);
        }

        .btn-secondary-glass {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.05);
          background: white;
          font-weight: 700;
          color: var(--ink);
          text-decoration: none;
          transition: all 0.2s;
        }

        .btn-secondary-glass:hover {
          background: var(--offwhite);
          transform: translateY(-2px);
        }

        .success-state-premium {
          text-align: center;
        }

        .success-icon-badge {
          width: 80px;
          height: 80px;
          background: #e8f5e9;
          color: #2e7d32;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          box-shadow: 0 10px 25px rgba(46, 125, 50, 0.15);
        }

        .success-state-premium h2 {
          font-family: var(--font-headings);
          font-size: 2rem;
          color: var(--ink);
          margin-bottom: 16px;
        }

        .success-state-premium p {
          color: var(--ink-soft);
          margin-bottom: 36px;
          line-height: 1.6;
          font-size: 1.05rem;
        }

        .reset-footer {
          text-align: center;
          font-size: 0.65rem;
          color: var(--ink-soft);
          opacity: 0.4;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .fade-in {
          animation: fadeIn 0.6s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .reset-card.glass {
            padding: 32px 24px;
          }
          
          .brand-logo {
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
};

export default ResetPassword;

