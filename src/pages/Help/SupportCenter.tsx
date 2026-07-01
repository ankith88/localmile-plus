import React, { useState } from 'react';
import { 
  Mail, 
  Phone, 
  MessageCircle, 
  ArrowRight,
  ShieldCheck,
  User
} from 'lucide-react';

import SupportEmailModal from '../../components/SupportEmailModal';
import { useLpo } from '../../context/LpoContext';

const SupportCenter: React.FC = () => {
  const { parent, companyData, userData, companyName } = useLpo();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    to?: string;
    cc?: string;
    title?: string;
    defaultSubject?: string;
  }>({});

  const contactInfo = {
    name: companyData?.accountManagerName || "Kerry O'Neill",
    email: companyData?.accountManagerEmail || "kerry.oneill@mailplus.com.au",
    phone: companyData?.accountManagerMobile || "0409 244 890",
    role: companyData?.accountManagerName ? "Account Manager" : "Support Lead",
    title: "LocalMile.Plus Support"
  };

  const firstName = contactInfo.name.split(' ')[0];

  const handleEmailContact = () => {
    setModalConfig({
      to: contactInfo.email,
      title: "Contact Support",
      defaultSubject: "Support Inquiry: LocalMile.Plus Assistance"
    });
    setIsModalOpen(true);
  };

  const handleSendFeedback = () => {
    setModalConfig({
      to: contactInfo.email,
      cc: "ankith.ravindran@mailplus.com.au",
      title: "Send Feedback",
      defaultSubject: "Platform Feedback: LocalMile.Plus"
    });
    setIsModalOpen(true);
  };

  return (
    <div className="support-center-premium">
      {/* Background Decorative Elements */}
      <div className="support-mesh">
        <div className="support-blob blob-primary"></div>
        <div className="support-blob blob-secondary"></div>
      </div>

      <div className="support-container">
        <header className="support-header">
          <div className="header-eyebrow label-eyebrow">Assistance & Resources</div>
          <h1>Support Center</h1>
          <p>We're here to ensure your experience with LocalMile.Plus is seamless. If you have any questions or encounter any issues, please reach out.</p>
        </header>

        <div className="support-grid">
          {/* Main Contact Card */}
          <section className="contact-hero-card">
            <div className="card-glass-effect"></div>
            <div className="contact-content">
              <div className="contact-avatar-wrapper">
                <div className="avatar-circle">
                  <User size={40} className="avatar-icon" />
                </div>
                <div className="status-indicator"></div>
              </div>
              
              <div className="contact-info-main">
                <h3>Contact {contactInfo.name}</h3>
                <p className="contact-role">Dedicated Support Specialist for LocalMile.Plus</p>
                
                <div className="contact-actions-grid">
                  <div 
                    className="contact-action-item" 
                    onClick={handleEmailContact}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="icon-box email">
                      <Mail size={20} />
                    </div>
                    <div className="action-details">
                      <span className="action-label">Email {firstName}</span>
                      <span className="action-value">{contactInfo.email}</span>
                    </div>
                    <ArrowRight size={16} className="arrow-hover" />
                  </div>

                  <a href={`tel:${contactInfo.phone.replace(/\s/g, '')}`} className="contact-action-item">
                    <div className="icon-box phone">
                      <Phone size={20} />
                    </div>
                    <div className="action-details">
                      <span className="action-label">Call {firstName}</span>
                      <span className="action-value">{contactInfo.phone}</span>
                    </div>
                    <ArrowRight size={16} className="arrow-hover" />
                  </a>
                </div>
              </div>
            </div>
            
            <div className="card-footer-note">
              <ShieldCheck size={14} />
              <span>Available Monday – Friday, 9:00 AM – 5:00 PM AEST</span>
            </div>
          </section>

          {/* Quick Support Links */}
          <div className="support-sidebar">
            <div className="support-card small">
              <div className="card-icon-header gold">
                <MessageCircle size={20} />
              </div>
              <h4>Direct Inquiries</h4>
              <p>For feature requests or platform feedback, we'd love to hear from you.</p>
              <button className="text-link" onClick={handleSendFeedback}>Send Feedback <ArrowRight size={14} /></button>
            </div>
          </div>
        </div>
      </div>

      <SupportEmailModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        to={modalConfig.to}
        cc={modalConfig.cc}
        title={modalConfig.title}
        defaultSubject={modalConfig.defaultSubject}
        metadata={{
          lpoName: parent?.name,
          companyName: companyData?.companyName || companyName || "N/A",
          senderName: userData ? `${userData.first_name || ""} ${userData.last_name || ""}`.trim() : "Unknown User",
          senderEmail: userData?.email || ""
        }}
      />

      <style>{`
        .support-center-premium {
          position: relative;
          min-height: calc(100vh - var(--header-height) - var(--bottom-nav-height));
          padding: 20px;
          overflow: hidden;
        }

        .support-mesh {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          filter: blur(100px);
          opacity: 0.5;
          pointer-events: none;
        }

        .support-blob {
          position: absolute;
          width: 400px;
          height: 400px;
          border-radius: 50%;
        }

        .blob-primary {
          top: -100px;
          right: -50px;
          background: rgba(168, 118, 58, 0.15);
          animation: float 20s infinite alternate;
        }

        .blob-secondary {
          bottom: -150px;
          left: -100px;
          background: rgba(9, 92, 123, 0.1);
          animation: float 25s infinite alternate-reverse;
        }

        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(30px, 50px) scale(1.1); }
        }

        .support-container {
          position: relative;
          z-index: 1;
          max-width: 1000px;
          margin: 0 auto;
        }

        .support-header {
          margin-bottom: 48px;
          max-width: 600px;
        }

        .support-header h1 {
          font-size: 3rem;
          margin: 12px 0 20px;
        }

        .support-header p {
          font-size: 1.15rem;
          color: var(--ink-soft);
          line-height: 1.6;
        }

        .support-grid {
          display: grid;
          grid-template-columns: 1.8fr 1fr;
          gap: 32px;
        }

        .contact-hero-card {
          position: relative;
          background: white;
          border-radius: 32px;
          padding: 48px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.04);
          border: 1px solid rgba(0,0,0,0.05);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .card-glass-effect {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 160px;
          background: linear-gradient(to bottom, rgba(168, 118, 58, 0.05), transparent);
          pointer-events: none;
        }

        .contact-content {
          position: relative;
          z-index: 2;
        }

        .contact-avatar-wrapper {
          position: relative;
          width: 80px;
          height: 80px;
          margin-bottom: 24px;
        }

        .avatar-circle {
          width: 100%;
          height: 100%;
          background: var(--cream-warm);
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--gold);
        }

        .status-indicator {
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 20px;
          height: 20px;
          background: #2ecc71;
          border: 4px solid white;
          border-radius: 50%;
        }

        .contact-info-main h3 {
          font-size: 1.75rem;
          margin-bottom: 8px;
        }

        .contact-role {
          font-family: var(--font-ui);
          font-size: 0.8rem;
          color: var(--gold);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 40px;
          font-weight: 600;
        }

        .contact-actions-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .contact-action-item {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 20px 24px;
          background: var(--offwhite);
          border-radius: 20px;
          text-decoration: none;
          color: var(--ink);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
        }

        .contact-action-item:hover {
          background: white;
          border-color: var(--gold);
          transform: translateX(8px);
          box-shadow: 0 10px 20px rgba(168, 118, 58, 0.08);
        }

        .icon-box {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-box.email { background: rgba(9, 92, 123, 0.1); color: #095c7b; }
        .icon-box.phone { background: rgba(168, 118, 58, 0.1); color: var(--gold); }

        .action-details {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .action-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--ink-soft);
          opacity: 0.6;
        }

        .action-value {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .arrow-hover {
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.3s;
          color: var(--gold);
        }

        .contact-action-item:hover .arrow-hover {
          opacity: 1;
          transform: translateX(0);
        }

        .card-footer-note {
          margin-top: 48px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--ink-soft);
          opacity: 0.6;
          border-top: 1px solid rgba(0,0,0,0.05);
          padding-top: 24px;
        }

        .support-sidebar {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .support-card {
          background: white;
          border-radius: 24px;
          padding: 32px;
          border: 1px solid rgba(0,0,0,0.05);
          box-shadow: 0 10px 30px rgba(0,0,0,0.02);
        }

        .card-icon-header {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }

        .card-icon-header.purple { background: #f3f0ff; color: #7c3aed; }
        .card-icon-header.gold { background: #fffbeb; color: #d97706; }

        .support-card h4 {
          font-size: 1.2rem;
          margin-bottom: 12px;
        }

        .support-card p {
          font-size: 0.95rem;
          color: var(--ink-soft);
          line-height: 1.5;
          margin-bottom: 20px;
        }

        .text-link {
          background: transparent;
          color: var(--gold);
          padding: 0;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .text-link:hover {
          gap: 10px;
          color: var(--ink);
        }

        @media (max-width: 900px) {
          .support-grid {
            grid-template-columns: 1fr;
          }
          
          .support-header h1 {
            font-size: 2.2rem;
          }
          
          .contact-hero-card {
            padding: 32px;
          }
        }
      `}</style>
    </div>
  );
};

export default SupportCenter;
