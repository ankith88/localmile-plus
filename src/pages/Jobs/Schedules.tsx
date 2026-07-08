import React, { useEffect, useState } from 'react';
import { 
  Plus,
  RefreshCw,
  Clock,
  MapPin,
  X,
  RotateCcw,
  Calendar,
  Trash2,
  ChevronDown,
  ChevronUp,
  Layers,
  ChevronLeft,
  ChevronRight,
  Grid,
  List
} from 'lucide-react';
import { collection, query, where, getDocs, doc, orderBy, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { sortStops } from '../../utils/stops';

import { db } from '../../firebase/config';
import SupportEmailModal from '../../components/SupportEmailModal';
import { useLpo } from '../../context/LpoContext';
import { getNextOccurrences, parseLocalDate } from '../../utils/scheduling';
import CustomSelect from '../../components/CustomSelect';

const Schedules: React.FC = () => {
  const { parent, isAdmin, selectedParentId, setSelectedParentId, allParents, userData } = useLpo();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportJobId, setSupportJobId] = useState('');
  const [supportMetadata, setSupportMetadata] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState('all');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState('all');

  const getServiceConfig = (serviceName: string) => {
    const norm = (serviceName || '').toLowerCase();
    if (norm.includes('h2h') || norm === 'h2h' || norm === 'h2h 2') {
      return { label: 'H2H', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', text: '#1d4ed8' };
    }
    if (norm.includes('ampo') || norm === 'lpo-to-site' || norm === 'australia post-to-site' || norm === 'round-trip') {
      return { label: 'AMPO', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#b45309' };
    }
    if (norm.includes('pmpo') || norm === 'site-to-lpo' || norm === 'site-to-australia post') {
      return { label: 'PMPO', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)', border: '#ec4899', text: '#be185d' };
    }
    return { label: serviceName || 'Other', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#047857' };
  };

  const uniqueCustomers = React.useMemo(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => {
      if (s.customer_id && s.customer?.company) {
        map.set(s.customer_id, s.customer.company);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [schedules]);

  const uniqueServices = React.useMemo(() => {
    const set = new Set<string>();
    schedules.forEach(s => {
      const config = getServiceConfig(s.service);
      set.add(config.label);
    });
    return Array.from(set);
  }, [schedules]);

  useEffect(() => {
    const fetchSchedules = async () => {
      setLoading(true);
      const normalizeFrequency = (freq: any): string[] => {
        if (!Array.isArray(freq)) return [];
        const map: Record<string, string> = {
          'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed', 'thursday': 'Thu', 'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun',
          'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed', 'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat', 'sun': 'Sun',
          'm': 'Mon', 't': 'Tue', 'w': 'Wed', 'th': 'Thu', 'f': 'Fri'
        };
        return freq.map(d => map[d.toLowerCase()] || d);
      };

      const mapDoc = (doc: any) => {
        const data = doc.data() as any;
        return {
          ...data,
          id: doc.id,
          frequency: normalizeFrequency(data.frequency)
        };
      };

      try {
        let baseQ = collection(db, 'scheduled_jobs');
        let constraints: any[] = [orderBy('createdAt', 'desc')];

        if (userData?.role === 'customer' && userData?.customer_id) {
          constraints.unshift(where('customer_id', '==', userData.customer_id));
        } else if (selectedParentId !== 'all') {
          constraints.unshift(where('parent_id', '==', selectedParentId));
        }

        const q = query(baseQ, ...constraints);
        const snapshot = await getDocs(q);
        setSchedules(snapshot.docs.map(mapDoc));
      } catch (error) {
        console.error("Error fetching schedules:", error);
        // Fallback for missing indexes
        let baseQ = collection(db, 'scheduled_jobs');
        let q;
        if (userData?.role === 'customer' && userData?.customer_id) {
          q = query(baseQ, where('customer_id', '==', userData.customer_id));
        } else if (selectedParentId !== 'all') {
          q = query(baseQ, where('parent_id', '==', selectedParentId));
        } else {
          q = baseQ;
        }
        const snapshot = await getDocs(q as any);
        setSchedules(snapshot.docs.map(mapDoc));
      } finally {
        setLoading(false);
      }
    };

    if (parent || isAdmin || userData?.role === 'parent' || userData?.role === 'customer') {
      fetchSchedules();
    }
  }, [parent, isAdmin, selectedParentId, userData]);

  const toggleExpand = (jobId: string) => {
    const newExpanded = new Set(expandedJobIds);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobIds(newExpanded);
  };

  const handleSkipDate = async (jobId: string, date: string) => {
    try {
      await updateDoc(doc(db, 'scheduled_jobs', jobId), {
        skippedDates: arrayUnion(date)
      });
      const updated = schedules.map(s => s.id === jobId ? { ...s, skippedDates: [...(s.skippedDates || []), date] } : s);
      setSchedules(updated);
      if (selectedSchedule?.id === jobId) {
        setSelectedSchedule({ ...selectedSchedule, skippedDates: [...(selectedSchedule.skippedDates || []), date] });
      }
    } catch (e) {
      console.error("Error skipping date:", e);
    }
  };

  const handleUnskipDate = async (jobId: string, date: string) => {
    try {
      await updateDoc(doc(db, 'scheduled_jobs', jobId), {
        skippedDates: arrayRemove(date)
      });
      const updated = schedules.map(s => s.id === jobId ? { ...s, skippedDates: (s.skippedDates || []).filter((d: string) => d !== date) } : s);
      setSchedules(updated);
      if (selectedSchedule?.id === jobId) {
        setSelectedSchedule({ ...selectedSchedule, skippedDates: (selectedSchedule.skippedDates || []).filter((d: string) => d !== date) });
      }
    } catch (e) {
      console.error("Error unskipping date:", e);
    }
  };

  const handleStopSeries = async (jobId: string) => {
    if (!window.confirm("Are you sure you want to stop this recurring schedule? This will prevent all future visits.")) return;
    try {
      await updateDoc(doc(db, 'scheduled_jobs', jobId), {
        recurrenceStatus: 'stopped'
      });
      setSchedules(schedules.map(s => s.id === jobId ? { ...s, recurrenceStatus: 'stopped' } : s));
      setSelectedSchedule(null);
    } catch (e) {
      console.error("Error stopping series:", e);
    }
  };

  const handleUpdateFrequency = async (jobId: string, day: string) => {
    const schedule = schedules.find(s => s.id === jobId);
    if (!schedule) return;
    const currentFreq = schedule.frequency || [];
    const newFreq = currentFreq.includes(day)
      ? currentFreq.filter((d: string) => d !== day)
      : [...currentFreq, day];

    try {
      await updateDoc(doc(db, 'scheduled_jobs', jobId), {
        frequency: newFreq
      });
      const updated = schedules.map(s => s.id === jobId ? { ...s, frequency: newFreq } : s);
      setSchedules(updated);
      if (selectedSchedule?.id === jobId) {
        setSelectedSchedule({ ...selectedSchedule, frequency: newFreq });
      }
    } catch (e) {
      console.error("Error updating frequency:", e);
    }
  };

  const filteredSchedules = schedules.filter(s => {
    const matchesSearch = s.customer.company.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         s.customer.address.toLowerCase().includes(searchTerm.toLowerCase());
    const isActive = s.recurrenceStatus !== 'stopped';
    const matchesCustomer = selectedCustomerFilter === 'all' || s.customer_id === selectedCustomerFilter;
    const serviceConfig = getServiceConfig(s.service);
    const matchesService = selectedServiceFilter === 'all' || serviceConfig.label === selectedServiceFilter;
    return matchesSearch && isActive && matchesCustomer && matchesService;
  });

  // Calendar Logic Helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    
    const days = [];
    // Padding for first week
    for (let i = 0; i < firstDay; i++) {
      days.push({ type: 'padding' });
    }
    // Actual days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ type: 'day', date: dateStr, dayNum: i });
    }
    return days;
  };

  const monthProjections = React.useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const results: any[] = [];
    filteredSchedules.forEach(s => {
      for (let d = 1; d <= lastDay; d++) {
        const checkDate = new Date(year, month, d);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayName = dayNames[checkDate.getDay()];
        
        if (s.date <= dateStr && s.frequency?.includes(dayName)) {
          results.push({ ...s, date: dateStr });
        }
      }
    });
    return results;
  }, [filteredSchedules, currentMonth]);

  const navigateMonth = (direction: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };
  return (
    <div className="schedules-premium">
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <div className="content-container">
        <header className="page-header">
           <div className="header-left">
              <div className="title-area">
                <RotateCcw className="header-icon" />
                <div>
                  <h1>Recurring Schedules</h1>
                  <p>Manage your ongoing logistics contracts and visit frequencies.</p>
                </div>
              </div>
           </div>
           <div className="header-right">
              <button onClick={() => window.location.href = '/new-job'} className="btn-premium-action">
                <Plus size={20} />
                <span>BOOK NEW JOB</span>
              </button>
           </div>
        </header>

        <div className="schedules-view-layout">
            <div className="glass-card filter-bar">
               {isAdmin && (
                 <CustomSelect 
                   value={selectedParentId}
                   onChange={(val) => setSelectedParentId(val)}
                   options={[
                    { value: 'all', label: 'All Parents', icon: <MapPin size={14} /> },
                    ...allParents.map(l => ({ value: l.id, label: l.name, icon: <MapPin size={14} /> }))
                   ]}
                   className="lpo-select-custom"
                 />
               )}
               <div className="search-pill">
                 <Plus size={18} style={{ transform: 'rotate(45deg)', color: '#8fa6a0' }} />
                 <input 
                   type="text" 
                   placeholder="Search schedules..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
               </div>

               <CustomSelect 
                 value={selectedCustomerFilter}
                 onChange={(val) => setSelectedCustomerFilter(val)}
                 options={[
                   { value: 'all', label: 'All Customers', icon: <MapPin size={14} /> },
                   ...uniqueCustomers.map(c => ({ value: c.id, label: c.name, icon: <MapPin size={14} /> }))
                 ]}
                 className="lpo-select-custom"
               />

               <CustomSelect 
                 value={selectedServiceFilter}
                 onChange={(val) => setSelectedServiceFilter(val)}
                 options={[
                   { value: 'all', label: 'All Services', icon: <Clock size={14} /> },
                   ...uniqueServices.map(s => ({ value: s, label: s, icon: <Clock size={14} /> }))
                 ]}
                 className="lpo-select-custom"
               />
               
               <div className="view-toggle-pills">
                 <button 
                   className={viewMode === 'calendar' ? 'active' : ''} 
                   onClick={() => setViewMode('calendar')}
                 >
                   <Grid size={16} />
                   <span>CALENDAR</span>
                 </button>
                 <button 
                   className={viewMode === 'list' ? 'active' : ''} 
                   onClick={() => setViewMode('list')}
                 >
                   <List size={16} />
                   <span>LIST</span>
                 </button>
               </div>

               <button className="btn-secondary-glass" onClick={() => window.location.reload()}><RefreshCw size={18} /></button>
            </div>

            {loading ? (
              <div className="loading-state">
                <RefreshCw className="spinner" />
                <p>Fetching Schedules...</p>
              </div>
            ) : viewMode === 'calendar' ? (
              <div className="calendar-view-container fade-in">
                <div className="calendar-header-nav">
                   <button onClick={() => navigateMonth(-1)}><ChevronLeft size={20} /></button>
                   <h2>{currentMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</h2>
                   <button onClick={() => navigateMonth(1)}><ChevronRight size={20} /></button>
                </div>

                <div className="calendar-grid-wrapper glass-card">
                  <div className="calendar-weekday-header">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
                  </div>
                  <div className="calendar-days-grid">
                    {getDaysInMonth(currentMonth).map((day, idx) => {
                      if (day.type === 'padding') return <div key={idx} className="day-cell padding"></div>;
                      
                      const dayJobs = monthProjections.filter(p => p.date === day.date);
                      const isToday = day.date === new Date().toISOString().split('T')[0];

                      return (
                        <div key={day.date} className={`day-cell ${isToday ? 'is-today' : ''}`}>
                          <div className="day-number">{day.dayNum}</div>
                          <div className="day-jobs-list">
                             {dayJobs.map(job => {
                               const isSkipped = (job.skippedDates || []).includes(job.date);
                               const serviceConfig = getServiceConfig(job.service);
                               return (
                                 <div 
                                   key={job.id} 
                                   className={`job-dot-pill ${isSkipped ? 'skipped' : ''}`}
                                   onClick={() => setSelectedSchedule(job)}
                                   title={`${job.customer.company} - ${serviceConfig.label}`}
                                   style={isSkipped ? {} : {
                                     backgroundColor: serviceConfig.bg,
                                     borderColor: serviceConfig.border,
                                     color: serviceConfig.text,
                                     border: `1px solid ${serviceConfig.border}`
                                   }}
                                 >
                                   <div className="dot" style={isSkipped ? {} : { backgroundColor: serviceConfig.color }}></div>
                                   <span className="truncate">{job.customer.company} ({serviceConfig.label})</span>
                                 </div>
                               );
                             })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="glass-card empty-state">
                <div className="empty-icon"><Layers size={48} /></div>
                <h3>No Recurring Schedules Found</h3>
                <p>Active logistics contracts will appear here for management.</p>
              </div>
            ) : (
              <div className="schedules-grid">
                {filteredSchedules.map(schedule => (
                  <div key={schedule.id} className="schedule-card-wrapper">
                     <div className="timeline-content-card glass-card">
                        <div className="card-header" onClick={() => toggleExpand(schedule.id)} style={{ cursor: 'pointer' }}>
                           <div className="customer-block">
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 <h3 className="company-name">{schedule.customer.company}</h3>
                                 {isAdmin && (
                                   <span className="lpo-badge-inline">
                                     {allParents.find(l => l.id === schedule.parent_id)?.name || 'Unknown Parent'}
                                   </span>
                                 )}
                               </div>
                              <div className="location-info">
                                 <MapPin size={12} />
                                 <span>{schedule.customer.suburb}, {schedule.customer.state}</span>
                              </div>
                           </div>
                           <div className="header-meta-group">
                             <div className="status-tag status-scheduled">
                                {schedule.frequency?.join(', ')}
                             </div>
                             <div className="expand-icon">
                               {expandedJobIds.has(schedule.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                             </div>
                           </div>
                        </div>

                        {expandedJobIds.has(schedule.id) && (
                           <div className="job-stops-container fade-in">
                              <div className="stops-visual-line"></div>
                              {sortStops(schedule.stops).map((stop: any, sIdx: number) => {
                                const isCustomer = userData?.role === 'customer';
                                const isOutbound = schedule.service === 'site-to-australia post' || schedule.service === 'site-to-lpo';
                                const isInbound = schedule.service === 'australia post-to-site' || schedule.service === 'lpo-to-site';
                                const shouldMask = isCustomer && ((isOutbound && stop.type === 'delivery') || (isInbound && stop.type === 'pickup'));

                                return (
                                  <div key={sIdx} className="stop-entry">
                                    <div className={`stop-node ${stop.type}`}></div>
                                    <div className="stop-details">
                                      <div className="stop-type-header">
                                        <span className="type-pill">{stop.label || stop.type.toUpperCase()}</span>
                                        <span className="stop-seq">STOP {stop.sequence}</span>
                                      </div>
                                      <div className="stop-loc-name">{shouldMask ? "POST OFFICE" : stop.locationName}</div>
                                      <div className="stop-addr">{shouldMask ? "" : `${stop.address || ''}${stop.suburb ? `, ${stop.suburb}` : ''}`}</div>
                                    </div>
                                    <div className="stop-status">{stop.status}</div>
                                  </div>
                                );
                              })}
                           </div>
                         )}

                       <div className="card-meta">
                          {(() => {
                            const serviceConfig = getServiceConfig(schedule.service);
                            return (
                              <div className="meta-pill" style={{
                                backgroundColor: serviceConfig.bg,
                                color: serviceConfig.text,
                                border: `1px solid ${serviceConfig.border}`,
                                padding: '4px 10px',
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                 <Clock size={12} style={{ color: serviceConfig.color }} />
                                 <span>{serviceConfig.label}</span>
                              </div>
                            );
                          })()}
                          <div className="meta-pill">
                             <RotateCcw size={12} />
                             <span>{schedule.billing}</span>
                          </div>
                          <div 
                            className="job-ref interactive" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSupportJobId(schedule.id);
                              setSupportMetadata({
                                parentName: parent?.name,
                                companyName: schedule.customer?.company,
                                contactName: schedule.customer?.contactName,
                                contactEmail: schedule.customer?.email,
                                contactPhone: schedule.customer?.phone,
                                serviceType: schedule.service,
                                billing: schedule.billing
                              });
                              setIsSupportModalOpen(true);
                            }}
                          >
                            REF: {schedule.id}
                          </div>
                       </div>

                        <div className="card-actions">
                            <button className="btn-primary-glass manage-schedule" onClick={() => setSelectedSchedule(schedule)}>
                               <RefreshCw size={16} />
                               <span>MANAGE SCHEDULE</span>
                            </button>
                        </div>
                     </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <SupportEmailModal 
        isOpen={isSupportModalOpen} 
        onClose={() => setIsSupportModalOpen(false)}
        jobId={supportJobId}
        contextTitle={supportJobId ? `Job Reference: ${supportJobId}` : undefined}
        metadata={supportMetadata}
      />

      {selectedSchedule && (
        <div className="modal-overlay fade-in active">
          <div className="modal-content glass-card">
            <div className="modal-header">
              <div className="header-title">
                <RotateCcw size={20} />
                <h2>Schedule Management</h2>
              </div>
              <button className="close-btn" onClick={() => setSelectedSchedule(null)}><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              <div className="schedule-info-summary">
                <div className="m-company">{selectedSchedule.customer.company}</div>
                <div className="m-address">
                  <MapPin size={12} />
                  <span>{selectedSchedule.customer.address}, {selectedSchedule.customer.suburb}</span>
                </div>
              </div>

              <div className="mgmt-section">
                <label className="m-label">Service Frequency</label>
                <div className="m-frequency-grid">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                    <button
                      key={day}
                      className={`m-freq-pill ${selectedSchedule.frequency?.includes(day) ? 'active' : ''}`}
                      onClick={() => handleUpdateFrequency(selectedSchedule.id, day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mgmt-section">
                <label className="m-label">Upcoming Instances</label>
                <div className="occurrences-list">
                  {getNextOccurrences(selectedSchedule.date, selectedSchedule.frequency || [], 6).map(date => {
                    const isSkipped = (selectedSchedule.skippedDates || []).includes(date);
                    return (
                      <div key={date} className={`occ-row ${isSkipped ? 'skipped' : ''}`}>
                        <div className="occ-date">
                          <Calendar size={14} />
                          <span>{parseLocalDate(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                        </div>
                        <button 
                          className={`skip-toggle ${isSkipped ? 'active' : ''}`}
                          onClick={() => isSkipped ? handleUnskipDate(selectedSchedule.id, date) : handleSkipDate(selectedSchedule.id, date)}
                        >
                          {isSkipped ? 'UNSKIP' : 'SKIP VISIT'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-danger-zone">
                <button className="btn-danger-outline" onClick={() => handleStopSeries(selectedSchedule.id)}>
                   <Trash2 size={16} /> STOP ALL FUTURE VISITS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .schedules-premium {
          position: relative;
          min-height: 100vh;
          background: var(--offwhite);
          overflow-x: hidden;
        }

        .mesh-bg {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 0; filter: blur(100px); opacity: 0.5;
        }
        .blob { position: absolute; border-radius: 50%; width: 600px; height: 600px; background: var(--cream-warm); animation: blobMove 15s infinite alternate; }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -100px; left: -100px; background: var(--cream-warm); animation-delay: -5s; }

        @keyframes blobMove {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(100px, 50px) scale(1.1); }
        }

        .content-container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 40px 24px 100px; }

        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .title-area { display: flex; gap: 20px; align-items: center; }
        .header-icon { width: 44px; height: 44px; color: var(--ink); }
        .page-header h1 { font-family: var(--font-headings); font-size: 2.2rem; font-weight: 400; color: var(--ink); margin: 0; letter-spacing: -0.025em; }
        .page-header p { margin: 4px 0 0; color: var(--ink-soft); font-size: 1rem; font-weight: 400; }

        .lpo-select-custom {
          min-width: 200px;
        }

        .lpo-badge-inline {
          font-family: var(--font-ui);
          font-size: 0.6rem;
          font-weight: 700;
          color: var(--gold);
          background: rgba(234, 240, 68, 0.1);
          padding: 2px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .btn-premium-action {
          background: var(--ink);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 18px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(26, 61, 51, 0.2);
          transition: all 0.3s;
        }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          margin-bottom: 32px;
          border-radius: 20px;
          gap: 16px;
        }
        .search-pill {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.8);
          padding: 0 20px;
          border-radius: 14px;
        }
        .search-pill input { border: none; background: transparent; padding: 14px 0; width: 100%; font-weight: 500; font-size: 0.95rem; outline: none; }
        
        .view-toggle-pills {
          display: flex;
          background: rgba(255, 255, 255, 0.5);
          padding: 4px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .view-toggle-pills button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.75rem;
          color: var(--ink-soft);
          cursor: pointer;
          transition: all 0.2s;
        }
        .view-toggle-pills button.active {
          background: var(--ink);
          color: white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .calendar-header-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .calendar-header-nav h2 { font-size: 1.5rem; font-weight: 800; color: var(--ink); margin: 0; }
        .calendar-header-nav button {
          background: white; border: 1px solid var(--cream-warm); width: 44px; height: 44px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink);
        }

        .calendar-grid-wrapper { padding: 24px; border-radius: 24px; }
        .calendar-weekday-header { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; margin-bottom: 16px; }
        .calendar-weekday-header div { font-size: 0.75rem; font-weight: 800; color: var(--ink-soft); opacity: 0.5; text-transform: uppercase; letter-spacing: 1px; }

        .calendar-days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; }
        .day-cell {
          min-height: 120px;
          background: rgba(255,255,255,0.4);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 16px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: all 0.2s;
        }
        .day-cell.padding { background: transparent; border: none; }
        .day-cell:not(.padding):hover { background: rgba(255,255,255,0.8); transform: translateY(-2px); }
        .day-cell.is-today { border: 2px solid var(--ink); background: rgba(255,255,255,0.9); }
        .day-number { font-size: 0.9rem; font-weight: 800; color: var(--ink-soft); }
        .is-today .day-number { color: var(--ink); }

        .day-jobs-list { display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
        .job-dot-pill {
          background: var(--ink);
          color: white;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.65rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          overflow: hidden;
        }
        .job-dot-pill.skipped { background: var(--cream-warm); color: var(--ink-soft); opacity: 0.6; text-decoration: line-through; }
        .job-dot-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); }
        .job-dot-pill.skipped .dot { background: var(--danger); }
        .truncate { overflow: hidden; text-overflow: ellipsis; }

        .btn-secondary-glass {
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.5);
          color: var(--ink);
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }

        .schedules-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }

        .timeline-content-card {
          padding: 24px; border-radius: 24px; background: rgba(255,255,255,0.6);
          border: 1px solid rgba(255,255,255,0.4);
          transition: all 0.3s;
        }
        .timeline-content-card:hover {
          background: rgba(255,255,255,0.9);
          box-shadow: 0 15px 40px rgba(26,61,51,0.08);
        }

        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .company-name { font-size: 1.25rem; font-weight: 900; color: var(--ink); margin: 0; }
        .location-info { display: flex; align-items: center; gap: 6px; color: var(--ink-soft); font-size: 0.85rem; font-weight: 600; margin-top: 6px; }

        .header-meta-group { display: flex; align-items: center; gap: 16px; }
        .status-tag {
          padding: 6px 14px; border-radius: 10px; font-family: var(--font-ui); font-size: 0.65rem; font-weight: 500;
          text-transform: uppercase; background: var(--cream-warm); color: var(--ink); letter-spacing: 0.16em;
        }
        .expand-icon { color: var(--ink-soft); opacity: 0.6; }

        .job-stops-container {
          margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.03);
          position: relative; padding-left: 24px; margin-bottom: 24px;
        }
        .stops-visual-line {
          position: absolute; left: 7px; top: 30px; bottom: 30px; width: 2px;
          background: rgba(26, 61, 51, 0.08); border-radius: 2px;
        }
        .stop-entry { display: flex; gap: 16px; margin-bottom: 20px; }
        .stop-node { width: 16px; height: 16px; border-radius: 50%; background: white; border: 3px solid var(--offwhite); margin-top: 4px; }
        .stop-node.pickup { border-color: var(--ink); }
        .stop-node.delivery { border-color: var(--gold); }
        .stop-type-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .type-pill { font-family: var(--font-ui); font-size: 0.55rem; font-weight: 500; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.16em; }
        .stop-seq { font-family: var(--font-ui); font-size: 0.6rem; color: var(--ink-soft); opacity: 0.4; font-weight: 500; }
        .stop-loc-name { font-weight: 800; color: var(--ink); font-size: 0.9rem; }
        .stop-addr { font-size: 0.75rem; color: var(--ink-soft); }

        .card-meta { display: flex; gap: 16px; align-items: center; padding: 20px 0; border-top: 1px solid rgba(26,61,51,0.03); margin-top: 20px; }
        .meta-pill { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); }
        .job-ref { margin-left: auto; font-family: var(--font-ui); font-size: 0.7rem; color: var(--ink-soft); opacity: 0.4; font-weight: 500; }


        .loading-state, .empty-state {
          padding: 80px 40px; text-align: center; color: var(--ink-soft);
        }
        .spinner { animation: rotate 2s linear infinite; margin-bottom: 16px; }
        @keyframes rotate { 100% { transform: rotate(360deg); } }
        .empty-icon { margin-bottom: 20px; color: #c0d1cc; }

        /* Modal Styles Placeholder (Using the same as Dashboard) */
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(26, 61, 51, 0.4); backdrop-filter: blur(8px);
          display: none; align-items: center; justify-content: center; z-index: 2000;
          padding: 24px;
        }
        .modal-overlay.active { display: flex; }
        .modal-content { width: 100%; max-width: 550px; padding: 32px; position: relative; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-title { display: flex; align-items: center; gap: 12px; color: var(--ink); }
        .header-title h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); opacity: 0.6; cursor: pointer; }

        .schedule-info-summary { background: var(--paper); padding: 20px; border-radius: 20px; margin-bottom: 32px; }
        .m-company { font-weight: 800; color: var(--ink); font-size: 1.1rem; margin-bottom: 4px; }
        .m-address { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--ink-soft); font-weight: 600; }

        .mgmt-section { margin-bottom: 32px; }
        .m-label { display: block; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--ink-soft); opacity: 0.6; margin-bottom: 8px; letter-spacing: 0.5px; }

        .m-frequency-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .m-freq-pill { padding: 12px; border-radius: 12px; border: 1px solid var(--cream-warm); background: white; font-weight: 700; color: var(--ink-soft); cursor: pointer; transition: all 0.2s; }
        .m-freq-pill.active { background: var(--ink); color: white; border-color: var(--ink); }

        .occurrences-list { display: flex; flex-direction: column; gap: 10px; }
        .occ-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: white; border: 1px solid var(--cream-warm); border-radius: 14px; }
        .occ-row.skipped { background: var(--cream-warm); border-color: var(--danger); opacity: 0.7; }
        .occ-date { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 700; color: var(--ink); }
        .skip-toggle { padding: 6px 14px; border-radius: 50px; font-size: 0.65rem; font-weight: 800; border: 1px solid var(--cream-warm); background: white; color: var(--ink-soft); cursor: pointer; }
        .skip-toggle.active { background: var(--danger); color: white; border-color: var(--danger); }

        .modal-danger-zone { border-top: 1px solid var(--cream-warm); padding-top: 24px; margin-top: 10px; }
        .btn-danger-outline { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid var(--danger); color: var(--danger); background: transparent; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: all 0.2s; }
        .btn-danger-outline:hover { background: var(--cream-warm); }

        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* Responsive Adjustments */
        @media (max-width: 768px) {
          .content-container { padding: 16px 12px 100px; }
          .page-header { flex-direction: column; gap: 16px; margin-bottom: 24px; }
          .page-header h1 { font-size: 1.5rem; }
          .page-header p { font-size: 0.85rem; }
          .header-icon { width: 32px; height: 32px; }
          .header-right { width: 100%; }
          .btn-premium-action { width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.85rem; }

          .filter-bar { flex-direction: column; align-items: stretch; padding: 12px; gap: 12px; margin-bottom: 20px; }
          .view-toggle-pills { width: 100%; }
          .view-toggle-pills button { flex: 1; justify-content: center; padding: 6px 12px; }

          .calendar-grid-wrapper { padding: 12px 8px; margin: 0 -4px; width: calc(100% + 8px); border-radius: 16px; }
          .calendar-weekday-header div { font-size: 0.6rem; letter-spacing: 0; }
          .calendar-days-grid { gap: 4px; }
          .day-cell { min-height: 44px; padding: 4px; border-radius: 8px; }
          .day-number { font-size: 0.65rem; text-align: center; }
          .day-jobs-list { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 2px; }

          .job-dot-pill { padding: 0; width: 5px; height: 5px; min-width: 5px; border-radius: 50%; background: var(--ink); }
          .job-dot-pill span, .job-dot-pill .dot { display: none; }
          .job-dot-pill.skipped { background: var(--danger); opacity: 0.5; }

          .timeline-content-card { padding: 14px; border-radius: 20px; }
          .card-header { flex-direction: column; gap: 8px; margin-bottom: 12px; }
          .company-name { font-size: 1.1rem; }
          .location-info { font-size: 0.75rem; margin-top: 2px; }
          .header-meta-group { width: 100%; justify-content: space-between; }
          .status-tag { padding: 4px 10px; font-size: 0.55rem; }

          .card-meta { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 0; margin-top: 12px; }
          .meta-pill { font-size: 0.7rem; }
          .job-ref { margin-left: 0; font-size: 0.6rem; }

          .modal-content { padding: 20px 14px; max-height: 85vh; overflow-y: auto; border-radius: 24px; }
          .modal-header { margin-bottom: 16px; }
          .header-title h2 { font-size: 1.1rem; }
          .schedule-info-summary { padding: 12px; margin-bottom: 20px; }
          .m-company { font-size: 1rem; }
          .mgmt-section { margin-bottom: 20px; }
          .m-frequency-grid { grid-template-columns: repeat(5, 1fr); gap: 6px; }
          .m-freq-pill { padding: 8px; font-size: 0.7rem; border-radius: 8px; }
          .occ-row { padding: 8px 12px; font-size: 0.8rem; }
          .skip-toggle { padding: 4px 10px; font-size: 0.6rem; }
        }
      `}</style>
    </div>
  );
};

export default Schedules;
