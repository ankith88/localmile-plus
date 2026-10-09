import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Camera, 
  Trash2, 
  Download, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  ShieldCheck,
  FileImage,
  RefreshCw,
  Plus
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { useLpo } from '../context/LpoContext';
import { getDisplayServiceName } from '../utils/serviceHelpers';

export interface PodFile {
  id: string;
  url: string;
  storagePath?: string;
  name: string;
  size?: number;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByRole?: string;
}

export interface JobPodTarget {
  id: string;
  status?: string;
  date?: string;
  customer?: {
    company?: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    suburb?: string;
    state?: string;
    [key: string]: unknown;
  };
  service?: string;
  stops?: Array<{
    address?: string;
    suburb?: string;
    status?: string;
    [key: string]: unknown;
  }>;
  podFiles?: PodFile[];
  podUrls?: string[];
  podNotes?: string | null;
  podUploadedAt?: string;
  podUploadedBy?: string;
  [key: string]: unknown;
}

interface ProofOfDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobPodTarget | null;
  onSuccess?: (updatedJob: JobPodTarget) => void;
}

// Client-side image compression to ensure smooth, fast uploads under any network condition
const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1920;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => resolve(blob || file),
            'image/jpeg',
            0.85
          );
        } else {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ProofOfDeliveryModal: React.FC<ProofOfDeliveryModalProps> = ({
  isOpen,
  onClose,
  job,
  onSuccess
}) => {
  const { isAdmin, userData, user } = useLpo();
  
  // Pending files for upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<string>(job?.podNotes || '');
  const [markCompleted, setMarkCompleted] = useState<boolean>(job?.status !== 'completed');
  const [prevJobId, setPrevJobId] = useState<string | null>(job?.id || null);

  // Upload state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Viewing state
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync state when a different job is loaded
  if (job && job.id !== prevJobId) {
    setPrevJobId(job.id);
    setDeliveryNotes(job.podNotes || '');
    setMarkCompleted(job.status !== 'completed');
    setActivePhotoIndex(0);
    setSelectedFiles([]);
    setFilePreviews([]);
    setUploadError(null);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Normalize existing POD files from job
  const existingPodFiles: PodFile[] = React.useMemo(() => {
    if (!job) return [];
    if (Array.isArray(job.podFiles) && job.podFiles.length > 0) {
      return job.podFiles;
    }
    if (Array.isArray(job.podUrls) && job.podUrls.length > 0) {
      return job.podUrls.map((url: string, idx: number) => ({
        id: `legacy_${idx}`,
        url,
        name: `Delivery Photo ${idx + 1}`,
        uploadedAt: job.podUploadedAt || (job.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        uploadedBy: job.podUploadedBy || 'Admin'
      }));
    }
    return [];
  }, [job]);

  // Clean up object URLs when selected files change
  useEffect(() => {
    return () => {
      filePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [filePreviews]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (fullscreenImage) {
          setFullscreenImage(null);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' && existingPodFiles.length > 1) {
        setActivePhotoIndex(prev => (prev > 0 ? prev - 1 : existingPodFiles.length - 1));
      } else if (e.key === 'ArrowRight' && existingPodFiles.length > 1) {
        setActivePhotoIndex(prev => (prev < existingPodFiles.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, fullscreenImage, existingPodFiles.length, onClose]);

  if (!isOpen || !job) return null;

  const handleFilesAdded = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const newFiles = Array.from(filesList).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) {
      alert("Please select valid image files (JPG, PNG, WEBP).");
      return;
    }

    const newPreviews = newFiles.map(file => URL.createObjectURL(file));
    setSelectedFiles(prev => [...prev, ...newFiles]);
    setFilePreviews(prev => [...prev, ...newPreviews]);
  };

  const handleRemovePendingFile = (index: number) => {
    URL.revokeObjectURL(filePreviews[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadPod = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select or capture at least one picture to upload.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(10);

    const uploadedPodFiles: PodFile[] = [...existingPodFiles];
    const userEmail = userData?.email || user?.email || 'admin@mailplus.com.au';
    const userRole = userData?.role || (isAdmin ? 'admin' : 'user');

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(Math.round(15 + ((i + 1) / selectedFiles.length) * 70));

        // 1. Compress image
        const compressedBlob = await compressImage(file);

        // 2. Upload to Firebase Storage
        const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `proof_of_delivery/${job.id}/${Date.now()}_${i}_${cleanName}`;
        let downloadUrl = '';

        try {
          const storageReference = ref(storage, storagePath);
          await uploadBytes(storageReference, compressedBlob, {
            contentType: 'image/jpeg',
            customMetadata: {
              jobId: job.id,
              uploadedBy: userEmail,
              originalName: file.name
            }
          });
          downloadUrl = await getDownloadURL(storageReference);
        } catch (storageErr: unknown) {
          console.warn("Direct Firebase Storage upload encountered issue, checking base64 fallback:", storageErr);
          // Fallback: convert compressed blob to data URL if storage rules reject
          if (compressedBlob.size < 500000) {
            downloadUrl = await new Promise((res) => {
              const r = new FileReader();
              r.onloadend = () => res(r.result as string);
              r.readAsDataURL(compressedBlob);
            });
          } else {
            throw storageErr;
          }
        }

        uploadedPodFiles.push({
          id: `pod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url: downloadUrl,
          storagePath,
          name: file.name,
          size: compressedBlob.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userEmail,
          uploadedByRole: userRole
        });
      }

      setUploadProgress(90);

      // 3. Update Firestore job document
      const collectionName = 'jobs';
      const jobDocRef = doc(db, collectionName, job.id);

      const updatePayload: Record<string, unknown> = {
        podFiles: uploadedPodFiles,
        podUrls: uploadedPodFiles.map(f => f.url),
        hasPod: true,
        podNotes: deliveryNotes.trim() || job.podNotes || null,
        podUploadedAt: new Date().toISOString(),
        podUploadedBy: userEmail,
        updatedAt: serverTimestamp()
      };

      if (markCompleted && job.status !== 'completed') {
        updatePayload.status = 'completed';
        // Also update stops status if present
        if (Array.isArray(job.stops)) {
          updatePayload.stops = job.stops.map((s: Record<string, unknown>) => ({ ...s, status: 'completed' }));
        }
      }

      await updateDoc(jobDocRef, updatePayload);

      setUploadProgress(100);

      const updatedJob = {
        ...job,
        ...updatePayload,
        updatedAt: new Date()
      };

      // Reset local state
      setSelectedFiles([]);
      setFilePreviews([]);
      if (onSuccess) {
        onSuccess(updatedJob);
      }
    } catch (err: unknown) {
      console.error("Error uploading POD:", err);
      const errMsg = err instanceof Error ? err.message : "Failed to upload Proof of Delivery. Please check network/storage connection.";
      setUploadError(errMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: PodFile) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to delete this Proof of Delivery photo (${photo.name})?`)) {
      return;
    }

    setDeletingId(photo.id);
    try {
      // 1. Delete from Firebase Storage if storagePath exists
      if (photo.storagePath) {
        try {
          const fileRef = ref(storage, photo.storagePath);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Storage deletion warning (file may already be removed):", storageErr);
        }
      }

      // 2. Remove from Firestore
      const updatedPodFiles = existingPodFiles.filter(p => p.id !== photo.id);
      const collectionName = 'jobs';
      const jobDocRef = doc(db, collectionName, job.id);

      const updatePayload: Record<string, unknown> = {
        podFiles: updatedPodFiles,
        podUrls: updatedPodFiles.map(f => f.url),
        hasPod: updatedPodFiles.length > 0,
        updatedAt: serverTimestamp()
      };

      await updateDoc(jobDocRef, updatePayload);

      if (activePhotoIndex >= updatedPodFiles.length && updatedPodFiles.length > 0) {
        setActivePhotoIndex(updatedPodFiles.length - 1);
      }

      const updatedJob = {
        ...job,
        ...updatePayload,
        updatedAt: new Date()
      };

      if (onSuccess) {
        onSuccess(updatedJob);
      }
    } catch (err: unknown) {
      console.error("Error deleting photo:", err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      alert("Failed to delete photo: " + errMsg);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (photoUrl: string, filename: string = 'proof_of_delivery.jpg') => {
    try {
      const a = document.createElement('a');
      a.href = photoUrl;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(photoUrl, '_blank');
    }
  };

  const deliveryAddress = job.customer?.address 
    ? `${job.customer.address}, ${job.customer.suburb} ${job.customer.state || ''}`
    : (job.stops && job.stops.length > 0 ? `${job.stops[job.stops.length - 1].address || ''} ${job.stops[job.stops.length - 1].suburb || ''}` : 'Location provided in job');

  const customerName = job.customer?.company || job.customer?.firstName 
    ? `${job.customer.firstName || ''} ${job.customer.lastName || ''}`.trim() 
    : 'Customer';

  return (
    <div className="modal-overlay active">
      <div className="modal-content glass-card fade-in pod-modal-container">
        
        {/* Modal Header */}
        <div className="modal-header pod-modal-header">
          <div className="pod-header-left">
            <div className="pod-icon-shield">
              <ShieldCheck size={24} className="icon-emerald" />
            </div>
            <div>
              <div className="pod-badge-verified">
                <CheckCircle2 size={13} />
                <span>PROOF OF DELIVERY (POD)</span>
              </div>
              <h2 className="pod-title">{customerName}</h2>
              <div className="pod-subtext">Job Ref: <strong>{job.id}</strong> &bull; {job.date}</div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} disabled={isUploading}>
            <X size={22} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body pod-modal-body">

          {/* Job Overview Card */}
          <div className="pod-info-card">
            <div className="pod-info-row">
              <div className="pod-info-col">
                <span className="info-label"><MapPin size={13} /> Destination</span>
                <span className="info-val">{deliveryAddress}</span>
              </div>
              <div className="pod-info-col">
                <span className="info-label"><Clock size={13} /> Service Type</span>
                <span className="info-val">{getDisplayServiceName(job.service || '', false)}</span>
              </div>
              <div className="pod-info-col">
                <span className="info-label"><CheckCircle2 size={13} /> Job Status</span>
                <span className={`status-pill status-${job.status || 'scheduled'}`}>{(job.status || 'scheduled').toUpperCase()}</span>
              </div>
            </div>

            {(job.podNotes || deliveryNotes) && (
              <div className="pod-notes-box">
                <span className="notes-heading">Delivery Remark / Instructions:</span>
                <p className="notes-text">{job.podNotes || deliveryNotes}</p>
              </div>
            )}
          </div>

          {/* GALLERY SECTION (Visible to both Admins and Actual Users) */}
          {existingPodFiles.length > 0 ? (
            <div className="pod-gallery-section">
              <div className="gallery-header">
                <div className="gallery-count">
                  <Camera size={16} />
                  <span>Delivery Photos ({existingPodFiles.length})</span>
                </div>
                {existingPodFiles[activePhotoIndex] && (
                  <div className="photo-actions">
                    <button 
                      className="btn-action-ghost" 
                      onClick={() => handleDownload(existingPodFiles[activePhotoIndex].url, `POD_${job.id}_${activePhotoIndex + 1}.jpg`)}
                      title="Download image"
                    >
                      <Download size={14} /> Download
                    </button>
                    <button 
                      className="btn-action-ghost" 
                      onClick={() => setFullscreenImage(existingPodFiles[activePhotoIndex].url)}
                      title="View full screen"
                    >
                      <ExternalLink size={14} /> Zoom Fullscreen
                    </button>
                    {isAdmin && (
                      <button 
                        className="btn-action-ghost text-danger" 
                        onClick={() => handleDeletePhoto(existingPodFiles[activePhotoIndex])}
                        disabled={deletingId === existingPodFiles[activePhotoIndex].id}
                        title="Delete photo (Admin only)"
                      >
                        {deletingId === existingPodFiles[activePhotoIndex].id ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />} Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Main Featured Photo Viewer */}
              <div className="pod-main-viewer">
                {existingPodFiles.length > 1 && (
                  <button 
                    className="nav-arrow left" 
                    onClick={() => setActivePhotoIndex(prev => prev > 0 ? prev - 1 : existingPodFiles.length - 1)}
                    title="Previous photo"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}

                <div 
                  className="main-image-wrapper"
                  onClick={() => setFullscreenImage(existingPodFiles[activePhotoIndex].url)}
                  title="Click to zoom in full resolution"
                >
                  <img 
                    src={existingPodFiles[activePhotoIndex].url} 
                    alt={`Proof of Delivery ${activePhotoIndex + 1}`} 
                    className="featured-pod-image"
                  />
                  <div className="zoom-hint">Click image to enlarge</div>
                </div>

                {existingPodFiles.length > 1 && (
                  <button 
                    className="nav-arrow right" 
                    onClick={() => setActivePhotoIndex(prev => prev < existingPodFiles.length - 1 ? prev + 1 : 0)}
                    title="Next photo"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </div>

              {/* Photo Meta and Indicator */}
              <div className="photo-meta-bar">
                <span className="photo-counter">Photo {activePhotoIndex + 1} of {existingPodFiles.length}</span>
                {existingPodFiles[activePhotoIndex].uploadedAt && (
                  <span className="photo-time">
                    Uploaded {new Date(existingPodFiles[activePhotoIndex].uploadedAt).toLocaleString()}
                    {existingPodFiles[activePhotoIndex].uploadedBy && ` by ${existingPodFiles[activePhotoIndex].uploadedBy}`}
                  </span>
                )}
              </div>

              {/* Thumbnails Filmstrip */}
              {existingPodFiles.length > 1 && (
                <div className="pod-thumbnails-strip">
                  {existingPodFiles.map((photo, idx) => (
                    <div 
                      key={photo.id || idx}
                      className={`thumb-box ${idx === activePhotoIndex ? 'active' : ''}`}
                      onClick={() => setActivePhotoIndex(idx)}
                    >
                      <img src={photo.url} alt={`Thumbnail ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // No POD uploaded yet
            !isAdmin && (
              <div className="pod-empty-state">
                <div className="empty-icon-wrap">
                  <FileImage size={40} className="icon-soft" />
                </div>
                <h3>Proof of Delivery Pending</h3>
                <p>The delivery photos have not yet been uploaded for this job. Once the driver or dispatch team uploads proof of delivery, it will appear here immediately.</p>
              </div>
            )
          )}

          {/* ADMIN UPLOAD SECTION (Admins & Superadmins only) */}
          {isAdmin && (
            <div className="admin-upload-card">
              <div className="admin-card-header">
                <div className="admin-header-title">
                  <Upload size={18} className="icon-emerald" />
                  <h3>{existingPodFiles.length > 0 ? "Upload Additional POD Photos" : "Upload Proof of Delivery"}</h3>
                </div>
                <span className="admin-badge">Admin Feature</span>
              </div>

              {/* Hidden file & camera inputs */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => handleFilesAdded(e.target.files)} 
                accept="image/*" 
                multiple 
                style={{ display: 'none' }} 
              />
              <input 
                type="file" 
                ref={cameraInputRef} 
                onChange={(e) => handleFilesAdded(e.target.files)} 
                accept="image/*" 
                capture="environment" 
                style={{ display: 'none' }} 
              />

              {/* Drag and Drop Zone */}
              <div 
                className="dropzone-area"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFilesAdded(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="dropzone-content">
                  <div className="upload-circle">
                    <Upload size={24} />
                  </div>
                  <div className="dropzone-text">
                    <strong>Drag and drop photos here</strong>, or click to browse
                  </div>
                  <div className="dropzone-sub">
                    Supports high-res JPG, PNG, WEBP &bull; Auto-optimized for instant client access
                  </div>
                  
                  <div className="dropzone-buttons" onClick={(e) => e.stopPropagation()}>
                    <button 
                      type="button" 
                      className="btn-select-photos"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus size={15} /> Choose Photos
                    </button>
                    <button 
                      type="button" 
                      className="btn-take-photo"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera size={15} /> Take Photo (Camera)
                    </button>
                  </div>
                </div>
              </div>

              {/* Pending Selected Files Preview */}
              {selectedFiles.length > 0 && (
                <div className="pending-files-section">
                  <div className="pending-header">
                    <span>{selectedFiles.length} {selectedFiles.length === 1 ? 'photo' : 'photos'} ready to upload:</span>
                  </div>
                  <div className="pending-grid">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="pending-file-item">
                        <img src={filePreviews[idx]} alt={file.name} className="pending-thumb" />
                        <div className="pending-info">
                          <span className="file-name" title={file.name}>{file.name}</span>
                          <span className="file-size">{formatFileSize(file.size)}</span>
                        </div>
                        <button 
                          className="btn-remove-pending"
                          onClick={() => handleRemovePendingFile(idx)}
                          title="Remove file"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery Remarks & Completion Checkbox */}
              <div className="admin-form-row">
                <div className="input-group">
                  <label htmlFor="pod-notes">Delivery Notes / Remarks (Optional)</label>
                  <input 
                    id="pod-notes"
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="e.g. Left with reception desk / Delivered to front door safe place"
                    className="styled-input"
                  />
                </div>

                {job.status !== 'completed' && (
                  <div className="checkbox-row">
                    <label className="styled-checkbox-label">
                      <input 
                        type="checkbox"
                        checked={markCompleted}
                        onChange={(e) => setMarkCompleted(e.target.checked)}
                      />
                      <span>Mark job status as <strong>Completed</strong> upon upload</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Upload Progress & Errors */}
              {isUploading && (
                <div className="upload-progress-box">
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                  <div className="progress-text">
                    <RefreshCw size={14} className="spin" />
                    <span>Compressing & uploading photos... {uploadProgress}%</span>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="upload-error-box">
                  <AlertCircle size={16} />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Submit Upload Button */}
              <div className="admin-actions-footer">
                <button 
                  type="button" 
                  className="btn-upload-submit"
                  onClick={handleUploadPod}
                  disabled={selectedFiles.length === 0 || isUploading}
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={18} className="spin" />
                      <span>Uploading Proof of Delivery...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Upload & Save Proof of Delivery ({selectedFiles.length})</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="modal-footer pod-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isUploading}>
            Close
          </button>
        </div>

      </div>

      {/* Fullscreen Image Lightbox Modal */}
      {fullscreenImage && (
        <div className="fullscreen-lightbox" onClick={() => setFullscreenImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={fullscreenImage} alt="Proof of Delivery Fullscreen" className="lightbox-img" />
            <button className="lightbox-close" onClick={() => setFullscreenImage(null)}>
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Styled Scoped CSS */}
      <style>{`
        .pod-modal-container {
          max-width: 820px !important;
          width: 95% !important;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          padding: 0 !important;
          overflow: hidden;
          background: #ffffff !important;
          border-radius: 20px !important;
          box-shadow: 0 25px 60px rgba(0,0,0,0.22) !important;
        }

        .pod-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
          background: linear-gradient(to bottom, #ffffff, #fafbfb);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pod-header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .pod-icon-shield {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #059669;
          flex-shrink: 0;
        }

        .pod-badge-verified {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #059669;
          background: rgba(16, 185, 129, 0.08);
          padding: 3px 8px;
          border-radius: 6px;
          margin-bottom: 4px;
        }

        .pod-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--ink, #1a202c);
          margin: 0;
        }

        .pod-subtext {
          font-size: 0.8rem;
          color: #718096;
          margin-top: 2px;
        }

        .pod-modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .pod-info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px 20px;
        }

        .pod-info-row {
          display: grid;
          grid-template-columns: 2fr 1.2fr 1fr;
          gap: 16px;
        }

        @media (max-width: 640px) {
          .pod-info-row {
            grid-template-columns: 1fr;
          }
        }

        .pod-info-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .info-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .info-val {
          font-size: 0.88rem;
          font-weight: 600;
          color: #1e293b;
        }

        .pod-notes-box {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px dashed #cbd5e1;
        }

        .notes-heading {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
          display: block;
          margin-bottom: 4px;
        }

        .notes-text {
          font-size: 0.85rem;
          color: #334155;
          margin: 0;
          line-height: 1.4;
          background: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        /* Gallery Section */
        .pod-gallery-section {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }

        .gallery-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .gallery-count {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 0.95rem;
          color: #1e293b;
        }

        .photo-actions {
          display: flex;
          gap: 8px;
        }

        .btn-action-ghost {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-action-ghost:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .btn-action-ghost.text-danger {
          color: #dc2626;
          background: rgba(220, 38, 38, 0.06);
          border-color: rgba(220, 38, 38, 0.2);
        }

        .btn-action-ghost.text-danger:hover {
          background: rgba(220, 38, 38, 0.12);
        }

        .pod-main-viewer {
          position: relative;
          background: #0f172a;
          border-radius: 12px;
          overflow: hidden;
          min-height: 320px;
          max-height: 480px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .main-image-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: zoom-in;
          position: relative;
        }

        .featured-pod-image {
          max-width: 100%;
          max-height: 480px;
          object-fit: contain;
          transition: transform 0.2s ease;
        }

        .zoom-hint {
          position: absolute;
          bottom: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.6);
          color: #ffffff;
          font-size: 0.72rem;
          padding: 4px 10px;
          border-radius: 20px;
          pointer-events: none;
          backdrop-filter: blur(4px);
        }

        .nav-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.85);
          border: none;
          color: #0f172a;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          transition: all 0.2s;
        }

        .nav-arrow:hover {
          background: #ffffff;
          transform: translateY(-50%) scale(1.1);
        }

        .nav-arrow.left { left: 16px; }
        .nav-arrow.right { right: 16px; }

        .photo-meta-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 4px;
          font-size: 0.78rem;
          color: #64748b;
        }

        .pod-thumbnails-strip {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          overflow-x: auto;
          padding-bottom: 6px;
        }

        .thumb-box {
          width: 68px;
          height: 68px;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          flex-shrink: 0;
          opacity: 0.65;
          transition: all 0.2s;
        }

        .thumb-box:hover {
          opacity: 0.9;
        }

        .thumb-box.active {
          border-color: #10b981;
          opacity: 1;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
        }

        .thumb-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Empty state */
        .pod-empty-state {
          text-align: center;
          padding: 40px 20px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
        }

        .empty-icon-wrap {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
          color: #94a3b8;
        }

        .pod-empty-state h3 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #334155;
          margin-bottom: 8px;
        }

        .pod-empty-state p {
          font-size: 0.85rem;
          color: #64748b;
          max-width: 440px;
          margin: 0 auto;
          line-height: 1.5;
        }

        /* Admin Upload Section */
        .admin-upload-card {
          background: #fafaf9;
          border: 1px solid #e7e5e4;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .admin-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .admin-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .admin-header-title h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #1c1917;
          margin: 0;
        }

        .admin-badge {
          background: #1c1917;
          color: #fafaf9;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 3px 8px;
          border-radius: 6px;
        }

        .dropzone-area {
          border: 2px dashed #cbd5e1;
          border-radius: 14px;
          background: #ffffff;
          padding: 28px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropzone-area:hover {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.02);
        }

        .dropzone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .upload-circle {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }

        .dropzone-text {
          font-size: 0.92rem;
          color: #334155;
        }

        .dropzone-sub {
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .dropzone-buttons {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .btn-select-photos, .btn-take-photo {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-select-photos {
          background: #10b981;
          color: #ffffff;
          border: none;
        }

        .btn-select-photos:hover {
          background: #059669;
        }

        .btn-take-photo {
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
        }

        .btn-take-photo:hover {
          background: #f1f5f9;
        }

        /* Pending files grid */
        .pending-files-section {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
        }

        .pending-header {
          font-size: 0.8rem;
          font-weight: 700;
          color: #475569;
          margin-bottom: 10px;
        }

        .pending-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }

        .pending-file-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 6px 8px;
          position: relative;
        }

        .pending-thumb {
          width: 36px;
          height: 36px;
          border-radius: 6px;
          object-fit: cover;
          flex-shrink: 0;
        }

        .pending-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex: 1;
        }

        .file-name {
          font-size: 0.74rem;
          font-weight: 600;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-size {
          font-size: 0.68rem;
          color: #94a3b8;
        }

        .btn-remove-pending {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-remove-pending:hover {
          color: #ef4444;
        }

        .admin-form-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
          margin-bottom: 6px;
          display: block;
        }

        .styled-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          font-size: 0.85rem;
          color: #1e293b;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }

        .styled-input:focus {
          border-color: #10b981;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
        }

        .styled-checkbox-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.84rem;
          color: #334155;
          cursor: pointer;
        }

        .styled-checkbox-label input {
          accent-color: #10b981;
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .upload-progress-box {
          background: #ffffff;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .progress-bar-bg {
          height: 6px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-bar-fill {
          height: 100%;
          background: #10b981;
          transition: width 0.3s ease;
        }

        .progress-text {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
          color: #059669;
          font-weight: 600;
        }

        .upload-error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .admin-actions-footer {
          display: flex;
          justify-content: flex-end;
        }

        .btn-upload-submit {
          background: #10b981;
          color: #ffffff;
          border: none;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
          transition: all 0.2s;
        }

        .btn-upload-submit:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-1px);
        }

        .btn-upload-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .pod-modal-footer {
          padding: 14px 24px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          justify-content: flex-end;
        }

        /* Lightbox Fullscreen */
        .fullscreen-lightbox {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.92);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .lightbox-content {
          position: relative;
          max-width: 95vw;
          max-height: 95vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .lightbox-img {
          max-width: 95vw;
          max-height: 92vh;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        .lightbox-close {
          position: absolute;
          top: -48px;
          right: 0;
          background: transparent;
          border: none;
          color: #ffffff;
          cursor: pointer;
          padding: 8px;
        }
      `}</style>

    </div>
  );
};

export default ProofOfDeliveryModal;
