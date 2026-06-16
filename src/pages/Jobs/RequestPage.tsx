import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  collection, 
  onSnapshot,
  arrayUnion,
  query,
  where,
  getDocs,
  getDoc,
  increment
} from 'firebase/firestore';
import { 
  Building2, 
  MapPin, 
  Clock, 
  Truck, 
  ChevronLeft, 
  MessageSquare, 
  Send,
  XCircle,
  CheckCircle2,
  Phone,
  Mail,
  User as UserIcon,
  Zap
} from 'lucide-react';
import CustomDatePicker from '../../components/CustomDatePicker';
import LoadingScreen from '../../components/LoadingScreen';
import AcceptingProgress from '../../components/AcceptingProgress';
import { db } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import { formatDateForInput, parseLocalDate, getDayName } from '../../utils/scheduling';
import { requestNotificationPermission, saveTokenToFirestore, onForegroundMessage } from '../../utils/notifications';

const RequestPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { parent, userData, loading: parentLoading } = useLpo();
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptProgress, setAcceptProgress] = useState(0);
  const [acceptStatus, setAcceptStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Rejection Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');

  // Reprocess State
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  // Propose New Time Modal State
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [proposedTime, setProposedTime] = useState('');

  // Identity: If userData exists, person is the Customer (Logged in user).
  // Otherwise, they are a Franchisee (Not logged in).
  const isParentUser = !!userData;
  const isExternalUser = !userData;

  const today = formatDateForInput(new Date());
  const isHistory = request?.date < today;

  useEffect(() => {
    if (!id) return;

    // Use onSnapshot for real-time chat
    const unsubscribe = onSnapshot(doc(db, 'requests', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRequest({ id: docSnap.id, ...data });
      } else {
        setError("Request not found or has been deleted.");
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching request:", err);
      setError("Error loading request details.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, parent]);

  useEffect(() => {
    // Request notification permission and save token
    const setupNotifications = async () => {
      const token = await requestNotificationPermission();
      if (token) {
        if (isParentUser && userData?.uid) {
          saveTokenToFirestore(token, 'operator', userData.uid); 
        } else if (id) {
          saveTokenToFirestore(token, 'customer', id);
        }
      }
    };

    setupNotifications();
    onForegroundMessage();

    // Setup audio
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.volume = 0.5;

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [id, isParentUser, userData, parent]);

  // Tab Title Pulsing Logic
  useEffect(() => {
    let interval: any;
    if (hasNewMessage && document.hidden) {
      const originalTitle = document.title;
      let showAlt = false;
      interval = setInterval(() => {
        document.title = showAlt ? `(1) New Message!` : originalTitle;
        showAlt = !showAlt;
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
      document.title = "LocalMile.Plus | Job Coordination";
    };
  }, [hasNewMessage]);

  // Clear new message state when user clicks on page
  useEffect(() => {
    const handleFocus = () => {
      setHasNewMessage(false);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Play sound when chat length increases (if not the sender)
  useEffect(() => {
    if (!request?.chat) return;
    const lastMsg = request.chat[request.chat.length - 1];
    if (!lastMsg) return;

    // If a new message arrived from the OTHER person
    const isFromOther = (isParentUser && lastMsg.sender === 'user') || (!isParentUser && lastMsg.sender === 'operator');
    
    if (isFromOther) {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log("Audio play blocked by browser", e));
      }
      if (document.hidden) {
        setHasNewMessage(true);
      }
    }
  }, [request?.chat?.length, isParentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [request?.chat]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !id) return;

    const newMessage = {
      sender: isParentUser ? 'operator' : 'user',
      text: message.trim(),
      timestamp: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, 'requests', id), {
        chat: arrayUnion(newMessage)
      });
      setMessage('');
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const handleCancelRequest = async () => {
    if (!request || !id) return;

    if (window.confirm("Are you sure you want to cancel this job request? This will remove all scheduled visits associated with it.")) {
      setLoading(true);
      try {
        const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2533&deploy=1&compid=1048144&ns-at=AAEJ7tMQft1Dl2RVClm4B9TZr9MEKQ4mSl-fhRftfdOXMPsHlRI";
        
        // 1. Find and cancel all related jobs (instances)
        const jobsQ = query(collection(db, 'jobs'), where('originalRequestId', '==', id));
        const jobsSnap = await getDocs(jobsQ);
        
        for (const jobDoc of jobsSnap.docs) {
          const params = new URLSearchParams({
            job_id: jobDoc.id,
            request_id: id,
            customer_id: request.netsuiteCustomerId || request.customer?.netsuiteId || "",
            parent_id: request.parent_id || ""
          });

          await fetch(`${NETSUITE_API}&${params.toString()}`).catch(e => console.error("NetSuite Instance Cancel Error:", e));
          await deleteDoc(doc(db, 'jobs', jobDoc.id));
        }

        // 2. Find and cancel related scheduled_jobs (templates)
        const schedQ = query(collection(db, 'scheduled_jobs'), where('originalRequestId', '==', id));
        const schedSnap = await getDocs(schedQ);
        
        for (const schedDoc of schedSnap.docs) {
          await deleteDoc(doc(db, 'scheduled_jobs', schedDoc.id));
        }

        // 3. Update the request document
        const sysMessage = {
          id: Date.now().toString(),
          sender: 'system',
          text: `Job cancelled by ${isParentUser ? 'MailPlus' : 'Franchisee'}.`,
          timestamp: new Date().toISOString()
        };

        await updateDoc(doc(db, 'requests', id), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: isParentUser ? 'operator' : 'customer',
          chat: arrayUnion(sysMessage)
        });

        alert("Job cancelled successfully.");
      } catch (err) {
        console.error("Error cancelling job:", err);
        alert("Failed to cancel job. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAccept = async () => {
    if (!request) return;
    if (isParentUser && !parent) return;

    const parentId = parent?.id || request.parent_id || "";

    if (request.status === 'awaiting-activation') {
      alert("This customer is still awaiting T&C activation. You cannot accept the job until they are Active.");
      return;
    }

    if (window.confirm("Accept this job request?")) {
      setIsAccepting(true);
      setAcceptProgress(5);
      setAcceptStatus("Initializing acceptance flow...");

      try {
        // Fetch trial balance early to pass to APIs
        let isFreeJob = false;
        if (request.customer_id) {
          try {
            const compDoc = await getDoc(doc(db, 'companies', request.customer_id));
            if (compDoc.exists() && typeof compDoc.data().trial_credits_balance === 'number' && compDoc.data().trial_credits_balance > 0) {
              isFreeJob = true;
            }
          } catch (e) {
            console.error("Failed to check trial balance:", e);
          }
        }

        // 1. Create Job or Scheduled Template
        let jobDocRef;
        const today = formatDateForInput(new Date());
        let finalJobId = "";
        const netsuiteCustomerId = request.netsuiteCustomerId || request.customer?.netsuiteId || "";
        
        setAcceptProgress(15);
        setAcceptStatus("Analyzing service requirements...");

        let serviceInternalId = '';
        let serviceRate = '';

        if (request.jobType === 'scheduled') {
          // 1.1 Fetch Service Metadata from Customer Record
          setAcceptStatus("Fetching customer service metadata...");
          
          try {
            if (parentId) {
              const custQ = query(
                collection(db, `lpo/${parentId}/customers`),
                where('companyName', '==', request.customer.company)
              );
              const custSnap = await getDocs(custQ);
              if (!custSnap.empty) {
                const c = custSnap.docs[0].data();
                if (request.service === 'lpo-to-site' || request.service === 'australia post-to-site') {
                  serviceInternalId = c.lpoServiceAMPOInternalID || '';
                  serviceRate = c.lpoServiceAMPORate || '';
                } else if (request.service === 'site-to-lpo' || request.service === 'site-to-australia post') {
                  serviceInternalId = c.lpoServicePMPOInternalID || '';
                  serviceRate = c.lpoServicePMPORate || '';
                } else if (request.service === 'round-trip') {
                  serviceInternalId = c.lpoServiceAMPOPMPOInternalID || '';
                  serviceRate = c.lpoServiceAMPOPMPORate || '';
                }
              }
            }
          } catch (err) {
            console.error("Error fetching customer service metadata:", err);
          }

          setAcceptProgress(35);
          setAcceptStatus("Generating recurring schedule template...");

          // Save template
          const { id: _, ...requestData } = request;
          const templateRef = await addDoc(collection(db, 'scheduled_jobs'), {
            ...requestData,
            parent_id: parentId,
            status: 'scheduled',
            serviceInternalId,
            serviceRate,
            createdAt: new Date(),
            originalRequestId: request.id,
            operatorNetSuiteId: null,
            operatorName: null,
            operatorEmail: null,
            operatorPhone: null
          });
          
          console.log("Created scheduled_jobs template:", templateRef.id);
          finalJobId = templateRef.id;
          
          // Check if today matches frequency to immediately generate first instance
          const todayDayName = getDayName(new Date());
          if (request.date <= today && request.frequency?.includes(todayDayName)) {
            setAcceptProgress(50);
            setAcceptStatus("Creating first job instance...");
            jobDocRef = await addDoc(collection(db, 'jobs'), {
              ...requestData,
              parent_id: parentId,
              status: 'scheduled',
              serviceInternalId,
              serviceRate,
              createdAt: new Date(),
              jobType: 'scheduled_instance',
              scheduledJobId: templateRef.id,
              date: today,
              originalRequestId: request.id,
              operatorNetSuiteId: null,
              operatorName: null,
              operatorEmail: null,
              operatorPhone: null
            });
            console.log("Created immediate job instance:", jobDocRef.id);
            finalJobId = jobDocRef.id;
          }
        } else {
          // Normal one-off job
          // 1.2 Fetch Service Metadata for one-off job
          setAcceptStatus("Fetching customer service metadata...");
          
          try {
            const custQ = query(
              collection(db, `lpo/${parentId}/customers`),
              where('companyName', '==', request.customer.company)
            );
            const custSnap = await getDocs(custQ);
            if (!custSnap.empty) {
              const c = custSnap.docs[0].data();
              if (request.service === 'lpo-to-site' || request.service === 'australia post-to-site') {
                serviceInternalId = c.lpoServiceAMPOInternalID || '';
                serviceRate = c.lpoServiceAMPORate || '';
              } else if (request.service === 'site-to-lpo' || request.service === 'site-to-australia post') {
                serviceInternalId = c.lpoServicePMPOInternalID || '';
                serviceRate = c.lpoServicePMPORate || '';
              } else if (request.service === 'round-trip') {
                serviceInternalId = c.lpoServiceAMPOPMPOInternalID || '';
                serviceRate = c.lpoServiceAMPOPMPORate || '';
              }
            }
          } catch (err) {
            console.error("Error fetching one-off service metadata:", err);
          }

          setAcceptProgress(45);
          setAcceptStatus("Creating job record...");

          const { id: _, ...requestData } = request;
          jobDocRef = await addDoc(collection(db, 'jobs'), {
            ...requestData,
            parent_id: parentId,
            status: 'scheduled',
            serviceInternalId,
            serviceRate,
            createdAt: new Date(),
            originalRequestId: request.id,
            operatorNetSuiteId: null,
            operatorName: null,
            operatorEmail: null,
            operatorPhone: null
          });
          console.log("Created one-off job:", jobDocRef.id);
          finalJobId = jobDocRef.id;
        }

        // 1.5 Sync with NetSuite if same-day job instance was created
        if (request.date === today && jobDocRef) {
          setAcceptProgress(65);
          setAcceptStatus("Syncing instance...");
          const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2650&deploy=1&compid=1048144&ns-at=AAEJ7tMQwOy-VLSQwqUcq11USKGh9PAqMVQtMt6Mu_VXgYTiUyM";
          
          const params = new URLSearchParams({
            job_id: jobDocRef.id,
            billing: request.billing || "",
            customer_id: request.netsuiteCustomerId || request.customer?.netsuiteId || "",
            instructions: request.customer?.instructions || "",
            job_type: request.jobType || "",
            parent_id: parentId,
            request_id: request.id,
            preferred_time: request.preferredTime || "",
            service_name: request.service || "null",
            service_internal_id: serviceInternalId || "null",
            date: request.date || "null",
            service_pmpo_internal_id: request.servicePMPOInternalID || "null",
            service_pmpo_rate: request.servicePMPORate || "null",
            service_ampo_internal_id: request.serviceAMPOInternalID || "null",
            service_ampo_rate: request.serviceAMPORate || "null",
            service_h2h_internal_id: request.serviceH2HInternalID || "null",
            service_h2h_rate: request.serviceH2HRate || "null",
            auspost_first_name: request.auspostContact?.firstName || "null",
            auspost_last_name: request.auspostContact?.lastName || "null",
            auspost_phone: request.auspostContact?.phone || "null",
            auspost_email: request.auspostContact?.email || "null",
            auspost_company: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.company : request.recipient?.company) || "null",
            auspost_address: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.address : request.recipient?.address) || "null",
            auspost_state: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.state : request.recipient?.state) || "null",
            auspost_suburb: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.suburb : request.recipient?.suburb) || "null",
            auspost_postcode: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.postcode : request.recipient?.postcode) || "null",
            auspost_lat: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.coordinates?.lat : request.recipient?.coordinates?.lat)?.toString() || "null",
            auspost_lng: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.coordinates?.lng : request.recipient?.coordinates?.lng)?.toString() || "null",
            is_free_job: isFreeJob.toString()
          });

          try {
            const res = await fetch(`${NETSUITE_API}&${params.toString()}`);
            const data = await res.json();
            console.log("NetSuite Script 2650 Response:", data);
          } catch (err) {
            console.error("NetSuite Script 2650 Error:", err);
          }
        }

        // 1.6 Secondary NetSuite Sync (Confirmation)
        const SECOND_NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2649&deploy=1&compid=1048144&ns-at=AAEJ7tMQX4gDftlZvyZi8scPrWJRKTOWGovx9I5Cz06qXdzpiRU";
        if (finalJobId) {
          setAcceptProgress(85);
          setAcceptStatus("Sending confirmation...");
          const params2649 = new URLSearchParams({
            job_id: finalJobId,
            parent_id: parentId,
            customer_id: netsuiteCustomerId,
            email: request.customer?.email || "",
            firstName: request.customer?.firstName || "",
            service: request.service || "",
            date: request.date || "null",
            frequency: request.jobType === 'scheduled' ? (request.frequency?.join(',') || "null") : "null",
            service_pmpo_internal_id: request.servicePMPOInternalID || "null",
            service_pmpo_rate: request.servicePMPORate || "null",
            service_ampo_internal_id: request.serviceAMPOInternalID || "null",
            service_ampo_rate: request.serviceAMPORate || "null",
            service_h2h_internal_id: request.serviceH2HInternalID || "null",
            service_h2h_rate: request.serviceH2HRate || "null",
            auspost_first_name: request.auspostContact?.firstName || "null",
            auspost_last_name: request.auspostContact?.lastName || "null",
            auspost_phone: request.auspostContact?.phone || "null",
            auspost_email: request.auspostContact?.email || "null",
            auspost_company: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.company : request.recipient?.company) || "null",
            is_free_job: isFreeJob.toString(),
            user_first_name: userData?.first_name || "null",
            user_last_name: userData?.last_name || "null",
            user_email: userData?.email || "null",
            user_phone: userData?.mobile || "null"
          });

          console.log("Triggering NetSuite 2649 with:", Object.fromEntries(params2649));

          try {
            const res = await fetch(`${SECOND_NETSUITE_API}&${params2649.toString()}`);
            const data = await res.json();
            console.log("NetSuite Script 2649 Response:", data);
          } catch (err) {
            console.error("NetSuite Script 2649 Error:", err);
          }
        } else {
          console.warn("NetSuite 2649 not triggered: finalJobId is empty");
        }

        // 2. Update Request Status
        setAcceptProgress(95);
        setAcceptStatus("Finalizing request status...");
        await updateDoc(doc(db, 'requests', request.id), {
          status: 'scheduled'
        });

        // Decrement trial balance for customer job requests
        if (isFreeJob && request.customer_id) {
          try {
            await updateDoc(doc(db, 'companies', request.customer_id), {
              trial_credits_balance: increment(-1)
            });
          } catch (e) {
            console.error("Failed to decrement trial balance:", e);
          }
        }

        setAcceptProgress(100);
        setAcceptStatus("Job accepted successfully!");
        
        setTimeout(() => {
          setIsAccepting(false);
          setAcceptProgress(0);
        }, 2000);
      } catch (err) {
        console.error("Error accepting job:", err);
        alert("Failed to accept job.");
        setIsAccepting(false);
      }
    }
  };

  const handleReject = () => {
    if (!isExternalUser && !isParentUser) return;
    setIsRejectModalOpen(true);
  };

  const submitReject = async () => {
    if (!request) return;
    if (!isParentUser && !isExternalUser) return;
    if (!rejectReason || !rejectNotes.trim()) {
      alert("Please select a reason and provide notes.");
      return;
    }

    try {
      const sysMessage = {
        id: Date.now().toString(),
        sender: 'system',
        text: `Request Declined. Reason: ${rejectReason}. Notes: ${rejectNotes.trim()}`,
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'requests', request.id), {
        status: 'rejected',
        rejectionReason: rejectReason,
        rejectionNotes: rejectNotes.trim(),
        rejectedAt: new Date().toISOString(),
        rejectedBy: isParentUser ? (parent?.id || 'operator') : 'customer',
        chat: arrayUnion(sysMessage)
      });

      // NetSuite Integration for Rejection Alert
      const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2532&deploy=1&compid=1048144&ns-at=AAEJ7tMQboW4e_4uOdEOkAJSDSB2d-67rLJ9FX2eFCl6Rfo5vSY";
      
      const params = new URLSearchParams({
        action: 'reject',
        request_id: request.id,
        customer_id: request.netsuiteCustomerId || request.customer?.netsuiteId || "",
        parent_id: parent?.id || request.parent_id || "",
        reason: rejectReason,
        notes: rejectNotes.trim()
      });

      fetch(`${NETSUITE_API}&${params.toString()}`)
        .then(res => res.json())
        .then(data => console.log("NetSuite Reject Sync:", data))
        .catch(err => console.error("NetSuite Reject Error:", err));

      setIsRejectModalOpen(false);
      setRejectReason('');
      setRejectNotes('');
    } catch (err) {
      console.error("Error rejecting job:", err);
      alert("Failed to reject job.");
    }
  };

  const handleProposeNewTime = async () => {
    if (!request || !id || !proposedTime) return;

    try {
      const sysMessage = {
        id: Date.now().toString(),
        sender: 'system',
        text: `Franchisee proposed a new 'Must be completed by' time: ${proposedTime}`,
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'requests', id), {
        status: 'new-time-proposed',
        preferredTime: proposedTime,
        proposedAt: new Date().toISOString(),
        chat: arrayUnion(sysMessage)
      });

      setIsTimeModalOpen(false);
      setProposedTime('');
      alert("New time proposal sent to operator.");
    } catch (err) {
      console.error("Error proposing new time:", err);
      alert("Failed to send proposal.");
    }
  };

  const handleReprocess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !id) return;
    if (!newDate) {
      alert("Please select a new date.");
      return;
    }

    try {
      const timeMsg = newTime ? ` and time: ${newTime}` : '';
      const sysMessage = {
        id: Date.now().toString(),
        sender: 'system',
        text: `Request reprocessed with new date: ${newDate}${timeMsg}`,
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'requests', id), {
        status: 'pending',
        date: newDate,
        preferredTime: newTime || request.preferredTime,
        reprocessedAt: new Date().toISOString(),
        chat: arrayUnion(sysMessage)
      });
      setNewDate('');
      setNewTime('');
    } catch (err) {
      console.error("Error reprocessing job:", err);
      alert("Failed to reprocess request.");
    }
  };

  if (loading || parentLoading) {
    return <LoadingScreen message="Coordinating Request" />;
  }

  if (error) {
    return (
      <div className="request-page-error">
         <div className="error-card glass">
            <XCircle size={64} color="#ff4757" />
            <h2>Coordination Inactive</h2>
            <p>{error}</p>
            <button onClick={() => window.location.href = '/dashboard'} className="btn-primary">
              GO TO DASHBOARD
            </button>
         </div>
         <style>{`
            .request-page-error { height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--offwhite); padding: 20px; }
            .error-card { text-align: center; padding: 40px; border-radius: 32px; max-width: 500px; }
            .error-card h2 { margin: 24px 0 12px; color: var(--ink); }
            .error-card p { color: var(--ink-soft); margin-bottom: 32px; }
         `}</style>
      </div>
    );
  }

  return (
    <div className="request-page-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      {isAccepting && (
        <AcceptingProgress progress={acceptProgress} statusText={acceptStatus} />
      )}

      <div className=" coordination-container">
        <header className="request-header">
           <button className="back-btn" onClick={() => window.history.back()}>
              <ChevronLeft size={20} />
              <span>Back</span>
           </button>
           <div className="header-main">
              <div className={`status-pill ${request.status}`}>
                {request.status === 'scheduled' ? 'Job Scheduled' : 
                 request.status === 'awaiting-activation' ? 'Awaiting Activation' : 
                 request.status === 'cancelled' ? 'Cancelled' :
                 request.status === 'rejected' ? 'Request Declined' :
                 request.status === 'new-time-proposed' ? 'New Time Proposed' :
                 'Coordination Phase'}
              </div>
              <h1>Job Request Coordination</h1>
              <p>Reference: #{request.id.slice(0, 8).toUpperCase()}</p>
              {request.status === 'awaiting-activation' && (
                <div className="tc-banner fade-in">
                  <div className="tc-icon"><Clock size={16} /></div>
                  <div className="tc-text">
                    <strong>Awaiting T&C:</strong> The system is still waiting for the customer to accept the Terms & Conditions.
                  </div>
                </div>
              )}
           </div>
           
           {(request.status === 'pending' || request.status === 'new-time-proposed' || request.status === 'awaiting-activation') && (
             <div className="operator-actions desktop-only">
               {isParentUser ? (
                 <>
                   <button className="btn-reject" onClick={handleCancelRequest}>
                     <XCircle size={18} /> CANCEL REQUEST
                   </button>
                 </>
               ) : (
                 <>
                   <button className="btn-reject" onClick={handleReject}>
                     <XCircle size={18} /> DECLINE JOB
                   </button>
                   <button className="btn-propose" onClick={() => setIsTimeModalOpen(true)}>
                     <Clock size={18} /> PROPOSE NEW TIME
                   </button>
                   <button 
                     className={`btn-accept ${request.status === 'awaiting-activation' ? 'disabled' : 'shadow-teal'}`} 
                     onClick={handleAccept}
                     title={request.status === 'awaiting-activation' ? "Awaiting Customer T&C Activation" : ""}
                   >
                     <div className="accept-content">
                       <CheckCircle2 size={18} /> 
                       <span>ACCEPT JOB</span>
                     </div>
                     {request.preferredTime && (
                       <div className="btn-badge">Time Priority</div>
                     )}
                   </button>
                 </>
               )}
             </div>
           )}
        </header>

        <div className="request-grid">
           {/* Left: Job Details */}
           <aside className="details-sidebar glass-card">
              <div className="detail-section">
                 <div className="section-title">
                    <Building2 size={18} />
                    <h3>Client Details</h3>
                 </div>
                 <div className="info-box">
                    <div className="info-row">
                       <UserIcon size={14} />
                       <strong>{request.customer.company}</strong>
                    </div>
                    <div className="info-row">
                       <UserIcon size={14} />
                       <span>{request.customer.firstName} {request.customer.lastName}</span>
                    </div>
                    <div className="info-row">
                       <Phone size={14} />
                       <span>{request.customer.phone}</span>
                    </div>
                    <div className="info-row">
                       <Mail size={14} />
                       <span>{request.customer.email}</span>
                    </div>
                 </div>
              </div>

              <div className="detail-section">
                 <div className="section-title">
                    <MapPin size={18} />
                    <h3>Location</h3>
                 </div>
                 <div className="location-card">
                    <p className="address">{request.customer.address}</p>
                    <p className="suburb">{request.customer.suburb}, {request.customer.state} {request.customer.postcode}</p>
                 </div>
              </div>

              <div className="detail-section">
                 <div className="section-title">
                    <Truck size={18} />
                    <h3>Service Logistics</h3>
                 </div>
                 <div className="logistics-grid">
                    <div className="log-item">
                       <label>Service</label>
                       <span>{request.service === 'site-to-australia post' ? 'Site ➔ Australia Post' : request.service === 'australia post-to-site' ? 'Australia Post ➔ Site' : request.service.replace(/-/g, ' ')}</span>
                    </div>
                    <div className="log-item">
                       <label>Billing</label>
                       <span>{request.billing}</span>
                    </div>
                    <div className="log-item">
                       <label>Date</label>
                       <span>{parseLocalDate(request.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    </div>
                    {request.jobType === 'scheduled' && request.frequency && (
                       <div className="log-item">
                          <label>Frequency</label>
                          <span style={{ textTransform: 'capitalize' }}>{request.frequency.join(', ')}</span>
                       </div>
                    )}
                 </div>
                 {request.preferredTime && (
                     <div className="time-highlight-banner">
                        <div className="time-icon-area">
                           <Clock size={20} className="pulse-clock" />
                        </div>
                        <div className="time-text-area">
                           <label>MUST BE COMPLETED BY</label>
                           <span className="time-value">{request.preferredTime}</span>
                        </div>
                     </div>
                  )}
              </div>

              {request.customer.instructions && (
                <div className="detail-section">
                  <div className="section-title">
                    <Clock size={18} />
                    <h3>Instructions</h3>
                  </div>
                  <div className="instructions-box">
                     {request.customer.instructions}
                  </div>
                </div>
              )}
           </aside>

           {/* Right: Chat Coordination */}
           <main className="chat-interface glass-card">
              {isExternalUser && request.status === 'scheduled' && !isHistory && (
                 <div className="guest-connection-banner fade-in">
                    <div className="banner-icon pulse">
                       <Zap size={18} />
                    </div>
                    <div className="banner-text">
                       <strong>Keep this page open!</strong>
                       <p>We'll notify you here with a sound when the Parent Account responds.</p>
                    </div>
                    {Notification.permission !== 'granted' && (
                       <button className="btn-enable-alerts" onClick={async () => {
                          const token = await requestNotificationPermission();
                          if (token && id) {
                             await saveTokenToFirestore(token, 'customer', id);
                             alert("Notifications enabled! You'll get popups even if you're in another tab.");
                          }
                       }}>
                          ENABLE ALERTS
                       </button>
                    )}
                 </div>
              )}

              {request.status === 'rejected' && (
                 <div className="rejection-banner-inline">
                    <div className="banner-top">
                       <XCircle size={20} color="#ff4757" />
                       <h4>Request Declined</h4>
                    </div>
                    <div className="banner-body">
                       <div className="banner-item">
                          <label>Reason</label>
                          <span>{request.rejectionReason || 'Other'}</span>
                       </div>
                       {request.rejectionNotes && (
                          <div className="banner-item">
                             <label>Notes</label>
                             <p>{request.rejectionNotes}</p>
                          </div>
                       )}
                    </div>
                    
                    {!isParentUser && !isHistory && (
                       <div className="reprocess-mini">
                          <button className="btn-show-reprocess" onClick={() => {
                             // Toggle a local state or just scroll to a form
                             const el = document.getElementById('reprocess-form-anchor');
                             el?.scrollIntoView({ behavior: 'smooth' });
                          }}>
                             PROPOSE NEW TIME
                          </button>
                       </div>
                    )}
                 </div>
              )}

              <div className="chat-header">
                 <MessageSquare size={20} />
                 <h2>Coordination Chat</h2>
                 <span className="live-indicator">{isHistory ? 'ARCHIVED' : 'LIVE'}</span>
              </div>

              <div className="chat-messages">
                 {(!request.chat || request.chat.length === 0) ? (
                    <div className="empty-chat">
                       <MessageSquare size={48} />
                       <p>Start the coordination by sending a message.</p>
                       <span className="hint">Questions about timing, access, or billing can be discussed here.</span>
                    </div>
                 ) : (
                    request.chat.map((msg: any, idx: number) => {
                       if (msg.sender === 'system') {
                          return (
                             <div key={idx} className="system-message">
                                <div className="system-message-content">
                                   <span className="system-icon"><Clock size={14} /></span>
                                   {msg.text}
                                </div>
                                <div className="message-time">
                                   {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                             </div>
                          );
                       }
                       return (
                          <div key={idx} className={`message-bubble ${msg.sender}`}>
                             <div className="sender-label">{msg.sender === 'operator' ? 'Parent' : 'Franchisee'}</div>
                             <div className="message-content">{msg.text}</div>
                             <div className="message-time">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </div>
                          </div>
                       );
                    })
                 )}
                 <div ref={chatEndRef} />
              </div>

              {isHistory ? (
                <div className="history-notice">
                   <Clock size={16} />
                   <span>This job has moved to history. Chat is now read-only.</span>
                </div>
              ) : (
                <form className="chat-input-area" onSubmit={handleSendMessage}>
                   <input 
                     type="text" 
                     placeholder="Type your message here..."
                     value={message}
                     onChange={(e) => setMessage(e.target.value)}
                   />
                   <button type="submit" className="send-btn" disabled={!message.trim()}>
                      <Send size={18} />
                   </button>
                </form>
              )}

              {request.status === 'rejected' && !isParentUser && !isHistory && (
                 <div id="reprocess-form-anchor" className="reprocess-section-inline">
                    <div className="reprocess-header">
                       <h3>Submit a new proposed time</h3>
                       <p>If you'd like the operator to review this again, pick a new date and time.</p>
                    </div>
                    <form className="reprocess-form" onSubmit={handleReprocess}>
                       <div className="form-row">
                          <div className="input-group">
                             <label>New Date</label>
                             <div className="custom-reprocess-date">
                                <CustomDatePicker 
                                   value={newDate}
                                   onChange={(val) => setNewDate(val)}
                                   min={formatDateForInput(new Date())}
                                />
                             </div>
                          </div>
                          <div className="input-group">
                             <label>Preferred Time</label>
                             <input 
                                type="time" 
                                value={newTime}
                                onChange={(e) => setNewTime(e.target.value)}
                             />
                          </div>
                       </div>
                       <button type="submit" className="btn-reprocess">
                          RESUBMIT REQUEST
                       </button>
                    </form>
                 </div>
              )}
           </main>
        </div>
      </div>

       {(request.status === 'pending' || request.status === 'new-time-proposed' || request.status === 'awaiting-activation') && (
        <div className="mobile-operator-actions mobile-only">
          <div className="actions-container">
            {isParentUser ? (
              <>
                <button className="btn-reject" style={{ width: '100%' }} onClick={handleCancelRequest}>
                  <XCircle size={18} /> CANCEL REQUEST
                </button>
              </>
            ) : (
              <>
                <button className="btn-reject" onClick={handleReject}>
                  <XCircle size={18} /> DECLINE
                </button>
                <button className="btn-propose-mobile" onClick={() => setIsTimeModalOpen(true)}>
                  <Clock size={18} /> PROPOSE TIME
                </button>
                <button 
                  className={`btn-accept ${request.status === 'awaiting-activation' ? 'disabled' : 'shadow-teal'}`} 
                  onClick={handleAccept}
                >
                  <CheckCircle2 size={18} /> 
                  <span>ACCEPT</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {isRejectModalOpen && (
        <div className="modal-overlay">
           <div className="modal-content">
              <div className="modal-header">
                 <h3>Decline Job Request</h3>
                 <button className="close-btn" onClick={() => setIsRejectModalOpen(false)}>
                    <XCircle size={24} />
                 </button>
              </div>
              <div className="modal-body">
                 <div className="input-group">
                    <label>Reason for declining <span style={{color: '#ff4757'}}>*</span></label>
                    <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
                       <option value="">-- Select a reason --</option>
                       <option value="No Capacity Today">No Capacity Today</option>
                       <option value="Outside Territory">Outside Territory</option>
                       <option value="Vehicle Breakdown">Vehicle Breakdown</option>
                       <option value="Service Not Offered">Service Not Offered</option>
                       {isExternalUser && <option value="Unsuitable Time">Unsuitable Time</option>}
                       {isExternalUser && <option value="Found Other Provider">Found Other Provider</option>}
                       <option value="Other">Other</option>
                    </select>
                 </div>
                 <div className="input-group">
                    <label>Additional Notes <span style={{color: '#ff4757'}}>*</span></label>
                    <textarea 
                       placeholder={isParentUser ? "Please provide details for the Franchisee and dispatch team..." : "Please let us know why you are declining this request..."}
                       value={rejectNotes}
                       onChange={(e) => setRejectNotes(e.target.value)}
                    />
                 </div>
              </div>
              <div className="modal-actions">
                 <button className="btn-cancel" onClick={() => setIsRejectModalOpen(false)}>CANCEL</button>
                 <button className="btn-confirm-reject" onClick={submitReject}>CONFIRM DECLINE</button>
              </div>
           </div>
        </div>
      )}

      {isTimeModalOpen && (
        <div className="modal-overlay">
           <div className="modal-content">
              <div className="modal-header">
                 <h3>Propose New Time</h3>
                 <button className="close-btn" onClick={() => setIsTimeModalOpen(false)}>
                    <XCircle size={24} />
                 </button>
              </div>
              <div className="modal-body">
                 <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: '10px' }}>
                   If you can't make the requested time, please suggest a new "Must be completed by" time for the operator to review.
                 </p>
                 <div className="input-group">
                    <label>Proposed Completion Time</label>
                    <input 
                       type="time" 
                       value={proposedTime}
                       onChange={(e) => setProposedTime(e.target.value)}
                    />
                 </div>
              </div>
              <div className="modal-actions">
                 <button className="btn-cancel" onClick={() => setIsTimeModalOpen(false)}>CANCEL</button>
                 <button className="btn-confirm-time shadow-teal" onClick={handleProposeNewTime} disabled={!proposedTime}>
                   SUBMIT PROPOSAL
                 </button>
              </div>
           </div>
        </div>
      )}

      <style>{`
        .request-page-premium { min-height: 100vh; background: var(--offwhite); padding: 40px 24px; position: relative; overflow-x: hidden; }
        .mesh-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; filter: blur(100px); opacity: 0.5; }
        .blob { position: absolute; border-radius: 50%; width: 600px; height: 600px; background: var(--cream-warm); }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -100px; left: -100px; background: var(--cream-warm); }

        .coordination-container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; }

        .request-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .back-btn { display: flex; align-items: center; gap: 8px; background: transparent; border: none; color: var(--ink-soft); font-weight: 700; cursor: pointer; }
        .header-main h1 { font-family: var(--font-headings); font-size: 2rem; font-weight: 400; color: var(--ink); margin: 8px 0 4px; letter-spacing: -0.025em; }
        .header-main p { font-weight: 500; color: var(--ink-soft); font-family: var(--font-ui); font-size: 0.75rem; letter-spacing: 0.05em; }
        .status-pill { display: inline-block; padding: 4px 12px; borderRadius: 20px; font-family: var(--font-ui); font-size: 0.65rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; }
        .status-pill.pending { background: var(--cream-warm); color: var(--gold); }
        .tc-banner { margin-top: 12px; display: inline-flex; align-items: center; gap: 10px; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); padding: 10px 16px; border-radius: 12px; color: #b38600; font-family: var(--font-ui); font-size: 0.8rem; }
        .tc-icon { display: flex; align-items: center; }

        .operator-actions { display: flex; gap: 12px; }
        .btn-reject { background: white; color: #ff4757; border: 1px solid #ffdada; padding: 12px 24px; border-radius: 14px; font-weight: 800; display: flex; align-items: center; gap: 10px; cursor: pointer; }
        
        .request-grid { display: grid; grid-template-columns: 350px 1fr; gap: 32px; }

        .glass-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 32px; padding: 32px; }
        
        .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; color: var(--ink); }
        .section-title h3 { font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; margin: 0; text-transform: uppercase; letter-spacing: 0.16em; }

        .info-box { background: var(--paper); padding: 16px; border-radius: 16px; display: flex; flex-direction: column; gap: 10px; }
        .info-row { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: var(--ink-soft); }
        .info-row strong { color: var(--ink); }

        .location-card { background: var(--paper); padding: 16px; border-radius: 16px; }
        .location-card .address { font-weight: 700; color: var(--ink); margin-bottom: 4px; }
        .location-card .suburb { font-size: 0.8rem; color: var(--ink-soft); font-weight: 600; }

        .logistics-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-bottom: 20px; }
        .log-item { display: flex; flex-direction: column; gap: 4px; }
        .log-item label { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 500; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.16em; }
        .log-item span { font-weight: 700; color: var(--ink); font-size: 0.9rem; }

        .time-highlight-banner { 
           background: var(--cream-warm); 
           border: 1px solid var(--gold); 
           border-radius: 16px; 
           padding: 16px; 
           display: flex; 
           align-items: center; 
           gap: 16px; 
           margin-top: 4px;
           box-shadow: 0 4px 12px rgba(168, 118, 58, 0.1);
         }
         .time-icon-area { 
           width: 40px; 
           height: 40px; 
           background: var(--gold); 
           color: white; 
           border-radius: 12px; 
           display: flex; 
           align-items: center; 
           justify-content: center; 
         }
         .pulse-clock { animation: clockPulse 2s infinite; }
         @keyframes clockPulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
         
         .time-text-area { display: flex; flex-direction: column; gap: 2px; }
         .time-text-area label { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 900; color: var(--gold); letter-spacing: 0.5px; }
         .time-value { font-size: 1.3rem; font-weight: 900; color: var(--ink); letter-spacing: -0.5px; }

         .btn-accept.disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }
         .btn-accept { position: relative; overflow: visible; display: flex; flex-direction: column; align-items: center; padding: 12px 24px; min-width: 160px; background: var(--ink); color: white; border: none; border-radius: 14px; font-weight: 800; cursor: pointer; transition: all 0.2s; }
         .accept-content { display: flex; align-items: center; gap: 8px; }
          .btn-badge { 
            position: absolute; 
            top: -10px; 
            right: -10px; 
            background: var(--gold); 
            color: white; 
            font-family: var(--font-ui);
            font-size: 0.55rem; 
            font-weight: 500; 
            padding: 4px 10px; 
            border-radius: 20px; 
            box-shadow: 0 4px 10px rgba(168, 118, 58, 0.3);
            text-transform: uppercase;
            letter-spacing: 0.16em;
            border: 2px solid var(--offwhite);
          }

         .btn-propose { background: var(--cream-warm); color: var(--gold); border: 1px solid var(--gold); padding: 12px 20px; border-radius: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; cursor: pointer; }
         .btn-propose-mobile { background: var(--cream-warm); color: var(--gold); border: 1px solid var(--gold); padding: 12px 10px; border-radius: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px; }
         .btn-confirm-time { background: var(--ink); color: white; border: none; }
         .btn-confirm-time:disabled { opacity: 0.5; }
         
         .status-pill.new-time-proposed { background: #e3f2fd; color: #1976d2; }

         .instructions-box { background: var(--cream-warm); padding: 16px; border-radius: 16px; font-size: 0.85rem; color: var(--ink-soft); font-weight: 600; line-height: 1.5; border-left: 4px solid var(--gold); }

        .chat-interface { flex: 1; display: flex; flex-direction: column; min-height: 500px; padding: 0 !important; overflow: hidden; }
        .chat-header { display: flex; align-items: center; gap: 12px; margin: 32px 32px 24px; }
        .live-indicator { font-family: var(--font-ui); background: var(--cream-warm); color: var(--gold); font-size: 0.55rem; font-weight: 500; padding: 2px 8px; border-radius: 50px; letter-spacing: 0.16em; }

        .chat-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; padding-right: 15px; }
        .message-bubble { max-width: 80%; padding: 16px; border-radius: 20px; position: relative; }
        .message-bubble.user { align-self: flex-start; background: var(--paper); color: var(--ink-soft); border-bottom-left-radius: 4px; }
        .message-bubble.operator { align-self: flex-end; background: var(--ink); color: white; border-bottom-right-radius: 4px; }

        .sender-label { font-size: 0.65rem; font-weight: 800; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; }
        .message-content { font-weight: 600; font-size: 0.95rem; line-height: 1.4; }
        .message-time { font-size: 0.6rem; opacity: 0.5; margin-top: 6px; text-align: right; }

        .chat-input-area { display: flex; gap: 12px; background: var(--paper); padding: 8px; border-radius: 20px; border: 1px solid var(--cream-warm); }
        .chat-input-area input { flex: 1; border: none; padding: 12px 16px; font-weight: 500; font-size: 0.95rem; background: transparent; color: var(--ink); }
        .chat-input-area input:focus { outline: none; }
        .send-btn { background: var(--ink); color: white; border: none; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .send-btn:hover { transform: scale(1.05); }

         .empty-chat { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--ink-soft); gap: 12px; }
         .empty-chat p { font-weight: 600; margin: 0; color: var(--ink); }
         .empty-chat .hint { font-size: 0.8rem; }
         
         .system-message { display: flex; flex-direction: column; align-items: center; margin: 16px 0; }
         .system-message-content { background: var(--cream-warm); color: var(--ink-soft); font-size: 0.8rem; padding: 6px 12px; border-radius: 12px; display: flex; align-items: center; gap: 6px; font-weight: 500; }

        .request-page-loading { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--ink-soft); opacity: 0.6; }

        .mobile-only { display: none; }
        .desktop-only { display: flex; }

        /* Rejection View Styles */
        .rejection-view { padding: 20px; display: flex; flex-direction: column; gap: 24px; height: 100%; overflow-y: auto; }
        .rejection-header { text-align: center; margin-bottom: 10px; }
        .rejection-header h2 { color: var(--ink); margin: 16px 0 8px; font-size: 1.5rem; }
        .rejection-header p { color: var(--ink-soft); font-weight: 500; font-size: 0.9rem; }
        .rejection-details { display: flex; flex-direction: column; gap: 16px; background: var(--cream-warm); padding: 20px; border-radius: 20px; }
        .rejection-item label { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.1em; display: block; margin-bottom: 8px; }
        .reason-pill { display: inline-block; background: #ff4757; color: white; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; }
        .notes-box { background: white; padding: 16px; border-radius: 12px; color: var(--ink); font-weight: 500; font-size: 0.95rem; border: 1px solid rgba(0,0,0,0.05); }
        .reprocess-section { margin-top: 10px; padding-top: 24px; border-top: 1px dashed rgba(0,0,0,0.1); }
        .reprocess-section h3 { color: var(--ink); font-size: 1.1rem; margin-bottom: 6px; }
        .reprocess-section p { color: var(--ink-soft); font-size: 0.85rem; font-weight: 500; margin-bottom: 16px; }
        .reprocess-form { display: flex; flex-direction: column; gap: 16px; }
        .form-row { display: flex; gap: 16px; }
        .input-group { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .input-group label { font-size: 0.75rem; font-weight: 700; color: var(--ink); text-transform: uppercase; }
        .input-group input, .input-group select, .input-group textarea { padding: 12px; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; background: white; font-family: var(--font-ui); font-size: 0.9rem; }
        .btn-reprocess { background: var(--gold); color: white; border: none; padding: 14px; border-radius: 14px; font-weight: 800; font-size: 0.9rem; cursor: pointer; display: flex; justify-content: center; transition: all 0.2s; }
        .btn-reprocess:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(168, 118, 58, 0.3); }

        /* Modal Styles */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-content { background: white; width: 100%; max-width: 500px; border-radius: 24px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .modal-header h3 { font-family: var(--font-headings); font-size: 1.5rem; color: var(--ink); margin: 0; }
        .close-btn { background: transparent; border: none; cursor: pointer; color: var(--ink-soft); padding: 4px; display: flex; }
        .modal-body { display: flex; flex-direction: column; gap: 20px; margin-bottom: 32px; }
        .modal-body select, .modal-body textarea { width: 100%; padding: 14px; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; font-family: var(--font-ui); font-size: 0.95rem; background: var(--offwhite); }
        .modal-body select:focus, .modal-body textarea:focus { outline: none; border-color: var(--ink); }
        .modal-body textarea { min-height: 100px; resize: vertical; }
        .modal-actions { display: flex; gap: 12px; }
        .modal-actions button { flex: 1; padding: 14px; border-radius: 14px; font-weight: 800; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
        .btn-cancel { background: transparent; border: 1px solid rgba(0,0,0,0.1); color: var(--ink); }
        .btn-confirm-reject { background: #ff4757; border: none; color: white; }
        .btn-confirm-reject:hover { background: #ff2a3f; }

        @media (max-width: 900px) {
           .request-page-premium { padding: 24px 16px 120px; }
           .request-grid { grid-template-columns: 1fr; }
           .details-sidebar { order: 2; }
           .chat-interface { order: 1; min-height: 600px; margin-bottom: 32px; }
           .request-header { flex-direction: column; align-items: flex-start; gap: 20px; margin-bottom: 32px; }
           .header-main h1 { font-size: 1.5rem; }
           
           .desktop-only { display: none !important; }
           .mobile-only { display: block; }

           .mobile-operator-actions { 
             position: fixed; 
             bottom: 0; 
             left: 0; 
             right: 0; 
             background: rgba(255, 255, 255, 0.9); 
             backdrop-filter: blur(10px); 
             padding: 20px; 
             border-top: 1px solid rgba(26, 61, 51, 0.1); 
             z-index: 1000; 
             box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.05);
           }
           .actions-container { 
             max-width: 600px; 
             margin: 0 auto; 
             display: flex; 
             gap: 12px; 
           }
           .actions-container button { flex: 1; min-width: 0; }
           .btn-accept { padding: 12px 16px; }
           .btn-reject { padding: 12px 16px; justify-content: center; }
        }

        /* New Inline Styles */
        .guest-connection-banner { background: var(--ink); color: white; margin: 20px; padding: 16px 20px; border-radius: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 8px 24px rgba(26,61,51,0.15); border: 1px solid rgba(255,255,255,0.1); }
        .banner-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--gold); flex-shrink: 0; }
        .banner-text { flex: 1; }
        .banner-text strong { display: block; font-size: 0.95rem; margin-bottom: 2px; }
        .banner-text p { margin: 0; font-size: 0.75rem; opacity: 0.7; font-weight: 500; }
        .btn-enable-alerts { background: var(--gold); color: var(--ink); border: none; padding: 10px 16px; border-radius: 12px; font-size: 0.75rem; font-weight: 800; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .btn-enable-alerts:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(234,240,68,0.3); }
        
        .pulse { animation: pulse-shadow 2s infinite; }
        @keyframes pulse-shadow {
           0% { box-shadow: 0 0 0 0 rgba(234,240,68, 0.4); }
           70% { box-shadow: 0 0 0 10px rgba(234,240,68, 0); }
           100% { box-shadow: 0 0 0 0 rgba(234,240,68, 0); }
        }

        .rejection-banner-inline { background: #fff5f5; border: 1px solid #ffe3e3; border-radius: 20px; padding: 20px; margin: 20px; display: flex; flex-direction: column; gap: 12px; }
        .banner-top { display: flex; align-items: center; gap: 8px; }
        .banner-top h4 { margin: 0; color: #ff4757; font-size: 1rem; }
        .banner-body { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; }
        .banner-item label { display: block; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 4px; }
        .banner-item span { font-weight: 700; color: var(--ink); }
        .banner-item p { margin: 0; font-size: 0.85rem; color: var(--ink-soft); font-weight: 500; }
        .reprocess-mini { margin-top: 4px; }
        .btn-show-reprocess { background: var(--ink); color: white; border: none; padding: 8px 16px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
        .reprocess-section-inline { padding: 32px; border-top: 1px dashed rgba(0,0,0,0.1); background: var(--offwhite); }
        .reprocess-header h3 { margin: 0 0 4px; font-size: 1.1rem; }
        .reprocess-header p { margin: 0 0 20px; font-size: 0.85rem; color: var(--ink-soft); font-weight: 500; }
        .history-notice { display: flex; align-items: center; justify-content: center; gap: 10px; background: var(--cream-warm); color: var(--gold); padding: 16px; border-radius: 20px; margin: 0 20px 20px; font-size: 0.85rem; font-weight: 600; }
      `}</style>
    </div>
  );
};

export default RequestPage;
