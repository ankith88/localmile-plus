import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  MapPin, 
  Phone, 
  Filter,
  Plus,
  Mail,
  CreditCard,
  Rocket,
  User,
  Building2,
  Edit2,
  UserMinus
} from 'lucide-react';
import LoadingScreen from '../../components/LoadingScreen';
import EditCustomerModal from '../../components/EditCustomerModal';
import CancelCustomerModal from '../../components/CancelCustomerModal';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import CustomSelect from '../../components/CustomSelect';

const CustomerHub: React.FC = () => {
  const { parent, isAdmin, allParents, selectedParentId, setSelectedParentId, userData, companyData } = useLpo();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [jobTypeFilter, setJobTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [cancellingCustomer, setCancellingCustomer] = useState<any | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'contact' | 'addresses' | 'services'>>({});

  const handleBookJob = (url = '/new-job') => {
    if (userData?.role === 'customer' && (companyData?.franchisee === 435 || companyData?.franchisee === '435')) {
       alert("The MailPlus team is working to get the account setup. You will be notified once done.");
       return;
    }
    window.location.href = url;
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        let allCustomers: any[] = [];
        let allRequests: any[] = [];

        // Check if independent customer
        if (userData?.role === 'customer' && userData?.customer_id) {
          const q = query(
            collection(db, `companies/${userData.customer_id}/address_book`),
            orderBy('companyName', 'asc')
          );
          const snapshot = await getDocs(q);
          allCustomers = snapshot.docs.map(doc => ({ 
            ...doc.data(), 
            id: doc.id,
            status: 'Active', // Address book entries are always active
            role: 'customer', // tag it for modal logic
            customer_id: userData.customer_id
          }));
        } else {
          // Parent/Admin logic
          const parentsToFetch = selectedParentId === 'all' ? allParents : allParents.filter(l => l.id === selectedParentId);

          if (parentsToFetch.length === 0 && parent) {
            parentsToFetch.push(parent);
          }

          // Fetch customers from all relevant LPOs
          await Promise.all(parentsToFetch.map(async (targetParent) => {
            const q = query(
              collection(db, `companies/${targetParent.id}/customers`),
              orderBy('companyName', 'asc')
            );
            const snapshot = await getDocs(q);
            const customersData = snapshot.docs.map(doc => ({ 
              ...doc.data(), 
              id: doc.id, 
              parent_id: targetParent.id,
              lpoName: targetParent.name 
            }));
            allCustomers = [...allCustomers, ...customersData];
          }));
        }

        // Fetch Requests to calculate stats
        let reqBaseQ = collection(db, 'requests');
        let reqConstraints: any[] = [];
        
        if (userData?.role === 'customer' && userData?.uid) {
          reqConstraints.push(where('uid', '==', userData.uid));
        } else if (selectedParentId !== 'all') {
          reqConstraints.push(where('parent_id', '==', selectedParentId));
        }
        
        const requestsSnap = await getDocs(query(reqBaseQ, ...reqConstraints));
        allRequests = requestsSnap.docs.map(doc => doc.data());

        // Aggregate Stats
        const statsMap: Record<string, { totalJobs: number, lastJobDate: string | null }> = {};
        
        allRequests.forEach(req => {
          // For independent customers, we match by company name since it's the identifier in the address book
          const key = userData?.role === 'customer' ? req.customer?.company : (req.netsuiteCustomerId?.toString() || req.customer?.netsuiteId?.toString() || req.customer?.company);
          if (!key) return;

          if (!statsMap[key]) {
            statsMap[key] = { totalJobs: 0, lastJobDate: null };
          }
          statsMap[key].totalJobs += 1;
          if (req.date) {
            if (!statsMap[key].lastJobDate || req.date > statsMap[key].lastJobDate) {
              statsMap[key].lastJobDate = req.date;
            }
          }
        });

        // Merge stats
        const enrichedCustomers = allCustomers.map((c: any) => {
          const custId = (c.companyId || c.customerInternalId || '').toString();
          const company = c.companyName || c.company_name || '';
          
          let stats;
          if (userData?.role === 'customer') {
            stats = statsMap[company];
          } else {
            stats = (custId && statsMap[custId]) ? statsMap[custId] : (company ? statsMap[company] : null);
          }
          
          return {
            ...c,
            totalJobs: stats?.totalJobs || 0,
            lastJobDate: stats?.lastJobDate || c.lastJobDate || null
          };
        });

        setCustomers(enrichedCustomers);
      } catch (error) {
        console.error("Error fetching customers/stats:", error);
      } finally {
        setLoading(false);
      }
    };

    if (parent || isAdmin || (userData?.role === 'customer') || userData?.role === 'parent') {
      fetchCustomers();
    }
  }, [parent, isAdmin, selectedParentId, allParents, userData]);

  const filteredCustomers = customers.filter(c => {
    // Hide default Australia Post from customer role
    if (userData?.role === 'customer') {
      const name = (c.companyName || c.company_name || '').toLowerCase();
      if (name.includes('australia post')) return false;
    }

    // 1. Search Filter
    const searchStr = searchTerm.toLowerCase();
    const name = (c.companyName || c.company_name || '').toLowerCase();
    const city = (c.city || c.address?.suburb || '').toLowerCase();
    const franchisee = (c.franchiseeText || '').toLowerCase();
    const matchesSearch = name.includes(searchStr) || city.includes(searchStr) || franchisee.includes(searchStr);

    if (!matchesSearch) return false;

    // 2. Advanced Filters
    if (serviceFilter !== 'all') {
      if ((serviceFilter === 'lpo-to-site' || serviceFilter === 'australia post-to-site') && !(c.lpoServiceAMPOInternalID && c.lpoServiceAMPOInternalID !== 'null')) return false;
      if ((serviceFilter === 'site-to-lpo' || serviceFilter === 'site-to-australia post') && !(c.lpoServicePMPOInternalID && c.lpoServicePMPOInternalID !== 'null')) return false;
      if (serviceFilter === 'round-trip' && !(c.lpoServiceAMPOPMPOInternalID && c.lpoServiceAMPOPMPOInternalID !== 'null')) return false;
    }

    if (billingFilter !== 'all') {
      const b = (c.billing || '').toLowerCase();
      if (b !== billingFilter) return false;
    }

    if (jobTypeFilter !== 'all') {
      const jt = (c.jobtype || c.jobType || '').toLowerCase();
      if (jt !== jobTypeFilter) return false;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && c.status === 'cancelled') return false;
      if (statusFilter === 'cancelled' && c.status !== 'cancelled') return false;
    }

    return true;
  });

  return (
    <div className="customer-hub-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <div className="content-container">
        <header className="page-header">
           <div className="header-left">
              <div className="title-area">
                <Users className="header-icon" />
                <div>
                  <h1>{userData?.role === 'customer' ? 'Address Book' : 'Customer Hub'} <span className="title-count">{filteredCustomers.length}</span></h1>
                  <p>{userData?.role === 'customer' ? 'Manage your saved delivery addresses.' : 'Manage and track your service territory clients.'}</p>
                </div>
              </div>
           </div>
           <div className="header-right">
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
              <button className="btn-premium-action" onClick={() => handleBookJob()}>
                <Plus size={20} />
                <span>{userData?.role === 'customer' ? 'BOOK NEW JOB' : 'NEW JOB FOR CUSTOMER'}</span>
              </button>
           </div>
        </header>

        <div className="hub-controls">
           <div className="search-bar-glass">
              <Search size={20} />
              <input 
                type="text" 
                placeholder="Search by company, contact or suburb..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           {userData?.role !== 'customer' && (
             <div className="filter-group-glass">
                <div className="filter-item">
                  <Filter size={14} />
                  <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                    <option value="all">All Service Types</option>
                    <option value="lpo-to-site">Parent ➔ Site</option>
                    <option value="site-to-lpo">Site ➔ Parent</option>
                    <option value="australia post-to-site">Australia Post ➔ Site</option>
                    <option value="site-to-australia post">Site ➔ Australia Post</option>
                    <option value="round-trip">Round Trip</option>
                  </select>
                </div>
                <div className="filter-item">
                  <CreditCard size={14} />
                  <select value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
                    <option value="all">All Billing</option>
                    <option value="customer">Customer</option>
                    <option value="lpo">Parent Paid</option>
                  </select>
                </div>
                <div className="filter-item">
                  <Rocket size={14} />
                  <select value={jobTypeFilter} onChange={(e) => setJobTypeFilter(e.target.value)}>
                    <option value="all">All Job Types</option>
                    <option value="one-off">One-off</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
                <div className="filter-item">
                  <Users size={14} />
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="active">Active Accounts</option>
                    <option value="cancelled">Cancelled Only</option>
                    <option value="all">All Accounts</option>
                  </select>
                </div>
             </div>
           )}
        </div>

        <div className="customers-view">
           {loading ? (
             <LoadingScreen fullScreen={false} message="Syncing Database" />
           ) : filteredCustomers.length === 0 ? (
             <div className="empty-hub glass-card">
                <Users size={64} className="empty-icon" />
                <h3>{userData?.role === 'customer' ? 'Address Book Empty' : 'No Customers Found'}</h3>
                <p>{userData?.role === 'customer' ? 'Your saved addresses will appear here.' : 'Start a job for a new client to see them listed here.'}</p>
             </div>
           ) : (
             <div className="customer-grid">
                {filteredCustomers.map((customer) => (
                   <div key={customer.id} className="customer-card glass-card">
                       <div className="card-top">
                          <div className="main-info">
                             <h3 title={customer.companyName || customer.company_name}>{customer.companyName || customer.company_name}</h3>
                             {isAdmin && customer.lpoName && (
                               <div className="sub-info lpo-tag">
                                  <Building2 size={12} />
                                  <span>Parent: {customer.lpoName}</span>
                               </div>
                             )}
                             {customer.franchiseeText && (
                               <div className="sub-info franchisee-tag">
                                  <Users size={12} />
                                  <span>Franchisee: {customer.franchiseeText}</span>
                               </div>
                             )}
                             <div className={`status-badge-premium ${customer.status === 'Active' ? 'active' : customer.status === 'cancelled' ? 'cancelled' : 'awaiting'}`} style={{ width: 'fit-content', marginTop: '6px' }}>
                               {customer.status === 'Active' ? 'ACTIVE' : customer.status === 'cancelled' ? 'CANCELLED' : 'AWAITING T&C'}
                             </div>
                          </div>
                       </div>

                       {userData?.role === 'customer' ? (
                          (() => {
                             const activeTab = activeTabs[customer.id] || 'contact';
                             return (
                                <>
                                   <div className="card-tabs-header">
                                      <button 
                                        type="button"
                                        className={`tab-btn ${activeTab === 'contact' ? 'active' : ''}`}
                                        onClick={() => setActiveTabs(prev => ({ ...prev, [customer.id]: 'contact' }))}
                                      >
                                         Contact
                                      </button>
                                      <button 
                                        type="button"
                                        className={`tab-btn ${activeTab === 'addresses' ? 'active' : ''}`}
                                        onClick={() => setActiveTabs(prev => ({ ...prev, [customer.id]: 'addresses' }))}
                                      >
                                         Addresses
                                      </button>
                                   </div>

                                   {activeTab === 'contact' ? (
                                      <div className="card-body">
                                         <div className="contact-item">
                                            <User size={14} />
                                            <span>{customer.firstName || customer.first_name ? `${customer.firstName || customer.first_name} ${customer.lastName || customer.last_name || ''}` : customer.contact || 'No contact name'}</span>
                                         </div>
                                         <div className="contact-item">
                                            <Mail size={14} />
                                            <span>{customer.customerEmail || customer.email || 'No email'}</span>
                                         </div>
                                         <div className="contact-item">
                                            <Phone size={14} />
                                            <span>{customer.customerPhone || customer.phone || 'No phone'}</span>
                                         </div>
                                      </div>
                                   ) : (
                                      <div className="card-body">
                                         <div className="setup-header" style={{ marginBottom: '6px' }}>
                                            <MapPin size={12} />
                                            <span>SITE ADDRESS</span>
                                         </div>
                                         <div className="contact-item" style={{ marginBottom: '14px' }}>
                                            <MapPin size={14} />
                                            <span>
                                               {([
                                                 customer.address1,
                                                 customer.street || customer.address?.street,
                                                 customer.city || customer.address?.suburb,
                                                 customer.state || customer.address?.state
                                               ].filter(p => p && String(p).trim()).join(', ') || 'No address')}
                                            </span>
                                         </div>

                                         {Array.isArray(customer.billingAddresses) && customer.billingAddresses.length > 0 && (
                                            <div className="billing-addresses-section" style={{ padding: 0, margin: 0 }}>
                                               <div className="setup-header" style={{ marginBottom: '6px' }}>
                                                  <MapPin size={12} />
                                                  <span>BILLING ADDRESSES</span>
                                               </div>
                                               <div className="billing-addresses-list">
                                                  {customer.billingAddresses.map((addr: any, idx: number) => {
                                                     const street = addr.address1 || addr.street || '';
                                                     const city = addr.city || '';
                                                     const state = addr.state || '';
                                                     const zip = addr.zip || '';
                                                     const addrStr = [street, city, state, zip].filter(p => p && String(p).trim()).join(', ');
                                                     return (
                                                        <div key={idx} className="billing-address-badge" title={addrStr}>
                                                           {addrStr || 'No Address Details'}
                                                        </div>
                                                     );
                                                  })}
                                               </div>
                                            </div>
                                         )}
                                      </div>
                                   )}
                                </>
                             );
                          })()
                       ) : (
                          (() => {
                             const activeTab = activeTabs[customer.id] || 'services';
                             return (
                                <>
                                   <div className="card-tabs-header">
                                      <button 
                                        type="button"
                                        className={`tab-btn ${activeTab === 'contact' ? 'active' : ''}`}
                                        onClick={() => setActiveTabs(prev => ({ ...prev, [customer.id]: 'contact' }))}
                                      >
                                         Contact
                                      </button>
                                      <button 
                                        type="button"
                                        className={`tab-btn ${activeTab === 'addresses' ? 'active' : ''}`}
                                        onClick={() => setActiveTabs(prev => ({ ...prev, [customer.id]: 'addresses' }))}
                                      >
                                         Addresses
                                      </button>
                                      <button 
                                        type="button"
                                        className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`}
                                        onClick={() => setActiveTabs(prev => ({ ...prev, [customer.id]: 'services' }))}
                                      >
                                         Services
                                      </button>
                                   </div>

                                   {activeTab === 'contact' ? (
                                      <div className="card-body">
                                         <div className="contact-item">
                                            <User size={14} />
                                            <span>{customer.firstName || customer.first_name ? `${customer.firstName || customer.first_name} ${customer.lastName || customer.last_name || ''}` : customer.contact || 'No contact name'}</span>
                                         </div>
                                         <div className="contact-item">
                                            <Mail size={14} />
                                            <span>{customer.customerEmail || customer.email || 'No email'}</span>
                                         </div>
                                         <div className="contact-item">
                                            <Phone size={14} />
                                            <span>{customer.customerPhone || customer.phone || 'No phone'}</span>
                                         </div>
                                      </div>
                                   ) : activeTab === 'addresses' ? (
                                      <div className="card-body">
                                         <div className="setup-header" style={{ marginBottom: '6px' }}>
                                            <MapPin size={12} />
                                            <span>SITE ADDRESS</span>
                                         </div>
                                         <div className="contact-item" style={{ marginBottom: '14px' }}>
                                            <MapPin size={14} />
                                            <span>
                                               {([
                                                 customer.address1,
                                                 customer.street || customer.address?.street,
                                                 customer.city || customer.address?.suburb,
                                                 customer.state || customer.address?.state
                                               ].filter(p => p && String(p).trim()).join(', ') || 'No address')}
                                            </span>
                                         </div>

                                         {Array.isArray(customer.billingAddresses) && customer.billingAddresses.length > 0 && (
                                            <div className="billing-addresses-section" style={{ padding: 0, margin: 0 }}>
                                               <div className="setup-header" style={{ marginBottom: '6px' }}>
                                                  <MapPin size={12} />
                                                  <span>BILLING ADDRESSES</span>
                                               </div>
                                               <div className="billing-addresses-list">
                                                  {customer.billingAddresses.map((addr: any, idx: number) => {
                                                     const street = addr.address1 || addr.street || '';
                                                     const city = addr.city || '';
                                                     const state = addr.state || '';
                                                     const zip = addr.zip || '';
                                                     const addrStr = [street, city, state, zip].filter(p => p && String(p).trim()).join(', ');
                                                     return (
                                                        <div key={idx} className="billing-address-badge" title={addrStr}>
                                                           {addrStr || 'No Address Details'}
                                                        </div>
                                                     );
                                                  })}
                                               </div>
                                            </div>
                                         )}
                                      </div>
                                   ) : (
                                      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                         <div className="services-setup-premium" style={{ padding: 0 }}>
                                            <div className="setup-header">
                                               <Rocket size={12} />
                                               <span>SERVICES SETUP</span>
                                            </div>
                                            <div className="setup-tags">
                                               {userData?.role === 'parent' ? (
                                                 (() => {
                                                   const serviceList = (customer.serviceList || customer.services || [])
                                                     .filter((s: any) => s && s.name !== 'PMPO');
                                                   return Array.isArray(serviceList) && serviceList.length > 0 ? (
                                                     serviceList.map((s: any, idx: number) => {
                                                       let displayName = s.name || '';
                                                       if (s.name === 'H2H') displayName = "Hand to Hand Deliveries";
                                                       else if (s.name === 'H2H 2') displayName = "Hand to Hand Deliveries 2";
                                                       else if (s.name === 'AMPO') displayName = "Pick up and Delivery from PO";
                                                       else if (s.name === 'PMPO') displayName = "Outgoing Mail Lodgement";
                                                       return (
                                                         <span key={idx} className="service-tag-pill enabled">
                                                           {displayName}
                                                         </span>
                                                       );
                                                     })
                                                   ) : (
                                                     <span className="service-tag-pill disabled">No Services</span>
                                                   );
                                                 })()
                                               ) : (
                                                 <>
                                                   <span className={`service-tag-pill ${customer.lpoServiceAMPOInternalID && customer.lpoServiceAMPOInternalID !== 'null' ? 'enabled' : 'disabled'}`}>
                                                     LPO ➔ Site
                                                   </span>
                                                   <span className={`service-tag-pill ${customer.lpoServicePMPOInternalID && customer.lpoServicePMPOInternalID !== 'null' ? 'enabled' : 'disabled'}`}>
                                                     Site ➔ LPO
                                                   </span>
                                                   <span className={`service-tag-pill ${customer.lpoServiceAMPOPMPOInternalID && customer.lpoServiceAMPOPMPOInternalID !== 'null' ? 'enabled' : 'disabled'}`}>
                                                     Round Trip
                                                   </span>
                                                 </>
                                               )}
                                            </div>
                                         </div>

                                         <div className="service-details-premium" style={{ padding: 0, display: 'flex', gap: '12px' }}>
                                            <div className="detail-tag">
                                               <CreditCard size={12} />
                                               <span>Billing: <strong style={{ textTransform: 'uppercase' }}>{customer.billing || 'N/A'}</strong></span>
                                            </div>
                                            <div className="detail-tag">
                                               <Rocket size={12} />
                                               <span>Job Type: <strong style={{ textTransform: 'capitalize' }}>{customer.jobtype || customer.jobType || 'N/A'}</strong></span>
                                            </div>
                                         </div>
                                      </div>
                                   )}
                                </>
                             );
                          })()
                       )}

                      <div className="card-footer">
                         <div className="stats">
                            <div className="stat-item">
                             <label>Total Jobs</label>
                             <span>{customer.totalJobs || 0}</span>
                          </div>
                          <div className="stat-item">
                             <label>Last Service</label>
                             <span>{customer.lastJobDate ? (customer.lastJobDate.includes('-') ? customer.lastJobDate.split('-').reverse().join('/') : new Date(customer.lastJobDate).toLocaleDateString()) : 'N/A'}</span>
                            </div>
                         </div>
                         <div className="footer-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                             <button 
                               type="button"
                               className="edit-customer-btn" 
                               onClick={() => {
                                 setEditingCustomer(customer);
                                 setIsEditModalOpen(true);
                               }}
                               title="Edit Contact Details"
                               style={{ width: '36px', height: '36px', borderRadius: '12px' }}
                             >
                                <Edit2 size={14} />
                             </button>
                             {customer.status !== 'cancelled' && (
                               <button 
                                 type="button"
                                 className="edit-customer-btn cancel-btn" 
                                 onClick={() => {
                                   setCancellingCustomer(customer);
                                   setIsCancelModalOpen(true);
                                 }}
                                 title="Cancel Customer"
                                 style={{ width: '36px', height: '36px', borderRadius: '12px' }}
                               >
                                  <UserMinus size={14} />
                               </button>
                             )}
                             <button className="view-details" onClick={() => handleBookJob(`/new-job?rebook=true&customerId=${customer.id}`)} title="Book New Job">
                                <Plus size={18} />
                             </button>
                          </div>
                      </div>
                   </div>
                ))}
             </div>
           )}
        </div>
      </div>

      <EditCustomerModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        customer={editingCustomer}
        onUpdate={(updatedCust) => {
          setCustomers(prev => prev.map(c => c.id === updatedCust.id ? updatedCust : c));
        }}
      />

      <CancelCustomerModal 
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        customer={cancellingCustomer}
        onUpdate={(updatedCust) => {
          if (updatedCust.id === 'deleted') {
            setCustomers(prev => prev.filter(c => c.id !== cancellingCustomer.id));
          } else {
            setCustomers(prev => prev.map(c => c.id === updatedCust.id ? updatedCust : c));
          }
        }}
      />

      <style>{`
         .card-tabs-header {
           display: flex;
           border-bottom: 1px solid var(--cream-warm);
           margin: 0 0 16px;
           padding: 0;
           gap: 16px;
         }
         .tab-btn {
           background: none;
           border: none;
           padding: 8px 4px;
           font-size: 0.8rem;
           font-weight: 700;
           color: var(--ink-soft);
           cursor: pointer;
           position: relative;
           transition: color 0.2s;
         }
         .tab-btn:hover {
           color: var(--ink);
         }
         .tab-btn.active {
           color: var(--ink);
         }
         .tab-btn.active::after {
           content: '';
           position: absolute;
           bottom: -1px;
           left: 0;
           right: 0;
           height: 2px;
           background: var(--ink);
           border-radius: 2px;
         }
         .billing-addresses-section {
           margin-top: 12px;
         }
         .billing-addresses-list {
           display: flex;
           flex-direction: column;
           gap: 6px;
           max-height: 100px;
           overflow-y: auto;
           margin-top: 6px;
           padding-right: 4px;
         }
         .billing-address-badge {
           font-size: 0.75rem;
           background: rgba(26, 61, 51, 0.03);
           padding: 6px 10px;
           border-radius: 8px;
           color: var(--ink-soft);
           border: 1px solid rgba(26, 61, 51, 0.05);
           white-space: nowrap;
           overflow: hidden;
           text-overflow: ellipsis;
         }
         .customer-hub-premium { min-height: 100vh; background: var(--offwhite); padding: 40px 24px 100px; position: relative; overflow-x: hidden; }
        .mesh-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; filter: blur(100px); opacity: 0.5; }
        .blob { position: absolute; border-radius: 50%; width: 600px; height: 600px; background: var(--cream-warm); }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -100px; left: -100px; background: var(--cream-warm); }

        .lpo-select-custom {
          margin-right: 16px;
          min-width: 200px;
        }

        .lpo-tag { color: var(--gold); background: rgba(234, 240, 68, 0.1); padding: 2px 8px; border-radius: 6px; width: fit-content; margin-bottom: 4px; }

        .content-container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; }

        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .title-area { display: flex; gap: 20px; align-items: center; }
        .header-icon { width: 44px; height: 44px; color: var(--ink); }
        .page-header h1 { font-family: var(--font-headings); font-size: 2.2rem; font-weight: 400; color: var(--ink); margin: 0; letter-spacing: -0.025em; display: flex; align-items: center; gap: 12px; }
        .title-count { font-family: var(--font-ui); font-size: 1rem; background: var(--cream-warm); color: var(--ink); padding: 4px 12px; border-radius: 12px; font-weight: 700; opacity: 0.8; }
        .page-header p { margin: 4px 0; color: var(--ink-soft); font-size: 1rem; font-weight: 400; }

        .btn-premium-action {
          background: var(--ink); color: white; border: none; padding: 14px 28px; border-radius: 18px;
          font-weight: 800; display: flex; align-items: center; gap: 12px; cursor: pointer;
          box-shadow: 0 10px 25px rgba(26, 61, 51, 0.2); transition: all 0.3s;
        }

        .hub-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; gap: 20px; }
        .search-bar-glass {
           flex: 1; display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.7);
           backdrop-filter: blur(10px); padding: 0 24px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.4);
           max-width: 600px;
        }
        .search-bar-glass input { border: none; background: transparent; padding: 18px 0; width: 100%; font-weight: 600; font-size: 1rem; color: var(--ink); }
        .search-bar-glass input:focus { outline: none; }
        .search-bar-glass svg { color: var(--ink-soft); }

        .filter-group-glass { display: flex; gap: 12px; align-items: center; }
        .filter-item {
           display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.7);
           backdrop-filter: blur(10px); padding: 8px 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.4);
           transition: all 0.2s;
        }
        .filter-item:focus-within { border-color: var(--ink); background: white; }
        .filter-item select {
           border: none; background: transparent; font-weight: 700; color: var(--ink-soft); font-size: 0.85rem; cursor: pointer;
           outline: none; padding: 4px 0; min-width: 120px;
        }
        .filter-item svg { color: var(--ink-soft); opacity: 0.7; }

        .customers-view { margin-top: 20px; }
        .glass-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 32px; padding: 24px; }
        
        .customer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
        .customer-card {
           display: flex;
           flex-direction: column;
           height: 100%;
           transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .customer-card:hover { transform: translateY(-8px); background: var(--paper); box-shadow: 0 20px 40px rgba(26, 61, 51, 0.08); }

        .card-top { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; position: relative; }
        .avatar { width: 44px; height: 44px; background: var(--cream-warm); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 400; color: var(--ink); font-size: 1.2rem; font-family: var(--font-headings); flex-shrink: 0; }
        .main-info { flex: 1; min-width: 0; }
        .main-info h3 {
           margin: 0;
           font-size: 1.1rem;
           font-weight: 400;
           color: var(--ink);
           letter-spacing: -0.015em;
           font-family: var(--font-headings);
           word-break: break-word;
           white-space: normal;
        }
        .sub-info { display: flex; align-items: center; gap: 6px; color: var(--ink-soft); font-size: 0.75rem; font-weight: 400; margin-top: 2px; }
        .franchisee-tag { color: var(--ink); background: rgba(26, 61, 51, 0.05); padding: 2px 8px; border-radius: 6px; width: fit-content; }
        .status-badge-premium { font-family: var(--font-ui); padding: 4px 10px; border-radius: 8px; font-size: 0.55rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; }
        .status-badge-premium.active { background: var(--cream-warm); color: var(--ink); }
        .status-badge-premium.awaiting { background: var(--cream-warm); color: var(--gold); }
        .status-badge-premium.cancelled { background: #fee2e2; color: #dc2626; }

        .card-actions { display: flex; align-items: center; gap: 8px; }
        .edit-customer-btn {
          width: 30px; height: 30px; border-radius: 8px; background: rgba(0,0,0,0.05);
          border: none; color: var(--ink-soft); cursor: pointer; display: flex;
          align-items: center; justify-content: center; transition: all 0.2s;
        }
        .edit-customer-btn:hover { background: var(--ink); color: white; }
        .edit-customer-btn.cancel-btn:hover { background: #dc2626; color: white; }

        .card-body {
           border-bottom: 1px solid var(--cream-warm);
           padding: 16px 0;
           margin-bottom: 16px;
           display: flex;
           flex-direction: column;
           gap: 10px;
           flex-grow: 1;
           min-height: 180px;
           max-height: 250px;
           overflow-y: auto;
        }
        .contact-item { display: flex; align-items: center; gap: 10px; color: var(--ink-soft); font-size: 0.85rem; font-weight: 600; }
        .contact-item svg { color: var(--ink-soft); opacity: 0.6; }

        .service-details-premium { padding: 0 24px 16px; display: flex; gap: 12px; }
        .detail-tag { display: flex; align-items: center; gap: 6px; background: var(--paper); padding: 6px 12px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; color: var(--ink-soft); }
        .detail-tag svg { color: var(--gold); }
        .detail-tag strong { color: var(--ink); }
 
        .services-setup-premium { padding: 0 24px 16px; }
        .setup-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .setup-header span { font-family: var(--font-ui); font-size: 0.55rem; font-weight: 500; color: var(--ink-soft); opacity: 0.6; letter-spacing: 0.16em; text-transform: uppercase; }
        .setup-header svg { color: var(--gold); opacity: 0.6; }
        .setup-tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .service-tag-pill { font-family: var(--font-ui); padding: 4px 10px; border-radius: 20px; font-size: 0.55rem; font-weight: 500; border: 1px solid transparent; text-transform: uppercase; letter-spacing: 0.05em; }
        .service-tag-pill.enabled { background: var(--cream-warm); color: var(--ink); border-color: rgba(26, 61, 51, 0.1); }
        .service-tag-pill.disabled { background: var(--offwhite); color: var(--ink-soft); border-color: var(--cream-warm); text-decoration: line-through; opacity: 0.6; }

        .card-footer { display: flex; justify-content: space-between; align-items: flex-end; }
        .stats { display: flex; gap: 20px; }
        .stat-item { display: flex; flex-direction: column; }
        .stat-item label { font-family: var(--font-ui); font-size: 0.55rem; font-weight: 500; color: var(--ink-soft); opacity: 0.6; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.16em; }
        .stat-item span { font-family: var(--font-ui); font-size: 0.75rem; font-weight: 500; color: var(--ink); }

        .view-details { width: 40px; height: 40px; border-radius: 12px; background: var(--cream-warm); border: none; color: var(--ink); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .view-details:hover { background: var(--ink); color: white; }

        .empty-hub { text-align: center; padding: 80px; color: var(--ink-soft); }
        .empty-icon { opacity: 0.2; margin-bottom: 24px; }
        .empty-hub h3 { color: var(--ink); margin-bottom: 8px; }

        @media (max-width: 768px) {
           .customer-hub-premium { padding: 16px 12px 100px; }
           .page-header { flex-direction: column; gap: 16px; margin-bottom: 24px; }
           .page-header h1 { font-size: 1.5rem; }
           .page-header p { font-size: 0.85rem; }
           .header-icon { width: 32px; height: 32px; }
           .header-right { width: 100%; }
           .btn-premium-action { width: 100%; justify-content: center; padding: 12px 20px; font-size: 0.85rem; }
           
           .hub-controls { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 24px; }
           .search-bar-glass { max-width: none; padding: 0 12px; }
           .search-bar-glass input { padding: 14px 0; font-size: 0.9rem; }
           .filter-group-glass { flex-direction: column; gap: 8px; }
           .filter-item { width: 100%; justify-content: flex-start; padding: 12px; }
           .filter-item select { flex: 1; font-size: 0.8rem; }

           .customer-grid { gap: 16px; }
           .customer-card { padding: 14px; border-radius: 20px; }
           .card-top { margin-bottom: 12px; }
           .avatar { width: 36px; height: 36px; font-size: 1rem; border-radius: 10px; }
           .main-info h3 { font-size: 1rem; }
           .status-badge-premium { font-size: 0.5rem; padding: 3px 8px; }

           .card-body { padding: 12px 0; margin-bottom: 12px; gap: 8px; }
           .contact-item { font-size: 0.75rem; }
           
           .service-details-premium, .services-setup-premium { padding: 0 0 12px; }
           .detail-tag { padding: 4px 8px; font-size: 0.7rem; }
           .service-tag-pill { padding: 3px 8px; font-size: 0.5rem; }
           
           .card-footer { padding-top: 12px; border-top: 1px solid var(--cream-warm); }
           .stat-item label { font-size: 0.5rem; }
           .stat-item span { font-size: 0.7rem; }
           .view-details { width: 32px; height: 32px; border-radius: 10px; }
        }
      `}</style>
    </div>
  );
};

export default CustomerHub;
