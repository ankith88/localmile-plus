import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Building, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Smartphone,
  AtSign
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useJsApiLoader } from '@react-google-maps/api';
import { getGeocode } from 'use-places-autocomplete';
import { httpsCallable } from 'firebase/functions';
import { useLpo } from '../../context/LpoContext';
import { googleMapsApiKey, functions } from '../../firebase/config';
import Stepper from '../../components/Stepper';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import LoadingScreen from '../../components/LoadingScreen';

const steps = [
  { id: '01', name: 'Account' },
  { id: '02', name: 'Company' },
];

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, user, updateUserData } = useLpo();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Step 1 Data
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regType, setRegType] = useState<'email' | 'mobile'>('email');

  // Step 2 Data
  const [companyName, setCompanyName] = useState('');
  const [suite, setSuite] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [fullAddress, setFullAddress] = useState('');

  // Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    isServiceable: boolean;
    reason?: string;
    leadID?: string;
  } | null>(null);

  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey,
    libraries: ["places"],
  });

  useEffect(() => {
    if (user && currentStep === 0) {
      setCurrentStep(1);
    }
  }, [user, currentStep]);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const finalEmail = regType === 'email' ? email : `${phone}@localmile.plus`;
      await signUp(finalEmail, password, firstName, lastName, phone);
      setCurrentStep(1);
    } catch (err: any) {
      console.error("Sign up error:", err);
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAddress = async (address: string) => {
    if (!address) {
      setStreet('');
      setCity('');
      setState('');
      setZip('');
      setFullAddress('');
      return;
    }

    setFullAddress(address);
    try {
      const results = await getGeocode({ address });
      const components = results[0].address_components;

      const getComp = (type: string, long = true) => {
        const comp = components.find(c => c.types.includes(type));
        return comp ? (long ? comp.long_name : comp.short_name) : '';
      };

      const num = getComp('street_number');
      const route = getComp('route');
      setStreet(`${num} ${route}`.trim());
      setCity(getComp('locality'));
      setState(getComp('administrative_area_level_1', false));
      setZip(getComp('postal_code'));
    } catch (err) {
      console.error("Geocode error:", err);
      setError('Failed to parse address details.');
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!street || !city || !state || !zip) {
      setError('Please provide a complete address.');
      return;
    }

    setIsVerifying(true);
    setError('');
    setVerificationResult(null);

    const parentId = searchParams.get('parentId') || searchParams.get('parent_id') || searchParams.get('lpoid');
    const payment = searchParams.get('payment');

    try {
      const verifyAddressServiceability = httpsCallable(functions, 'verifyAddressServiceability');
      const result = await verifyAddressServiceability({
        street,
        suite,
        city,
        state,
        zip,
        companyName,
        parentId: parentId || undefined,
        payment: payment || undefined,
        firstName,
        lastName,
        email: regType === 'email' ? email : `${phone}@localmile.plus`,
        phone,
      });

      const data = result.data as any;
      setVerificationResult(data);

      if (data.success && data.isServiceable) {
        if (data.leadID) {
          // If we have a parentId, this lead belongs to an LPO
          if (parentId) {
            await updateUserData({ 
              parent_id: parentId, // The LPO's ID
              customer_id: data.leadID, // The new customer's NetSuite ID
              role: 'customer'
            });
          } else {
            // Independent customer
            await updateUserData({ 
              customer_id: data.leadID, 
              role: 'customer' 
            });
          }
        }
        
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        // NetSuite returned false or serviceability check failed
        setError(data.reason || 'Address not serviceable.');
        // Clear address so they have to re-enter it correctly
        setStreet('');
        setCity('');
        setState('');
        setZip('');
        setFullAddress('');
        
        // Redirect back to step 1 after a short delay so they can see the error
        setTimeout(() => {
          setCurrentStep(0);
          setVerificationResult(null);
        }, 4000);
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="signup-page">
      {isLoading && <LoadingScreen message="Creating Your Account" />}
      <div className="signup-container">
        <div className="signup-card">
          <div className="logo-section">
            <h1 className="brand-logo">LocalMile<span className="logo-plus">.Plus</span></h1>
            <p className="powered-by">Powered by MailPlus</p>
            <h2 className="welcome-text">Create Your Account</h2>
          </div>

          <Stepper currentStep={currentStep} steps={steps} />

          {currentStep === 0 ? (
            <form className="signup-form" onSubmit={handleStep1Submit}>
              <div className="registration-type-toggle">
                <button 
                  type="button" 
                  className={regType === 'email' ? 'active' : ''} 
                  onClick={() => setRegType('email')}
                >
                  <AtSign size={16} /> Email
                </button>
                <button 
                  type="button" 
                  className={regType === 'mobile' ? 'active' : ''} 
                  onClick={() => setRegType('mobile')}
                >
                  <Smartphone size={16} /> Mobile
                </button>
              </div>

              <div className="form-row">
                <div className="input-group">
                  <label htmlFor="firstName">First Name</label>
                  <div className="input-wrapper">
                    <User size={20} />
                    <input 
                      id="firstName"
                      type="text" 
                      placeholder="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="lastName">Last Name</label>
                  <div className="input-wrapper">
                    <User size={20} />
                    <input 
                      id="lastName"
                      type="text" 
                      placeholder="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="mobile">Mobile Number</label>
                <div className="input-wrapper">
                  <Phone size={20} />
                  <input 
                    id="mobile"
                    type="tel" 
                    placeholder="Enter your mobile"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              {regType === 'email' && (
                <div className="input-group">
                  <label htmlFor="email">Email Address</label>
                  <div className="input-wrapper">
                    <Mail size={20} />
                    <input 
                      id="email"
                      type="email" 
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="input-group">
                <label htmlFor="password">Password</label>
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

              {error && <div className="error-message">{error}</div>}

              <button type="submit" className="signup-btn" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Continue to Company'}
                {!isLoading && <ArrowRight size={20} />}
              </button>
            </form>
          ) : (
            <form className="signup-form" onSubmit={handleFinalSubmit}>
              <div className="input-group">
                <label htmlFor="companyName">Company Name</label>
                <div className="input-wrapper">
                  <Building size={20} />
                  <input 
                    id="companyName"
                    type="text" 
                    placeholder="Your Company Name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    disabled={isVerifying}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Company Address</label>
                {isMapsLoaded ? (
                  <AddressAutocomplete 
                    onSelectAddress={handleSelectAddress}
                    defaultValue={fullAddress}
                    disabled={isVerifying}
                  />
                ) : (
                  <div className="input-wrapper">
                    <Loader2 className="animate-spin" size={20} />
                    <input disabled placeholder="Loading Google Maps..." />
                  </div>
                )}
              </div>

              <div className="input-group">
                <label htmlFor="suite">Suite / Level / Apartment</label>
                <div className="input-wrapper">
                  <Building size={20} />
                  <input 
                    id="suite"
                    type="text" 
                    placeholder="e.g. Suite 101"
                    value={suite}
                    onChange={(e) => setSuite(e.target.value)}
                    disabled={isVerifying}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="input-group">
                  <label>City</label>
                  <input value={city} readOnly placeholder="City" className="read-only" />
                </div>
                <div className="input-group">
                  <label>State</label>
                  <input value={state} readOnly placeholder="State" className="read-only" />
                </div>
                <div className="input-group">
                  <label>Postcode</label>
                  <input value={zip} readOnly placeholder="Postcode" className="read-only" />
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              {verificationResult && (
                <div className={`verification-message ${verificationResult.isServiceable ? 'success' : 'failure'}`}>
                  {verificationResult.isServiceable ? <CheckCircle size={20} /> : <XCircle size={20} />}
                  <p>{verificationResult.isServiceable ? 'Your address is serviceable! Welcome aboard.' : verificationResult.reason}</p>
                </div>
              )}

              <div className="button-row">
                <button 
                  type="button" 
                  className="back-btn" 
                  onClick={() => setCurrentStep(0)}
                  disabled={isVerifying}
                >
                  <ArrowLeft size={20} /> Back
                </button>
                <button type="submit" className="signup-btn" disabled={isVerifying || !fullAddress}>
                  {isVerifying ? <Loader2 className="animate-spin" size={20} /> : 'Verify & Complete'}
                  {!isVerifying && <ArrowRight size={20} />}
                </button>
              </div>
            </form>
          )}

          <p className="footer-link">
            Already have an account? <a onClick={() => navigate('/signin')} style={{cursor: 'pointer'}}>Sign In</a>
          </p>
        </div>
      </div>

      <style>{`
        .signup-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at top left, #f8f9fa, #e9ecef);
          padding: 20px;
        }

        .signup-container {
          width: 100%;
          max-width: 520px;
          animation: fadeInUp 0.6s ease-out;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .signup-card {
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

        .registration-type-toggle {
          display: flex;
          background: #f1f3f5;
          padding: 4px;
          border-radius: 14px;
          margin-bottom: 24px;
        }

        .registration-type-toggle button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #666;
          transition: all 0.2s;
        }

        .registration-type-toggle button.active {
          background: white;
          color: var(--ink);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .signup-form {
          margin-top: 32px;
        }

        .form-row {
          display: flex;
          gap: 16px;
        }

        .form-row .input-group {
          flex: 1;
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

        .read-only {
          background: #f1f3f5 !important;
          border-color: transparent !important;
          color: #495057 !important;
          font-weight: 500;
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

        .verification-message {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 20px;
          border-radius: 18px;
          font-size: 0.95rem;
          margin-bottom: 24px;
          font-weight: 500;
          line-height: 1.4;
        }

        .verification-message.success {
          background: #f4fce3;
          color: #2b8a3e;
          border: 1px solid #d8f5a2;
        }

        .verification-message.failure {
          background: #fff5f5;
          color: #e03131;
          border: 1px solid #ffc9c9;
        }

        .verification-message.failure {
          background: #fff5f5;
          color: #c92a2a;
          border: 1px solid #ffc9c9;
        }

        .signup-btn {
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
        }

        .signup-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
        }

        .signup-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .signup-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-row {
          display: flex;
          gap: 16px;
        }

        .back-btn {
          flex-shrink: 0;
          padding: 14px 24px;
          background: #f1f3f5;
          color: #495057;
          border-radius: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .back-btn:hover:not(:disabled) {
          background: #e9ecef;
        }

        .footer-link {
          text-align: center;
          font-size: 0.95rem;
          color: #6c757d;
          margin-top: 32px;
        }

        .footer-link a {
          color: var(--ink);
          font-weight: 700;
          text-decoration: none;
          margin-left: 4px;
          transition: color 0.2s;
        }

        .footer-link a:hover {
          color: var(--yellow-dark, #c0c800);
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .signup-card {
            padding: 32px 24px;
          }
          .form-row {
            flex-direction: column;
            gap: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default SignUp;
