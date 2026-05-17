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
  Map,
  MapPin
} from 'lucide-react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import CustomSelect from '../../components/CustomSelect';

const Reports: React.FC = () => {
  const { parent, isAdmin, selectedParentId, setSelectedParentId, allParents } = useLpo();
  const [loading, setLoading] = useState(true);
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
    serviceSplit: {
      'lpo-to-site': 0,
      'site-to-lpo': 0,
      'round-trip': 0
    }
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        let jobsBaseQ = collection(db, 'jobs');
        let jobsConstraints: any[] = [];

        if (selectedParentId !== 'all') {
          jobsConstraints.push(where('parent_id', '==', selectedParentId));
        }

        const jobsQ = query(jobsBaseQ, ...jobsConstraints);
        const snapshot = await getDocs(jobsQ);
        
        let completed = 0;
        let revenue = 0;
        let forecast = 0;
        const statusCount = { scheduled: 0, completed: 0, cancelled: 0 };
        const customerRevenue: Record<string, number> = {};
        const suburbs: Record<string, number> = {};
        const split = { 'lpo-to-site': 0, 'site-to-lpo': 0, 'round-trip': 0 };
        
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        snapshot.docs.forEach(doc => {
          const data = doc.data();
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
          const type = data.service as keyof typeof split;
          if (split[type] !== undefined) split[type]++;
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
        const parentsToQuery = selectedParentId === 'all' ? allParents : allParents.filter(l => l.id === selectedParentId);
        
        // Ensure we have at least the current LPO if nothing else is selected/available
        if (parentsToQuery.length === 0 && parent) {
          parentsToQuery.push(parent);
        }

        if (parentsToQuery.length > 0) {
          const counts = await Promise.all(parentsToQuery.map(async (targetParent) => {
            const custQ = query(
              collection(db, `lpo/${targetParent.id}/customers`),
              where('status', '==', 'Active')
            );
            const snap = await getDocs(custQ);
            return snap.size;
          }));
          totalCustomers = counts.reduce((acc, curr) => acc + curr, 0);
        }

        setStats({
          totalJobs: snapshot.size,
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

    if (parent || isAdmin) {
      fetchStats();
    }
  }, [parent, isAdmin, selectedParentId, allParents]);

  const serviceLabels: Record<string, string> = {
    'lpo-to-site': 'Parent ➔ Site',
    'site-to-lpo': 'Site ➔ Parent',
    'round-trip': 'Round Trip'
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
            <div className="stats-grid">
              <div className="stat-card glass-card">
                <div className="stat-icon-wrapper green">
                  <DollarSign size={24} />
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
                  <TrendingUp size={24} />
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
                  <Users size={24} />
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
                  <Award size={24} />
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
                  <Activity size={24} />
                </div>
                <div className="stat-content">
                  <label>Completion Rate</label>
                  <div className="stat-value-row">
                    <h3>{stats.totalJobs > 0 ? Math.round((stats.completedJobs / stats.totalJobs) * 100) : 0}%</h3>
                  </div>
                </div>
              </div>
            </div>

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
                  <Map size={20} />
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
                        strokeDasharray={`${(stats.serviceSplit['lpo-to-site'] / (stats.totalJobs || 1)) * 251} 251`}
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
                        <span className="label">{serviceLabels[key]}</span>
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

        .content-container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; }

        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .title-area { display: flex; gap: 20px; align-items: center; }
        .header-icon { width: 44px; height: 44px; color: var(--ink); }
        .page-header h1 { font-family: var(--font-headings); font-size: 2.2rem; font-weight: 400; color: var(--ink); margin: 0; letter-spacing: -0.025em; }
        .page-header p { margin: 4px 0 0; color: var(--ink-soft); font-size: 1rem; font-weight: 400; }

        .date-range-glass {
          display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.7);
          backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.4); color: var(--ink);
          font-weight: 700; font-size: 0.9rem; cursor: pointer;
        }

        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 32px; }
        .glass-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 24px; padding: 24px; }
        
        .stat-card { display: flex; align-items: center; gap: 20px; transition: transform 0.3s; }
        .stat-card:hover { transform: translateY(-5px); }
        
        .stat-icon-wrapper { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
        .stat-icon-wrapper.blue { background: #e3f2fd; color: #1e88e5; }
        .stat-icon-wrapper.green { background: #e8f5e9; color: #43a047; }
        .stat-icon-wrapper.purple { background: #f3e5f5; color: #8e24aa; }
        .stat-icon-wrapper.orange { background: #fff3e0; color: #fb8c00; }

        .stat-content label { display: block; font-family: var(--font-ui); font-size: 0.65rem; font-weight: 500; color: var(--ink-soft); text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.16em; }
        .stat-value-row { display: flex; align-items: baseline; gap: 8px; }
        .stat-value-row h3 { margin: 0; font-family: var(--font-ui); font-size: 1.5rem; font-weight: 500; color: var(--ink); }
        .trend { font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 6px; }
        .trend.up { background: #e2f9ec; color: #27ae60; }
        .trend.down { background: #fff1f1; color: #ff4757; }

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
        
        .chart-legend { display: flex; gap: 16px; font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); }
        .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .dot.jobs { background: var(--ink); }
        
        .viz-placeholder { height: 240px; position: relative; }
        .trend-viz { width: 100%; height: 180px; }
        .x-axis { display: flex; justify-content: space-between; padding-top: 12px; color: var(--ink-soft); font-family: var(--font-ui); font-size: 0.55rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; }

        .viz-placeholder.pie { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
        .pie-wrapper { position: relative; width: 150px; height: 150px; margin-bottom: 24px; }
        .pie-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
        
        .pie-legend { width: 100%; display: flex; flex-direction: column; gap: 8px; }
        .legend-item { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; font-weight: 600; color: var(--ink-soft); }
        .legend-item .label { flex: 1; }
        .legend-item .value { font-weight: 800; color: var(--ink); }
        
        .dot.lpo-to-site { background: var(--ink); }
        .dot.site-to-lpo { background: var(--gold); }
        .dot.round-trip { background: var(--ink-soft); }

        .loading-state { padding: 100px; text-align: center; color: var(--ink-soft); font-weight: 800; font-size: 1.2rem; }

        @media (max-width: 1024px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .insights-row { grid-template-columns: 1fr; }
          .charts-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default Reports;
