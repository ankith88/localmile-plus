import React, { useState } from 'react';
import { X, Send, Mail, MessageSquare, RefreshCw, CheckCircle2, Phone } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface FranchiseeContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  userFullName?: string;
  companyName?: string;
}

const FranchiseeContactModal: React.FC<FranchiseeContactModalProps> = ({
  isOpen,
  onClose,
  job,
  contactName,
  contactEmail,
  contactPhone,
  userFullName,
  companyName
}) => {
  const [message, setMessage] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(!!contactPhone);
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !job) return null;

  const resolvedName = contactName || job?.operatorName || 'Franchisee Partner';
  const resolvedEmail = (contactEmail || job?.operatorEmail || '').trim();
  const resolvedPhone = (contactPhone || job?.operatorPhone || '').trim();
  const displayCompany = companyName || job?.customer?.company || 'LocalMile.Plus';

  const handleSend = async () => {
    if (!message.trim()) {
      alert("Please enter a message to send.");
      return;
    }

    if (!sendEmail && !sendSms) {
      alert("Please select at least one channel (Email or SMS).");
      return;
    }

    if (sendEmail && !resolvedEmail) {
      alert("No email address found for the Franchisee.");
      return;
    }

    if (sendSms && !resolvedPhone) {
      alert("No mobile phone number found for the Franchisee.");
      return;
    }

    setIsSending(true);

    try {
      const functions = getFunctions();
      const sendMsgFn = httpsCallable(functions, 'sendProspectPlusMessage');

      const senderName = userFullName || 'Parent Owner';
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #095c7b;">Message from ${displayCompany}</h2>
          <p><strong>Job Reference:</strong> #${job.id.substring(0, 8).toUpperCase()}</p>
          <p><strong>Sender:</strong> ${senderName}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="background: #f9f9f9; border-left: 5px solid #095c7b; padding: 10px 15px; margin: 15px 0;">
            ${message.trim().replace(/\n/g, '<br/>')}
          </blockquote>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
          <p style="font-size: 11px; color: #888;">This email was sent via LocalMile.Plus Franchisee Communication Service.</p>
        </div>
      `;

      const formattedSms = `From LocalMile.Plus (${displayCompany}) - Job Ref: #${job.id.substring(0, 8).toUpperCase()} - Sender: ${senderName}:\n\n${message.trim()}`;

      await sendMsgFn({
        toEmail: sendEmail ? resolvedEmail : undefined,
        toPhone: sendSms ? resolvedPhone : undefined,
        subject: `Message regarding Job Ref: #${job.id.substring(0, 8).toUpperCase()}`,
        html: emailHtml,
        smsMessage: formattedSms,
        leadId: job.customer_id || job.netsuiteCustomerId || "",
        author: senderName,
        jobId: job.id
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setMessage('');
        onClose();
      }, 1800);
    } catch (err) {
      console.error("Failed to send message to franchisee:", err);
      alert("Failed to send message. Please check connection and try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-overlay active" style={{ zIndex: 1100 }}>
      <div className="modal-content glass-card fade-in" style={{ maxWidth: '520px', borderRadius: '24px', padding: '24px' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(9, 92, 123, 0.1)', padding: '10px', borderRadius: '12px', color: '#095c7b' }}>
              <Mail size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>Contact Franchisee</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Job Ref: #{job.id}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isSending} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.7 }}>
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div style={{ padding: '30px 10px', textAlign: 'center' }}>
            <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 700 }}>Message Sent Successfully!</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', margin: 0 }}>
              Your message has been dispatched to {resolvedName} via {sendEmail && sendSms ? 'Email & SMS' : sendEmail ? 'Email' : 'SMS'}.
            </p>
          </div>
        ) : (
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Recipient Details Card */}
            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '14px 16px', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px', color: 'var(--ink)' }}>
                Recipient: {resolvedName}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                {resolvedEmail && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Mail size={13} /> {resolvedEmail}
                  </span>
                )}
                {resolvedPhone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Phone size={13} /> {resolvedPhone}
                  </span>
                )}
              </div>
            </div>

            {/* Communication Channels Toggle */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>Send via:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                <input 
                  type="checkbox" 
                  checked={sendEmail} 
                  onChange={(e) => setSendEmail(e.target.checked)} 
                  disabled={!resolvedEmail}
                  style={{ accentColor: '#095c7b', width: '16px', height: '16px' }} 
                />
                Email
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                <input 
                  type="checkbox" 
                  checked={sendSms} 
                  onChange={(e) => setSendSms(e.target.checked)} 
                  disabled={!resolvedPhone}
                  style={{ accentColor: '#095c7b', width: '16px', height: '16px' }} 
                />
                SMS
              </label>
            </div>

            {/* Message Area */}
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>Message to Franchisee</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message or instructions for the franchisee owner..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: '1px solid var(--cream-warm, rgba(0,0,0,0.15))',
                  background: 'var(--paper, #fff)',
                  fontSize: '0.92rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Native SMS quick link option */}
            {resolvedPhone && (
              <div style={{ textAlign: 'right' }}>
                <a 
                  href={`sms:${resolvedPhone}?body=${encodeURIComponent(message || `Regarding Job Ref: #${job.id}`)}`}
                  style={{ fontSize: '0.78rem', color: '#095c7b', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <MessageSquare size={12} /> Open device SMS app directly
                </a>
              </div>
            )}

            {/* Action Buttons */}
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={onClose} 
                disabled={isSending}
                style={{ padding: '10px 18px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleSend} 
                disabled={isSending || (!sendEmail && !sendSms) || !message.trim()}
                style={{ 
                  padding: '10px 22px', 
                  borderRadius: '12px', 
                  border: 'none', 
                  background: '#095c7b', 
                  color: 'white', 
                  cursor: isSending ? 'not-allowed' : 'pointer', 
                  fontWeight: 700, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px' 
                }}
              >
                {isSending ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FranchiseeContactModal;
