import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useLpo } from '../../context/LpoContext';
import { db } from '../../firebase/config';
import { Search, FileText, ChevronDown, MapPin } from 'lucide-react';
import CustomSelect from '../../components/CustomSelect';

interface LineItem {
  itemId: string;
  description: string;
  rate: number;
  quantity: number;
  amount: number;
}

interface Invoice {
  id: string;
  customerId?: string;
  customerName: string;
  invoiceNum: string;
  date: string;
  billingMonth: string;
  totalAmount: number;
  status?: string;
  billingMethod?: string;
  line_items: LineItem[];
  parentName?: string;
}

export default function Invoices() {
  const { userData, isAdmin, selectedParentId, setSelectedParentId, allParents, companyName, parent } = useLpo();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const trailingMonths = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    async function fetchInvoices() {
      setLoading(true);
      
      const parentsToFetch = isAdmin && selectedParentId === 'all' 
        ? allParents 
        : allParents.filter(p => p.id === (isAdmin ? selectedParentId : (userData?.parent_id || userData?.customer_id)));

      let targets = [...parentsToFetch];
      if (targets.length === 0) {
        const singleId = userData?.parent_id || userData?.customer_id;
        if (singleId) {
          targets.push({ id: singleId, name: companyName || 'My Company' } as any);
        } else if (parent) {
          targets.push(parent);
        }
      }

      if (targets.length === 0) {
        setInvoices([]);
        setLoading(false);
        return;
      }

      const allResolvedInvoices: Invoice[] = [];
      
      try {
        await Promise.all(targets.map(async (targetParent) => {
          const invoicesRef = collection(db, `companies/${targetParent.id}/invoices`);
          const q = query(invoicesRef, where('billingMonth', '==', selectedMonth));
          
          const querySnapshot = await getDocs(q);
          const invoicePromises = querySnapshot.docs.map(async (docSnapshot) => {
            const data = docSnapshot.data();
            const line_items = Array.isArray(data.line_items) ? data.line_items : [];
            
            let billingMethod = '';
            const customerId = data.customerId;
            if (customerId) {
              try {
                const custDocRef = doc(db, `companies/${targetParent.id}/customers/${customerId}`);
                const custDocSnap = await getDoc(custDocRef);
                if (custDocSnap.exists()) {
                  billingMethod = custDocSnap.data().billing || '';
                }
              } catch (err) {
                console.error("Failed to fetch customer billing", err);
              }
            }
            
            return {
              id: docSnapshot.id,
              customerId: customerId || '',
              customerName: data.customerName || '',
              invoiceNum: data.invoiceNum || '',
              date: data.date || '',
              billingMonth: data.billingMonth || '',
              totalAmount: data.totalAmount || 0,
              status: data.status || '',
              billingMethod,
              line_items,
              parentName: targetParent.name
            };
          });
          
          const resolved = await Promise.all(invoicePromises);
          allResolvedInvoices.push(...resolved);
        }));

        let filtered = allResolvedInvoices;
        if (userData?.role === 'customer' && userData?.customer_id) {
          filtered = filtered.filter(inv => inv.customerId === userData.customer_id);
        }

        filtered.sort((a, b) => a.customerName.localeCompare(b.customerName));
        setInvoices(filtered);
      } catch (error) {
        console.error("Failed to fetch invoices:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchInvoices();
  }, [isAdmin, selectedParentId, allParents, userData, parent, companyName, selectedMonth]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.customerName.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (inv.parentName && inv.parentName.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  const totalFilteredSum = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const groupedInvoices = filteredInvoices.reduce((acc, inv) => {
    const key = inv.customerName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(inv);
    return acc;
  }, {} as Record<string, Invoice[]>);

  const colSpanCount = isAdmin && selectedParentId === 'all' ? 7 : 6;

  return (
    <div className="invoices-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="content-container">
        <header className="page-header">
           <div className="header-left">
             <div className="title-area">
               <FileText className="header-icon" />
               <div>
                 <h1>Invoices <span className="title-count">{filteredInvoices.length}</span></h1>
                 <p>View and manage company invoices.</p>
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
           </div>
        </header>

        <div className="hub-controls">
           <div className="search-bar-glass">
              <Search size={20} />
              <input 
                type="text" 
                placeholder="Filter by Customer Name..." 
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
              />
           </div>
           
           <div className="filter-group-glass">
              <div className="hub-filter-custom">
                <div className="select-trigger">
                  <select 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(e.target.value)}
                  >
                    {trailingMonths.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="dropdown-icon" />
                </div>
              </div>
           </div>
        </div>

        {loading ? (
          <div className="loading-container glass-card">
            <div className="spinner"></div>
            <p>Loading invoices...</p>
          </div>
        ) : (
          <>
            <div className="total-card glass-card">
              <div>
                <h2 className="text-lg font-medium opacity-80 tracking-wide uppercase text-sm">Total Filtered Amount</h2>
                <p className="text-sm opacity-60 mt-1">Across all filtered active rows</p>
              </div>
              <span className="amount">
                ${totalFilteredSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="table-card glass-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left table-styled">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      {isAdmin && selectedParentId === 'all' && <th>Parent LPO</th>}
                      <th>Invoice Number</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className="amount-col">Total Amount (Inc. GST)</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedInvoices).map(([customerName, custInvoices]) => (
                      <React.Fragment key={customerName}>
                        {custInvoices.map((invoice, idx) => {
                          const isExpanded = expandedRows.has(invoice.id);
                          return (
                            <React.Fragment key={invoice.id}>
                              <tr 
                                onClick={() => toggleRow(invoice.id)}
                                className="cursor-pointer group"
                              >
                                <td className="customer-name align-top">
                                  {idx === 0 ? customerName : ''}
                                </td>
                                {isAdmin && selectedParentId === 'all' && (
                                  <td className="parent-lpo align-top">
                                    {invoice.parentName || '-'}
                                  </td>
                                )}
                                <td>
                                  <span className="font-medium text-ink">
                                    {invoice.invoiceNum}
                                  </span>
                                </td>
                                <td>{invoice.date}</td>
                                <td>
                                  {invoice.status ? (
                                    <span className={`status-badge-premium ${invoice.status.toLowerCase() === 'paid' || invoice.status.toLowerCase() === 'paid in full' ? 'paid' : 'default'}`}>
                                      {invoice.status}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="amount-col">
                                  ${invoice.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="w-12 text-center">
                                  <ChevronDown size={18} className={`inline-block transition-transform duration-300 ${isExpanded ? 'rotate-180 text-ink opacity-100' : 'text-ink-soft opacity-40'} group-hover:opacity-100`} strokeWidth={2} />
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="expanded-row">
                                  <td colSpan={colSpanCount} className="p-0 border-0">
                                    <div className="line-items-container animate-fade-in-down">
                                      <h3 className="line-items-header">Line Items</h3>
                                      <table className="line-items-table">
                                        <thead>
                                          <tr>
                                            <th>Service Item</th>
                                            <th>Description</th>
                                            <th className="right">Rate</th>
                                            <th className="right">Qty</th>
                                            <th className="right">Amount (Ex. GST)</th>
                                            <th className="right">Amount (Inc. GST)</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {invoice.line_items?.map((item, i) => (
                                            <tr key={i}>
                                              <td>{item.itemId}</td>
                                              <td>{item.description}</td>
                                              <td className="right">
                                                ${item.rate?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </td>
                                              <td className="right">{item.quantity}</td>
                                              <td className="right">
                                                ${item.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </td>
                                              <td className="right total">
                                                ${(item.amount * 1.1)?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </td>
                                            </tr>
                                          ))}
                                          {(!invoice.line_items || invoice.line_items.length === 0) && (
                                            <tr>
                                              <td colSpan={6} className="p-4 text-center italic" style={{ color: 'var(--ink-soft)' }}>
                                                No line items found.
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    
                    {filteredInvoices.length === 0 && (
                      <tr>
                        <td colSpan={colSpanCount} className="p-0 border-0">
                          <div className="empty-state">
                            <p>No invoices found</p>
                            <span>Try adjusting your filters or selecting a different month.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      
      <style>{`
        .invoices-premium {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          background: var(--offwhite);
          padding: 40px 24px 100px;
        }

        .mesh-bg {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 0; filter: blur(100px); opacity: 0.6;
        }
        .blob {
          position: absolute; width: 600px; height: 600px; border-radius: 50%;
          background: var(--cream-warm); animation: blobPulse 20s infinite alternate;
        }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -150px; left: -100px; background: var(--cream-warm); }
        .blob-3 { top: 30%; left: 30%; width: 300px; height: 300px; background: var(--gold); opacity: 0.2; }

        @keyframes blobPulse {
          0%, 100% { border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%; }
          50% { border-radius: 40% 60% 54% 46% / 49% 60% 40% 51%; }
        }

        .content-container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; }

        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .header-left { display: flex; flex-direction: column; }
        .header-right { display: flex; align-items: center; }
        .title-area { display: flex; gap: 20px; align-items: center; }
        .header-icon { width: 44px; height: 44px; color: var(--ink); }
        .page-header h1 { font-family: var(--font-headings); font-size: 2.2rem; font-weight: 400; color: var(--ink); margin: 0; letter-spacing: -0.025em; display: flex; align-items: center; gap: 12px; }
        .title-count { font-family: var(--font-ui); font-size: 1rem; background: var(--cream-warm); color: var(--ink); padding: 4px 12px; border-radius: 12px; font-weight: 700; opacity: 0.8; }
        .page-header p { margin: 4px 0; color: var(--ink-soft); font-size: 1rem; font-weight: 400; }

        .hub-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; gap: 20px; }
        .search-bar-glass {
           flex: 1; display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.7);
           backdrop-filter: blur(10px); padding: 0 24px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.4);
           max-width: 600px;
        }
        .search-bar-glass input { border: none; background: transparent; padding: 18px 0; width: 100%; font-weight: 600; font-size: 1rem; color: var(--ink); }
        .search-bar-glass input:focus { outline: none; }
        .search-bar-glass svg { color: var(--ink-soft); }

        .filter-group-glass { display: flex; gap: 8px; align-items: center; }
        .hub-filter-custom { min-width: 160px; }
        .hub-filter-custom .select-trigger {
          padding: 8px 14px;
          border-radius: 16px;
          font-size: 0.85rem;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          position: relative;
          display: flex;
          align-items: center;
        }
        .hub-filter-custom select {
          appearance: none;
          background: transparent;
          border: none;
          width: 100%;
          padding-right: 20px;
          font-weight: 600;
          color: var(--ink);
          font-family: inherit;
          cursor: pointer;
        }
        .hub-filter-custom select:focus { outline: none; }
        .dropdown-icon { position: absolute; right: 14px; color: var(--ink-soft); pointer-events: none; }

        .glass-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 32px; padding: 24px; box-shadow: 0 10px 30px rgba(26,61,51,0.05); margin-bottom: 32px; }
        
        .total-card { display: flex; justify-content: space-between; align-items: center; background: var(--ink); color: white; border-color: rgba(0,0,0,0.1); padding: 32px 40px; }
        .total-card h2 { font-family: var(--font-ui); font-weight: 500; font-size: 0.75rem; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin: 0; }
        .total-card p { font-size: 0.85rem; color: rgba(255,255,255,0.5); margin-top: 4px; margin-bottom: 0; }
        .total-card .amount { font-family: var(--font-headings); font-size: 2.8rem; font-weight: 400; color: white; letter-spacing: -0.02em; }

        .table-card { padding: 0; overflow: hidden; }
        
        .table-styled { width: 100%; text-align: left; border-collapse: collapse; }
        .table-styled th { padding: 20px 24px; font-family: var(--font-ui); font-size: 0.65rem; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid rgba(26,61,51,0.05); background: rgba(255,255,255,0.5); }
        .table-styled td { padding: 20px 24px; border-bottom: 1px solid rgba(26,61,51,0.05); color: var(--ink); font-weight: 500; }
        .table-styled tr:not(.expanded-row):hover td { background: rgba(255,255,255,0.5); }
        
        .table-styled .customer-name { font-weight: 700; color: var(--ink); }
        .table-styled .parent-lpo { font-weight: 600; color: var(--ink-soft); }
        .table-styled .amount-col { text-align: right; font-weight: 700; }
        .table-styled th.amount-col { text-align: right; }

        .status-badge-premium { font-family: var(--font-ui); padding: 6px 12px; border-radius: 10px; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; display: inline-block; }
        .status-badge-premium.paid { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .status-badge-premium.default { background: var(--cream-warm); color: var(--ink-soft); border: 1px solid rgba(26,61,51,0.1); }

        .expanded-row td { background: rgba(255,255,255,0.3) !important; padding: 0; border-bottom: 1px solid rgba(26,61,51,0.05); }

        .line-items-container { padding: 16px; background: rgba(255,255,255,0.8); border-left: 4px solid var(--ink); margin: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(26,61,51,0.03); }
        .line-items-header { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0; margin-bottom: 8px; }
        .line-items-table { width: 100%; background: white; border-radius: 8px; overflow: hidden; border: 1px solid rgba(26,61,51,0.05); border-collapse: collapse; }
        .line-items-table th { padding: 8px 12px; font-family: var(--font-ui); font-size: 0.6rem; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; border-bottom: 1px solid rgba(26,61,51,0.05); background: rgba(26,61,51,0.02); }
        .line-items-table td { padding: 8px 12px; font-size: 0.8rem; border-bottom: 1px solid rgba(26,61,51,0.05); font-weight: 500; }
        .line-items-table tr:last-child td { border-bottom: none; }
        .line-items-table th.right, .line-items-table td.right { text-align: right; }
        .line-items-table td.total { font-weight: 700; color: var(--ink); }
        
        .empty-state { padding: 60px 24px; text-align: center; }
        .empty-state p { color: var(--ink); font-weight: 700; font-size: 1.1rem; margin: 0; }
        .empty-state span { color: var(--ink-soft); font-size: 0.9rem; margin-top: 8px; display: block; }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 24px;
          text-align: center;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(26, 61, 51, 0.1);
          border-left-color: var(--ink);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
