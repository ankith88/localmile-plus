import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Shield, 
  MapPin, 
  Building, 
  Save, 
  CheckCircle,
  AlertCircle,
  KeyRound
} from 'lucide-react';
import { useLpo } from '../../context/LpoContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase/config';

const Profile: React.FC = () => {
  const { user, userData, parent, customer, companyData, updateUserData } = useLpo();
  
  const [mobile, setMobile] = useState(userData?.mobile || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Clean mobile number (digits only)
      const cleanedMobile = mobile.replace(/\D/g, '');
      await updateUserData({ mobile: cleanedMobile });
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error("Profile update error:", err);
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    
    setLoading(true);
    setError('');
    
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setSuccess('Password reset email sent!');
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1 className="page-title">Account Settings</h1>
        <p className="page-subtitle">Manage your personal information and security preferences</p>
      </div>

      <div className="profile-grid">
        <div className="profile-card">
          <div className="card-header">
            <User size={20} />
            <h2>Personal Information</h2>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="profile-form">
            <div className="form-group">
              <label>Full Name</label>
              <div className="input-readonly">
                <User size={18} />
                <input 
                  type="text" 
                  value={userData?.first_name && userData?.last_name 
                    ? `${userData.first_name} ${userData.last_name}` 
                    : (user?.displayName || 'Clarke Kent')} 
                  readOnly 
                />
                <Shield size={14} className="verified-icon" />
              </div>
              <p className="field-note">Name is managed by administrators</p>
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <div className="input-readonly">
                <Mail size={18} />
                <input type="email" value={user?.email || ''} readOnly />
                <Shield size={14} className="verified-icon" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="mobile">Mobile Number</label>
              <div className="input-wrapper">
                <Phone size={18} />
                <input 
                  id="mobile"
                  type="tel" 
                  placeholder="e.g. 0412 345 678"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
              <p className="field-note">Used for mobile-number login</p>
            </div>

            {error && <div className="error-alert"><AlertCircle size={18} /> {error}</div>}
            {success && <div className="success-alert"><CheckCircle size={18} /> {success}</div>}

            <button type="submit" className="save-btn" disabled={loading || mobile === (userData?.mobile || '')}>
              {loading ? 'Saving...' : <><Save size={18} /> Save Changes</>}
            </button>
          </form>
        </div>

        <div className="side-cards">
          <div className="profile-card security-card">
            <div className="card-header">
              <Lock size={20} />
              <h2>Security</h2>
            </div>
            <div className="card-content">
              <p className="security-text">
                Keep your account secure by regularly updating your password.
              </p>
              
              {!resetSent ? (
                <button 
                  type="button" 
                  className="reset-btn" 
                  onClick={handlePasswordReset}
                  disabled={loading}
                >
                  <KeyRound size={18} /> Change Password
                </button>
              ) : (
                <div className="reset-status">
                  <CheckCircle size={20} />
                  <span>Reset link sent to your email</span>
                </div>
              )}
            </div>
          </div>

          <div className="profile-card lpo-info-card">
            <div className="card-header">
              {userData?.role === 'customer' ? <MapPin size={20} /> : <Building size={20} />}
              <h2>{userData?.role === 'customer' ? 'Your Site Address' : 'Your Parent Account'}</h2>
            </div>
            <div className="card-content">
              {userData?.role === 'customer' ? (
                <>
                  {userData?.customer_id && userData.customer_id !== 'test_standalone_customer' && (
                    <div className="lpo-badge">
                      <span className="lpo-id">{userData.customer_id}</span>
                    </div>
                  )}
                  <h3 className="lpo-display-name">{companyData?.companyName || companyData?.company_name || customer?.name || 'Your Company'}</h3>
                  <div className="lpo-detail">
                    <MapPin size={16} />
                    <span>
                      {([
                        companyData?.address1,
                        companyData?.street
                      ].filter(p => p && String(p).trim()).join(', ') || customer?.address || 'Verify your address')}
                    </span>
                  </div>
                  {([
                    companyData?.city || companyData?.suburb || customer?.suburb,
                    companyData?.state || customer?.state,
                    companyData?.postcode || companyData?.zip || customer?.postcode
                  ].some(p => p && String(p).trim())) && (
                    <div className="lpo-detail" style={{ marginTop: '4px' }}>
                      <Building size={16} />
                      <span>
                        {([
                          companyData?.city || companyData?.suburb || customer?.suburb,
                          companyData?.state || customer?.state,
                          companyData?.postcode || companyData?.zip || customer?.postcode
                        ].filter(p => p && String(p).trim()).join(' '))}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="lpo-badge">
                    <span className="lpo-id">{parent?.id || 'RH-001'}</span>
                  </div>
                  <h3 className="lpo-display-name">{parent?.name || 'Parent Account'}</h3>
                  <div className="lpo-detail">
                    <MapPin size={16} />
                    <span>{parent?.address || '10-14 Market Lane, Rouse Hill'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .profile-page {
          max-width: 1000px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .profile-header {
          margin-bottom: 40px;
        }

        .page-title {
          font-family: var(--font-headings);
          font-size: 2.5rem;
          color: var(--ink);
          margin-bottom: 8px;
        }

        .page-subtitle {
          color: var(--ink-soft);
          font-size: 1.1rem;
        }

        .profile-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 30px;
        }

        .profile-card {
          background: white;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
          border: 1px solid rgba(0,0,0,0.05);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--cream-warm);
        }

        .card-header h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--ink);
        }

        .card-header svg {
          color: var(--gold);
        }

        .profile-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-family: var(--font-ui);
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-soft);
        }

        .input-wrapper, .input-readonly {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-wrapper svg, .input-readonly svg:not(.verified-icon) {
          position: absolute;
          left: 16px;
          color: var(--ink-soft);
        }

        .input-wrapper input, .input-readonly input {
          width: 100%;
          padding: 12px 16px 12px 48px;
          border-radius: 12px;
          border: 1px solid var(--cream-warm);
          font-size: 1rem;
          transition: all 0.2s;
        }

        .input-wrapper input:focus {
          border-color: var(--gold);
          box-shadow: 0 0 0 4px rgba(168, 118, 58, 0.1);
          outline: none;
        }

        .input-readonly input {
          background: var(--cream-warm);
          border-color: transparent;
          color: var(--ink-soft);
          cursor: default;
        }

        .verified-icon {
          position: absolute;
          right: 16px;
          color: #2e7d32;
        }

        .field-note {
          font-size: 0.75rem;
          color: var(--ink-soft);
          font-style: italic;
        }

        .save-btn {
          margin-top: 12px;
          background: var(--ink);
          color: white;
          padding: 14px;
          border-radius: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .save-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .save-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .side-cards {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }

        .security-text {
          font-size: 0.9rem;
          color: var(--ink-soft);
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .reset-btn {
          width: 100%;
          background: white;
          color: var(--ink);
          border: 1px solid var(--ink);
          padding: 12px;
          border-radius: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .reset-btn:hover {
          background: var(--cream-warm);
        }

        .reset-status {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #2e7d32;
          font-weight: 600;
          font-size: 0.9rem;
          padding: 12px;
          background: #e8f5e9;
          border-radius: 12px;
        }

        .lpo-badge {
          display: inline-block;
          background: var(--ink);
          color: white;
          padding: 4px 12px;
          border-radius: 100px;
          font-family: var(--font-ui);
          font-size: 0.7rem;
          font-weight: 800;
          margin-bottom: 12px;
        }

        .lpo-display-name {
          font-size: 1.4rem;
          font-family: var(--font-headings);
          margin-bottom: 8px;
        }

        .lpo-detail {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--ink-soft);
          font-size: 0.9rem;
        }

        .error-alert {
          background: #ffebee;
          color: var(--danger);
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
        }

        .success-alert {
          background: #e8f5e9;
          color: #2e7d32;
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
        }

        @media (max-width: 900px) {
          .profile-grid {
            grid-template-columns: 1fr;
          }
          
          .side-cards {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
};

export default Profile;
