import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Calendar,
  Clock,
  PackageCheck,
  Scale,
  LogOut,
  Building2,
  Briefcase,
  ArrowLeft,
  Eye,
  FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  orderBy,
  query,
  addDoc,
  serverTimestamp,
  where,
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import { compressImage } from '../../utils/imageCompression';
import {
  TARGET_COMPANY_ID,
  fetchTargetCompanyName,
  formatOperatorServiceName,
  isCompany1868657ParentViewer,
} from '../../utils/operatorAccess';
import LoadingScreen from '../../components/LoadingScreen';
import './ProofUploadPage.css';

interface SubcustomerRecord {
  id: string;
  companyName: string;
  suburb?: string;
  state?: string;
  address?: string;
  serviceList?: Array<{ id?: string; name?: string; label?: string; rate?: string }>;
  services?: Array<{ id?: string; name?: string; label?: string; rate?: string }>;
  lpoServiceAMPOInternalID?: string;
  lpoServicePMPOInternalID?: string;
  lpoServiceAMPOPMPOInternalID?: string;
  [key: string]: unknown;
}

interface ServiceOption {
  id: string;
  name: string;
  displayName: string;
}

interface RecentUploadItem {
  id: string;
  subcustomerName: string;
  serviceName: string;
  proofType: 'pod' | 'excess_weight';
  deliveryDate: string;
  deliveryTime: string;
  imageUrls: string[];
  notes?: string | null;
  excessWeightQty?: number | null;
  excessWeightTotalIncGst?: number | null;
}

const EXCESS_WEIGHT_RATE_INC_GST = 3.85;
const EXCESS_WEIGHT_UNIT_KG = 16;

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentTimeString(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function extractCustomerServices(customer: SubcustomerRecord): ServiceOption[] {
  const services: ServiceOption[] = [];
  const rawList = customer.serviceList || customer.services;

  if (Array.isArray(rawList) && rawList.length > 0) {
    rawList.forEach((s, idx) => {
      const rawName = (s.name || s.label || '').toString().trim();
      if (!rawName) return;
      services.push({
        id: (s.id || `svc_${idx}`).toString(),
        name: rawName,
        displayName: formatOperatorServiceName(rawName),
      });
    });
  }

  if (services.length === 0) {
    if (customer.lpoServiceAMPOInternalID && customer.lpoServiceAMPOInternalID !== 'null') {
      services.push({
        id: customer.lpoServiceAMPOInternalID,
        name: 'AMPO',
        displayName: formatOperatorServiceName('AMPO'),
      });
    }
    if (customer.lpoServicePMPOInternalID && customer.lpoServicePMPOInternalID !== 'null') {
      services.push({
        id: customer.lpoServicePMPOInternalID,
        name: 'site-to-lpo',
        displayName: formatOperatorServiceName('site-to-lpo'),
      });
    }
    if (customer.lpoServiceAMPOPMPOInternalID && customer.lpoServiceAMPOPMPOInternalID !== 'null') {
      services.push({
        id: customer.lpoServiceAMPOPMPOInternalID,
        name: 'round-trip',
        displayName: formatOperatorServiceName('round-trip'),
      });
    }
  }

  return services;
}

const ProofUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, userData, isAdmin } = useLpo();

  const [companyName, setCompanyName] = useState<string>('');
  const [subcustomers, setSubcustomers] = useState<SubcustomerRecord[]>([]);
  const [loadingSubcustomers, setLoadingSubcustomers] = useState(true);
  const [subcustomerSearch, setSubcustomerSearch] = useState('');
  const [selectedSubcustomerId, setSelectedSubcustomerId] = useState('');

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<string>(getTodayDateString);
  const [deliveryTime, setDeliveryTime] = useState<string>(getCurrentTimeString);
  const [proofType, setProofType] = useState<'pod' | 'excess_weight'>('pod');
  const [excessWeightQty, setExcessWeightQty] = useState<number>(1);
  const [notes, setNotes] = useState('');

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [recentUploads, setRecentUploads] = useState<RecentUploadItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const canViewProofs = isCompany1868657ParentViewer(userData, isAdmin);

  useEffect(() => {
    fetchTargetCompanyName().then(setCompanyName);

    const fetchSubcustomers = async () => {
      setLoadingSubcustomers(true);
      try {
        const q = query(
          collection(db, `companies/${TARGET_COMPANY_ID}/customers`),
          orderBy('companyName', 'asc')
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          companyName: (d.data().companyName || d.data().name || 'Unnamed Customer').toString(),
          ...d.data(),
        })) as SubcustomerRecord[];
        setSubcustomers(list);
      } catch (err) {
        console.error('Error loading subcustomers:', err);
        setUploadError('Failed to load subcustomers. Please refresh and try again.');
      } finally {
        setLoadingSubcustomers(false);
      }
    };

    fetchSubcustomers();
  }, []);

  const fetchRecentUploads = async () => {
    if (!user?.uid) return;
    try {
      const q = query(
        collection(db, `companies/${TARGET_COMPANY_ID}/proof_uploads`),
        where('uploadedByUid', '==', user.uid),
        limit(10)
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            subcustomerName: data.subcustomerName || 'Unknown',
            serviceName: data.serviceName || 'N/A',
            proofType: data.proofType || 'pod',
            deliveryDate: data.deliveryDate || '',
            deliveryTime: data.deliveryTime || '',
            imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
            notes: data.notes || null,
            excessWeightQty: typeof data.excessWeightQty === 'number' ? data.excessWeightQty : null,
            excessWeightTotalIncGst:
              typeof data.excessWeightTotalIncGst === 'number' ? data.excessWeightTotalIncGst : null,
            createdAtMs: data.createdAt?.toMillis?.() || 0,
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      setRecentUploads(items);
    } catch (err) {
      console.error('Error loading recent uploads:', err);
    }
  };

  useEffect(() => {
    fetchRecentUploads();
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      filePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [filePreviews]);

  const filteredSubcustomers = useMemo(() => {
    const term = subcustomerSearch.trim().toLowerCase();
    if (!term) return subcustomers;
    return subcustomers.filter((c) => {
      const name = (c.companyName || '').toLowerCase();
      const suburb = (c.suburb || '').toLowerCase();
      const id = (c.id || '').toLowerCase();
      return name.includes(term) || suburb.includes(term) || id.includes(term);
    });
  }, [subcustomers, subcustomerSearch]);

  const selectedSubcustomer = useMemo(
    () => subcustomers.find((c) => c.id === selectedSubcustomerId) || null,
    [subcustomers, selectedSubcustomerId]
  );

  const availableServices = useMemo(() => {
    if (!selectedSubcustomer) return [];
    return extractCustomerServices(selectedSubcustomer);
  }, [selectedSubcustomer]);

  useEffect(() => {
    if (availableServices.length === 1) {
      setSelectedServiceId(availableServices[0].id);
    } else {
      setSelectedServiceId('');
    }
  }, [selectedSubcustomerId, availableServices]);

  const selectedService = useMemo(
    () => availableServices.find((s) => s.id === selectedServiceId) || null,
    [availableServices, selectedServiceId]
  );

  const handleFilesAdded = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const imageFiles = Array.from(filesList).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setUploadError('Only image files are supported.');
      return;
    }
    setUploadError(null);
    const newPreviews = imageFiles.map((f) => URL.createObjectURL(f));
    setSelectedFiles((prev) => [...prev, ...imageFiles]);
    setFilePreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveFile = (index: number) => {
    URL.revokeObjectURL(filePreviews[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setSuccessMessage(null);

    if (!selectedSubcustomer) {
      setUploadError('Please select a subcustomer.');
      return;
    }
    if (availableServices.length > 0 && !selectedService) {
      setUploadError('Please select a service.');
      return;
    }
    if (!deliveryDate || !deliveryTime) {
      setUploadError('Please choose both the date and time.');
      return;
    }
    if (proofType === 'excess_weight' && (!Number.isFinite(excessWeightQty) || excessWeightQty < 1)) {
      setUploadError('Please enter a valid excess weight quantity (minimum 1).');
      return;
    }
    if (selectedFiles.length === 0) {
      setUploadError('Please select or capture at least one image.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);

    try {
      const uploadedFiles: Array<{
        url: string;
        storagePath: string;
        name: string;
        size: number;
      }> = [];

      const timestamp = Date.now();
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const compressedBlob = await compressImage(file);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `proof_uploads/${TARGET_COMPANY_ID}/${selectedSubcustomer.id}/${proofType}/${timestamp}_${i}_${safeName}.jpg`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, compressedBlob, {
          contentType: 'image/jpeg',
        });
        const downloadUrl = await getDownloadURL(storageRef);

        uploadedFiles.push({
          url: downloadUrl,
          storagePath,
          name: file.name,
          size: compressedBlob.size,
        });

        setUploadProgress(Math.round(15 + ((i + 1) / selectedFiles.length) * 75));
      }

      const proofTimestamp = new Date(`${deliveryDate}T${deliveryTime}:00`).toISOString();
      const serviceName = selectedService?.displayName || selectedService?.name || 'General Service';
      const serviceId = selectedService?.id || 'general';

      const isExcessWeight = proofType === 'excess_weight';
      const normalizedQty = isExcessWeight ? Math.max(1, Math.floor(excessWeightQty)) : null;
      const totalIncGst =
        isExcessWeight && normalizedQty !== null
          ? Number((normalizedQty * EXCESS_WEIGHT_RATE_INC_GST).toFixed(2))
          : null;

      await addDoc(collection(db, `companies/${TARGET_COMPANY_ID}/proof_uploads`), {
        companyId: TARGET_COMPANY_ID,
        companyName: companyName || null,
        subcustomerId: selectedSubcustomer.id,
        subcustomerName: selectedSubcustomer.companyName,
        serviceId,
        serviceName,
        serviceRawName: selectedService?.name || serviceName,
        deliveryDate,
        deliveryTime,
        proofTimestamp,
        proofType,
        excessWeightQty: normalizedQty,
        excessWeightUnitKg: isExcessWeight ? EXCESS_WEIGHT_UNIT_KG : null,
        excessWeightRateIncGst: isExcessWeight ? EXCESS_WEIGHT_RATE_INC_GST : null,
        excessWeightTotalIncGst: totalIncGst,
        files: uploadedFiles,
        imageUrls: uploadedFiles.map((f) => f.url),
        notes: notes.trim() || null,
        uploadedByUid: user?.uid || null,
        uploadedByEmail: userData?.email || user?.email || '',
        uploadedByName:
          userData?.first_name && userData?.last_name
            ? `${userData.first_name} ${userData.last_name}`
            : userData?.email || user?.email || 'Operator',
        uploadedByRole: userData?.role || 'operator',
        createdAt: serverTimestamp(),
      });

      setUploadProgress(100);
      setSuccessMessage(
        `${proofType === 'pod' ? 'Proof of Delivery' : 'Proof of Excess Weight'} uploaded for ${selectedSubcustomer.companyName}.`
      );

      filePreviews.forEach((url) => URL.revokeObjectURL(url));
      setSelectedFiles([]);
      setFilePreviews([]);
      setNotes('');
      setExcessWeightQty(1);
      await fetchRecentUploads();
    } catch (err: unknown) {
      console.error('Upload error:', err);
      const e = err as { message?: string };
      setUploadError(e.message || 'Failed to upload proof images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/operator/signin');
  };

  if (loadingSubcustomers) {
    return <LoadingScreen message="Loading Subcustomers..." />;
  }

  const brandInitials = (companyName || 'LM')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="proof-portal">
      {/* Top Bar */}
      <header className="proof-topbar">
        <div className="proof-topbar-inner">
          <div className="proof-brand">
            <div className="proof-brand-mark" aria-hidden="true">
              {brandInitials}
            </div>
            <div>
              <h1 className="proof-brand-title">
                {companyName || 'Proof Upload'}
              </h1>
              <div className="proof-brand-meta">
                Proof Upload • Signed in as {userData?.email || user?.email}
              </div>
            </div>
          </div>

          <div className="proof-topbar-actions">
            {canViewProofs && (
              <button
                type="button"
                className="proof-nav-btn"
                onClick={() => navigate('/proofs')}
              >
                <Eye size={15} />
                <span>View Proofs</span>
              </button>
            )}
            {userData?.role !== 'operator' && (
              <button
                type="button"
                className="proof-nav-btn"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft size={15} />
                <span>Dashboard</span>
              </button>
            )}
            <button
              type="button"
              className="proof-nav-btn proof-nav-btn--danger"
              onClick={handleLogout}
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Column Workspace */}
      <main className="proof-workspace">
        <section className="proof-panel" aria-label="Upload proof form">
          <h2 className="proof-panel-heading">Submit Proof Evidence</h2>
          <form onSubmit={handleSubmit} className="proof-form">
            {uploadError && (
              <div className="proof-alert proof-alert--error" role="alert">
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{uploadError}</span>
              </div>
            )}

            {successMessage && (
              <div className="proof-alert proof-alert--success" role="status">
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Subcustomer */}
            <div className="proof-field-group">
              <label htmlFor="subcustomer-select" className="proof-label">
                <span className="proof-label-left">
                  <Building2 size={16} />
                  <span>Subcustomer</span>
                </span>
                <span className="proof-label-hint">{filteredSubcustomers.length} available</span>
              </label>

              <div className="proof-search-wrap">
                <Search size={16} className="proof-search-icon" />
                <input
                  type="text"
                  className="proof-input proof-input--with-icon"
                  placeholder="Filter subcustomers by name or suburb..."
                  value={subcustomerSearch}
                  onChange={(e) => setSubcustomerSearch(e.target.value)}
                  aria-label="Filter subcustomers"
                />
              </div>

              <select
                id="subcustomer-select"
                className="proof-select"
                value={selectedSubcustomerId}
                onChange={(e) => setSelectedSubcustomerId(e.target.value)}
                required
              >
                <option value="">Select a subcustomer...</option>
                {filteredSubcustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                    {c.suburb ? ` (${c.suburb})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Service */}
            {selectedSubcustomer && (
              <div className="proof-field-group">
                <div className="proof-label">
                  <span className="proof-label-left">
                    <Briefcase size={16} />
                    <span>Service</span>
                  </span>
                </div>

                {availableServices.length > 0 ? (
                  <div className="proof-service-grid">
                    {availableServices.map((svc) => {
                      const isSelected = selectedServiceId === svc.id;
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          className={`proof-choice-btn ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setSelectedServiceId(svc.id)}
                        >
                          {svc.displayName}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="proof-empty-recent" style={{ textAlign: 'left', padding: '12px 14px' }}>
                    No specific services configured — upload will be recorded under{' '}
                    <strong>General Service</strong>.
                  </div>
                )}
              </div>
            )}

            {/* Date & Time */}
            <div className="proof-field-group">
              <div className="proof-label">
                <span className="proof-label-left">
                  <Calendar size={16} />
                  <span>Delivery / Proof Date &amp; Time</span>
                </span>
              </div>
              <div className="proof-datetime-grid">
                <div>
                  <label htmlFor="proof-date" className="proof-sublabel">
                    Date
                  </label>
                  <input
                    id="proof-date"
                    type="date"
                    className="proof-input"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="proof-time" className="proof-sublabel">
                    <Clock size={13} />
                    <span>Time</span>
                  </label>
                  <input
                    id="proof-time"
                    type="time"
                    className="proof-input"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Proof Type */}
            <div className="proof-field-group">
              <div className="proof-label">
                <span>Proof Type</span>
              </div>
              <div className="proof-type-grid">
                <button
                  type="button"
                  className={`proof-type-card ${proofType === 'pod' ? 'is-pod' : ''}`}
                  onClick={() => setProofType('pod')}
                >
                  <PackageCheck size={22} style={{ flexShrink: 0 }} />
                  <div>
                    <div className="proof-type-title">Proof of Delivery</div>
                    <div className="proof-type-desc">Drop-off &amp; signature photos</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`proof-type-card ${proofType === 'excess_weight' ? 'is-excess' : ''}`}
                  onClick={() => setProofType('excess_weight')}
                >
                  <Scale size={22} style={{ flexShrink: 0 }} />
                  <div>
                    <div className="proof-type-title">Proof of Excess Weight</div>
                    <div className="proof-type-desc">A${EXCESS_WEIGHT_RATE_INC_GST.toFixed(2)} inc GST / {EXCESS_WEIGHT_UNIT_KG}kg</div>
                  </div>
                </button>
              </div>

              {proofType === 'excess_weight' && (
                <div className="proof-qty-box">
                  <div className="proof-qty-row">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#7c5220' }}>
                        Quantity (per extra {EXCESS_WEIGHT_UNIT_KG}kg)
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#7c5220', opacity: 0.9, marginTop: '2px' }}>
                        A${EXCESS_WEIGHT_RATE_INC_GST.toFixed(2)} (inc GST) per unit
                      </div>
                    </div>

                    <div className="proof-stepper">
                      <button
                        type="button"
                        className="proof-stepper-btn"
                        aria-label="Decrease quantity"
                        onClick={() => setExcessWeightQty((q) => Math.max(1, q - 1))}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        className="proof-stepper-input"
                        aria-label="Excess weight quantity"
                        value={excessWeightQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setExcessWeightQty(Number.isNaN(val) ? 1 : Math.max(1, val));
                        }}
                        required
                      />
                      <button
                        type="button"
                        className="proof-stepper-btn"
                        aria-label="Increase quantity"
                        onClick={() => setExcessWeightQty((q) => q + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="proof-qty-summary">
                    <span>
                      {excessWeightQty} × {EXCESS_WEIGHT_UNIT_KG}kg ({excessWeightQty * EXCESS_WEIGHT_UNIT_KG}kg extra)
                    </span>
                    <span>
                      Total: A${(excessWeightQty * EXCESS_WEIGHT_RATE_INC_GST).toFixed(2)} (inc GST)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Images */}
            <div className="proof-field-group">
              <div className="proof-label">
                <span>Evidence Photos</span>
                {selectedFiles.length > 0 && (
                  <span className="proof-label-hint">{selectedFiles.length} selected</span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }}
              />

              <div
                className={`proof-dropzone ${isDragOver ? 'is-dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  handleFilesAdded(e.dataTransfer.files);
                }}
              >
                <div className="proof-capture-grid">
                  <button
                    type="button"
                    className="proof-capture-btn proof-capture-btn--primary"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={18} />
                    <span>Take Photo</span>
                  </button>

                  <button
                    type="button"
                    className="proof-capture-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={18} />
                    <span>Choose Images</span>
                  </button>
                </div>

                {filePreviews.length > 0 && (
                  <div className="proof-previews">
                    {filePreviews.map((src, idx) => (
                      <div key={idx} className="proof-preview-item">
                        <img src={src} alt={`Selected proof ${idx + 1}`} />
                        <button
                          type="button"
                          className="proof-preview-remove"
                          onClick={() => handleRemoveFile(idx)}
                          aria-label={`Remove image ${idx + 1}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="proof-field-group">
              <label htmlFor="proof-notes" className="proof-label">
                <span className="proof-label-left">
                  <FileText size={15} />
                  <span>Notes (Optional)</span>
                </span>
              </label>
              <textarea
                id="proof-notes"
                rows={2}
                className="proof-textarea"
                placeholder="Consignment #, delivery location, or weight notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {isUploading && (
              <div>
                <div
                  style={{
                    height: '7px',
                    borderRadius: '999px',
                    background: 'var(--cream-warm, #F0EDE4)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${uploadProgress}%`,
                      background: 'var(--sidebar-bg, #095c7b)',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--ink-soft, #2A4E43)',
                    marginTop: '6px',
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Compressing &amp; uploading images… {uploadProgress}%
                </div>
              </div>
            )}

            <button type="submit" disabled={isUploading} className="proof-submit-btn">
              {isUploading
                ? 'Uploading…'
                : `Submit ${proofType === 'pod' ? 'Proof of Delivery' : 'Proof of Excess Weight'}`}
            </button>
          </form>
        </section>

        {/* Right Column: Live Summary + Recent Submissions */}
        <aside className="proof-sidebar-stack" aria-label="Submission summary and recent uploads">
          <div className="proof-sidebar-panel">
            <h2 className="proof-sidebar-title">Submission Summary</h2>
            <div className="proof-summary-rows">
              <div className="proof-summary-row">
                <span className="proof-summary-key">Subcustomer</span>
                <span className="proof-summary-val">
                  {selectedSubcustomer ? selectedSubcustomer.companyName : 'Not selected'}
                </span>
              </div>
              <div className="proof-summary-row">
                <span className="proof-summary-key">Service</span>
                <span className="proof-summary-val">
                  {selectedService ? selectedService.displayName : 'General Service'}
                </span>
              </div>
              <div className="proof-summary-row">
                <span className="proof-summary-key">Date &amp; Time</span>
                <span className="proof-summary-val">
                  {deliveryDate} {deliveryTime}
                </span>
              </div>
              <div className="proof-summary-row">
                <span className="proof-summary-key">Proof Type</span>
                <span className="proof-summary-val">
                  {proofType === 'pod' ? 'Proof of Delivery' : 'Proof of Excess Weight'}
                </span>
              </div>
              {proofType === 'excess_weight' && (
                <div className="proof-summary-row">
                  <span className="proof-summary-key">Excess Charge</span>
                  <span className="proof-summary-val" style={{ color: '#7c5220' }}>
                    {excessWeightQty} × {EXCESS_WEIGHT_UNIT_KG}kg (A$
                    {(excessWeightQty * EXCESS_WEIGHT_RATE_INC_GST).toFixed(2)})
                  </span>
                </div>
              )}
              <div className="proof-summary-row">
                <span className="proof-summary-key">Photos</span>
                <span className="proof-summary-val">{selectedFiles.length} attached</span>
              </div>
            </div>
          </div>

          <div className="proof-sidebar-panel">
            <h2 className="proof-sidebar-title">Your Recent Uploads</h2>
            {recentUploads.length === 0 ? (
              <div className="proof-empty-recent">
                Submitted Proof of Delivery and Excess Weight records will appear here for quick confirmation.
              </div>
            ) : (
              <div className="proof-recent-list">
                {recentUploads.map((item) => (
                  <div key={item.id} className="proof-recent-item">
                    <div className="proof-recent-top">
                      <div className="proof-recent-name">{item.subcustomerName}</div>
                      <span
                        className={`proof-badge ${
                          item.proofType === 'pod' ? 'proof-badge--pod' : 'proof-badge--excess'
                        }`}
                      >
                        {item.proofType === 'pod' ? 'POD' : 'Excess Weight'}
                      </span>
                    </div>
                    <div className="proof-recent-meta">
                      {item.serviceName} • {item.deliveryDate} {item.deliveryTime} • {item.imageUrls.length}{' '}
                      {item.imageUrls.length === 1 ? 'photo' : 'photos'}
                    </div>
                    {item.proofType === 'excess_weight' && item.excessWeightQty ? (
                      <div className="proof-recent-meta" style={{ fontWeight: 700, color: '#7c5220' }}>
                        Qty: {item.excessWeightQty} × {EXCESS_WEIGHT_UNIT_KG}kg • A$
                        {(
                          item.excessWeightTotalIncGst ??
                          item.excessWeightQty * EXCESS_WEIGHT_RATE_INC_GST
                        ).toFixed(2)}{' '}
                        inc GST
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default ProofUploadPage;
