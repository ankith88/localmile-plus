import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Filter,
  PackageCheck,
  Scale,
  Calendar,
  Clock,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileImage,
  RefreshCw,
  Edit2,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import { compressImage } from '../../utils/imageCompression';
import {
  fetchTargetCompanyName,
  formatOperatorServiceName,
  TARGET_COMPANY_ID,
  uploadProofBlob,
} from '../../utils/operatorAccess';
import LoadingScreen from '../../components/LoadingScreen';
import ExtrasReportPanel from '../../components/ExtrasReportPanel';
import { normalizeExtrasRecord } from '../../utils/extrasReport';

interface ProofFileEntry {
  url: string;
  storagePath?: string;
  name?: string;
  size?: number;
}

interface ProofRecord {
  id: string;
  subcustomerId: string;
  subcustomerName: string;
  serviceId: string;
  serviceName: string;
  deliveryDate: string;
  deliveryTime: string;
  proofTimestamp?: string;
  proofType: 'pod' | 'excess_weight';
  imageUrls: string[];
  files?: ProofFileEntry[];
  notes?: string | null;
  uploadedByEmail?: string;
  uploadedByName?: string;
  excessWeightQty?: number | null;
  excessWeightUnitKg?: number | null;
  excessWeightRateIncGst?: number | null;
  excessWeightTotalIncGst?: number | null;
  createdAtMs: number;
}

const ProofsViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, userData } = useLpo();
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [subcustomerFilter, setSubcustomerFilter] = useState('all');
  const [proofTypeFilter, setProofTypeFilter] = useState<'all' | 'pod' | 'excess_weight'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showExtrasReport, setShowExtrasReport] = useState(false);

  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');

  // Admin Edit/Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingProof, setEditingProof] = useState<ProofRecord | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editProofType, setEditProofType] = useState<'pod' | 'excess_weight'>('pod');
  const [editQty, setEditQty] = useState<number>(1);
  const [editNotes, setEditNotes] = useState('');
  const [editExistingFiles, setEditExistingFiles] = useState<ProofFileEntry[]>([]);
  const [editRemovedStoragePaths, setEditRemovedStoragePaths] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editNewPreviews, setEditNewPreviews] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchProofs = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, `companies/${TARGET_COMPANY_ID}/proof_uploads`),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          subcustomerId: data.subcustomerId || '',
          subcustomerName: data.subcustomerName || 'Unknown Subcustomer',
          serviceId: data.serviceId || '',
          serviceName: formatOperatorServiceName(data.serviceRawName || data.serviceName || 'General Service'),
          deliveryDate: data.deliveryDate || '',
          deliveryTime: data.deliveryTime || '',
          proofTimestamp: data.proofTimestamp || '',
          proofType: data.proofType === 'excess_weight' ? 'excess_weight' : 'pod',
          imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
          files: Array.isArray(data.files) ? data.files : [],
          notes: data.notes || null,
          uploadedByEmail: data.uploadedByEmail || '',
          uploadedByName: data.uploadedByName || data.uploadedByEmail || 'Operator',
          excessWeightQty: typeof data.excessWeightQty === 'number' ? data.excessWeightQty : null,
          excessWeightUnitKg: typeof data.excessWeightUnitKg === 'number' ? data.excessWeightUnitKg : 16,
          excessWeightRateIncGst:
            typeof data.excessWeightRateIncGst === 'number' ? data.excessWeightRateIncGst : 3.85,
          excessWeightTotalIncGst:
            typeof data.excessWeightTotalIncGst === 'number' ? data.excessWeightTotalIncGst : null,
          createdAtMs: data.createdAt?.toMillis?.() || 0,
        } as ProofRecord;
      });
      setProofs(items);
    } catch (err) {
      console.error('Error fetching proof uploads:', err);
      setError('Failed to load uploaded proofs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargetCompanyName().then(setCompanyName);
    fetchProofs();
  }, []);

  const subcustomerOptions = useMemo(() => {
    const map = new Map<string, string>();
    proofs.forEach((p) => {
      if (p.subcustomerId) {
        map.set(p.subcustomerId, p.subcustomerName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [proofs]);

  const filteredProofs = useMemo(() => {
    return proofs.filter((p) => {
      if (subcustomerFilter !== 'all' && p.subcustomerId !== subcustomerFilter) return false;
      if (proofTypeFilter !== 'all' && p.proofType !== proofTypeFilter) return false;
      if (dateFrom && p.deliveryDate && p.deliveryDate < dateFrom) return false;
      if (dateTo && p.deliveryDate && p.deliveryDate > dateTo) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hay = [
          p.subcustomerName,
          p.serviceName,
          p.notes || '',
          p.uploadedByEmail || '',
          p.uploadedByName || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [proofs, subcustomerFilter, proofTypeFilter, dateFrom, dateTo, searchTerm]);

  const stats = useMemo(() => {
    const podCount = filteredProofs.filter((p) => p.proofType === 'pod').length;
    const excessCount = filteredProofs.filter((p) => p.proofType === 'excess_weight').length;
    return {
      total: filteredProofs.length,
      podCount,
      excessCount,
    };
  }, [filteredProofs]);

  const extrasRecords = useMemo(
    () =>
      proofs
        .filter((p) => p.proofType === 'excess_weight')
        .map((p) => normalizeExtrasRecord(p.id, p)),
    [proofs]
  );

  const openLightbox = (images: string[], index: number, title: string) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxTitle(title);
  };

  const closeLightbox = () => {
    setLightboxImages([]);
    setLightboxIndex(0);
    setLightboxTitle('');
  };

  const handleDeleteProof = async (proof: ProofRecord) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      `Delete this ${proof.proofType === 'pod' ? 'Proof of Delivery' : 'Proof of Excess Weight'} for ${proof.subcustomerName}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(proof.id);
    setError(null);
    try {
      const storagePaths = (proof.files || [])
        .map((f) => f.storagePath)
        .filter((p): p is string => Boolean(p));

      await Promise.all(
        storagePaths.map((path) =>
          deleteObject(ref(storage, path)).catch((err) => {
            console.warn('Could not delete storage file:', path, err);
          })
        )
      );

      await deleteDoc(doc(db, `companies/${TARGET_COMPANY_ID}/proof_uploads`, proof.id));
      setProofs((prev) => prev.filter((p) => p.id !== proof.id));
    } catch (err) {
      console.error('Error deleting proof:', err);
      setError('Failed to delete proof record. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const openEditModal = (proof: ProofRecord) => {
    if (!isAdmin) return;
    setEditingProof(proof);
    setEditDate(proof.deliveryDate || '');
    setEditTime(proof.deliveryTime || '');
    setEditProofType(proof.proofType);
    setEditQty(proof.excessWeightQty || 1);
    setEditNotes(proof.notes || '');
    const initialFiles: ProofFileEntry[] =
      proof.files && proof.files.length > 0
        ? proof.files
        : proof.imageUrls.map((url) => ({ url }));
    setEditExistingFiles(initialFiles);
    setEditRemovedStoragePaths([]);
    setEditNewFiles([]);
    setEditNewPreviews([]);
  };

  const closeEditModal = () => {
    editNewPreviews.forEach((url) => URL.revokeObjectURL(url));
    setEditingProof(null);
    setEditNewFiles([]);
    setEditNewPreviews([]);
    setEditRemovedStoragePaths([]);
  };

  const handleRemoveExistingEditFile = (index: number) => {
    const target = editExistingFiles[index];
    if (target?.storagePath) {
      setEditRemovedStoragePaths((prev) => [...prev, target.storagePath!]);
    }
    setEditExistingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddEditFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const imgs = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    const previews = imgs.map((f) => URL.createObjectURL(f));
    setEditNewFiles((prev) => [...prev, ...imgs]);
    setEditNewPreviews((prev) => [...prev, ...previews]);
  };

  const handleRemoveNewEditFile = (index: number) => {
    URL.revokeObjectURL(editNewPreviews[index]);
    setEditNewFiles((prev) => prev.filter((_, i) => i !== index));
    setEditNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProof || !isAdmin) return;
    if (editExistingFiles.length === 0 && editNewFiles.length === 0) {
      alert('At least one proof image is required.');
      return;
    }

    setIsSavingEdit(true);
    setError(null);
    try {
      // Delete removed storage objects
      await Promise.all(
        editRemovedStoragePaths.map((path) =>
          deleteObject(ref(storage, path)).catch((err) => {
            console.warn('Could not delete removed storage file:', path, err);
          })
        )
      );

      // Upload newly added images
      const uploadedNew: ProofFileEntry[] = [];
      const ts = Date.now();
      for (let i = 0; i < editNewFiles.length; i++) {
        const file = editNewFiles[i];
        const compressed = await compressImage(file);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `proof_uploads/${TARGET_COMPANY_ID}/${editingProof.subcustomerId}/${editProofType}/${ts}_edit_${i}_${safeName}.jpg`;
        const url = await uploadProofBlob(storagePath, compressed);
        uploadedNew.push({
          url,
          storagePath,
          name: file.name,
          size: compressed.size,
        });
      }

      const finalFiles = [...editExistingFiles, ...uploadedNew];
      const finalUrls = finalFiles.map((f) => f.url);
      const isExcess = editProofType === 'excess_weight';
      const normalizedQty = isExcess ? Math.max(1, Math.floor(editQty)) : null;
      const totalIncGst =
        isExcess && normalizedQty !== null ? Number((normalizedQty * 3.85).toFixed(2)) : null;
      const proofTimestamp =
        editDate && editTime ? new Date(`${editDate}T${editTime}:00`).toISOString() : editingProof.proofTimestamp || '';

      await updateDoc(doc(db, `companies/${TARGET_COMPANY_ID}/proof_uploads`, editingProof.id), {
        deliveryDate: editDate,
        deliveryTime: editTime,
        proofTimestamp,
        proofType: editProofType,
        excessWeightQty: normalizedQty,
        excessWeightUnitKg: isExcess ? 16 : null,
        excessWeightRateIncGst: isExcess ? 3.85 : null,
        excessWeightTotalIncGst: totalIncGst,
        notes: editNotes.trim() || null,
        files: finalFiles,
        imageUrls: finalUrls,
        updatedAt: serverTimestamp(),
        updatedBy: userData?.email || 'admin',
      });

      setProofs((prev) =>
        prev.map((p) =>
          p.id === editingProof.id
            ? {
                ...p,
                deliveryDate: editDate,
                deliveryTime: editTime,
                proofTimestamp,
                proofType: editProofType,
                excessWeightQty: normalizedQty,
                excessWeightUnitKg: isExcess ? 16 : null,
                excessWeightRateIncGst: isExcess ? 3.85 : null,
                excessWeightTotalIncGst: totalIncGst,
                notes: editNotes.trim() || null,
                files: finalFiles,
                imageUrls: finalUrls,
              }
            : p
        )
      );

      closeEditModal();
    } catch (err) {
      console.error('Error updating proof:', err);
      setError('Failed to update proof record. Please try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading Uploaded Proofs..." />;
  }

  return (
    <div className="page-container fade-in" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: 'var(--ink, #0f172a)' }}>
            Uploaded Proofs{companyName ? ` — ${companyName}` : ''}
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            View Proof of Delivery and Proof of Excess Weight images uploaded by franchisees & operators
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowExtrasReport((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: showExtrasReport ? '1px solid #b45309' : '1px solid #cbd5e1',
                background: showExtrasReport ? '#fef3c7' : '#ffffff',
                color: showExtrasReport ? '#92400e' : '#0f172a',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Scale size={16} />
              <span>{showExtrasReport ? 'Hide Extras Report' : 'Extras Report & Export'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchProofs}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/operator/upload')}
            className="btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Upload size={16} />
            <span>Upload Proof</span>
          </button>
        </div>
      </div>

      {/* Admin & Superadmin Extras Report & Export */}
      {isAdmin && showExtrasReport && (
        <ExtrasReportPanel
          records={extrasRecords}
          externalLoading={loading}
          variant="card"
        />
      )}

      {/* Summary Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div className="card" style={{ padding: '16px', borderRadius: '14px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            Total Submissions
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            {stats.total}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderRadius: '14px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
            Proof of Delivery
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0369a1', marginTop: '4px' }}>
            {stats.podCount}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderRadius: '14px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
            Proof of Excess Weight
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
            {stats.excessCount}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        className="card"
        style={{
          padding: '16px',
          borderRadius: '14px',
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
            Search
          </label>
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
            />
            <input
              type="text"
              placeholder="Customer, service, notes, uploader..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px 9px 32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
            Subcustomer
          </label>
          <select
            value={subcustomerFilter}
            onChange={(e) => setSubcustomerFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
            }}
          >
            <option value="all">All Subcustomers</option>
            {subcustomerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
            <Filter size={13} />
            <span>Proof Type</span>
          </label>
          <select
            value={proofTypeFilter}
            onChange={(e) => setProofTypeFilter(e.target.value as 'all' | 'pod' | 'excess_weight')}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
            }}
          >
            <option value="all">All Types</option>
            <option value="pod">Proof of Delivery</option>
            <option value="excess_weight">Proof of Excess Weight</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
            From Date
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
            To Date
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Proofs List */}
      {filteredProofs.length === 0 ? (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: '16px' }}>
          <FileImage size={40} color="#94a3b8" style={{ marginBottom: '10px' }} />
          <h3 style={{ margin: '0 0 6px', color: '#0f172a' }}>No Uploaded Proofs Found</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
            Adjust your filters or wait for franchisees/operators to submit Proof of Delivery or Excess Weight images.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredProofs.map((proof) => (
            <div
              key={proof.id}
              className="card"
              style={{
                padding: '18px',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      {proof.subcustomerName}
                    </h3>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: proof.proofType === 'pod' ? '#e0f2fe' : '#fef3c7',
                        color: proof.proofType === 'pod' ? '#0369a1' : '#92400e',
                      }}
                    >
                      {proof.proofType === 'pod' ? <PackageCheck size={13} /> : <Scale size={13} />}
                      <span>{proof.proofType === 'pod' ? 'Proof of Delivery' : 'Proof of Excess Weight'}</span>
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '14px',
                      marginTop: '6px',
                      fontSize: '0.84rem',
                      color: '#475569',
                    }}
                  >
                    <span>
                      <strong>Service:</strong> {proof.serviceName}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} />
                      <span>{proof.deliveryDate || 'N/A'}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} />
                      <span>{proof.deliveryTime || 'N/A'}</span>
                    </span>
                    <span>
                      <strong>Uploaded by:</strong> {proof.uploadedByName || proof.uploadedByEmail}
                    </span>
                    {proof.proofType === 'excess_weight' && proof.excessWeightQty ? (
                      <span style={{ color: '#92400e', fontWeight: 700 }}>
                        Qty: {proof.excessWeightQty} × {proof.excessWeightUnitKg || 16}kg (
                        {proof.excessWeightQty * (proof.excessWeightUnitKg || 16)}kg extra) • A$
                        {(
                          proof.excessWeightTotalIncGst ??
                          proof.excessWeightQty * (proof.excessWeightRateIncGst || 3.85)
                        ).toFixed(2)}{' '}
                        inc GST
                      </span>
                    ) : null}
                  </div>
                </div>

                {isAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(proof)}
                      title="Edit proof"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 11px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Edit2 size={14} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProof(proof)}
                      disabled={deletingId === proof.id}
                      title="Delete proof"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 11px',
                        borderRadius: '8px',
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#b91c1c',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: deletingId === proof.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                      <span>{deletingId === proof.id ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  </div>
                )}
              </div>

              {proof.notes && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.86rem',
                    color: '#334155',
                  }}
                >
                  <strong>Notes:</strong> {proof.notes}
                </div>
              )}

              {/* Thumbnails */}
              {proof.imageUrls.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {proof.imageUrls.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        openLightbox(
                          proof.imageUrls,
                          idx,
                          `${proof.subcustomerName} — ${proof.proofType === 'pod' ? 'Proof of Delivery' : 'Excess Weight'}`
                        )
                      }
                      style={{
                        width: '96px',
                        height: '96px',
                        padding: 0,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid #cbd5e1',
                        cursor: 'pointer',
                        background: '#f1f5f9',
                      }}
                    >
                      <img
                        src={url}
                        alt={`Proof ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Admin Edit Modal */}
      {editingProof && isAdmin && (
        <div
          onClick={closeEditModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              width: '100%',
              maxWidth: '580px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '16px',
              padding: '24px',
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Edit Uploaded Proof</h2>
                <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '2px' }}>
                  {editingProof.subcustomerName} • {editingProof.serviceName}
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Time
                  </label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Proof Type
                </label>
                <select
                  value={editProofType}
                  onChange={(e) => setEditProofType(e.target.value as 'pod' | 'excess_weight')}
                  style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                >
                  <option value="pod">Proof of Delivery</option>
                  <option value="excess_weight">Proof of Excess Weight</option>
                </select>
              </div>

              {editProofType === 'excess_weight' && (
                <div style={{ padding: '12px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fcd34d' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '6px' }}>
                    Excess Weight Quantity (A$3.85 inc GST per extra 16kg)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={editQty}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setEditQty(Number.isNaN(v) ? 1 : Math.max(1, v));
                      }}
                      required
                      style={{ width: '100px', padding: '8px', borderRadius: '8px', border: '1px solid #d97706', fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#78350f' }}>
                      {editQty} × 16kg = A${(editQty * 3.85).toFixed(2)} inc GST
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional notes..."
                  style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  Proof Images ({editExistingFiles.length + editNewFiles.length})
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {editExistingFiles.map((f, idx) => (
                    <div key={`ex_${idx}`} style={{ position: 'relative', width: '76px', height: '76px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                      <img src={f.url} alt={`Existing ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingEditFile(idx)}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'rgba(15, 23, 42, 0.8)',
                          color: '#fff',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {editNewPreviews.map((src, idx) => (
                    <div key={`new_${idx}`} style={{ position: 'relative', width: '76px', height: '76px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #095c7b' }}>
                      <img src={src} alt={`New ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => handleRemoveNewEditFile(idx)}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'rgba(15, 23, 42, 0.8)',
                          color: '#fff',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    handleAddEditFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={closeEditModal}
                  style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="btn-primary"
                  style={{ padding: '10px 18px', borderRadius: '8px', fontWeight: 700, cursor: isSavingEdit ? 'not-allowed' : 'pointer' }}
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImages.length > 0 && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.88)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '900px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#ffffff' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {lightboxTitle} ({lightboxIndex + 1} / {lightboxImages.length})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <a
                  href={lightboxImages[lightboxIndex]}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    textDecoration: 'none',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                  }}
                >
                  <Download size={15} />
                  <span>Open / Download</span>
                </a>
                <button
                  type="button"
                  onClick={closeLightbox}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '34px',
                    height: '34px',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {lightboxImages.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length)
                  }
                  style={{
                    position: 'absolute',
                    left: '10px',
                    background: 'rgba(15, 23, 42, 0.7)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <img
                src={lightboxImages[lightboxIndex]}
                alt="Proof full view"
                style={{
                  maxHeight: '78vh',
                  maxWidth: '100%',
                  borderRadius: '12px',
                  objectFit: 'contain',
                  background: '#0f172a',
                }}
              />

              {lightboxImages.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((prev) => (prev + 1) % lightboxImages.length)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'rgba(15, 23, 42, 0.7)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProofsViewerPage;
