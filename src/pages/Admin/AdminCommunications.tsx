import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Search, 
  Send, 
  Inbox, 
  Clock, 
  Sparkles,
  RefreshCw,
  User,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
  Briefcase
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  limit
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';

interface Communication {
  id: string;
  from: string;
  to: string | string[];
  subject: string;
  body: string;
  timestamp: any;
  type: 'sent' | 'received';
  metadata: {
    parentId?: string;
    customerId?: string;
    jobId?: string;
    lpoName?: string;
    companyName?: string;
    customerName?: string;
    netsuiteCustomerId?: string;
  };
  threadId: string;
  aiSummary?: string;
  sentiment?: string;
}

const AdminCommunications: React.FC = () => {
  const { isAdmin, allParents } = useLpo();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received'>('all');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [composeData, setComposeData] = useState({
    to: '',
    subject: '',
    body: '',
    metadata: {} as any,
    threadId: ''
  });

  useEffect(() => {
    if (!isAdmin) return;

    const commsRef = collection(db, 'communications');
    const q = query(commsRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Communication[];
      setCommunications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleSummarize = async (comm: Communication) => {
    setIsSummarizing(true);
    const functions = getFunctions();
    const summarizeCommunication = httpsCallable(functions, 'summarizeCommunication');

    try {
      const result = await summarizeCommunication({ 
        communicationId: comm.id, 
        text: comm.body.replace(/<[^>]*>/g, '') // Strip HTML for the AI
      });
      
      const summary = (result.data as any).summary;
      setSelectedComm({ ...comm, aiSummary: summary });
    } catch (error) {
      console.error("AI Summary Error:", error);
      alert("Failed to generate AI summary.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSendResponse = async () => {
    if (!composeData.to || !composeData.body) {
      alert("Please enter a recipient and message.");
      return;
    }

    setIsSending(true);
    const functions = getFunctions();
    const respondToCommunication = httpsCallable(functions, 'respondToCommunication');

    try {
      await respondToCommunication({
        to: composeData.to,
        subject: composeData.subject,
        body: composeData.body,
        metadata: composeData.metadata,
        threadId: composeData.threadId
      });
      
      setIsComposeOpen(false);
      alert("Message sent successfully!");
    } catch (error) {
      console.error("Send Error:", error);
      alert("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const filteredComms = communications.filter(comm => {
    const matchesSearch = 
      comm.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comm.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comm.metadata?.jobId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || comm.type === filterType;
    
    return matchesSearch && matchesType;
  });

  // Auto-expand nodes when searching
  useEffect(() => {
    if (searchTerm) {
      const newExpanded: Record<string, boolean> = { ...expandedNodes };
      filteredComms.forEach(comm => {
        const parentId = comm.metadata?.parentId || 'global';
        const customerId = comm.metadata?.customerId || 'general';
        const jobId = comm.metadata?.jobId || 'direct';
        
        newExpanded[parentId] = true;
        newExpanded[`${parentId}-${customerId}`] = true;
        newExpanded[`${parentId}-${customerId}-${jobId}`] = true;
      });
      setExpandedNodes(newExpanded);
    }
  }, [searchTerm]);

  const groupedComms = filteredComms.reduce((acc, comm) => {
    const parentId = comm.metadata?.parentId || 'global';
    const lpoName = comm.metadata?.lpoName || allParents.find(l => l.id === parentId)?.name || 'Global / Support';
    
    if (!acc[parentId]) {
      acc[parentId] = { id: parentId, name: lpoName, customers: {} };
    }
    
    const customerId = comm.metadata?.customerId || comm.metadata?.netsuiteCustomerId || comm.metadata?.companyName || 'general';
    const customerName = comm.metadata?.companyName || comm.metadata?.customerName || (comm.metadata?.customerId ? `Customer ID: ${comm.metadata.customerId}` : 'General Inquiries');
    
    if (!acc[parentId].customers[customerId]) {
      acc[parentId].customers[customerId] = { id: customerId, name: customerName, jobs: {} };
    }
    
    const jobId = comm.metadata?.jobId || 'direct';
    const jobLabel = jobId === 'direct' ? 'Direct Emails' : `Job: ${jobId}`;
    
    if (!acc[parentId].customers[customerId].jobs[jobId]) {
      acc[parentId].customers[customerId].jobs[jobId] = { id: jobId, label: jobLabel, emails: [] };
    }
    
    acc[parentId].customers[customerId].jobs[jobId].emails.push(comm);
    return acc;
  }, {} as any);

  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  return (
    <div className="admin-comms-premium">
      <div className="comms-header">
        <div className="header-left">
          <div className="header-eyebrow">Administration</div>
          <h1>Communications Hub</h1>
        </div>
        
        <div className="header-actions">
          <div className="search-pill">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by Job ID, Subject or Email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="filter-group-glass">
            <button 
              className={filterType === 'all' ? 'active' : ''} 
              onClick={() => setFilterType('all')}
            >
              All
            </button>
            <button 
              className={filterType === 'received' ? 'active' : ''} 
              onClick={() => setFilterType('received')}
            >
              Inbox
            </button>
            <button 
              className={filterType === 'sent' ? 'active' : ''} 
              onClick={() => setFilterType('sent')}
            >
              Sent
            </button>
          </div>

          <button 
            className="btn-history-sync"
            onClick={async () => {
              const functions = getFunctions();
              const syncRecentEmails = httpsCallable(functions, 'syncRecentEmails');
              setLoading(true);
              try {
                await syncRecentEmails();
                alert("History sync complete!");
              } catch (error) {
                console.error("Sync error:", error);
                alert("Failed to sync history.");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Sync History
          </button>
        </div>
      </div>

      <div className="comms-layout">
        {/* Email List */}
        <div className="comms-list-panel glass-panel">
          {loading ? (
            <div className="loader-container">
              <RefreshCw className="spin" />
              <p>Loading communications...</p>
            </div>
          ) : Object.keys(groupedComms).length === 0 ? (
            <div className="empty-state">
              <Mail size={48} opacity={0.2} />
              <p>No communications found.</p>
            </div>
          ) : (
            <div className="hierarchy-container">
              {Object.values(groupedComms).map((lpo: any) => (
                <div key={lpo.id} className="hierarchy-node lpo-node">
                  <div className="node-header" onClick={(e) => toggleNode(lpo.id, e)}>
                    {expandedNodes[lpo.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Building2 size={14} />
                    <span>{lpo.name}</span>
                  </div>
                  
                  {expandedNodes[lpo.id] && (
                    <div className="node-content">
                      {Object.values(lpo.customers).map((customer: any) => {
                        const customerKey = `${lpo.id}-${customer.id}`;
                        return (
                          <div key={customerKey} className="hierarchy-node customer-node">
                            <div className="node-header" onClick={(e) => toggleNode(customerKey, e)}>
                              {expandedNodes[customerKey] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <Users size={14} />
                              <span>{customer.name}</span>
                            </div>

                            {expandedNodes[customerKey] && (
                              <div className="node-content">
                                {Object.values(customer.jobs).map((job: any) => {
                                  const jobKey = `${lpo.id}-${customer.id}-${job.id}`;
                                  return (
                                    <div key={jobKey} className="hierarchy-node job-node">
                                      <div className="node-header" onClick={(e) => toggleNode(jobKey, e)}>
                                        {expandedNodes[jobKey] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <Briefcase size={14} />
                                        <span>{job.label}</span>
                                      </div>

                                      {expandedNodes[jobKey] && (
                                        <div className="email-node-list">
                                          {job.emails.map((comm: Communication) => (
                                            <div 
                                              key={comm.id} 
                                              className={`comm-item nested ${selectedComm?.id === comm.id ? 'selected' : ''}`}
                                              onClick={() => setSelectedComm(comm)}
                                            >
                                              <div className="comm-item-header">
                                                <div className="comm-type-icon">
                                                  {comm.type === 'sent' ? <Send size={12} /> : <Inbox size={12} />}
                                                </div>
                                                <span className="comm-time">
                                                  {comm.timestamp?.toDate ? new Date(comm.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                                                </span>
                                              </div>
                                              
                                              <div className="comm-item-main">
                                                <h3 className="comm-subject">{comm.subject}</h3>
                                                <p className="comm-from">{comm.from}</p>
                                              </div>
                                              
                                              <div className="comm-item-footer">
                                                {comm.aiSummary && (
                                                  <Sparkles size={12} className="ai-status-icon" />
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Content Detail */}
        <div className="comms-detail-panel glass-panel">
          {selectedComm ? (
            <div className="detail-content fade-in">
              <div className="detail-header">
                <div className="detail-header-main">
                  <h2>{selectedComm.subject}</h2>
                  <div className="detail-meta">
                    <div className="meta-item">
                      <User size={14} />
                      <span>{selectedComm.from}</span>
                    </div>
                    <div className="meta-item">
                      <Clock size={14} />
                      <span>{selectedComm.timestamp?.toDate ? new Date(selectedComm.timestamp.toDate()).toLocaleString() : 'Recent'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="detail-actions">
                  <button 
                    className="btn-action-glass"
                    onClick={() => {
                      setComposeData({
                        to: selectedComm.from,
                        subject: `Re: ${selectedComm.subject}`,
                        body: `<br><br>---<br>Original Message:<br>${selectedComm.body}`,
                        metadata: selectedComm.metadata,
                        threadId: selectedComm.threadId
                      });
                      setIsComposeOpen(true);
                    }}
                  >
                    <MessageSquare size={16} />
                    Reply
                  </button>
                  <button 
                    className="btn-action-glass"
                    onClick={() => {
                      setComposeData({
                        to: '',
                        subject: `Fwd: ${selectedComm.subject}`,
                        body: `<br><br>---<br>Forwarded Message:<br>${selectedComm.body}`,
                        metadata: selectedComm.metadata,
                        threadId: selectedComm.threadId
                      });
                      setIsComposeOpen(true);
                    }}
                  >
                    <Send size={16} />
                    Forward
                  </button>
                  <button 
                    className="btn-ai-summarize"
                    onClick={() => handleSummarize(selectedComm)}
                    disabled={isSummarizing}
                  >
                    {isSummarizing ? <RefreshCw size={16} className="spin" /> : <Sparkles size={16} />}
                    AI Summary
                  </button>
                </div>
              </div>

              {selectedComm.aiSummary && (
                <div className="ai-summary-card">
                  <div className="ai-header">
                    <Sparkles size={14} />
                    <span>AI ORGANIZER</span>
                  </div>
                  <p>{selectedComm.aiSummary}</p>
                </div>
              )}

              <div className="email-body-container">
                <div 
                  className="email-body" 
                  dangerouslySetInnerHTML={{ __html: selectedComm.body }} 
                />
              </div>
            </div>
          ) : (
            <div className="detail-placeholder">
              <MessageSquare size={64} opacity={0.1} />
              <p>Select a communication to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {isComposeOpen && (
        <div className="compose-overlay">
          <div className="compose-modal glass-panel">
            <div className="compose-header">
              <h3>{composeData.subject.startsWith('Re:') ? 'Reply' : 'Forward'} Email</h3>
              <button className="close-btn" onClick={() => setIsComposeOpen(false)}>×</button>
            </div>
            <div className="compose-body">
              <div className="input-group-glass">
                <label>To</label>
                <input 
                  type="text" 
                  value={composeData.to} 
                  onChange={(e) => setComposeData({...composeData, to: e.target.value})}
                  placeholder="recipient@email.com"
                />
              </div>
              <div className="input-group-glass">
                <label>Subject</label>
                <input 
                  type="text" 
                  value={composeData.subject} 
                  onChange={(e) => setComposeData({...composeData, subject: e.target.value})}
                />
              </div>
              <div className="input-group-glass editor-group">
                <label>Message</label>
                <textarea 
                  value={composeData.body.replace(/<br>/g, '\n')} 
                  onChange={(e) => setComposeData({...composeData, body: e.target.value.replace(/\n/g, '<br>')})}
                  placeholder="Type your response here..."
                />
              </div>
            </div>
            <div className="compose-footer">
              <button className="btn-secondary" onClick={() => setIsComposeOpen(false)}>Cancel</button>
              <button 
                className="btn-send-premium" 
                onClick={handleSendResponse}
                disabled={isSending}
              >
                {isSending ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-comms-premium {
          padding: 32px;
          height: calc(100vh - 100px);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .comms-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .header-eyebrow {
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--gold);
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }

        .comms-header h1 {
          font-size: 2.5rem;
          margin: 0;
        }

        .header-actions {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .search-pill {
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 100px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          width: 350px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
        }

        .search-pill input {
          border: none;
          background: transparent;
          outline: none;
          width: 100%;
          font-size: 0.9rem;
        }

        .filter-group-glass {
          background: rgba(0, 0, 0, 0.03);
          padding: 4px;
          border-radius: 12px;
          display: flex;
          gap: 4px;
        }

        .filter-group-glass button {
          padding: 6px 16px;
          border-radius: 8px;
          border: none;
          background: transparent;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-group-glass button.active {
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .comms-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 24px;
          overflow: hidden;
        }

        .glass-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .comms-list-panel {
          overflow-y: auto;
        }

        .comm-items {
          display: flex;
          flex-direction: column;
        }

        .comm-item {
          padding: 20px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.03);
          cursor: pointer;
          transition: all 0.2s;
        }

        .comm-item:hover {
          background: rgba(255, 255, 255, 0.4);
        }

        .comm-item.selected {
          background: white;
          border-left: 4px solid var(--gold);
        }

        .hierarchy-container {
          display: flex;
          flex-direction: column;
        }

        .hierarchy-node {
          display: flex;
          flex-direction: column;
        }

        .node-header {
          display: flex;
          align-items: center;
          padding: 12px 20px;
          cursor: pointer;
          transition: all 0.2s;
          gap: 12px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.03);
          user-select: none;
        }

        .node-header:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        .node-header span {
          font-size: 0.85rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .lpo-node > .node-header {
          background: rgba(0, 0, 0, 0.04);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--ink);
          border-top: 1px solid rgba(0, 0, 0, 0.05);
        }

        .customer-node .node-header {
          padding-left: 36px;
          font-weight: 700;
          color: var(--ink-soft);
          background: rgba(0, 0, 0, 0.01);
        }

        .job-node .node-header {
          padding-left: 52px;
          font-weight: 600;
          color: var(--ink-soft);
          opacity: 0.8;
        }

        .node-content {
          display: flex;
          flex-direction: column;
        }

        .email-node-list {
          display: flex;
          flex-direction: column;
        }

        .comm-item.nested {
          padding: 16px 20px 16px 68px;
          border-left: none;
        }

        .comm-item.nested.selected {
          background: white;
          border-left: 4px solid var(--gold);
          padding-left: 64px;
          box-shadow: inset 4px 0 0 var(--gold);
        }

        .comm-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .comm-type-icon {
          width: 24px;
          height: 24px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink-soft);
        }

        .comm-time {
          font-size: 0.75rem;
          color: var(--ink-soft);
          opacity: 0.6;
        }

        .comm-subject {
          font-size: 0.95rem;
          font-weight: 700;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .comm-from {
          font-size: 0.85rem;
          color: var(--ink-soft);
          margin: 0 0 12px 0;
        }

        .comm-item-footer {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .badge {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .job-badge { background: #fdfef0; color: #a8763a; border: 1px solid #f9f9db; }
        .lpo-badge { background: #f0f7ff; color: #0070f3; border: 1px solid #e1effe; }
        .ai-status-icon { color: var(--gold); margin-left: auto; }

        .comms-detail-panel {
          padding: 0;
          background: white;
        }

        .detail-placeholder {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--ink-soft);
          opacity: 0.5;
          gap: 20px;
        }

        .detail-content {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .detail-header {
          padding: 32px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .detail-header h2 {
          margin: 0 0 8px 0;
          font-size: 1.5rem;
        }

        .detail-meta {
          display: flex;
          gap: 16px;
          color: var(--ink-soft);
          font-size: 0.85rem;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .detail-actions {
          display: flex;
          gap: 12px;
        }

        .btn-action-glass {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid rgba(0, 0, 0, 0.05);
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-action-glass:hover {
          background: rgba(0, 0, 0, 0.1);
        }

        .btn-ai-summarize {
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, var(--gold) 0%, #e67e22 100%);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(243, 156, 18, 0.3);
          transition: all 0.2s;
        }

        .btn-ai-summarize:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(243, 156, 18, 0.4);
        }

        .ai-summary-card {
          margin: 32px;
          background: #fffcf0;
          border: 1px solid #f9f1d2;
          border-radius: 16px;
          padding: 24px;
        }

        .ai-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.7rem;
          font-weight: 900;
          color: var(--gold);
          letter-spacing: 0.1em;
          margin-bottom: 12px;
        }

        .ai-summary-card p {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--ink);
        }

        .email-body-container {
          padding: 0 32px 32px;
          overflow-y: auto;
          flex: 1;
        }

        .email-body {
          font-size: 1rem;
          line-height: 1.8;
          color: var(--ink);
        }

        .compose-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(5px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .compose-modal {
          width: 600px;
          max-height: 90vh;
        }

        .compose-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .compose-header h3 { margin: 0; font-size: 1.1rem; }
        .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; opacity: 0.5; }

        .compose-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .input-group-glass {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .input-group-glass label {
          font-size: 0.7rem;
          font-weight: 800;
          color: var(--ink-soft);
          text-transform: uppercase;
        }

        .input-group-glass input, .input-group-glass textarea {
          padding: 12px;
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.02);
          font-size: 0.95rem;
          outline: none;
        }

        .editor-group textarea {
          height: 200px;
          resize: none;
        }

        .compose-footer {
          padding: 20px 24px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .btn-send-premium {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--ink);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default AdminCommunications;
