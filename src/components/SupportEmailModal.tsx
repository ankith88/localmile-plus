import React, { useState } from 'react';
import { X, Send, Mail, RefreshCw, MessageSquare } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface SupportEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId?: string;
  contextTitle?: string;
  defaultSubject?: string;
  metadata?: {
    lpoName?: string;
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    serviceType?: string;
    billing?: string;
  };
}

const SupportEmailModal: React.FC<SupportEmailModalProps> = ({ 
  isOpen, 
  onClose, 
  jobId, 
  contextTitle,
  defaultSubject,
  metadata
}) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;

    setIsSending(true);
    const functions = getFunctions();
    const sendSupportEmail = httpsCallable(functions, 'sendSupportEmail');

    try {
      await sendSupportEmail({
        message,
        jobId,
        subject: defaultSubject || (jobId ? `Inquiry regarding Job Ref: ${jobId}` : 'General Inquiry'),
        metadata
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setMessage('');
      }, 2000);
    } catch (error) {
      console.error("Error sending support email:", error);
      alert("Failed to send email. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`modal-overlay active`}>
      <div className="modal-content glass-card fade-in" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <div className="header-title">
            <Mail size={20} />
            <h2>{jobId ? 'Job Inquiry' : 'Contact Support'}</h2>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSending}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {success ? (
            <div className="success-state" style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="success-icon" style={{ color: '#2ecc71', marginBottom: '16px' }}>
                <Send size={48} />
              </div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Message Sent!</h3>
              <p style={{ color: 'var(--ink-soft)' }}>The team will be in touch shortly.</p>
            </div>
          ) : (
            <>
              {contextTitle && (
                <div className="context-banner" style={{ 
                  background: 'var(--cream-warm)', 
                  padding: '12px 16px', 
                  borderRadius: '12px', 
                  marginBottom: '20px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <MessageSquare size={14} />
                  <span><strong>Regarding:</strong> {contextTitle}</span>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: 800, 
                  textTransform: 'uppercase', 
                  color: 'var(--ink-soft)', 
                  marginBottom: '8px',
                  opacity: 0.6
                }}>
                  Your Message
                </label>
                <textarea
                  className="comm-textarea"
                  placeholder="How can we help you?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '16px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: 'rgba(255,255,255,0.5)',
                    fontSize: '1rem',
                    outline: 'none',
                    resize: 'none'
                  }}
                  disabled={isSending}
                />
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className="btn-secondary-glass" 
                  onClick={onClose}
                  style={{ flex: 1, padding: '14px', borderRadius: '14px', fontWeight: 700 }}
                  disabled={isSending}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary-glass" 
                  onClick={handleSend}
                  disabled={isSending || !message.trim()}
                  style={{ 
                    flex: 1, 
                    padding: '14px', 
                    borderRadius: '14px', 
                    fontWeight: 700,
                    background: 'var(--ink)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isSending ? <RefreshCw size={18} className="spin" /> : <><Send size={18} /> Send Message</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(26, 61, 51, 0.4); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 3000;
          padding: 24px;
        }
        .modal-content { 
          width: 100%; 
          background: white;
          padding: 32px; 
          border-radius: 24px;
          position: relative;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-title { display: flex; align-items: center; gap: 12px; color: var(--ink); }
        .header-title h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); opacity: 0.6; cursor: pointer; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default SupportEmailModal;
