import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { UserMetadata } from '../context/LpoContext';
import { getDisplayServiceName } from './serviceHelpers';

export const TARGET_COMPANY_ID = '1868657';

const OPERATOR_SERVICE_LABELS: Record<string, string> = {
  AMPO: 'Post Office to IM',
  H2H: 'IM to Site',
  H2H2: 'Site to IM',
};

export function formatOperatorServiceName(rawName: string): string {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return 'General Service';
  const normalized = trimmed.toUpperCase().replace(/\s+/g, '');
  if (OPERATOR_SERVICE_LABELS[normalized]) {
    return OPERATOR_SERVICE_LABELS[normalized];
  }
  return getDisplayServiceName(trimmed) || trimmed;
}

export async function fetchTargetCompanyName(): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'companies', TARGET_COMPANY_ID));
    if (snap.exists()) {
      const data = snap.data();
      return (data.companyName || data.name || 'Company Portal').toString();
    }
  } catch (err) {
    console.error('Error fetching target company name:', err);
  }
  return 'Company Portal';
}

/**
 * Checks if a user has access to the Company 1868657 Proof Upload page.
 * Access is granted if:
 * 1. User is an admin or superadmin
 * 2. User has role 'operator' or 'parent' with parent_id === '1868657'
 * 3. User's email is in `companies/1868657/proof_upload_access` with active === true
 */
export async function hasCompany1868657UploadAccess(
  userData: UserMetadata | null,
  isAdmin: boolean,
  email?: string | null
): Promise<boolean> {
  if (isAdmin) return true;

  if (
    userData &&
    userData.parent_id === TARGET_COMPANY_ID &&
    ['operator', 'parent'].includes(userData.role)
  ) {
    return true;
  }

  const normalizedEmail = (email || userData?.email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  try {
    const accessDoc = await getDoc(
      doc(db, `companies/${TARGET_COMPANY_ID}/proof_upload_access`, normalizedEmail)
    );
    return accessDoc.exists() && accessDoc.data()?.active === true;
  } catch (err) {
    console.error('Error checking proof_upload_access:', err);
    return false;
  }
}

/**
 * Checks if a user can view uploaded proofs for Company 1868657.
 * True for admins/superadmins or parent-role users linked to 1868657 via parent_id or customer_id.
 */
export function isCompany1868657ParentViewer(
  userData: UserMetadata | null,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (!userData) return false;
  return (
    userData.role === 'parent' &&
    (userData.parent_id === TARGET_COMPANY_ID || userData.customer_id === TARGET_COMPANY_ID)
  );
}

/**
 * Uploads a compressed proof image Blob via the /api/upload-proof-image endpoint
 * to gs://localmile-plus-pod-storage and returns its download URL.
 */
export async function uploadProofBlob(storagePath: string, blob: Blob): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to upload proof images.');
  }

  const idToken = await currentUser.getIdToken();
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read compressed image.'));
    reader.readAsDataURL(blob);
  });

  const response = await fetch('/api/upload-proof-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      storagePath,
      base64Data,
      contentType: blob.type || 'image/jpeg',
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `Upload failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.url;
}
