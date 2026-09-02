import React, { useEffect, useState } from 'react';
import { 
  Search, 
  RotateCcw, 
  Trash2, 
  ArrowRightLeft,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Layers,
  Plus,
  RefreshCw,
  Clock,
  MapPin,
  MessageSquare,
  Download,
  X,
  XCircle,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  CheckCircle2,
  User,
  Mail,
  Phone,
  Repeat,
  Lock,
  Building2
} from 'lucide-react';
import LoadingScreen from '../../components/LoadingScreen';
import SupportEmailModal from '../../components/SupportEmailModal';
import CancelJobModal from '../../components/CancelJobModal';
import FranchiseeContactModal from '../../components/FranchiseeContactModal';
import BulkUpdateDateModal from '../../components/BulkUpdateDateModal';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, orderBy, arrayUnion } from 'firebase/firestore';
import { db, functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { useLpo } from '../../context/LpoContext';
import { formatDateForInput, parseLocalDate, isWithinWorkHours } from '../../utils/scheduling';
import { sortStops } from '../../utils/stops';
import CustomDatePicker from '../../components/CustomDatePicker';
import CustomSelect from '../../components/CustomSelect';
import { getDisplayServiceName } from '../../utils/serviceHelpers';
import { acceptJobRequest } from '../../utils/requestHelpers';


const Dashboard: React.FC = () => {
  const { parent, customer, isAdmin, selectedParentId, setSelectedParentId, allParents, userData, companyData } = useLpo();
  const [jobs, setJobs] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'upcoming' | 'in-progress' | 'history' | 'declined'>('in-progress');
  const [serviceFilter, setServiceFilter] = useState<string | string[]>('all');
  const [statusFilter, setStatusFilter] = useState<string | string[]>('all');
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());

  // Communication Modal State
  const [isCommModalOpen, setIsCommModalOpen] = useState(false);
  const [selectedJobForComm, setSelectedJobForComm] = useState<any>(null);
  const [commMessage, setCommMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Admin Role View & Linked Customer Company Filter
  const [adminRoleView, setAdminRoleView] = useState<string | string[]>('all');
  const [selectedCustomerCompanyId, setSelectedCustomerCompanyId] = useState<string | string[]>('all');
  const [userRoleMap, setUserRoleMap] = useState<Map<string, string>>(new Map());
  const [customerCompanies, setCustomerCompanies] = useState<{ id: string; name: string }[]>([]);

  // Franchisee Contact Modal State (Parent Role)
  const [isFranchiseeModalOpen, setIsFranchiseeModalOpen] = useState(false);
  const [selectedJobForFranchiseeModal, setSelectedJobForFranchiseeModal] = useState<any>(null);

  const handleFranchiseeContact = (job: any) => {
    setSelectedJobForFranchiseeModal(job);
    setIsFranchiseeModalOpen(true);
  };

  // Admin Multi-Select Bulk Action State
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkAccepting, setIsBulkAccepting] = useState(false);
  const [bulkAcceptProgress, setBulkAcceptProgress] = useState(0);
  const [bulkAcceptStatus, setBulkAcceptStatus] = useState('');
  const [isBulkUpdateDateModalOpen, setIsBulkUpdateDateModalOpen] = useState(false);
  const [isBulkUpdatingDate, setIsBulkUpdatingDate] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchUsersAndCompanies = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const roleMap = new Map<string, string>();
        usersSnap.docs.forEach(d => {
          const data = d.data();
          if (data.role) {
            roleMap.set(d.id, data.role);
          }
        });
        setUserRoleMap(roleMap);

        const compSnap = await getDocs(collection(db, 'companies'));
        const compList: { id: string; name: string }[] = [];
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
        console.error("Error fetching users & companies for admin:", err);
      }
    };
    fetchUsersAndCompanies();
  }, [isAdmin]);

  const getParentName = (id: string) => {
    return allParents.find(p => p.id === id)?.name || 'Independent';
  };
  
  // Support Email Modal State
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportJobId, setSupportJobId] = useState('');
  const [supportMetadata, setSupportMetadata] = useState<any>(null);

  // Cancellation Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedJobForCancel, setSelectedJobForCancel] = useState<any>(null);

  const isRestricted = userData?.role === 'customer' && (companyData?.franchisee === 435 || companyData?.franchisee === '435');

  const toggleExpand = (jobId: string) => {
    const newExpanded = new Set(expandedJobIds);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobIds(newExpanded);
  };

  const handleBookJob = (url = '/new-job') => {
    if (userData?.role === 'customer' && (companyData?.franchisee === 435 || companyData?.franchisee === '435')) {
       alert("The MailPlus team is working to get the account setup. You will be notified once done.");
       return;
    }
    window.location.href = url;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let jobsBaseQ = collection(db, 'jobs');
        let reqBaseQ = collection(db, 'requests');
        let schedBaseQ = collection(db, 'scheduled_jobs');

        let jobsConstraints: any[] = [orderBy('createdAt', 'desc')];
        let reqConstraints: any[] = [orderBy('createdAt', 'desc')];
        let schedConstraints: any[] = [orderBy('createdAt', 'desc')];

        const targetCustId = userData?.customer_id || customer?.id || companyData?.id;
        const targetParentId = userData?.parent_id || parent?.id || (selectedParentId !== 'all' && !(Array.isArray(selectedParentId) && selectedParentId.includes('all')) ? (Array.isArray(selectedParentId) ? selectedParentId[0] : selectedParentId) : null);

        if (!isAdmin) {
          if ((userData?.role === 'customer' || (!userData?.parent_id && targetCustId)) && targetCustId) {
            jobsConstraints.unshift(where('customer_id', '==', targetCustId));
            reqConstraints.unshift(where('customer_id', '==', targetCustId));
            schedConstraints.unshift(where('customer_id', '==', targetCustId));
          } else if (targetParentId) {
            jobsConstraints.unshift(where('parent_id', '==', targetParentId));
            reqConstraints.unshift(where('parent_id', '==', targetParentId));
            schedConstraints.unshift(where('parent_id', '==', targetParentId));
          }
        }

        // Fetch Jobs
        try {
          const jobsQ = query(jobsBaseQ, ...jobsConstraints);
          const jobsSnapshot = await getDocs(jobsQ);
          setJobs(jobsSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
        } catch (e) {
          const fbQ = !isAdmin && (userData?.role === 'customer' || (!userData?.parent_id && targetCustId)) && targetCustId
            ? query(jobsBaseQ, where('customer_id', '==', targetCustId))
            : (!isAdmin && targetParentId ? query(jobsBaseQ, where('parent_id', '==', targetParentId)) : jobsBaseQ);
          const jobsSnapshot = await getDocs(fbQ as any);
          setJobs(jobsSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
        }

        // Fetch Requests
        try {
          const reqQ = query(reqBaseQ, ...reqConstraints);
          const reqSnapshot = await getDocs(reqQ);
          setRequests(reqSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
        } catch (e) {
          const fbQ = !isAdmin && (userData?.role === 'customer' || (!userData?.parent_id && targetCustId)) && targetCustId
            ? query(reqBaseQ, where('customer_id', '==', targetCustId))
            : (!isAdmin && targetParentId ? query(reqBaseQ, where('parent_id', '==', targetParentId)) : reqBaseQ);
          const reqSnapshot = await getDocs(fbQ as any);
          setRequests(reqSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
        }

        // Fetch Schedules
        try {
          const schedQ = query(schedBaseQ, ...schedConstraints);
          const schedSnapshot = await getDocs(schedQ);
          setSchedules(schedSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
        } catch (e) {
          const fbQ = !isAdmin && (userData?.role === 'customer' || (!userData?.parent_id && targetCustId)) && targetCustId
            ? query(schedBaseQ, where('customer_id', '==', targetCustId))
            : (!isAdmin && targetParentId ? query(schedBaseQ, where('parent_id', '==', targetParentId)) : schedBaseQ);
          const schedSnapshot = await getDocs(fbQ as any);
          setSchedules(schedSnapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id })));
        }

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (parent || isAdmin || customer || userData?.role === 'customer' || userData?.role === 'parent') {
      fetchData();
    }
  }, [parent, customer, isAdmin, selectedParentId, userData, companyData]);

  const handleCommunication = (job: any) => {
    setSelectedJobForComm(job);
    setIsCommModalOpen(true);
    setCommMessage('');
  };

  const submitCommunication = async () => {
    if (!commMessage.trim()) {
      alert("Please enter a message.");
      return;
    }

    setIsSending(true);
    const job = selectedJobForComm;

    const isJobActiveToday = activeTab === 'in-progress';
    const contactEmail = (isJobActiveToday && job.operatorEmail ? job.operatorEmail : (companyData?.franchiseeEmail || '')).trim();
    const contactPhone = isWithinWorkHours() 
      ? (isJobActiveToday && job.operatorPhone ? job.operatorPhone : (companyData?.franchiseeMobile || '')).trim()
      : '';

    const userFullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || userData.email : 'Unknown User';
    const companyName = job.customer?.company || companyData?.companyName || 'Unknown Company';
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #095c7b;">Message from ${companyName}</h2>
        <p><strong>Sender:</strong> ${userFullName}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="background: #f9f9f9; border-left: 5px solid #095c7b; padding: 10px 15px; margin: 15px 0;">
          ${commMessage.trim().replace(/\n/g, '<br/>')}
        </blockquote>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
        <p style="font-size: 11px; color: #888;">This email was sent via LocalMile.Plus communication service.</p>
      </div>
    `;

    const formattedSms = `From LocalMile.Plus (${companyName}) - Sender: ${userFullName}:\n\n${commMessage.trim()}`;
    const leadId = job.customer_id || userData?.customer_id || job.netsuiteCustomerId || "";

    try {
      console.log(`Triggering ProspectPlus Communication for job ${job.id} to Email: ${contactEmail}, Phone: ${contactPhone}`);
      const sendMsgFn = httpsCallable(functions, 'sendProspectPlusMessage');
      await sendMsgFn({
        toEmail: contactEmail || undefined,
        toPhone: contactPhone || undefined,
        subject: `Message regarding Job Ref: #${job.id.substring(0, 8).toUpperCase()}`,
        html: emailHtml,
        smsMessage: formattedSms,
        leadId,
        author: userFullName,
        jobId: job.id
      });
      alert("Message sent to operator successfully via Email/SMS.");
      setIsCommModalOpen(false);
      setCommMessage('');
    } catch (err) {
      console.error("ProspectPlus Communication Error:", err);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const today = formatDateForInput(new Date());

  // Projections are now managed exclusively in the Schedules page calendar
  const projectedJobs: any[] = [];

  const allCustomerCompanyOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    customerCompanies.forEach(c => map.set(c.id, c.name));
    [...jobs, ...requests].forEach(item => {
      if (item.customer?.company) {
        const cid = item.customer_id || item.customer.company;
        if (!map.has(cid)) {
          map.set(cid, item.customer.company);
        }
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [customerCompanies, jobs, requests]);

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

  // Global Filter Function
  const applyGlobalFilters = (item: any) => {
    const matchesSearch = (item.customer?.company || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (item.customer?.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesService = (() => {
      if (!serviceFilter || serviceFilter === 'all' || (Array.isArray(serviceFilter) && (serviceFilter.length === 0 || serviceFilter.includes('all')))) return true;
      const isParentView = userData?.role === 'parent' || (isAdmin && (adminRoleView === 'parent' || (Array.isArray(adminRoleView) && adminRoleView.includes('parent'))));
      const itemDisplayService = getDisplayServiceName(item.service, isParentView);
      const filterList = Array.isArray(serviceFilter) ? serviceFilter : [serviceFilter];
      return filterList.some(f => f === item.service || f === itemDisplayService);
    })();

    const matchesDate = !dateFilter || item.date === dateFilter;

    const matchesStatus = (() => {
      if (!statusFilter || statusFilter === 'all' || (Array.isArray(statusFilter) && (statusFilter.length === 0 || statusFilter.includes('all')))) return true;
      const filterList = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
      return filterList.includes(item.status);
    })();

    let matchesAdminFilters = true;
    if (isAdmin) {
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
          const compName = allCustomerCompanyOptions.find(c => c.id === cid)?.name;
          const matchName = compName && (item.customer?.company || '').toLowerCase() === compName.toLowerCase();
          return matchId || matchName;
        });
        if (!match) matchesAdminFilters = false;
      }

      if (selectedParentId !== 'all' && !(Array.isArray(selectedParentId) && (selectedParentId.length === 0 || selectedParentId.includes('all')))) {
        const parentList = Array.isArray(selectedParentId) ? selectedParentId : [selectedParentId];
        if (!item.parent_id || !parentList.includes(item.parent_id)) {
          matchesAdminFilters = false;
        }
      }
    } else if (userData?.role === 'customer' || (!userData?.parent_id && (userData?.customer_id || customer?.id || companyData?.id))) {
      const targetCustId = userData?.customer_id || customer?.id || companyData?.id;
      if (targetCustId) {
        const matchId = item.customer_id === targetCustId || item.customer?.id === targetCustId;
        const matchName = companyData?.companyName && (item.customer?.company || '').toLowerCase() === companyData.companyName.toLowerCase();
        const matchUid = item.uid && item.uid === userData?.uid;
        if (!matchId && !matchName && !matchUid) {
          return false;
        }
      }
    } else if (userData?.role === 'parent' || userData?.parent_id || parent?.id) {
      const targetParentId = userData?.parent_id || parent?.id || (selectedParentId !== 'all' && !(Array.isArray(selectedParentId) && selectedParentId.includes('all')) ? (Array.isArray(selectedParentId) ? selectedParentId[0] : selectedParentId) : null);
      if (targetParentId) {
        if (item.parent_id && item.parent_id !== targetParentId) {
          return false;
        }
      }
    }

    return matchesSearch && matchesService && matchesDate && matchesStatus && matchesAdminFilters;
  };

  const globalFilteredJobs = jobs.filter(applyGlobalFilters);
  const globalFilteredRequests = requests.filter(applyGlobalFilters);

  // Define source based on tab
  const source = (activeTab === 'pending' || activeTab === 'declined') 
    ? globalFilteredRequests 
    : (activeTab === 'history' ? [...globalFilteredJobs, ...globalFilteredRequests] : (activeTab === 'upcoming' ? [...globalFilteredJobs, ...projectedJobs] : globalFilteredJobs));

  const filteredJobs = source.filter(j => {
    // Tab Filtering
    const checkTab = (tab: string) => {
      switch (tab) {
        case 'pending':
          return (j.status === 'pending' || j.status === 'new-time-proposed' || j.status === 'awaiting-activation'); 
        case 'in-progress':
          return j.date === today && j.status !== 'cancelled' && j.status !== 'rejected';
        case 'upcoming':
          return j.date > today && j.status !== 'cancelled' && j.status !== 'rejected';
        case 'history':
          return j.date < today;
        case 'declined':
          return j.status === 'rejected' || j.status === 'cancelled';
        default:
          return false;
      }
    };

    return checkTab(activeTab);
  });

  const groupedJobs = filteredJobs.reduce((acc: any[], job) => {
    const date = job.date;
    const existingGroup = acc.find(g => g.date === date);
    if (existingGroup) {
      existingGroup.jobs.push(job);
    } else {
      acc.push({ date, jobs: [job] });
    }
    return acc;
  }, []).sort((a, b) => {
    return activeTab === 'history' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });

  const exportJobsCSV = () => {
    const headers = ['Job ID', 'Customer', 'Address', 'Suburb', 'Service', 'Date', 'Preferred Time', 'Billing', 'Status'];
    const rows = filteredJobs.map(j => [
      `"${(j.id || '').toString().replace(/"/g, '""')}"`,
      `"${(j.customer?.company || '').toString().replace(/"/g, '""')}"`,
      `"${(j.customer?.address || '').toString().replace(/"/g, '""')}"`,
      `"${(j.customer?.suburb || '').toString().replace(/"/g, '""')}"`,
      `"${(j.service || '').toString().replace(/"/g, '""')}"`,
      `"${(j.date || '').toString().replace(/"/g, '""')}"`,
      `"${(j.preferredTime || j.preferred_time || '').toString().replace(/"/g, '""')}"`,
      `"${(j.billing || '').toString().replace(/"/g, '""')}"`,
      `"${(j.status || '').toString().replace(/"/g, '""')}"`
    ]);
    
    const csvContent = headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `jobs_export_${formatDateForInput(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRebook = (job: any) => {
    localStorage.setItem('rebook_draft', JSON.stringify(job));
    handleBookJob('/new-job?rebook=true');
  };

  const handleDelete = async (id: string) => {
    const job = jobs.find(j => j.id === id);
    
    // If job is scheduled, open the cancellation modal
    if (job && job.status === 'scheduled') {
      setSelectedJobForCancel(job);
      setIsCancelModalOpen(true);
      return;
    }

    if (job && (job.status === 'accepted' || job.status === 'in-progress' || job.status === 'completed')) {
      alert("This job has already been accepted and cannot be cancelled.");
      return;
    }

    if (window.confirm('Are you sure you want to cancel this job?')) {
      if (job) {
        const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2659&deploy=1&compid=1048144&ns-at=AAEJ7tMQotYIcRX7i2nlMeRMASDYV0VaDuDV06BPqb9AWt3leUU";
        
        let cancelCustomerId = job.netsuiteCustomerId || job.customer?.netsuiteId || "";
        const pId = job.parent_id || userData?.parent_id || "";
        if (userData?.role === 'parent' && pId && job.customer?.company) {
          try {
            const custQ = query(collection(db, `companies/${pId}/customers`), where('companyName', '==', job.customer.company));
            getDocs(custQ).then(custSnap => {
              if (!custSnap.empty) {
                const cData = custSnap.docs[0].data();
                if (cData.companyId || cData.customerInternalId) {
                  cancelCustomerId = cData.companyId || cData.customerInternalId;
                }
              }
              const params = new URLSearchParams({
                job_id: id,
                request_id: job.originalRequestId || "",
                customer_id: cancelCustomerId,
                parent_id: job.parent_id || ""
              });
              fetch(`${NETSUITE_API}&${params.toString()}`)
                .then(res => res.json())
                .then(data => console.log("NetSuite Job Cancellation Sync:", data))
                .catch(err => console.error("NetSuite Job Cancellation Error:", err));
            }).catch(() => {
              const params = new URLSearchParams({
                job_id: id,
                request_id: job.originalRequestId || "",
                customer_id: cancelCustomerId,
                parent_id: job.parent_id || ""
              });
              fetch(`${NETSUITE_API}&${params.toString()}`)
                .then(res => res.json())
                .then(data => console.log("NetSuite Job Cancellation Sync:", data))
                .catch(err => console.error("NetSuite Job Cancellation Error:", err));
            });
          } catch {
            const params = new URLSearchParams({
              job_id: id,
              request_id: job.originalRequestId || "",
              customer_id: cancelCustomerId,
              parent_id: job.parent_id || ""
            });
            fetch(`${NETSUITE_API}&${params.toString()}`)
              .then(res => res.json())
              .then(data => console.log("NetSuite Job Cancellation Sync:", data))
              .catch(err => console.error("NetSuite Job Cancellation Error:", err));
          }
        } else {
          const params = new URLSearchParams({
            job_id: id,
            request_id: job.originalRequestId || "",
            customer_id: cancelCustomerId,
            parent_id: job.parent_id || ""
          });

          fetch(`${NETSUITE_API}&${params.toString()}`)
            .then(res => res.json())
            .then(data => console.log("NetSuite Job Cancellation Sync:", data))
            .catch(err => console.error("NetSuite Job Cancellation Error:", err));
        }
      }
      
      await deleteDoc(doc(db, 'jobs', id));
      setJobs(jobs.filter(j => j.id !== id));
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this job request?')) {
      await deleteDoc(doc(db, 'requests', id));
      setRequests(requests.filter(r => r.id !== id));
    }
  };

  const toggleSelectJob = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin) return;
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFilteredJobs = () => {
    if (!isAdmin) return;
    const allIds = filteredJobs.map(j => j.id);
    setSelectedJobIds(new Set(allIds));
  };

  const clearJobSelection = () => {
    setSelectedJobIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!isAdmin) {
      alert("Only admins and superadmins can perform bulk deletion.");
      return;
    }
    if (selectedJobIds.size === 0) {
      alert("No jobs selected for deletion.");
      return;
    }

    const count = selectedJobIds.size;
    if (!window.confirm(`Are you sure you want to permanently delete the ${count} selected job(s)/request(s) directly from the database?`)) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedJobIds);
      
      await Promise.all(idsToDelete.map(async (id) => {
        try {
          await deleteDoc(doc(db, 'jobs', id));
        } catch (e) {
          // Document might be in requests collection
        }
        try {
          await deleteDoc(doc(db, 'requests', id));
        } catch (e) {
          // ignore
        }
      }));

      const idSet = new Set(idsToDelete);
      setJobs(prev => prev.filter(j => !idSet.has(j.id)));
      setRequests(prev => prev.filter(r => !idSet.has(r.id)));
      setSelectedJobIds(new Set());

      alert(`Successfully deleted ${count} item(s) from the database.`);
    } catch (err) {
      console.error("Error bulk deleting items:", err);
      alert("An error occurred during bulk deletion. Please try again.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkAccept = async () => {
    if (!isAdmin) {
      alert("Only admin and super admin users can perform bulk acceptance.");
      return;
    }
    if (selectedJobIds.size === 0) {
      alert("No requests selected.");
      return;
    }

    const selectedRequests = requests.filter(r => selectedJobIds.has(r.id) && (r.status === 'pending' || r.status === 'new-time-proposed' || r.status === 'awaiting-activation'));

    if (selectedRequests.length === 0) {
      alert("None of the selected items are pending requests that can be accepted.");
      return;
    }

    const count = selectedRequests.length;
    if (!window.confirm(`Are you sure you want to accept the ${count} selected pending request(s)?`)) {
      return;
    }

    setIsBulkAccepting(true);
    setBulkAcceptProgress(0);
    setBulkAcceptStatus(`Starting bulk accept for ${count} request(s)...`);

    let successCount = 0;
    let failCount = 0;
    const parentId = parent?.id || userData?.parent_id || "";

    for (let i = 0; i < selectedRequests.length; i++) {
      const req = selectedRequests[i];
      const currentProgress = Math.round(((i) / count) * 100);
      setBulkAcceptProgress(currentProgress);
      setBulkAcceptStatus(`Accepting request ${i + 1} of ${count}: ${req.customer?.company || req.id}...`);

      try {
        await acceptJobRequest({
          request: req,
          parentId: parentId || req.parent_id || "",
          userData,
          companyData
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to accept request ${req.id}:`, err);
        failCount++;
      }
    }

    setBulkAcceptProgress(100);
    setBulkAcceptStatus(`Bulk accept completed! (${successCount} succeeded, ${failCount} failed)`);

    const acceptedIds = new Set(selectedRequests.map(r => r.id));
    setRequests(prev => prev.map(r => acceptedIds.has(r.id) ? { ...r, status: 'scheduled' } : r));
    setSelectedJobIds(new Set());

    setTimeout(() => {
      setIsBulkAccepting(false);
      setBulkAcceptProgress(0);
      setBulkAcceptStatus('');
      alert(`Bulk accept finished: ${successCount} request(s) accepted successfully.${failCount > 0 ? ` (${failCount} failed)` : ''}`);
    }, 1000);
  };

  const handleBulkUpdateStartDate = async (newStartDate: string) => {
    if (!isAdmin) {
      alert("Only admin and super admin users can update request start dates in bulk.");
      return;
    }
    if (selectedJobIds.size === 0) {
      alert("No pending requests selected.");
      return;
    }

    const selectedRequests = requests.filter(r => selectedJobIds.has(r.id) && (r.status === 'pending' || r.status === 'new-time-proposed' || r.status === 'awaiting-activation'));

    if (selectedRequests.length === 0) {
      alert("None of the selected items are pending requests.");
      return;
    }

    setIsBulkUpdatingDate(true);
    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(selectedRequests.map(async (req) => {
        try {
          const sysMessage = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
            sender: 'system',
            text: `Start date updated in bulk to ${newStartDate} by Admin.`,
            timestamp: new Date().toISOString()
          };

          await updateDoc(doc(db, 'requests', req.id), {
            date: newStartDate,
            startDate: newStartDate,
            reprocessedAt: new Date().toISOString(),
            updatedAt: new Date(),
            chat: arrayUnion(sysMessage)
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to update start date for request ${req.id}:`, err);
          failCount++;
        }
      }));

      const updatedIds = new Set(selectedRequests.map(r => r.id));
      setRequests(prev => prev.map(r => updatedIds.has(r.id) ? { ...r, date: newStartDate, startDate: newStartDate } : r));
      setSelectedJobIds(new Set());
      setIsBulkUpdateDateModalOpen(false);

      alert(`Successfully updated start date to ${newStartDate} for ${successCount} pending request(s).${failCount > 0 ? ` (${failCount} failed)` : ''}`);
    } catch (err) {
      console.error("Error bulk updating start dates:", err);
      alert("An error occurred while updating start dates.");
    } finally {
      setIsBulkUpdatingDate(false);
    }
  };

  const handleSingleAccept = async (request: any) => {
    if (!isAdmin) {
      alert("Only admin and super admin users can accept job requests.");
      return;
    }

    if (request.status === 'awaiting-activation') {
      alert("This customer is still awaiting T&C activation. You cannot accept the job until they are Active.");
      return;
    }

    if (window.confirm(`Accept job request for ${request.customer?.company || 'customer'}?`)) {
      try {
        const parentId = parent?.id || userData?.parent_id || request.parent_id || "";
        await acceptJobRequest({
          request,
          parentId,
          userData,
          companyData
        });
        setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'scheduled' } : r));
        alert("Job request accepted successfully!");
      } catch (err: any) {
        console.error("Error accepting job request:", err);
        alert(err?.message || "Failed to accept job request.");
      }
    }
  };

  const handleUpdateStopStatus = async (jobId: string, stopIndex: number, newStatus: string) => {
    if (userData?.role === 'customer' || userData?.role === 'parent') {
      alert("You do not have permission to modify job status.");
      return;
    }
    const job = (activeTab === 'pending' ? requests : jobs).find(j => j.id === jobId);
    if (!job) return;

    const updatedStops = [...(job.stops || [])];
    updatedStops[stopIndex] = { ...updatedStops[stopIndex], status: newStatus };

    // Calculate overall job status
    const allCompleted = updatedStops.every(s => s.status === 'completed');
    const anyCompleted = updatedStops.some(s => s.status === 'completed');
    
    let newJobStatus = job.status;
    if (allCompleted) {
      newJobStatus = 'completed';
    } else if (anyCompleted) {
      newJobStatus = 'in-progress';
    }

    try {
      const collectionName = (activeTab === 'pending') ? 'requests' : 'jobs';
      await updateDoc(doc(db, collectionName, jobId), {
        stops: updatedStops,
        status: newJobStatus,
        updatedAt: new Date()
      });
      
      if (collectionName === 'requests') {
        setRequests(requests.map(r => r.id === jobId ? { ...r, stops: updatedStops, status: newJobStatus } : r));
      } else {
        setJobs(jobs.map(j => j.id === jobId ? { ...j, stops: updatedStops, status: newJobStatus } : j));
      }
    } catch (err) {
      console.error("Error updating stop status:", err);
      alert("Failed to update status.");
    }
  };



  const handleEditRequest = (request: any) => {
    localStorage.setItem('edit_request_draft', JSON.stringify(request));
    handleBookJob(`/new-job?edit=true&id=${request.id}`);
  };

  const getServiceIcon = (type: string) => {
    if (type === 'round-trip') return <ArrowRightLeft size={16} />;
    if (type === 'site-to-lpo' || type === 'site-to-australia post') return <ArrowRight size={16} />;
    return <ArrowLeft size={16} />;
  };

  const getTabCount = (tabId: string) => {
    if (tabId === 'pending') return globalFilteredRequests.filter(r => (r.status === 'pending' || r.status === 'new-time-proposed' || r.status === 'awaiting-activation')).length;
    if (tabId === 'declined') return globalFilteredRequests.filter(r => r.status === 'rejected' || r.status === 'cancelled').length + globalFilteredJobs.filter(j => j.status === 'cancelled').length;
    if (tabId === 'history') return [...globalFilteredJobs, ...globalFilteredRequests].filter(j => j.date < today).length;
    
    return globalFilteredJobs.filter(j => {
      if (tabId === 'in-progress') return j.date === today && j.status !== 'cancelled' && j.status !== 'rejected';
      if (tabId === 'upcoming') return j.date > today && j.status !== 'cancelled' && j.status !== 'rejected';
      return false;
    }).length;
  };

  const getRecurringCustomerCount = () => {
    const activeSchedules = schedules.filter(s => {
      const isNotStopped = s.recurrenceStatus !== 'stopped';
      const matchesFilter = applyGlobalFilters(s);
      return isNotStopped && matchesFilter;
    });
    const uniqueCustomers = new Set(activeSchedules.map(s => s.customer?.company).filter(Boolean)).size;
    return uniqueCustomers;
  };

  return (
    <div className="job-manager-premium">
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <div className="content-container">
        <header className="page-header">
           <div className="header-left">
              <div className="title-area">
                <Layers className="header-icon" />
                <div>
                  <h1>Job Manager</h1>
                  <p>Centralized control for all your logistics tasks.</p>
                </div>
              </div>
           </div>
           <div className="header-right">
              <button onClick={() => handleBookJob()} className="btn-premium-action" id="tour-new-job">
                <Plus size={20} />
                <span>BOOK NEW JOB</span>
              </button>
           </div>
        </header>

        {isRestricted && (
          <div style={{ background: 'rgba(232, 28, 46, 0.1)', border: '1px solid var(--brand-red)', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'var(--brand-red)', color: 'white', borderRadius: '50%', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={20} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: 'var(--ink)', fontSize: '16px', fontWeight: 600 }}>Account Setup in Progress</h3>
              <p style={{ margin: 0, color: 'var(--ink)', opacity: 0.8, fontSize: '14px' }}>
                The MailPlus team is working in the background to get your account ready. You will receive an email once ready.
              </p>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
           {/* Stats Section */}
           <div className="stats-row">
               {[
                  { label: 'Active Jobs', value: globalFilteredJobs.filter(j => j.date === today && j.status !== 'completed').length, icon: Calendar, color: 'var(--ink)' },
                  { label: 'Pending Requests', value: globalFilteredRequests.filter(r => (r.status === 'pending' || r.status === 'new-time-proposed' || r.status === 'awaiting-activation')).length, icon: MessageSquare, color: 'var(--gold)' },
                  { label: 'Completed Jobs', value: globalFilteredJobs.filter(j => j.status === 'completed').length, icon: CheckCircle2, color: 'var(--ink)' }
               ].map((stat, i) => (
                <div key={i} className="stat-card glass">
                   <div className="stat-icon" style={{ background: `var(--cream-warm)`, color: stat.color }}>
                      <stat.icon size={20} />
                   </div>
                   <div className="stat-data">
                      <span className="stat-label">{stat.label}</span>
                      <span className="stat-value">{stat.value}</span>
                   </div>
                </div>
              ))}
           </div>

            {/* Controls Row */}
            <div className="controls-row">


              {/* Mobile Tabs Dropdown */}
              <div className="mobile-tabs-dropdown">
                <select 
                  value={activeTab} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'recurring') {
                      window.open('/schedules', '_blank');
                    } else {
                      setActiveTab(val as any);
                    }
                  }}
                  className="mobile-tab-select"
                >
                  {[
                    { id: 'pending', label: 'Pending Requests' },
                    { id: 'in-progress', label: 'Active Today' },
                    { id: 'upcoming', label: 'Future One-Off' },
                    { id: 'history', label: 'History' },
                    { id: 'declined', label: 'Declined' },
                    { id: 'recurring', label: 'Recurring Schedules' }
                  ].map(tab => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label} {tab.id === 'recurring' ? `(${getRecurringCustomerCount()})` : `(${getTabCount(tab.id)})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="glass-card filter-bar" id="tour-filters">
              <div className="search-pill">
                <Search size={18} />
                <input 
                  type="text" 
                  placeholder="Search company, address or Job ID..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
                <div className="filter-actions">
                   {isAdmin && (
                     <>
                       <CustomSelect 
                         value={adminRoleView}
                         onChange={(val) => setAdminRoleView(val as any)}
                         options={[
                           { value: 'all', label: 'All Roles', icon: <Layers size={14} /> },
                           { value: 'customer', label: 'Role: Customer', icon: <User size={14} /> },
                           { value: 'parent', label: 'Role: Parent', icon: <Building2 size={14} /> }
                         ]}
                         isMulti={true}
                         placeholder="Filter Roles"
                         className="role-select-custom"
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
                         className="company-select-custom"
                       />
                       <CustomSelect 
                         value={selectedParentId}
                         onChange={(val) => setSelectedParentId(val)}
                         options={[
                           { value: 'all', label: 'All Regions / Parents', icon: <MapPin size={14} /> },
                           ...allParents.map(p => ({ value: p.id, label: p.name, icon: <MapPin size={14} /> }))
                         ]}
                         isMulti={true}
                         searchable={true}
                         placeholder="All Regions / Parents"
                         className="lpo-select-custom"
                       />
                     </>
                   )}
                   <div className="custom-filter-date" style={{ position: 'relative', zIndex: 10 }}>
                     <CustomDatePicker 
                       value={dateFilter}
                       onChange={(val) => setDateFilter(val)}
                       placeholder="All Dates"
                     />
                   </div>
                    <CustomSelect 
                       value={serviceFilter}
                       onChange={(val) => setServiceFilter(val)}
                       options={userData?.role === 'parent' || (isAdmin && (adminRoleView === 'parent' || (Array.isArray(adminRoleView) && adminRoleView.includes('parent')))) ? [
                         { value: 'all', label: 'All Services' },
                         { value: 'Post Office-to-IM', label: 'Post Office-to-IM' },
                         { value: 'IM-to-Site', label: 'IM-to-Site' },
                         { value: 'Site-to-IM', label: 'Site-to-IM' }
                       ] : [
                         { value: 'all', label: 'All Services' },
                         { value: 'site-to-lpo', label: userData?.role === 'customer' ? 'Outbound' : 'Site ➔ Parent' },
                         { value: 'site-to-australia post', label: userData?.role === 'customer' ? 'Outbound (AusPost)' : 'Site ➔ Australia Post' },
                         { value: 'lpo-to-site', label: userData?.role === 'customer' ? 'Inbound' : 'Parent ➔ Site' },
                         { value: 'australia post-to-site', label: userData?.role === 'customer' ? 'Inbound (AusPost)' : 'Australia Post ➔ Site' },
                         { value: 'round-trip', label: 'Round Trip' }
                       ]}
                       isMulti={isAdmin}
                       searchable={true}
                       placeholder="All Services"
                       className="service-select-custom"
                     />
                    <CustomSelect 
                      value={statusFilter}
                      onChange={(val) => setStatusFilter(val)}
                      options={[
                        { value: 'all', label: 'All Statuses' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'accepted', label: 'Accepted' },
                        { value: 'scheduled', label: 'Scheduled' },
                        { value: 'in-progress', label: 'In Progress' },
                        { value: 'completed', label: 'Completed' },
                        { value: 'rejected', label: 'Rejected' },
                        { value: 'cancelled', label: 'Cancelled' }
                      ]}
                      isMulti={isAdmin}
                      searchable={true}
                      placeholder="All Statuses"
                      className="status-select-custom"
                    />
                  <button className="btn-secondary-glass" onClick={() => window.location.reload()}><RefreshCw size={18} /></button>
                  <button className="btn-secondary-glass icon-only" onClick={exportJobsCSV} title="Export Jobs">
                    <Download size={18} />
                  </button>
               </div>
            </div>

            {/* Admin Bulk Selection Bar */}
            {isAdmin && filteredJobs.length > 0 && (
               <div className="admin-bulk-bar glass-card" style={{
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'space-between',
                 padding: '12px 20px',
                 marginTop: '12px',
                 marginBottom: '16px',
                 borderRadius: '16px',
                 background: 'rgba(255, 255, 255, 0.85)',
                 border: '1px solid rgba(255, 255, 255, 0.4)',
                 boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)'
               }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <button 
                     className="btn-secondary-glass" 
                     onClick={selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0 ? clearJobSelection : selectAllFilteredJobs}
                     style={{ fontSize: '13px', fontWeight: 600, padding: '6px 14px', cursor: 'pointer' }}
                   >
                     {selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0 ? 'Deselect All' : `Select All (${filteredJobs.length})`}
                   </button>
                   <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                     {isBulkAccepting && bulkAcceptStatus ? bulkAcceptStatus : `${selectedJobIds.size} selected`}
                   </span>
                 </div>
                 
                 {selectedJobIds.size > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {activeTab === 'pending' && (
                        <>
                          <button 
                            onClick={handleBulkAccept}
                            disabled={isBulkAccepting || isBulkDeleting || isBulkUpdatingDate}
                            style={{
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '8px 16px',
                              fontWeight: 700,
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: isBulkAccepting ? 'wait' : 'pointer',
                              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                              opacity: isBulkAccepting ? 0.8 : 1
                            }}
                          >
                            <CheckCircle2 size={16} />
                            <span>{isBulkAccepting ? `Accepting (${bulkAcceptProgress}%)...` : `Accept Selected (${selectedJobIds.size})`}</span>
                          </button>
                          <button 
                            onClick={() => setIsBulkUpdateDateModalOpen(true)}
                            disabled={isBulkAccepting || isBulkDeleting || isBulkUpdatingDate}
                            style={{
                              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '8px 16px',
                              fontWeight: 700,
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: isBulkUpdatingDate ? 'wait' : 'pointer',
                              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                              opacity: isBulkUpdatingDate ? 0.8 : 1
                            }}
                          >
                            <Calendar size={16} />
                            <span>Update Start Date ({selectedJobIds.size})</span>
                          </button>
                        </>
                      )}
                     <button 
                       onClick={handleBulkDelete}
                       disabled={isBulkDeleting || isBulkAccepting}
                       style={{
                         background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                         color: 'white',
                         border: 'none',
                         borderRadius: '10px',
                         padding: '8px 16px',
                         fontWeight: 700,
                         fontSize: '13px',
                         display: 'flex',
                         alignItems: 'center',
                         gap: '8px',
                         cursor: isBulkDeleting ? 'wait' : 'pointer',
                         boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                         opacity: isBulkDeleting ? 0.8 : 1
                       }}
                     >
                       <Trash2 size={16} />
                       <span>{isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedJobIds.size})`}</span>
                     </button>
                   </div>
                 )}
               </div>
             )}

            {/* Logistics Timeline */}
            <div className="dashboard-layout-with-sidebar">
              <aside className="dashboard-sidebar desktop-only">
                <h3 className="sidebar-title">VIEWS</h3>
                <nav className="vertical-tabs" id="tour-tabs">
                  {[
                    { id: 'pending', label: 'Pending Requests', icon: MessageSquare },
                    { id: 'in-progress', label: 'Active Today', icon: Clock },
                    { id: 'upcoming', label: 'Future One-Off', icon: Calendar },
                    { id: 'recurring', label: 'Recurring Schedules', icon: Repeat, external: true },
                    { type: 'separator' },
                    { id: 'history', label: 'History', icon: RotateCcw },
                    { id: 'declined', label: 'Declined', icon: XCircle },
                  ].map((tab: any, idx) => (
                    tab.type === 'separator' ? (
                      <div key={`sep-${idx}`} className="sidebar-separator" />
                    ) : (
                      <button 
                        key={tab.id}
                        className={`vertical-tab-btn ${tab.external ? '' : (activeTab === tab.id ? 'active' : '')}`}
                        onClick={() => {
                          if (tab.external) {
                            window.open('/schedules', '_blank');
                          } else {
                            setActiveTab(tab.id as any);
                          }
                        }}
                      >
                        <tab.icon size={18} strokeWidth={1.5} />
                        <span>{tab.label}</span>
                        <span className="count-badge">
                          {tab.id === 'recurring' ? getRecurringCustomerCount() : getTabCount(tab.id)}
                        </span>
                      </button>
                    )
                  ))}
                </nav>
              </aside>

              <div className="timeline-container">
               {loading ? (
                 <LoadingScreen fullScreen={false} message="Syncing Manifest" />
               ) : groupedJobs.length === 0 ? (
                 <div className="glass-card empty-state">
                   <div className="empty-icon"><Layers size={48} /></div>
                   <h3>No Active Jobs Found</h3>
                   <p>Your manifest is currently empty. Start by booking a new job.</p>
                   <button onClick={() => handleBookJob()} className="btn-primary-glass">
                     BOOK YOUR FIRST JOB
                   </button>
                 </div>
               ) : (
                 <div className="timeline-manifest">
                   <div className="timeline-rail"></div>
                   
                   {groupedJobs.map((group) => (
                     <div key={group.date} className="timeline-group">
                        <div className="date-separator">
                           <div className="separator-line"></div>
                           <div className="date-badge glass">
                              <Calendar size={14} />
                              <span>{parseLocalDate(group.date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                           </div>
                           <div className="separator-line"></div>
                        </div>

                        {group.jobs.map((job: any) => (
                          <div key={job.id} className="timeline-item">
                             <div className="timeline-node">
                                <div className={`node-inner pill-${job.status}`}>
                         {getServiceIcon(job.service)}
                                </div>
                             </div>
                             <div className="timeline-content-card glass-card">
                                 <div className="card-header" onClick={() => toggleExpand(job.id)} style={{ cursor: 'pointer' }}>
                                    <div className="customer-block">
                                       {isAdmin && (
                                         <input 
                                           type="checkbox" 
                                           checked={selectedJobIds.has(job.id)}
                                           onClick={(e) => e.stopPropagation()}
                                           onChange={(e) => toggleSelectJob(job.id, e as any)}
                                           style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: activeTab === 'pending' ? '#10b981' : '#dc2626', marginRight: '8px', flexShrink: 0 }}
                                           title={selectedJobIds.has(job.id) ? "Deselect item" : "Select item for bulk actions"}
                                         />
                                       )}
                                       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          {userData?.role === 'customer' ? (
                                            <h3 className="company-name" style={{ textTransform: 'capitalize' }}>
                                              {job.service === 'site-to-australia post' ? 'Site ➔ Australia Post' : job.service === 'australia post-to-site' ? 'Australia Post ➔ Site' : job.service.replace(/-/g, ' ')}
                                            </h3>
                                          ) : (
                                            <h3 className="company-name">{job.customer.company}</h3>
                                          )}
                                          {isAdmin && (
                                            <span className="parent-badge-inline">
                                              {getParentName(job.parent_id)}
                                            </span>
                                          )}
                                       </div>
                                       {!(userData?.role === 'customer' && (job.service === 'site-to-australia post' || job.service === 'australia post-to-site')) && (
                                       <div className="contact-details">
                                          {(job.customer.firstName || job.customer.lastName) && (
                                            <div className="contact-row" title="Contact Person">
                                              <User size={12} />
                                              <span>{job.customer.firstName || ''} {job.customer.lastName || ''}</span>
                                            </div>
                                          )}
                                          {job.customer.email && (
                                            <div className="contact-row" title="Email">
                                              <Mail size={12} />
                                              <span>{job.customer.email}</span>
                                            </div>
                                          )}
                                          {job.customer.phone && (
                                            <div className="contact-row phone-interactive" title="Phone">
                                              <Phone size={12} />
                                              <span>{job.customer.phone}</span>
                                              <div className="phone-actions">
                                                <a href={`tel:${job.customer.phone}`} className="action-link call" onClick={(e) => e.stopPropagation()} title="Call Customer">
                                                  <Phone size={12} />
                                                </a>
                                                <a href={`sms:${job.customer.phone}`} className="action-link sms" onClick={(e) => e.stopPropagation()} title="Text Customer">
                                                  <MessageSquare size={12} />
                                                </a>
                                              </div>
                                            </div>
                                          )}
                                       </div>
                                       )}
                                       {userData?.role === 'customer' && companyData && (() => {
                                          const isJobActiveToday = activeTab === 'in-progress';
                                          const contactName = isJobActiveToday && job.operatorName ? job.operatorName : companyData.franchiseeContact;
                                          const contactEmail = isJobActiveToday && job.operatorEmail ? job.operatorEmail : companyData.franchiseeEmail;
                                          const rawPhone = isJobActiveToday && job.operatorPhone ? job.operatorPhone : companyData.franchiseeMobile;
                                          const contactPhone = isWithinWorkHours() ? rawPhone : null;
                                          const cardTitle = isJobActiveToday ? "Operator Performing Job" : "Your Franchisee Partner";
                                          
                                          return (
                                            <div className="franchisee-card" style={{
                                              marginTop: '12px',
                                              padding: '10px 14px',
                                              background: 'rgba(26, 61, 51, 0.03)',
                                              border: '1px solid rgba(26, 61, 51, 0.08)',
                                              borderRadius: '8px',
                                              display: 'flex',
                                              flexDirection: 'column',
                                              gap: '6px'
                                            }}>
                                              <div style={{
                                                fontSize: '0.6rem',
                                                letterSpacing: '0.08em',
                                                color: 'var(--primary)',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                opacity: 0.8
                                              }}>
                                                {cardTitle}
                                              </div>
                                              
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>
                                                    {companyData.franchiseeName || 'MailPlus Franchisee'}
                                                  </div>
                                                  {contactName && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginTop: '1px' }}>
                                                      Contact: {contactName}
                                                    </div>
                                                  )}
                                                </div>
                                                
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                  {contactEmail && (
                                                    <a 
                                                      href={`mailto:${contactEmail}`} 
                                                      className="action-link-premium email" 
                                                      onClick={(e) => e.stopPropagation()} 
                                                      title="Email Partner"
                                                      style={{
                                                        width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: 'rgba(26, 61, 51, 0.05)', color: 'var(--ink)', transition: 'all 0.2s', textDecoration: 'none'
                                                      }}
                                                    >
                                                      <Mail size={14} />
                                                    </a>
                                                  )}
                                                  {contactPhone && (
                                                    <>
                                                      <a 
                                                        href={`tel:${contactPhone}`} 
                                                        className="action-link-premium call" 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        title="Call Partner"
                                                        style={{
                                                          width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                          background: 'rgba(26, 61, 51, 0.05)', color: 'var(--ink)', transition: 'all 0.2s', textDecoration: 'none'
                                                        }}
                                                      >
                                                        <Phone size={14} />
                                                      </a>
                                                      <a 
                                                        href={`sms:${contactPhone}`} 
                                                        className="action-link-premium sms" 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        title="SMS Partner"
                                                        style={{
                                                          width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                          background: 'rgba(26, 61, 51, 0.05)', color: 'var(--ink)', transition: 'all 0.2s', textDecoration: 'none'
                                                        }}
                                                      >
                                                        <MessageSquare size={14} />
                                                      </a>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                        {userData?.role !== 'customer' && (
                                       <div className="location-info">
                                          <MapPin size={12} />
                                          <span>{job.customer.suburb}, {job.customer.state}</span>
                                       </div>
                                       )}
                                    </div>
                                    <div className="header-meta-group">
                                      <div className={`status-tag status-${
                                        (activeTab === 'history' && job.date < today && job.status === 'pending') ? 'not-accepted' :
                                        (activeTab === 'history' && job.date < today && (job.status === 'accepted' || job.status === 'scheduled')) ? 'unperformed' :
                                        job.status
                                      }`}>
                                         {activeTab === 'history' && job.date < today && job.status === 'pending' ? 'Not Accepted' :
                                          activeTab === 'history' && job.date < today && (job.status === 'accepted' || job.status === 'scheduled') ? 'Unperformed' :
                                          job.status}
                                      </div>
                                      <div className="expand-icon">
                                        {expandedJobIds.has(job.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                      </div>
                                    </div>
                                 </div>

                                 {expandedJobIds.has(job.id) && (
                                   <div className="job-stops-container fade-in">
                                      <div className="stops-visual-line"></div>
                                      {sortStops(job.stops).map((stop: any, sIdx: number) => {
                                        const isCustomer = userData?.role === 'customer';
                                        const isOutbound = job.service === 'site-to-australia post' || job.service === 'site-to-lpo';
                                        const isInbound = job.service === 'australia post-to-site' || job.service === 'lpo-to-site';
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
                                            <div className="stop-action-group">
                                              <div className={`stop-status-pill ${stop.status}`}>{stop.status}</div>
                                              {stop.status !== 'completed' && (activeTab !== 'pending') && userData?.role !== 'customer' && userData?.role !== 'parent' && (
                                                <button 
                                                  className="btn-complete-stop"
                                                  onClick={() => handleUpdateStopStatus(job.id, stop.originalIndex, 'completed')}
                                                  title="Mark Stop Completed"
                                                >
                                                  <CheckCircle2 size={16} />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {(!job.stops || job.stops.length === 0) && (
                                        <div className="legacy-hint">
                                          Consolidated view unavailable for legacy records.
                                        </div>
                                      )}
                                   </div>
                                 )}

                                 {(activeTab === 'declined' || job.status === 'cancelled') && (
                                   <div className="decline-details-card fade-in" style={job.status === 'cancelled' ? { borderLeft: '4px solid var(--danger)' } : {}}>
                                      <div className="decline-reason-badge">
                                         <XCircle size={12} />
                                         <span>{job.rejectionReason || job.cancellationReason || 'Other Reason'}</span>
                                      </div>
                                      {(job.rejectionNotes || job.cancellationNotes) && (
                                        <div className="decline-notes-content">
                                          <MessageSquare size={12} className="notes-icon" />
                                          <p>{job.rejectionNotes || job.cancellationNotes}</p>
                                        </div>
                                      )}
                                   </div>
                                  )}

                                <div className="card-meta">
                                   {userData?.role !== 'customer' && (
                                   <div className="meta-pill">
                                      <Clock size={12} />
                                      <span>{userData?.role === 'parent' || (isAdmin && adminRoleView === 'parent') ? getDisplayServiceName(job.service, true) : (job.service === 'site-to-australia post' ? 'Site ➔ Australia Post' : job.service === 'australia post-to-site' ? 'Australia Post ➔ Site' : job.service.replace(/-/g, ' '))}</span>
                                   </div>
                                   )}
                                   {userData?.role !== 'customer' && (
                                   <div className="meta-pill">
                                      <RotateCcw size={12} />
                                      <span>{job.billing}</span>
                                   </div>
                                   )}
                                    <div 
                                      className="job-ref interactive" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSupportJobId(job.id);
                                        setSupportMetadata({
                                          parentName: parent?.name,
                                          companyName: job.customer?.company,
                                          contactName: job.customer?.contactName,
                                          contactEmail: job.customer?.email,
                                          contactPhone: job.customer?.phone,
                                          serviceType: job.service,
                                          billing: job.billing
                                        });
                                        setIsSupportModalOpen(true);
                                      }}
                                    >
                                      REF: {job.id}
                                    </div>
                                </div>

                                 <div className="card-actions">
                                      {userData?.role === 'parent' ? (
                                        <div className="messaging-group">
                                          <button className="btn-primary-glass mini-chat" onClick={() => handleFranchiseeContact(job)}>
                                             <Mail size={16} />
                                             <span>EMAIL / SMS FRANCHISEE</span>
                                          </button>
                                        </div>
                                      ) : (activeTab === 'pending' || activeTab === 'declined') && job.preferredTime ? (
                                        <div className="messaging-group">
                                          <button className="btn-primary-glass mini-chat" onClick={() => window.open(`/request/${job.id}`, '_blank')}>
                                             <MessageSquare size={16} />
                                             <span>CHAT & MANAGE</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="messaging-group">
                                           <button className="btn-primary-glass mini-chat" onClick={() => handleCommunication(job)}>
                                              <MessageSquare size={16} />
                                              <span>CONTACT OPERATOR</span>
                                           </button>
                                        </div>
                                      )}
                                     
                                    <div className="overflow-menu">
                                       <div className="menu-trigger">
                                          <MoreHorizontal size={18} />
                                          <div className="menu-dropdown glass">
                                             {activeTab === 'pending' || activeTab === 'declined' ? (
                                               <>
                                                 {activeTab === 'pending' && isAdmin && (
                                                   <button onClick={() => handleSingleAccept(job)} style={{ color: '#10b981' }}>
                                                     <CheckCircle2 size={14} /> Accept Request
                                                   </button>
                                                 )}
                                                 <button onClick={() => handleEditRequest(job)}><RotateCcw size={14} /> Edit Request</button>
                                                 <button className="cancel" onClick={() => handleDeleteRequest(job.id)}><Trash2 size={14} /> Delete Request</button>
                                               </>
                                             ) : (
                                               <>
                                                 <button onClick={() => handleRebook(job)}><RotateCcw size={14} /> Rebook</button>
                                                 {(job.status !== 'accepted' && job.status !== 'rejected' && job.status !== 'in-progress' && job.status !== 'completed') && (
                                                   <button className="cancel" onClick={() => handleDelete(job.id)}><Trash2 size={14} /> {job.status === 'scheduled' ? 'Cancel Job' : 'Cancel'}</button>
                                                 )}
                                               </>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                             </div>
                          </div>
                        ))}
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Communication Modal */}
      <div className={`modal-overlay ${isCommModalOpen ? 'active' : ''}`}>
        <div className="modal-content card glass fade-in">
          <div className="modal-header">
            <div className="header-title">
              <MessageSquare size={20} />
              <h2>Contact Operator</h2>
            </div>
            <button className="close-btn" onClick={() => setIsCommModalOpen(false)}>
              <X size={20} />
            </button>
          </div>

          {selectedJobForComm && (
            <div className="schedule-info-summary">
              <div className="m-company">{selectedJobForComm.customer.company}</div>
              <div className="m-address">
                <MapPin size={14} />
                <span>{selectedJobForComm.customer.address}, {selectedJobForComm.customer.suburb}</span>
              </div>
            </div>
          )}

          <div className="mgmt-section">
            <label className="m-label">Your Message</label>
            <p className="m-hint">This message will be sent to the operator via Email and SMS.</p>
            <textarea 
              className="comm-textarea"
              placeholder="Type your message here..."
              value={commMessage}
              onChange={(e) => setCommMessage(e.target.value)}
              rows={5}
              disabled={isSending}
            />
          </div>

          <div className="modal-actions">
            <button 
              className="btn-secondary-glass" 
              onClick={() => setIsCommModalOpen(false)}
              disabled={isSending}
            >
              Cancel
            </button>
            <button 
              className="btn-primary-glass" 
              onClick={submitCommunication}
              disabled={isSending || !commMessage.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}
            >
              {isSending ? <RefreshCw size={18} className="spin" /> : 'Send Message'}
            </button>
          </div>
        </div>
      </div>

      <SupportEmailModal 
        isOpen={isSupportModalOpen} 
        onClose={() => setIsSupportModalOpen(false)}
        jobId={supportJobId}
        contextTitle={supportJobId ? `Job Reference: ${supportJobId}` : undefined}
        metadata={supportMetadata}
      />

      <CancelJobModal 
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        job={selectedJobForCancel}
        onSuccess={() => {
          // Update local state to reflect cancellation
          if (selectedJobForCancel) {
            setJobs(jobs.map(j => j.id === selectedJobForCancel.id ? { ...j, status: 'cancelled' } : j));
          }
          alert("Job cancelled and dispatch notified.");
        }}
      />

      <FranchiseeContactModal 
        isOpen={isFranchiseeModalOpen}
        onClose={() => setIsFranchiseeModalOpen(false)}
        job={selectedJobForFranchiseeModal}
        contactName={selectedJobForFranchiseeModal?.operatorName || companyData?.franchiseeContact || parent?.name}
        contactEmail={selectedJobForFranchiseeModal?.operatorEmail || companyData?.franchiseeEmail || parent?.franchiseeEmail || companyData?.email || parent?.email}
        contactPhone={selectedJobForFranchiseeModal?.operatorPhone || companyData?.franchiseeMobile || parent?.franchiseeMobile || companyData?.mobile || parent?.mobile}
        userFullName={userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : undefined}
        companyName={companyData?.companyName || parent?.name}
      />

      <BulkUpdateDateModal 
        isOpen={isBulkUpdateDateModalOpen}
        onClose={() => setIsBulkUpdateDateModalOpen(false)}
        selectedCount={selectedJobIds.size}
        onConfirm={handleBulkUpdateStartDate}
        isUpdating={isBulkUpdatingDate}
      />

      <style>{`
        .job-manager-premium {
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
        .blob-2 { bottom: -100px; left: -100px; background: var(--gold); opacity: 0.2; animation-delay: -5s; }

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
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .btn-premium-action:hover { transform: translateY(-4px); box-shadow: 0 15px 35px rgba(26, 61, 51, 0.25); }

        .dashboard-layout-with-sidebar {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        @media (min-width: 1024px) {
          .dashboard-layout-with-sidebar {
            display: grid;
            grid-template-columns: 240px 1fr;
            align-items: start;
          }
          .desktop-only { display: block; }
          .mobile-tabs-dropdown { display: none !important; }
          .controls-row { display: none; }
        }
        
        @media (max-width: 1023px) {
          .desktop-only { display: none; }
          .mobile-tabs-dropdown { display: block; }
          .controls-row { justify-content: space-between; }
        }

        .dashboard-sidebar {
          position: sticky;
          top: 100px;
          background: rgba(255, 255, 255, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(20px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
        }

        .sidebar-title {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--ink);
          opacity: 0.6;
          margin-bottom: 20px;
          font-weight: 700;
          margin-top: 0;
        }

        .vertical-tabs {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .vertical-tab-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 16px;
          border: none;
          background: transparent;
          color: var(--ink);
          font-weight: 500;
          font-size: 1.05rem;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          margin-bottom: 4px;
        }

        .vertical-tab-btn:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        .vertical-tab-btn.active {
          background: rgba(224, 184, 107, 0.15);
          color: #7d653a;
          font-weight: 700;
        }

        .vertical-tab-btn svg {
          color: inherit;
          opacity: 0.8;
        }

        .vertical-tab-btn .count-badge {
          margin-left: auto;
          background: rgba(0, 0, 0, 0.04);
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--ink-soft);
        }
        
        .vertical-tab-btn.active .count-badge {
          background: rgba(0, 0, 0, 0.05);
          color: #7d653a;
        }

        .sidebar-separator {
          height: 1px;
          background: rgba(0, 0, 0, 0.05);
          margin: 12px 16px;
        }

        .sidebar-title {
          font-family: var(--font-ui);
          font-size: 0.75rem;
          font-weight: 800;
          color: var(--ink-soft);
          opacity: 0.6;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 16px 20px;
        }

        .dashboard-grid { display: flex; flex-direction: column; gap: 24px; }

        .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 32px; }
        .stat-card {
          padding: 24px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .stat-icon { width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
        .stat-data { display: flex; flex-direction: column; }
        .stat-label { font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; color: var(--ink-soft); opacity: 0.6; text-transform: uppercase; letter-spacing: 0.16em; }
        .stat-value { font-family: var(--font-headings); font-size: 1.6rem; font-weight: 500; color: var(--ink); }

        .filter-bar {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          margin-bottom: 24px;
          border-radius: 20px;
          position: relative;
          z-index: 10;
        }
        .search-pill {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.8);
          padding: 0 20px;
          border-radius: 14px;
          max-width: 400px;
        }
        .search-pill input { border: none; background: transparent; padding: 14px 0; width: 100%; font-weight: 500; font-size: 0.95rem; }
        .filter-actions { display: flex; gap: 8px; }
        .lpo-select-custom { min-width: 200px; }

        .btn-secondary-glass {
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.5);
          color: var(--ink);
          padding: 0 16px;
          border-radius: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex; align-items: center; gap: 8px;
        }
        .btn-secondary-glass.icon-only {
          padding: 10px;
          justify-content: center;
        }
        .timeline-container { position: relative; padding-top: 20px; }
        .timeline-manifest { position: relative; padding-left: 60px; }
        .timeline-rail {
          position: absolute; left: 24px; top: 0; bottom: 0; width: 4px;
          background: var(--cream-warm); border-radius: 4px;
        }
        
        .date-separator {
          display: flex; align-items: center; gap: 20px; margin: 40px 0 24px -60px;
        }
        .separator-line { flex: 1; height: 1px; background: rgba(0, 65, 65, 0.1); }
        .date-badge {
          padding: 8px 24px; border-radius: 50px; background: white !important;
          display: flex; align-items: center; gap: 10px; font-family: var(--font-ui); font-weight: 500;
          color: var(--ink); font-size: 0.75rem; box-shadow: 0 4px 15px rgba(26, 61, 51, 0.05);
          text-transform: uppercase; letter-spacing: 0.16em;
        }

        .timeline-item { position: relative; margin-bottom: 24px; display: flex; align-items: center; }
        .timeline-node {
          position: absolute; left: -60px; width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center; z-index: 2;
        }
        .node-inner {
          width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
          background: white; border: 3px solid var(--offwhite); color: var(--ink);
          box-shadow: 0 8px 20px rgba(26, 61, 51, 0.08); transition: all 0.3s;
        }
        .node-inner.pill-scheduled { border-color: var(--ink); color: var(--ink); }
        .node-inner.pill-cancelled { border-color: var(--danger); color: var(--danger); }

        .timeline-content-card {
          flex: 1; padding: 20px 24px; border-radius: 24px; background: rgba(255,255,255,0.6);
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          border: 1px solid rgba(255,255,255,0.4);
        }
        .timeline-content-card:hover {
          transform: translateX(10px); background: rgba(255,255,255,0.9);
          box-shadow: 0 15px 40px rgba(26, 61, 51, 0.08);
        }

        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .company-name { font-family: var(--font-headings); font-size: 1.1rem; font-weight: 500; color: var(--ink); margin: 0; }
        .contact-details { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; margin-bottom: 8px; }
        .contact-row { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 0.75rem; font-weight: 600; }
        .contact-row svg { opacity: 0.6; flex-shrink: 0; }
        
        .phone-interactive { position: relative; }
        .phone-actions { display: inline-flex; gap: 6px; margin-left: 10px; vertical-align: middle; }
        .action-link {
          width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
          background: rgba(26, 61, 51, 0.05); color: var(--ink); transition: all 0.2s; text-decoration: none;
        }
        .action-link:hover { transform: scale(1.15); color: white; }
        .action-link.call:hover { background: #2ecc71; }
        .action-link.sms:hover { background: #3498db; }

        .action-link-premium {
          transition: all 0.2s ease-in-out;
        }
        .action-link-premium:hover { transform: translateY(-2px); color: white !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .action-link-premium.email:hover { background: var(--primary) !important; }
        .action-link-premium.call:hover { background: #2ecc71 !important; }
        .action-link-premium.sms:hover { background: #3498db !important; }

        .location-info { display: flex; align-items: center; gap: 6px; color: var(--ink-soft); opacity: 0.6; font-size: 0.75rem; font-weight: 600; margin-top: 4px; }
        
        .status-tag {
          padding: 4px 10px; border-radius: 8px; font-family: var(--font-ui); font-size: 0.55rem; font-weight: 500;
          text-transform: uppercase; background: var(--cream-warm); color: var(--ink-soft); letter-spacing: 0.16em;
        }
        .status-tag.status-scheduled { background: var(--cream-warm); color: var(--ink); }
        .status-tag.status-not-accepted { background: var(--cream-warm); color: var(--gold); }
        .status-tag.status-unperformed { background: var(--cream-warm); color: var(--danger); }
        .status-tag.status-accepted { background: var(--cream-warm); color: var(--ink); }
        .status-tag.status-in-progress { background: var(--cream-warm); color: var(--ink); }
        .status-tag.status-completed { background: var(--ink); color: white; }
        .status-tag.status-rejected { background: var(--cream-warm); color: var(--danger); }
        .status-tag.status-cancelled { background: var(--cream-warm); color: var(--danger); }

        .card-meta { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
        .meta-pill { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 700; color: var(--ink-soft); opacity: 0.6; text-transform: capitalize; }
        .job-ref { margin-left: auto; font-family: var(--font-ui); font-size: 0.65rem; color: var(--ink-soft); opacity: 0.4; font-weight: 500; }

        .decline-details-card {
          margin: 16px 0;
          padding: 16px;
          background: rgba(255, 71, 87, 0.04);
          border: 1px solid rgba(255, 71, 87, 0.1);
          border-radius: 16px;
        }
        .decline-reason-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: #ff4757;
          color: white;
          border-radius: 10px;
          font-family: var(--font-ui);
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
          box-shadow: 0 4px 12px rgba(255, 71, 87, 0.2);
        }
        .decline-notes-content {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: var(--ink);
          font-size: 0.85rem;
          line-height: 1.5;
        }
        .notes-icon {
          margin-top: 3px;
          color: #ff4757;
          opacity: 0.6;
          flex-shrink: 0;
        }
        .decline-notes-content p {
          margin: 0;
          font-weight: 500;
        }

        .card-actions {
          display: flex; justify-content: space-between; align-items: center;
          padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.03);
        }
        .messaging-group { display: flex; gap: 8px; }
        .mini-action {
          padding: 8px 14px; border-radius: 10px; border: none; cursor: pointer;
          display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 0.7rem;
          transition: all 0.2s; background: white; border: 1px solid rgba(0,0,0,0.05);
        }
        .mini-action.sms { color: var(--ink); }
        .mini-action.email { color: #3498db; }
        .mini-action:hover { background: var(--ink); color: white; transform: translateY(-2px); }

        .overflow-menu { position: relative; }
        .menu-trigger { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; color: var(--ink-soft); cursor: pointer; }
        .menu-trigger:hover { background: rgba(26, 61, 51, 0.05); color: var(--ink); }
        .menu-dropdown {
          position: absolute; bottom: calc(100% + 8px); right: 0;
          min-width: 160px; border-radius: 16px; padding: 6px; z-index: 100;
          display: none; flex-direction: column; gap: 2px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(15px);
          box-shadow: 0 10px 40px rgba(26, 61, 51, 0.15); 
          border: 1px solid rgba(26, 61, 51, 0.05);
        }
        /* Bridge the gap for hover */
        .menu-dropdown::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          height: 12px;
          background: transparent;
        }
        .menu-trigger:hover .menu-dropdown, .menu-dropdown:hover { display: flex; }
        .menu-dropdown button {
          padding: 10px 14px; border-radius: 10px; border: none; background: transparent;
          display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 0.8rem;
          color: var(--ink-soft); cursor: pointer; text-align: left;
        }
        .menu-dropdown button:hover { background: rgba(26, 61, 51, 0.05); color: var(--ink); }
        .menu-dropdown button.cancel:hover { background: #fff5f5; color: #ff4757; }

        @media (max-width: 700px) {
          .timeline-manifest { padding-left: 50px; }
          .timeline-rail { left: 18px; }
          .timeline-node { left: -54px; }
          .node-inner { width: 36px; height: 36px; border-radius: 10px; }
          .timeline-content-card { padding: 16px; border-radius: 16px; }
          .card-header { margin-bottom: 12px; }
          .company-name { font-size: 1rem; }
          .date-badge { font-size: 0.7rem; padding: 6px 16px; }
          .card-meta { flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
          .job-ref { width: 100%; margin: 0; }
          .page-header { flex-direction: column; gap: 16px; align-items: stretch; }
          .header-right .btn-premium-action { width: 100%; justify-content: center; }
          .card-actions { flex-direction: row; justify-content: space-between; align-items: center; padding-top: 12px; }
          .messaging-group { flex-direction: row; width: auto; gap: 8px; }
          .mini-action span, .mini-chat span { display: none; }
          .mini-action, .mini-chat { width: 36px; height: 36px; justify-content: center; padding: 0; }
          .overflow-menu { position: relative; top: auto; right: auto; }
        }


        .loading-state { padding: 100px; text-align: center; color: var(--ink-soft); opacity: 0.6; font-weight: 600; }

        .glass-card { background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.4); padding: 32px; }

        .controls-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 20px; }
        .tabs-glass { 
          display: flex; gap: 4px; background: rgba(26, 61, 51, 0.05); padding: 5px; border-radius: 16px; 
          border: 1px solid rgba(255,255,255,0.4);
          flex-wrap: wrap; justify-content: center;
        }
        .mobile-tabs-dropdown { display: none; width: 100%; }
        .mobile-tab-select { 
          width: 100%; padding: 16px; font-family: var(--font-headings); font-weight: 700; font-size: 1rem;
          color: var(--ink); background: white; border: 2px solid var(--cream-warm); border-radius: 16px; 
          appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23095c7b' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat; background-position: right 16px center; background-size: 16px;
        }
        .tab-btn {
          padding: 8px 16px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
          color: var(--ink-soft); font-weight: 700; font-size: 0.85rem; transition: all 0.2s;
          flex: 1 1 calc(33.333% - 8px); min-width: 130px; text-align: center;
        }
        .tab-btn.active { background: white; color: var(--ink); box-shadow: 0 4px 12px rgba(26, 61, 51, 0.05); }
        .count-badge {
          background: rgba(26, 61, 51, 0.1); color: var(--ink); 
          font-family: var(--font-ui); font-size: 0.6rem; padding: 2px 6px; border-radius: 6px;
          font-weight: 500;
        }

        .select-glass:focus { border-color: var(--ink); }

        .date-picker-glass {
          display: flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.5); padding: 8px 14px; border-radius: 14px;
          color: var(--ink); font-weight: 600;
        }
        .date-picker-glass input {
          border: none; background: transparent; color: inherit; font-family: inherit;
          font-weight: 700; font-size: 0.85rem; outline: none;
        }
        .clear-date {
          background: rgba(0, 0, 0, 0.05); border: none; width: 22px; height: 22px;
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #ff4757; transition: all 0.2s;
        }
        .clear-date:hover { background: #ff4757; color: white; }

        @media (max-width: 900px) {
          .desktop-tabs { display: none !important; }
          .mobile-tabs-dropdown { display: block; }
          .cards-wrapper { grid-template-columns: 1fr; }
          .stats-row { grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
          .stat-card { padding: 12px 6px; flex-direction: column; gap: 4px; text-align: center; border-radius: 12px; align-items: center; justify-content: center; }
          .stat-card::before { top: 0; left: 0; width: 100%; height: 3px; }
          .stat-icon { width: 32px; height: 32px; border-radius: 10px; }
          .stat-icon svg { width: 16px !important; height: 16px !important; }
          .stat-data { align-items: center; }
          .stat-label { font-size: 0.5rem; letter-spacing: 0; line-height: 1.1; margin-bottom: 2px; }
          .stat-value { font-size: 1.2rem; }
          .controls-row { flex-direction: column; align-items: stretch; gap: 12px; }
          .page-header h1 { font-size: 1.5rem; }
          .page-header p { font-size: 0.85rem; }
          .filter-bar { flex-direction: column; gap: 12px; align-items: stretch; padding: 16px; margin-bottom: 20px; }
          .search-pill { max-width: 100%; padding: 0 12px; }
          .filter-actions { flex-wrap: wrap; justify-content: flex-start; gap: 8px; }
          .date-picker-glass, .select-glass { flex: 1; min-width: 110px; padding: 6px 10px; font-size: 0.8rem; }
          .lpo-select-custom { flex: 1; min-width: 140px; }
        }

        @media (max-width: 700px) {
          .content-container { padding: 16px 12px 100px; }
          .timeline-manifest { padding-left: 40px; }
          .timeline-rail { left: 14px; }
          .timeline-node { left: -48px; }
          .node-inner { width: 32px; height: 32px; border-radius: 8px; }
          .timeline-content-card { padding: 14px; border-radius: 20px; }
          .card-header { margin-bottom: 10px; gap: 8px; }
          .company-name { font-size: 1rem; }
          .contact-details { gap: 4px; margin-bottom: 8px; }
          .contact-row { font-size: 0.7rem; }
          .location-info { font-size: 0.75rem; margin-top: 2px; }
          .date-badge { font-size: 0.65rem; padding: 4px 12px; }
          .card-meta { flex-wrap: wrap; gap: 8px; padding: 12px 0; margin-top: 12px; margin-bottom: 8px; }
          .meta-pill { font-size: 0.7rem; gap: 4px; }
          .job-ref { width: 100%; margin: 0; font-size: 0.6rem; }
          .card-actions { padding-top: 12px; border-top: 1px solid rgba(26,61,51,0.03); }
          .mini-chat { padding: 8px 12px; font-size: 0.75rem; }
          .mini-action span, .mini-chat span { display: none; }
          .mini-action, .mini-chat { width: 32px; height: 32px; justify-content: center; padding: 0; border-radius: 10px; }
        }

        .header-meta-group { display: flex; align-items: center; gap: 12px; }
        .expand-icon { color: var(--ink-soft); opacity: 0.6; transition: all 0.2s; }
        .card-header:hover .expand-icon { transform: scale(1.1); opacity: 1; color: var(--ink); }

        .job-stops-container {
          margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.03);
          position: relative; padding-left: 24px;
        }
        .stops-visual-line {
          position: absolute; left: 7px; top: 30px; bottom: 30px; width: 2px;
          background: rgba(26, 61, 51, 0.08); border-radius: 2px;
        }
        .stop-entry {
          display: flex; gap: 16px; margin-bottom: 24px; position: relative;
        }
        .stop-entry:last-child { margin-bottom: 0; }
        .timeline-group:last-child { margin-bottom: 0; }

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
        .stop-node {
          width: 16px; height: 16px; border-radius: 50%; background: white;
          border: 3px solid var(--offwhite); z-index: 2; margin-top: 4px;
          box-shadow: 0 4px 10px rgba(26,61,51,0.1);
        }
        .stop-node.pickup { border-color: var(--ink); }
        .stop-node.delivery { border-color: var(--gold); }
        
        .stop-details { flex: 1; }
        .stop-type-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .type-pill { font-family: var(--font-ui); font-size: 0.55rem; font-weight: 500; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.16em; }
        .stop-seq { font-family: var(--font-ui); font-size: 0.6rem; color: var(--ink-soft); opacity: 0.4; font-weight: 500; letter-spacing: 0.05em; }
        .stop-loc-name { font-weight: 800; color: var(--ink); font-size: 0.9rem; }
        .stop-addr { font-size: 0.75rem; color: var(--ink-soft); font-weight: 600; margin-top: 2px; }
        
        .stop-action-group {
          display: flex;
          align-items: center;
          gap: 12px;
          align-self: flex-start;
        }

        .stop-status-pill {
          font-size: 0.6rem;
          font-weight: 800;
          color: var(--ink-soft);
          opacity: 0.6;
          text-transform: uppercase;
          background: rgba(0,0,0,0.03);
          padding: 4px 8px;
          border-radius: 6px;
        }
        
        .stop-status-pill.completed {
          background: var(--cream-warm);
          color: var(--ink);
        }

        .btn-complete-stop {
          background: transparent;
          border: none;
          color: var(--ink);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          padding: 4px;
        }
        .btn-complete-stop:hover {
          transform: scale(1.2);
          color: var(--ink);
        }

        .legacy-hint { padding: 20px; text-align: center; color: var(--ink-soft); opacity: 0.6; font-size: 0.8rem; font-weight: 600; font-style: italic; }

        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* Modal Styles */
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

        .schedule-info-summary { background: var(--offwhite); padding: 20px; border-radius: 20px; margin-bottom: 32px; }
        .m-company { font-weight: 800; color: var(--ink); font-size: 1.1rem; margin-bottom: 4px; }
        .m-address { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--ink-soft); font-weight: 600; }

        .mgmt-section { margin-bottom: 32px; }
        .m-label { display: block; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--ink-soft); opacity: 0.6; margin-bottom: 8px; letter-spacing: 0.5px; }
        .m-hint { font-size: 0.8rem; color: var(--ink-soft); margin-bottom: 16px; line-height: 1.4; }

        .m-frequency-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .m-freq-pill { padding: 12px; border-radius: 12px; border: 1px solid var(--cream-warm); background: white; font-weight: 700; color: var(--ink-soft); cursor: pointer; transition: all 0.2s; }
        .m-freq-pill.active { background: var(--ink); color: white; border-color: var(--ink); }

        .occurrences-list { display: flex; flex-direction: column; gap: 10px; }
        .occ-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: white; border: 1px solid var(--cream-warm); border-radius: 14px; }
        .occ-row.skipped { background: var(--cream-warm); border-color: var(--danger); opacity: 0.7; }
        .occ-date { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 700; color: var(--ink); }
        .occ-date svg { color: var(--ink-soft); opacity: 0.6; }
        .skip-toggle { padding: 6px 14px; border-radius: 50px; font-size: 0.65rem; font-weight: 800; border: 1px solid var(--cream-warm); background: white; color: var(--ink-soft); cursor: pointer; }
        .skip-toggle.active { background: var(--danger); color: white; border-color: var(--danger); }

        .modal-danger-zone { border-top: 1px solid var(--cream-warm); padding-top: 24px; margin-top: 10px; }
        .btn-danger-outline { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid var(--danger); color: var(--danger); background: transparent; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: all 0.2s; }
        .btn-danger-outline:hover { background: var(--cream-warm); }

        .manage-schedule { width: 100%; margin-bottom: 8px; border: 1px solid rgba(26, 61, 51, 0.1) !important; background: white !important; color: var(--ink) !important; }
        .manage-schedule:hover { background: var(--offwhite) !important; border-color: var(--ink) !important; }

        /* Communication Modal Specific */
        .comm-textarea {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid rgba(26, 61, 51, 0.1);
          background: white;
          font-family: var(--font-body);
          font-size: 0.9rem;
          resize: none;
          margin-bottom: 24px;
          transition: all 0.2s;
        }
        .comm-textarea:focus {
          border-color: var(--ink);
          box-shadow: 0 0 0 3px rgba(26, 61, 51, 0.05);
          outline: none;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .live-chat-highlight { background: var(--ink) !important; color: white !important; border: none !important; box-shadow: 0 4px 12px rgba(26, 61, 51, 0.2); }
        .live-chat-highlight:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(26, 61, 51, 0.3); }
      `}</style>
    </div>
  );
};

export default Dashboard;
