import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatOperatorServiceName, TARGET_COMPANY_ID } from './operatorAccess';

export interface ExtrasProofRecord {
  id: string;
  subcustomerId: string;
  subcustomerName: string;
  serviceId: string;
  serviceName: string;
  deliveryDate: string;
  deliveryTime: string;
  proofType: 'pod' | 'excess_weight';
  excessWeightQty: number;
  excessWeightUnitKg: number;
  excessWeightRateIncGst: number;
  excessWeightTotalIncGst: number;
  notes?: string | null;
  uploadedByName?: string;
  uploadedByEmail?: string;
  createdAtMs: number;
}

export interface ExtrasSummaryRow {
  key: string;
  subcustomerId: string;
  subcustomerName: string;
  serviceName: string;
  captureCount: number;
  totalExtrasQty: number;
  totalWeightKg: number;
  totalAmountIncGst: number;
  lastCapturedDate: string;
}

export interface ExtrasReportTotals {
  totalCaptures: number;
  totalExtrasQty: number;
  totalWeightKg: number;
  totalAmountIncGst: number;
  uniqueSubcustomers: number;
  uniqueServices: number;
}

const DEFAULT_UNIT_KG = 16;
const DEFAULT_RATE_INC_GST = 3.85;

export function normalizeExtrasRecord(id: string, data: Record<string, any>): ExtrasProofRecord {
  const qty = typeof data.excessWeightQty === 'number' && data.excessWeightQty > 0 ? data.excessWeightQty : 1;
  const unitKg = typeof data.excessWeightUnitKg === 'number' && data.excessWeightUnitKg > 0 ? data.excessWeightUnitKg : DEFAULT_UNIT_KG;
  const rateIncGst =
    typeof data.excessWeightRateIncGst === 'number' && data.excessWeightRateIncGst >= 0
      ? data.excessWeightRateIncGst
      : DEFAULT_RATE_INC_GST;
  const totalIncGst =
    typeof data.excessWeightTotalIncGst === 'number' && data.excessWeightTotalIncGst >= 0
      ? data.excessWeightTotalIncGst
      : Number((qty * rateIncGst).toFixed(2));

  return {
    id,
    subcustomerId: data.subcustomerId || '',
    subcustomerName: data.subcustomerName || 'Unknown Subcustomer',
    serviceId: data.serviceId || '',
    serviceName: formatOperatorServiceName(data.serviceRawName || data.serviceName || 'General Service'),
    deliveryDate: data.deliveryDate || '',
    deliveryTime: data.deliveryTime || '',
    proofType: data.proofType === 'excess_weight' ? 'excess_weight' : 'pod',
    excessWeightQty: qty,
    excessWeightUnitKg: unitKg,
    excessWeightRateIncGst: rateIncGst,
    excessWeightTotalIncGst: totalIncGst,
    notes: data.notes || null,
    uploadedByName: data.uploadedByName || data.uploadedByEmail || 'Operator',
    uploadedByEmail: data.uploadedByEmail || '',
    createdAtMs: data.createdAt?.toMillis?.() || 0,
  };
}

export async function fetchCapturedExtras(): Promise<ExtrasProofRecord[]> {
  const q = query(
    collection(db, `companies/${TARGET_COMPANY_ID}/proof_uploads`),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  const items: ExtrasProofRecord[] = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.proofType === 'excess_weight') {
      items.push(normalizeExtrasRecord(d.id, data));
    }
  });
  return items;
}

export function buildExtrasSummary(records: ExtrasProofRecord[]): ExtrasSummaryRow[] {
  const map = new Map<string, ExtrasSummaryRow>();

  records.forEach((rec) => {
    const subKey = rec.subcustomerId || rec.subcustomerName.trim().toLowerCase();
    const svcKey = rec.serviceName.trim().toLowerCase();
    const key = `${subKey}::${svcKey}`;

    const existing = map.get(key);
    const weightKg = rec.excessWeightQty * rec.excessWeightUnitKg;

    if (existing) {
      existing.captureCount += 1;
      existing.totalExtrasQty += rec.excessWeightQty;
      existing.totalWeightKg += weightKg;
      existing.totalAmountIncGst = Number((existing.totalAmountIncGst + rec.excessWeightTotalIncGst).toFixed(2));
      if (rec.deliveryDate && (!existing.lastCapturedDate || rec.deliveryDate > existing.lastCapturedDate)) {
        existing.lastCapturedDate = rec.deliveryDate;
      }
    } else {
      map.set(key, {
        key,
        subcustomerId: rec.subcustomerId,
        subcustomerName: rec.subcustomerName,
        serviceName: rec.serviceName,
        captureCount: 1,
        totalExtrasQty: rec.excessWeightQty,
        totalWeightKg: weightKg,
        totalAmountIncGst: Number(rec.excessWeightTotalIncGst.toFixed(2)),
        lastCapturedDate: rec.deliveryDate || '',
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.totalExtrasQty !== a.totalExtrasQty) return b.totalExtrasQty - a.totalExtrasQty;
    const subCmp = a.subcustomerName.localeCompare(b.subcustomerName);
    if (subCmp !== 0) return subCmp;
    return a.serviceName.localeCompare(b.serviceName);
  });
}

export function computeExtrasTotals(records: ExtrasProofRecord[]): ExtrasReportTotals {
  const subcustomers = new Set<string>();
  const services = new Set<string>();
  let totalExtrasQty = 0;
  let totalWeightKg = 0;
  let totalAmountIncGst = 0;

  records.forEach((rec) => {
    subcustomers.add(rec.subcustomerId || rec.subcustomerName.trim().toLowerCase());
    services.add(rec.serviceName.trim().toLowerCase());
    totalExtrasQty += rec.excessWeightQty;
    totalWeightKg += rec.excessWeightQty * rec.excessWeightUnitKg;
    totalAmountIncGst += rec.excessWeightTotalIncGst;
  });

  return {
    totalCaptures: records.length,
    totalExtrasQty,
    totalWeightKg,
    totalAmountIncGst: Number(totalAmountIncGst.toFixed(2)),
    uniqueSubcustomers: subcustomers.size,
    uniqueServices: services.size,
  };
}

function escapeCsvCell(value: unknown): string {
  const str = (value ?? '').toString().replace(/"/g, '""');
  return `"${str}"`;
}

function triggerCsvDownload(headers: string[], rows: unknown[][], filename: string): void {
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getTodayStamp(): string {
  return new Date().toISOString().split('T')[0];
}

export function exportExtrasSummaryCsv(
  summaryRows: ExtrasSummaryRow[],
  totals: ExtrasReportTotals
): void {
  const headers = [
    'Subcustomer',
    'Service',
    'Extras Count (Qty)',
    'Captures',
    'Total Extra Weight (kg)',
    'Total Amount Inc GST (AUD)',
    'Last Captured Date',
  ];

  const rows: unknown[][] = summaryRows.map((row) => [
    row.subcustomerName,
    row.serviceName,
    row.totalExtrasQty,
    row.captureCount,
    row.totalWeightKg,
    row.totalAmountIncGst.toFixed(2),
    row.lastCapturedDate || '-',
  ]);

  if (summaryRows.length > 0) {
    rows.push([
      'TOTAL',
      `${totals.uniqueServices} Service(s)`,
      totals.totalExtrasQty,
      totals.totalCaptures,
      totals.totalWeightKg,
      totals.totalAmountIncGst.toFixed(2),
      '',
    ]);
  }

  triggerCsvDownload(headers, rows, `extras_summary_${getTodayStamp()}.csv`);
}

export function exportExtrasDetailedCsv(records: ExtrasProofRecord[]): void {
  const headers = [
    'Delivery Date',
    'Delivery Time',
    'Subcustomer',
    'Service',
    'Extras Count (Qty)',
    'Unit (kg)',
    'Total Weight (kg)',
    'Rate Inc GST (AUD)',
    'Total Inc GST (AUD)',
    'Captured By',
    'Notes',
    'Proof ID',
  ];

  const rows: unknown[][] = records.map((rec) => [
    rec.deliveryDate || '-',
    rec.deliveryTime || '-',
    rec.subcustomerName,
    rec.serviceName,
    rec.excessWeightQty,
    rec.excessWeightUnitKg,
    rec.excessWeightQty * rec.excessWeightUnitKg,
    rec.excessWeightRateIncGst.toFixed(2),
    rec.excessWeightTotalIncGst.toFixed(2),
    rec.uploadedByName || rec.uploadedByEmail || 'Operator',
    rec.notes || '',
    rec.id,
  ]);

  triggerCsvDownload(headers, rows, `extras_detailed_${getTodayStamp()}.csv`);
}
