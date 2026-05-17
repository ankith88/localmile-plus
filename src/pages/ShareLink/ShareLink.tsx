import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { 
  MessageSquare, 
  Copy, 
  Printer, 
  Check,
  Mail,
  Phone,
  ExternalLink,
  Download
} from 'lucide-react';
import { useLpo } from '../../context/LpoContext';

const ShareLink: React.FC = () => {
  const { parent } = useLpo();
  const [mobileNumber, setMobileNumber] = useState('');
  const [copied, setCopied] = useState(false);

  const parentId = parent?.id || 'ROUSE_HILL_001';
  const bookingUrl = `https://localmile.plus/register?parentId=${parentId}&payment=1`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendSms = () => {
    if (!mobileNumber) {
      alert("Please enter a mobile number first.");
      return;
    }
    const message = `Hi! You can book your MailPlus courier services directly here: ${bookingUrl}`;
    window.open(`sms:${mobileNumber}?body=${encodeURIComponent(message)}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadQR = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.download = `booking-qr-${parentId}.png`;
      link.href = url;
      link.click();
    }
  };

  return (
    <div className="share-link-premium">
      {/* Mesh Gradient Background */}
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="page-container">
        <header className="page-header">
          <div className="share-icon-wrapper">
            <ExternalLink size={24} />
          </div>
          <h1>Share Your LocalMile Link</h1>
          <p>
            Give customers direct access to book services with your Parent Account. 
            <span>Copy the link, send via SMS, or download your counter QR code.</span>
          </p>
        </header>

        <main className="content-grid">
          {/* QR Code Glass Card */}
          <div className="glass-card qr-card">
            <div className="card-header">
              <Printer className="header-icon" />
              <h3>Counter QR Code</h3>
            </div>
            
            <div className="qr-frame">
              <div className="qr-wrapper">
                <QRCodeCanvas 
                  value={bookingUrl} 
                  size={220}
                  level={"H"}
                  includeMargin={true}
                />
              </div>
              <div className="qr-decoration decoration-1"></div>
              <div className="qr-decoration decoration-2"></div>
            </div>

            <div className="card-actions">
              <button className="action-btn secondary" onClick={handleDownloadQR}>
                <Download size={18} /> Download
              </button>
              <button className="action-btn primary" onClick={handlePrint}>
                <Printer size={18} /> Print Now
              </button>
            </div>
          </div>

          {/* Sharing Options Glass Card */}
          <div className="glass-card share-card">
            <div className="card-header">
              <MessageSquare className="header-icon" />
              <h3>Digital Sharing</h3>
            </div>

            <div className="share-section">
              <label>Direct Booking URL</label>
              <div className="url-copy-pill">
                <div className="url-text">{bookingUrl}</div>
                <button 
                  className={`copy-pill-btn ${copied ? 'success' : ''}`}
                  onClick={handleCopyLink}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="share-section">
              <label>Send to Mobile</label>
              <div className="sms-pill-group">
                <input 
                  type="tel" 
                  placeholder="0400 000 000" 
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                />
                <button className="sms-pill-btn" onClick={handleSendSms}>
                  Send SMS
                </button>
              </div>
              <p className="helper-text text-center">Opens your device's native messaging app</p>
            </div>

            <div className="billing-badge">
              <strong>Billing:</strong> Defaulted to Full Payment Customer
            </div>
          </div>
        </main>

        <footer className="glass-footer">
          <div className="footer-content">
            <span className="help-text">Need extra help? <strong>Contact Kerry O'Neill</strong></span>
            <div className="contact-links">
              <a href="mailto:kerry.oneill@mailplus.com.au">
                <Mail size={16} /> kerry.oneill@mailplus.com.au
              </a>
              <a href="tel:0409244890">
                <Phone size={16} /> 0409 244 890
              </a>
            </div>
          </div>
        </footer>
      </div>

      <style>{`
        .share-link-premium {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: var(--offwhite);
          color: var(--ink);
        }

        /* Mesh Background */
        .mesh-bg {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          filter: blur(80px);
          opacity: 0.6;
        }

        .blob {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
        }

        .blob-1 {
          top: -100px;
          right: -100px;
          background: var(--cream-warm);
          animation: transform 20s infinite alternate;
        }

        .blob-2 {
          bottom: -150px;
          left: -100px;
          background: var(--cream-warm);
          animation: transform 25s infinite alternate-reverse;
        }

        .blob-3 {
          top: 40%;
          left: 30%;
          width: 300px;
          height: 300px;
          background: var(--gold);
          opacity: 0.2;
        }

        @keyframes transform {
          0%, 100% { border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%; }
          14% { border-radius: 40% 60% 54% 46% / 49% 60% 40% 51%; }
          28% { border-radius: 54% 46% 38% 62% / 49% 70% 30% 51%; }
          42% { border-radius: 61% 39% 55% 45% / 61% 38% 62% 39%; }
          56% { border-radius: 61% 39% 67% 33% / 70% 50% 50% 30%; }
          70% { border-radius: 50% 50% 34% 66% / 56% 68% 32% 44%; }
          84% { border-radius: 46% 54% 50% 50% / 35% 61% 39% 65%; }
        }

        .page-container {
          position: relative;
          z-index: 1;
          max-width: 1000px;
          margin: 0 auto;
          padding: 60px 24px;
        }

        .page-header {
          text-align: center;
          margin-bottom: 60px;
        }

        .share-icon-wrapper {
          width: 64px;
          height: 64px;
          background: white;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          color: var(--ink);
          box-shadow: 0 10px 30px rgba(26, 61, 51, 0.05);
        }

        .page-header h1 {
          font-family: var(--font-headings);
          font-size: 3rem;
          font-weight: 400;
          letter-spacing: -0.025em;
          margin-bottom: 16px;
        }

        .page-header p {
          font-size: 1.25rem;
          color: var(--ink-soft);
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.5;
        }

        .page-header p span {
          display: block;
          font-weight: 600;
          color: var(--ink);
          margin-top: 8px;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 32px;
          margin-bottom: 60px;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 32px;
          padding: 40px;
          box-shadow: 0 20px 50px rgba(26, 61, 51, 0.05);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .glass-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 25px 60px rgba(26, 61, 51, 0.08);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
          justify-content: center;
        }

        .header-icon {
          color: var(--ink);
          opacity: 0.6;
        }

        .glass-card h3 {
          font-family: var(--font-headings);
          font-size: 1.25rem;
          font-weight: 500;
          margin: 0;
        }

        /* QR Styles */
        .qr-frame {
          position: relative;
          width: 260px;
          margin: 0 auto 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .qr-wrapper {
          padding: 24px;
          background: white;
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.05);
          z-index: 2;
        }

        .qr-decoration {
          position: absolute;
          width: 80px;
          height: 80px;
          border: 4px solid var(--gold);
          z-index: 1;
        }

        .decoration-1 {
          top: -10px;
          left: -10px;
          border-right: none;
          border-bottom: none;
          border-top-left-radius: 20px;
        }

        .decoration-2 {
          bottom: -10px;
          right: -10px;
          border-left: none;
          border-top: none;
          border-bottom-right-radius: 20px;
        }

        .card-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .action-btn {
          padding: 12px 24px;
          border-radius: 16px;
          font-weight: 700;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .action-btn.primary {
          background: var(--ink);
          color: white;
        }

        .action-btn.secondary {
          background: white;
          color: var(--ink);
          box-shadow: 0 4px 12px rgba(26, 61, 51, 0.05);
        }

        .action-btn:hover {
          transform: scale(1.02);
          filter: brightness(1.1);
        }

        /* Share Card Styles */
        .share-section {
          margin-bottom: 40px;
        }

        .share-section label {
          display: block;
          font-family: var(--font-ui);
          font-weight: 500;
          margin-bottom: 12px;
          font-size: 0.7rem;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.16em;
        }

        .url-copy-pill {
          display: flex;
          background: white;
          border-radius: 20px;
          padding: 8px 8px 8px 20px;
          align-items: center;
          gap: 12px;
          box-shadow: inset 0 2px 5px rgba(0,0,0,0.02);
          border: 1px solid var(--cream-warm);
        }

        .url-text {
          flex: 1;
          font-size: 0.9rem;
          color: #666;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .copy-pill-btn {
          background: var(--cream-warm);
          color: var(--ink);
          padding: 10px 20px;
          border-radius: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-pill-btn.success {
          background: #2ecc71;
          color: white;
        }

        .sms-pill-group {
          display: flex;
          background: white;
          border-radius: 20px;
          padding: 8px;
          border: 1px solid var(--cream-warm);
          gap: 8px;
        }

        .sms-pill-group input {
          flex: 1;
          border: none;
          padding: 0 20px;
          font-size: 1rem;
          background: transparent;
        }

        .sms-pill-btn {
          background: var(--ink);
          color: white;
          padding: 12px 28px;
          border-radius: 16px;
          font-weight: 700;
          border: none;
          cursor: pointer;
        }

        .helper-text {
          font-size: 0.8rem;
          color: var(--ink-soft);
          opacity: 0.6;
          margin-top: 12px;
        }

        .billing-badge {
          display: inline-block;
          background: var(--gold);
          color: white;
          padding: 10px 24px;
          border-radius: 12px;
          font-family: var(--font-ui);
          font-size: 0.65rem;
          font-weight: 500;
          margin-top: 20px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* Footer */
        .glass-footer {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(8px);
          border-radius: 24px;
          padding: 24px 40px;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
        }

        .help-text { font-size: 1rem; }
        
        .contact-links {
          display: flex;
          gap: 24px;
        }

        .contact-links a {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: var(--ink);
          font-weight: 700;
          font-size: 0.95rem;
          transition: opacity 0.2s;
        }

        .contact-links a:hover { opacity: 0.7; }

        @media screen and (max-width: 900px) {
          .content-grid { grid-template-columns: 1fr; }
          .page-header h1 { font-size: 2.25rem; }
          .glass-card { padding: 32px; }
          .footer-content { justify-content: center; text-align: center; }
        }

        @media print {
          .mesh-bg, .footer-contact, .share-card, .action-btn.secondary, .share-icon-wrapper {
            display: none !important;
          }
          .share-link-premium { background: white; }
          .page-container { padding: 0; }
          .qr-card {
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            margin: 0 auto;
          }
        }
      `}</style>
    </div>
  );
};

export default ShareLink;
