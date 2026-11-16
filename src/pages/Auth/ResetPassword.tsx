import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  verifyPasswordResetCode, 
  confirmPasswordReset 
} from 'firebase/auth';
import { auth } from '../../firebase/config';
import { Lock, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
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
  const [linkError, setLinkError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const verifyCode = async () => {
      if (mode !== 'resetPassword' || !oobCode) {
        setLinkError('Invalid or expired reset link. Please request a new one from the sign-in page.');
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
        setLinkError('This reset link has expired or has already been used.');
        setVerifying(false);
        setLoading(false);
      }
    };

    verifyCode();
  }, [mode, oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode!, newPassword);
      setSuccess(true);
    } catch (err: any) {
      console.error("Reset error:", err);
      setFormError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && verifying) {
    return <LoadingScreen message="Verifying Security Code" />;
  }

  return (
    <div className="signin-page">
      {loading && !verifying && <LoadingScreen message="Updating Password" />}
      <div className="signin-container">
        <div className="signin-card">
          <div className="logo-section">
            <h1 className="brand-logo">LocalMile<span className="logo-plus">.Plus</span></h1>
            <p className="powered-by">Powered by MailPlus</p>
            {!success && (
              <>
                <h2 className="reset-title">Reset Password</h2>
                {email ? (
                  <p className="welcome-text">
                    Set a new password for <span className="email-highlight">{email}</span>
                  </p>
                ) : (
                  <p className="welcome-text">Secure your account with a new password</p>
                )}
              </>
            )}
          </div>

          {!success ? (
            linkError ? (
              <div className="link-error-state">
                <div className="error-message">
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>{linkError}</span>
                </div>
                <Link to="/signin" className="signin-btn" style={{ textDecoration: 'none', marginBottom: 0 }}>
                  <span>Return to Sign In</span>
                  <ArrowRight size={20} />
                </Link>
              </div>
            ) : (
              <form className="signin-form" onSubmit={handleResetPassword}>
                <div className="input-group">
                  <label htmlFor="newPassword">New Password</label>
                  <div className="input-wrapper">
                    <Lock size={20} />
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
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <div className="input-wrapper">
                    <Lock size={20} />
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

                {formError && (
                  <div className="error-message">
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span>{formError}</span>
                  </div>
                )}

                <button type="submit" className="signin-btn" disabled={loading}>
                  <span>{loading ? 'Updating Password...' : 'Reset Password'}</span>
                  {!loading && <ArrowRight size={20} />}
                </button>

                <p className="footer-link">
                  Remembered your password?{' '}
                  <Link to="/signin">Return to Sign In</Link>
                </p>
              </form>
            )
          ) : (
            <div className="success-state">
              <div className="success-icon-badge">
                <CheckCircle size={36} />
              </div>
              <h2 className="reset-title">Password Updated</h2>
              <p className="welcome-text" style={{ marginBottom: '28px' }}>
                Your password has been reset successfully. You can now access your account with your new credentials.
              </p>
              <button
                type="button"
                onClick={() => navigate('/signin')}
                className="signin-btn"
                style={{ marginBottom: 0 }}
              >
                <span>Sign In Now</span>
                <ArrowRight size={20} />
              </button>
            </div>
          )}
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

        .reset-title {
          font-family: var(--font-headings);
          font-size: 1.35rem;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 6px;
        }

        .welcome-text {
          color: var(--ink-soft);
          font-size: 0.92rem;
          font-weight: 500;
          line-height: 1.5;
        }

        .email-highlight {
          color: var(--ink);
          font-weight: 700;
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

        .signin-btn {
          width: 100%;
          background: var(--ink);
          color: white;
          padding: 14px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 1.05rem;
          font-weight: 600;
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

        .success-state {
          text-align: center;
        }

        .success-icon-badge {
          width: 64px;
          height: 64px;
          background: #e8f5e9;
          color: #2e7d32;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
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

export default ResetPassword;

