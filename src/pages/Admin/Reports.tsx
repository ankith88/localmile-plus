import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  Filter,
  PieChart,
  Activity,
  Award,
  Map as MapIcon,
  MapPin,
  FileText,
  X,
  Search,
  Building2,
  Layers
} from 'lucide-react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import CustomSelect from '../../components/CustomSelect';
import { getDisplayServiceName } from '../../utils/serviceHelpers';

const Reports: React.FC = () => {
  const { parent, isAdmin, selectedParentId, setSelectedParentId, allParents, userData } = useLpo();
  const [loading, setLoading] = useState(true);

  // Role Segmentation & Filtering State for Admins
  const [adminRoleView, setAdminRoleView] = useState<string | string[]>('all');
  const [selectedCustomerCompanyId, setSelectedCustomerCompanyId] = useState<string | string[]>('all');
  const [userRoleMap, setUserRoleMap] = useState<Map<string, string>>(() => new Map<string, string>());
  const [customerCompanies, setCustomerCompanies] = useState<{ id: string, name: string }[]>([]);
  const [rawJobs, setRawJobs] = useState<any[]>([]);
  const [rawRequests, setRawRequests] = useState<any[]>([]);

  // Admin Operational Analytics & Drilldown State
  const [adminMetrics, setAdminMetrics] = useState({
    acceptedRequests: [] as any[],
    declinedRequests: [] as any[],
    pendingRequests: [] as any[],
    unperformedJobs: [] as any[],
    inProgressJobs: [] as any[],
    completedJobs: [] as any[]
  });
  const [activeDrilldown, setActiveDrilldown] = useState<{ title: string; items: any[] } | null>(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');

  const [stats, setStats] = useState({
    totalJobs: 0,
    completedJobs: 0,
    activeCustomers: 0,
    estimatedRevenue: 0,
    revenueForecast: 0,
    averageJobValue: 0,
    statusBreakdown: {
      scheduled: 0,
      completed: 0,
      cancelled: 0
    },
    topCustomers: [] as { name: string, revenue: number }[],
    geographicData: [] as { suburb: string, count: number }[],
    serviceSplit: {} as Record<string, number>
  });

  // Fetch Admin reference mapping: user roles & customer companies
  useEffect(() => {
    const fetchUsersAndCompanies = async () => {
      if (!isAdmin) return;
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const rMap = new Map<string, string>();
        usersSnap.docs.forEach(d => {
          const data = d.data();
          if (data.role) rMap.set(d.id, data.role);
        });
        setUserRoleMap(rMap);

        const compSnap = await getDocs(collection(db, 'companies'));
        const compList: { id: string, name: string }[] = [];
        const seenNames = new Set<string>();
        compSnap.docs.forEach(d => {
          const data = d.data();
          const name = data.name || data.companyName;
          if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            compList.push({ id: d.id, name });
          }
        });

        try {
          const custSnap = await getDocs(collection(db, 'customers'));
          custSnap.docs.forEach(d => {
            const data = d.data();
            const name = data.name || data.companyName;
            if (name && !seenNames.has(name.toLowerCase())) {
              seenNames.add(name.toLowerCase());
              compList.push({ id: d.id, name });
            }
          });
        } catch (e) {
          // ignore if customers collection is unavailable
        }

        setCustomerCompanies(compList);
      } catch (err) {
        console.error("Error fetching users & companies for admin in Reports:", err);
      }
    };
    fetchUsersAndCompanies();
  }, [isAdmin]);

  const allCustomerCompanyOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    customerCompanies.forEach(c => map.set(c.id, c.name));
    [...rawJobs, ...rawRequests].forEach(item => {
      if (item.customer?.company) {
        const cid = item.customer_id || item.customer.company;
        if (!map.has(cid)) {
          map.set(cid, item.customer.company);
        }
      }
    });
    return Array.from(map.entries()).map((entry: [string, string]) => ({ id: entry[0], name: entry[1] }));
  }, [customerCompanies, rawJobs, rawRequests]);

  const getItemUserRole = (item: any): 'customer' | 'parent' => {
    if (item.userRole) {
      if (item.userRole === 'customer') return 'customer';
      if (item.userRole === 'parent' || item.userRole === 'lpoadmin' || item.userRole === 'operator') return 'parent';
    }
    if (item.uid && userRoleMap.has(item.uid)) {
      const uRole = userRoleMap.get(item.uid);
      if (uRole === 'customer') return 'customer';
      if (uRole === 'parent' || uRole === 'lpoadmin' || uRole === 'operator') return 'parent';
    }
    if (item.customer_id && (!item.parent_id || item.customer_id !== item.parent_id)) {
      return 'customer';
    }
    if (item.parent_id && !item.customer_id) {
      return 'parent';
    }
    return 'customer';
  };

  const applyAdminFilters = (item: any) => {
    if (!isAdmin) return true;
    const itemRole = getItemUserRole(item);
    if (adminRoleView !== 'all' && !(Array.isArray(adminRoleView) && (adminRoleView.length === 0 || adminRoleView.includes('all')))) {
      const roleList = Array.isArray(adminRoleView) ? adminRoleView : [adminRoleView];
      if (!roleList.includes(itemRole)) {
        return false;
      }
    }
    if (selectedCustomerCompanyId !== 'all' && !(Array.isArray(selectedCustomerCompanyId) && (selectedCustomerCompanyId.length === 0 || selectedCustomerCompanyId.includes('all')))) {
      const companyList = Array.isArray(selectedCustomerCompanyId) ? selectedCustomerCompanyId : [selectedCustomerCompanyId];
      const match = companyList.some(cid => {
        const matchId = item.customer_id === cid || item.customer?.id === cid;
        const compName = allCustomerCompanyOptions.find((c: any) => c.id === cid)?.name;
        const matchName = compName && (item.customer?.company || '').toLowerCase() === compName.toLowerCase();
        return matchId || matchName;
      });
      if (!match) return false;
    }
    if (selectedParentId !== 'all' && !(Array.isArray(selectedParentId) && (selectedParentId.length === 0 || selectedParentId.includes('all')))) {
      const parentList = Array.isArray(selectedParentId) ? selectedParentId : [selectedParentId];
      if (!item.parent_id || !parentList.includes(item.parent_id)) {
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        let jobsBaseQ = collection(db, 'jobs');
        let reqBaseQ = collection(db, 'requests');
        let jobsConstraints: any[] = [];
        let reqConstraints: any[] = [];

        if (!isAdmin && selectedParentId !== 'all') {
          jobsConstraints.push(where('parent_id', '==', selectedParentId));
          reqConstraints.push(where('parent_id', '==', selectedParentId));
        }

        const jobsQ = query(jobsBaseQ, ...jobsConstraints);
        const snapshot = await getDocs(jobsQ);
        const jobsList = snapshot.docs.map(doc => ({ ...(doc.data() as any), id: doc.id }));
        setRawJobs(jobsList);

        const reqQ = query(reqBaseQ, ...reqConstraints);
        const reqSnapshot = await getDocs(reqQ);
        const requestsList = reqSnapshot.docs.map(doc => ({ ...(doc.data() as any), id: doc.id }));
        setRawRequests(requestsList);

        // Apply admin role & company filters
        const filteredJobs = jobsList.filter(applyAdminFilters);
        const filteredRequests = requestsList.filter(applyAdminFilters);
        
        let completed = 0;
        let revenue = 0;
        let forecast = 0;
        const statusCount = { scheduled: 0, completed: 0, cancelled: 0 };
        const customerRevenue: Record<string, number> = {};
        const suburbs: Record<string, number> = {};
        const isParentView = userData?.role === 'parent' || (isAdmin && adminRoleView === 'parent');
        const split: Record<string, number> = isParentView
          ? { 'Post Office-to-IM': 0, 'IM-to-Site': 0, 'Site-to-IM': 0 }
          : { 'lpo-to-site': 0, 'site-to-lpo': 0, 'round-trip': 0, 'site-to-australia post': 0, 'australia post-to-site': 0 };
        
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        filteredJobs.forEach(data => {
          const rate = parseFloat(data.serviceRate || '0');
          const status = data.status as keyof typeof statusCount;
          const customerName = data.customer?.company || 'Unknown';
          const suburb = data.customer?.suburb || 'N/A';
          
          // Status counts
          if (statusCount[status] !== undefined) statusCount[status]++;
          if (status === 'completed') {
            completed++;
            revenue += rate;
            
            // Top customers revenue
            customerRevenue[customerName] = (customerRevenue[customerName] || 0) + rate;
          }
          
          // Forecast logic (scheduled jobs in the next 7 days)
          if (status === 'scheduled' && data.date) {
            const jobDate = new Date(data.date);
            if (jobDate >= today && jobDate <= nextWeek) {
              forecast += rate;
            }
          }

          // Geographic data
          suburbs[suburb] = (suburbs[suburb] || 0) + 1;
          
          // Service split
          const sDisplay = getDisplayServiceName(data.service, isParentView);
          if (split[sDisplay] !== undefined) {
            split[sDisplay]++;
          } else if (sDisplay) {
            split[sDisplay] = (split[sDisplay] || 0) + 1;
          }
        });

        // Process top customers
        const topCustomers = Object.entries(customerRevenue)
          .map(([name, rev]) => ({ name, revenue: rev }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        // Process geographic data
        const geographicData = Object.entries(suburbs)
          .map(([suburb, count]) => ({ suburb, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Fetch customers count
        let totalCustomers = 0;
        const parentsToQuery = (selectedParentId === 'all' || (Array.isArray(selectedParentId) && selectedParentId.includes('all')))
          ? allParents
          : allParents.filter(l => Array.isArray(selectedParentId) ? selectedParentId.includes(l.id) : l.id === selectedParentId);
        
        if (parentsToQuery.length === 0 && parent) {
          parentsToQuery.push(parent);
        }

        if (parentsToQuery.length > 0) {
          const counts = await Promise.all(parentsToQuery.map(async (targetParent) => {
            const custQ = query(
              collection(db, `companies/${targetParent.id}/customers`),
              where('status', '==', 'Active')
            );
            const snap = await getDocs(custQ);
            return snap.size;
          }));
          totalCustomers = counts.reduce((acc, curr) => acc + curr, 0);
        }

        // Categorize requests & jobs for drilldowns
        const acceptedReqs: any[] = [];
        const declinedReqs: any[] = [];
        const pendingReqs: any[] = [];

        filteredRequests.forEach(item => {
          if (item.status === 'accepted') {
            acceptedReqs.push(item);
          } else if (item.status === 'rejected' || item.status === 'cancelled') {
            declinedReqs.push(item);
          } else if (item.status === 'pending') {
            pendingReqs.push(item);
          }
        });

        const unperformed: any[] = [];
        const inProg: any[] = [];
        const completedList: any[] = [];

        filteredJobs.forEach(item => {
          if (item.status === 'scheduled' || item.status === 'pending') {
            unperformed.push(item);
          } else if (item.status === 'in-progress') {
            inProg.push(item);
          } else if (item.status === 'completed') {
            completedList.push(item);
          }
        });

        setAdminMetrics({
          acceptedRequests: acceptedReqs,
          declinedRequests: declinedReqs,
          pendingRequests: pendingReqs,
          unperformedJobs: unperformed,
          inProgressJobs: inProg,
          completedJobs: completedList
        });

        setStats({
          totalJobs: filteredJobs.length,
          completedJobs: completed,
          activeCustomers: totalCustomers,
          estimatedRevenue: revenue,
          revenueForecast: forecast,
          averageJobValue: completed > 0 ? revenue / completed : 0,
          statusBreakdown: statusCount,
          topCustomers,
          geographicData,
          serviceSplit: split
        });
      } catch (err) {
        console.error("Error fetching report stats:", err);
      } finally {
        setLoading(false);
      }
    };

    if (parent || isAdmin || userData?.role === 'parent') {
      fetchStats();
    }
  }, [parent, isAdmin, selectedParentId, adminRoleView, selectedCustomerCompanyId, allParents, userData, userRoleMap]);

  const serviceLabels: Record<string, string> = {
    'lpo-to-site': 'Parent ➔ Site',
    'site-to-lpo': 'Site ➔ Parent',
    'round-trip': 'Round Trip',
    'site-to-australia post': 'Site ➔ Australia Post',
    'australia post-to-site': 'Australia Post ➔ Site',
    'Post Office-to-IM': 'Post Office-to-IM',
    'IM-to-Site': 'IM-to-Site',
    'Site-to-IM': 'Site-to-IM'
  };

  return (
    <div className="reports-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <div className="content-container">
        <header className="page-header">
          <div className="header-left">
            <div className="title-area">
              <BarChart3 className="header-icon" />
              <div>
                <h1>Operational Insights</h1>
                <p>Advanced metrics and logistics performance for {parent?.name || 'your Parent Account'}.</p>
              </div>
            </div>
          </div>
          <div className="header-right">
            {isAdmin && (
              <>
                <CustomSelect 
                  value={adminRoleView}
                  onChange={(val) => setAdminRoleView(val as any)}
                  options={[
                    { value: 'all', label: 'All Roles', icon: <Layers size={14} /> },
                    { value: 'customer', label: 'Role: Customer', icon: <Users size={14} /> },
                    { value: 'parent', label: 'Role: Parent', icon: <Building2 size={14} /> }
                  ]}
                  isMulti={true}
                  placeholder="Filter Roles"
                  className="lpo-select-custom"
                />
                <CustomSelect 
                  value={selectedCustomerCompanyId}
                  onChange={(val) => setSelectedCustomerCompanyId(val)}
                  options={[
                    { value: 'all', label: 'All Customer Companies', icon: <Building2 size={14} /> },
                    ...allCustomerCompanyOptions.map(c => ({ value: c.id, label: c.name, icon: <Building2 size={14} /> }))
                  ]}
                  isMulti={true}
                  searchable={true}
                  placeholder="All Customer Companies"
                  className="lpo-select-custom"
                />
                <CustomSelect 
                  value={selectedParentId}
                  onChange={(val) => setSelectedParentId(val)}
                  options={[
                    { value: 'all', label: 'All Regions / Parents', icon: <MapPin size={14} /> },
                    ...allParents.map(l => ({ value: l.id, label: l.name, icon: <MapPin size={14} /> }))
                  ]}
                  isMulti={true}
                  searchable={true}
                  placeholder="All Regions / Parents"
                  className="lpo-select-custom"
                />
              </>
            )}
            <div className="date-range-glass">
              <Calendar size={16} />
              <span>Last 30 Days</span>
              <Filter size={14} />
            </div>
          </div>
        </header>

        {loading ? (
          <div className="loading-state">Generating Insights...</div>
        ) : (
          <>
            {/* Top Financial & KPI Grid (5 Cards) */}
            <div className="kpi-grid">
              <div className="stat-card glass-card">
                <div className="stat-icon-wrapper green">
                  <DollarSign size={22} />
                </div>
                <div className="stat-content">
                  <label>Revenue (Completed)</label>
                  <div className="stat-value-row">
                    <h3>${stats.estimatedRevenue.toFixed(2)}</h3>
                  </div>
                </div>
              </div>

              <div className="stat-card glass-card">
                <div className="stat-icon-wrapper blue">
                  <TrendingUp size={22} />
                </div>
                <div className="stat-content">
                  <label>Revenue Forecast (7d)</label>
                  <div className="stat-value-row">
                    <h3>${stats.revenueForecast.toFixed(2)}</h3>
                  </div>
                </div>
              </div>

              <div className="stat-card glass-card">
                <div className="stat-icon-wrapper purple">
                  <Users size={22} />
                </div>
                <div className="stat-content">
                  <label>Active Clients</label>
                  <div className="stat-value-row">
                    <h3>{stats.activeCustomers}</h3>
                  </div>
                </div>
              </div>

              <div className="stat-card glass-card">
                <div className="stat-icon-wrapper orange">
                  <Award size={22} />
                </div>
                <div className="stat-content">
                  <label>Avg. Job Value</label>
                  <div className="stat-value-row">
                    <h3>${stats.averageJobValue.toFixed(2)}</h3>
                  </div>
                </div>
              </div>

              <div className="stat-card glass-card">
                <div className="stat-icon-wrapper blue">
                  <Activity size={22} />
                </div>
                <div className="stat-content">
                  <label>Completion Rate</label>
                  <div className="stat-value-row">
                    <h3>{stats.totalJobs > 0 ? Math.round((stats.completedJobs / stats.totalJobs) * 100) : 0}%</h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Exclusive Operational Analytics */}
            {isAdmin && (
              <div className="admin-analytics-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <BarChart3 size={20} color="var(--ink)" />
                  <h3 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 600, color: 'var(--ink)' }}>
                    Admin Operational Performance (Click any metric to view jobs/requests & companies)
                  </h3>
                </div>

                <div className="admin-grid">
                  {/* Job Requests Breakdown Card */}
                  <div className="glass-card insight-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div className="insight-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileText size={22} color="var(--gold)" />
                        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Job Requests Breakdown</h3>
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}>
                        Total: {adminMetrics.acceptedRequests.length + adminMetrics.declinedRequests.length + adminMetrics.pendingRequests.length}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div 
                        onClick={() => setActiveDrilldown({ title: 'Accepted Job Requests', items: adminMetrics.acceptedRequests })}
                        style={{
                          background: 'rgba(39, 174, 96, 0.1)',
                          border: '1px solid rgba(39, 174, 96, 0.3)',
                          borderRadius: '16px',
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                        className="clickable-metric-pill"
                        title="Click to view accepted requests"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#27ae60', textTransform: 'uppercase', marginBottom: '4px' }}>Accepted</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#27ae60' }}>{adminMetrics.acceptedRequests.length}</div>
                        <div style={{ fontSize: '0.68rem', color: '#27ae60', opacity: 0.85, marginTop: '4px' }}>View List ➔</div>
                      </div>

                      <div 
                        onClick={() => setActiveDrilldown({ title: 'Declined Job Requests', items: adminMetrics.declinedRequests })}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '16px',
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                        className="clickable-metric-pill"
                        title="Click to view declined requests"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: '4px' }}>Declined</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#ef4444' }}>{adminMetrics.declinedRequests.length}</div>
                        <div style={{ fontSize: '0.68rem', color: '#ef4444', opacity: 0.85, marginTop: '4px' }}>View List ➔</div>
                      </div>

                      <div 
                        onClick={() => setActiveDrilldown({ title: 'Pending Job Requests', items: adminMetrics.pendingRequests })}
                        style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: '16px',
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                        className="clickable-metric-pill"
                        title="Click to view pending requests"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '4px' }}>Pending</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f59e0b' }}>{adminMetrics.pendingRequests.length}</div>
                        <div style={{ fontSize: '0.68rem', color: '#f59e0b', opacity: 0.85, marginTop: '4px' }}>View List ➔</div>
                      </div>
                    </div>
                  </div>

                  {/* Jobs Execution Breakdown Card */}
                  <div className="glass-card insight-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div className="insight-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity size={22} color="var(--ink)" />
                        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Jobs Execution Breakdown</h3>
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}>
                        Total: {adminMetrics.unperformedJobs.length + adminMetrics.inProgressJobs.length + adminMetrics.completedJobs.length}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div 
                        onClick={() => setActiveDrilldown({ title: 'Unperformed Jobs (Scheduled / Pending)', items: adminMetrics.unperformedJobs })}
                        style={{
                          background: 'rgba(107, 114, 128, 0.1)',
                          border: '1px solid rgba(107, 114, 128, 0.3)',
                          borderRadius: '16px',
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                        className="clickable-metric-pill"
                        title="Click to view unperformed jobs"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '4px' }}>Unperformed</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#374151' }}>{adminMetrics.unperformedJobs.length}</div>
                        <div style={{ fontSize: '0.68rem', color: '#4b5563', opacity: 0.85, marginTop: '4px' }}>View List ➔</div>
                      </div>

                      <div 
                        onClick={() => setActiveDrilldown({ title: 'In-Progress Jobs', items: adminMetrics.inProgressJobs })}
                        style={{
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          borderRadius: '16px',
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                        className="clickable-metric-pill"
                        title="Click to view in-progress jobs"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginBottom: '4px' }}>In Progress</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#1d4ed8' }}>{adminMetrics.inProgressJobs.length}</div>
                        <div style={{ fontSize: '0.68rem', color: '#2563eb', opacity: 0.85, marginTop: '4px' }}>View List ➔</div>
                      </div>

                      <div 
                        onClick={() => setActiveDrilldown({ title: 'Completed Jobs', items: adminMetrics.completedJobs })}
                        style={{
                          background: 'rgba(39, 174, 96, 0.1)',
                          border: '1px solid rgba(39, 174, 96, 0.3)',
                          borderRadius: '16px',
                          padding: '14px',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                        className="clickable-metric-pill"
                        title="Click to view completed jobs"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#27ae60', textTransform: 'uppercase', marginBottom: '4px' }}>Completed</div>
                        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#27ae60' }}>{adminMetrics.completedJobs.length}</div>
                        <div style={{ fontSize: '0.68rem', color: '#27ae60', opacity: 0.85, marginTop: '4px' }}>View List ➔</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Insights Row (Top Customers & Geographic Volume) */}
            <div className="insights-row">
              <div className="insight-card glass-card">
                <div className="insight-header">
                  <Award size={20} />
                  <h3>Top Customers (by Revenue)</h3>
                </div>
                <div className="insight-list">
                  {stats.topCustomers.map((cust, i) => (
                    <div key={i} className="insight-item">
                      <div className="item-rank">{i + 1}</div>
                      <div className="item-info">
                        <span className="item-name">{cust.name}</span>
                        <span className="item-sub">Completed Jobs</span>
                      </div>
                      <div className="item-value">${cust.revenue.toFixed(2)}</div>
                    </div>
                  ))}
                  {stats.topCustomers.length === 0 && <p className="empty-msg">No completed jobs yet.</p>}
                </div>
              </div>

              <div className="insight-card glass-card">
                <div className="insight-header">
                  <MapIcon size={20} />
                  <h3>Geographic Insights (by Volume)</h3>
                </div>
                <div className="insight-list">
                  {stats.geographicData.map((geo, i) => (
                    <div key={i} className="insight-item">
                      <div className="item-rank">{i + 1}</div>
                      <div className="item-info">
                        <span className="item-name">{geo.suburb}</span>
                        <span className="item-sub">Suburb Territory</span>
                      </div>
                      <div className="item-value">{geo.count} Jobs</div>
                    </div>
                  ))}
                  {stats.geographicData.length === 0 && <p className="empty-msg">No location data available.</p>}
                </div>
              </div>
            </div>

            {/* Charts Row (Service Mix & Status Distribution) */}
            <div className="charts-row">
              <div className="chart-container glass-card">
                <div className="chart-header">
                  <h3>Service Mix</h3>
                </div>
                <div className="viz-placeholder pie">
                  <div className="pie-wrapper">
                    <svg viewBox="0 0 100 100" className="pie-chart-viz">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f0f0f0" strokeWidth="20" />
                      <circle 
                        cx="50" cy="50" r="40" 
                        fill="transparent" 
                        stroke="var(--ink)" 
                        strokeWidth="20" 
                        strokeDasharray={`${((stats.serviceSplit['lpo-to-site'] + stats.serviceSplit['australia post-to-site']) / (stats.totalJobs || 1)) * 251} 251`}
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="pie-center">
                      <PieChart size={20} color="var(--ink-soft)" />
                    </div>
                  </div>
                  <div className="pie-legend">
                    {Object.entries(stats.serviceSplit).map(([key, value]) => (
                      <div key={key} className="legend-item">
                        <span className={`dot ${key}`}></span>
                        <span className="label">{serviceLabels[key] || key}</span>
                        <span className="value">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="chart-container glass-card">
                <div className="chart-header">
                  <h3>Status Distribution</h3>
                </div>
                <div className="viz-placeholder pie">
                  <div className="pie-wrapper">
                    <svg viewBox="0 0 100 100" className="pie-chart-viz">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f0f0f0" strokeWidth="20" />
                      <circle 
                        cx="50" cy="50" r="40" 
                        fill="transparent" 
                        stroke="#27ae60" 
                        strokeWidth="20" 
                        strokeDasharray={`${(stats.completedJobs / (stats.totalJobs || 1)) * 251} 251`}
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="pie-center">
                      <Activity size={20} color="#27ae60" />
                    </div>
                  </div>
                  <div className="pie-legend">
                    <div className="legend-item">
                      <span className="dot" style={{ background: '#27ae60' }}></span>
                      <span className="label">Completed</span>
                      <span className="value">{stats.completedJobs}</span>
                    </div>
                    <div className="legend-item">
                      <span className="dot" style={{ background: 'var(--gold)' }}></span>
                      <span className="label">Scheduled</span>
                      <span className="value">{stats.statusBreakdown.scheduled}</span>
                    </div>
                    <div className="legend-item">
                      <span className="dot" style={{ background: '#ff4757' }}></span>
                      <span className="label">Cancelled</span>
                      <span className="value">{stats.statusBreakdown.cancelled}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Admin Drilldown Modal */}
      {activeDrilldown && (
        <div className="modal-overlay active" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            maxWidth: '850px',
            width: '100%',
            maxHeight: '85vh',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="var(--ink)" />
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' }}>
                  {activeDrilldown.title} ({activeDrilldown.items.length})
                </h2>
              </div>
              <button 
                onClick={() => { setActiveDrilldown(null); setDrilldownSearch(''); }}
                style={{ background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 0 12px 0' }}>
              <div className="search-pill" style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', padding: '8px 16px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={16} color="var(--ink-soft)" />
                <input 
                  type="text" 
                  placeholder="Filter by company name, address or ref ID..."
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '14px' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {activeDrilldown.items.filter(item => {
                const company = (item.customer?.company || '').toLowerCase();
                const address = (item.customer?.address || '').toLowerCase();
                const id = (item.id || '').toLowerCase();
                const term = drilldownSearch.toLowerCase();
                return company.includes(term) || address.includes(term) || id.includes(term);
              }).length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  No matching records found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeDrilldown.items
                    .filter(item => {
                      const company = (item.customer?.company || '').toLowerCase();
                      const address = (item.customer?.address || '').toLowerCase();
                      const id = (item.id || '').toLowerCase();
                      const term = drilldownSearch.toLowerCase();
                      return company.includes(term) || address.includes(term) || id.includes(term);
                    })
                    .map((item) => (
                      <div key={item.id} style={{
                        background: 'white',
                        border: '1px solid rgba(0,0,0,0.08)',
                        borderRadius: '16px',
                        padding: '14px 18px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Building2 size={16} color="var(--gold)" />
                            <span>{item.customer?.company || 'Unknown Company'}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-soft)', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: '6px' }}>
                              #{item.id.substring(0, 8).toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '4px', display: 'flex', gap: '16px' }}>
                            <span>📍 {item.customer?.address || 'N/A'} {item.customer?.suburb || ''}</span>
                            <span>📅 {item.date || 'N/A'}</span>
                            <span>🚚 {getDisplayServiceName(item.service, userData?.role === 'parent' || (isAdmin && adminRoleView === 'parent')) || 'Standard'}</span>
                          </div>
                        </div>
                        <div>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: item.status === 'completed' || item.status === 'accepted' ? 'rgba(39, 174, 96, 0.15)' : (item.status === 'in-progress' ? 'rgba(59, 130, 246, 0.15)' : (item.status === 'rejected' || item.status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)')),
                            color: item.status === 'completed' || item.status === 'accepted' ? '#27ae60' : (item.status === 'in-progress' ? '#2563eb' : (item.status === 'rejected' || item.status === 'cancelled' ? '#ef4444' : '#f59e0b'))
                          }}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .reports-premium { min-height: 100vh; background: var(--offwhite); padding: 40px 24px 100px; position: relative; overflow-x: hidden; }
        .mesh-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; filter: blur(100px); opacity: 0.5; }
        .blob { position: absolute; border-radius: 50%; width: 600px; height: 600px; background: var(--cream-warm); }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -100px; left: -100px; background: var(--cream-warm); }

        .lpo-select-custom {
          margin-right: 12px;
          min-width: 200px;
        }

        .content-container { position: relative; z-index: 1; max-width: 1240px; margin: 0 auto; width: 100%; }

        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; gap: 20px; flex-wrap: wrap; }
        .header-left { display: flex; flex-direction: column; }
        .header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .title-area { display: flex; gap: 20px; align-items: center; }
        .header-icon { width: 44px; height: 44px; color: var(--ink); flex-shrink: 0; }
        .page-header h1 { font-family: var(--font-headings); font-size: 2.2rem; font-weight: 400; color: var(--ink); margin: 0; letter-spacing: -0.025em; }
        .page-header p { margin: 4px 0 0; color: var(--ink-soft); font-size: 1rem; font-weight: 400; }

        .date-range-glass {
          display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.7);
          backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.4); color: var(--ink);
          font-weight: 700; font-size: 0.9rem; cursor: pointer;
        }

        /* Top KPI Grid - 5 Cards auto-layout */
        .kpi-grid { 
          display: grid; 
          grid-template-columns: repeat(5, 1fr); 
          gap: 20px; 
          margin-bottom: 32px; 
        }

        .glass-card { background: rgba(255, 255, 255, 0.75); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 24px; padding: 24px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); }
        
        .stat-card { display: flex; align-items: center; gap: 16px; transition: transform 0.3s; }
        .stat-card:hover { transform: translateY(-4px); }
        
        .stat-icon-wrapper { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .stat-icon-wrapper.blue { background: #e3f2fd; color: #1e88e5; }
        .stat-icon-wrapper.green { background: #e8f5e9; color: #43a047; }
        .stat-icon-wrapper.purple { background: #f3e5f5; color: #8e24aa; }
        .stat-icon-wrapper.orange { background: #fff3e0; color: #fb8c00; }

        .stat-content label { display: block; font-family: var(--font-ui); font-size: 0.62rem; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.12em; }
        .stat-value-row { display: flex; align-items: baseline; gap: 8px; }
        .stat-value-row h3 { margin: 0; font-family: var(--font-ui); font-size: 1.35rem; font-weight: 700; color: var(--ink); }

        /* Admin Operational Performance Container */
        .admin-analytics-section { margin-bottom: 32px; width: 100%; }
        .admin-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }

        .clickable-metric-pill {
          transition: all 0.2s ease-in-out;
        }
        .clickable-metric-pill:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
        }

        .insights-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 32px; }
        .insight-card { padding: 24px; }
        .insight-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; color: var(--ink); }
        .insight-header h3 { margin: 0; font-family: var(--font-headings); font-size: 1.1rem; font-weight: 500; }
        .insight-list { display: flex; flex-direction: column; gap: 16px; }
        .insight-item { display: flex; align-items: center; gap: 16px; }
        .item-rank { width: 32px; height: 32px; background: var(--offwhite); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.8rem; color: var(--ink-soft); }
        .item-info { flex: 1; display: flex; flex-direction: column; }
        .item-name { font-weight: 700; color: var(--ink); font-size: 0.95rem; }
        .item-sub { font-size: 0.75rem; color: var(--ink-soft); }
        .item-value { font-weight: 800; color: var(--ink); font-size: 1rem; }
        .empty-msg { text-align: center; color: var(--ink-soft); font-style: italic; padding: 20px; }

        .charts-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 32px; }
        .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .chart-header h3 { margin: 0; font-family: var(--font-headings); font-size: 1.1rem; font-weight: 500; color: var(--ink); }

        .viz-placeholder { height: 240px; position: relative; }
        .viz-placeholder.pie { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
        .pie-wrapper { position: relative; width: 150px; height: 150px; margin-bottom: 24px; }
        .pie-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
        
        .pie-legend { width: 100%; display: flex; flex-direction: column; gap: 8px; }
        .legend-item { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); }
        .legend-item .label { flex: 1; }
        .legend-item .value { font-weight: 800; color: var(--ink); }

        .loading-state { padding: 100px; text-align: center; color: var(--ink-soft); font-weight: 800; font-size: 1.2rem; }

        @media (max-width: 1200px) {
          .kpi-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .admin-grid { grid-template-columns: 1fr; }
          .insights-row { grid-template-columns: 1fr; }
          .charts-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default Reports;
