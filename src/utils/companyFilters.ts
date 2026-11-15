import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

const INACTIVE_STATUSES = new Set([
  'cancelled',
  'canceled',
  'inactive',
  'lost',
  'declined',
  'suspended',
  'deactivated',
  'archived',
  'deleted',
]);

export interface CompanyOption {
  id: string;
  name: string;
}

/**
 * Returns true if a company or subcustomer document is active (not explicitly
 * disabled or marked with an inactive/cancelled status).
 */
export function isActiveCompanyRecord(data: Record<string, any>): boolean {
  if (data.active === false || data.isActive === false) return false;
  const status = (data.status || data.customerStatus || '').toString().toLowerCase().trim();
  return !INACTIVE_STATUSES.has(status);
}

/**
 * Normalizes a multi-select or single-select parent filter value into concrete
 * selected parent IDs (excluding empty values and `'all'`).
 */
export function getSelectedParentIds(selectedParentId: string | string[]): string[] {
  if (!selectedParentId || selectedParentId === 'all') return [];
  const list = Array.isArray(selectedParentId) ? selectedParentId : [selectedParentId];
  if (list.length === 0 || list.includes('all')) return [];
  return list.filter(Boolean);
}

/**
 * Fetches active subcustomers from `companies/{parentId}/customers` for the
 * given parent company IDs, deduplicated by ID and sorted by name.
 */
export async function fetchCompanySubcustomers(parentIds: string[]): Promise<CompanyOption[]> {
  if (parentIds.length === 0) return [];

  const map = new Map<string, string>();
  await Promise.all(
    parentIds.map(async (pid) => {
      try {
        const snap = await getDocs(collection(db, `companies/${pid}/customers`));
        snap.docs.forEach((d) => {
          const data = d.data();
          if (!isActiveCompanyRecord(data)) return;
          const name = (data.companyName || data.name || '').toString().trim();
          if (name && !map.has(d.id)) {
            map.set(d.id, name);
          }
        });
      } catch (err) {
        console.error(`Error fetching customers subcollection for company ${pid}:`, err);
      }
    })
  );

  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
