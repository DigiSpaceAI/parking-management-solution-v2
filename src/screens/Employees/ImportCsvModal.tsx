import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import type { Employee, EmployeeStatus, VehicleType } from '../../types';
import { Banner, Button, Modal } from '../../design-system/components';
import { formatNumber } from '../../utils/format';

export const EMPLOYEE_CSV_HEADER = 'EmployeeID,FullName,Department,Designation,Mobile,Email,VehicleNumber,VehicleType,VehicleBrand,Status';

/** The template (001 columns, unchanged). Example rows are clearly examples. */
export function employeeTemplateCsv(): string {
  return `${EMPLOYEE_CSV_HEADER}
EMP-0001,Example Person,Finance,Analyst,+91 90000 00000,example.person@yourcompany.example,MH12AB1234,SEDAN,Honda,Active`;
}

function vehicleTypeOf(raw: string): VehicleType {
  const t = raw.toUpperCase();
  if (t.includes('CSUV')) return 'CSUV';
  if (t.includes('SUV')) return 'SUV';
  if (t.includes('EV')) return 'EV';
  if (t.includes('TWO') || t.includes('2W')) return 'TWO_WHEELER';
  if (t.includes('HATCH')) return 'HATCHBACK';
  return 'SEDAN';
}

/** One row per line; the header row is skipped. Empty cells stay empty (the server decides what is required). */
export function parseEmployeeCsv(text: string): Partial<Employee>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const start = /employee|name|plate/i.test(lines[0]) ? 1 : 0;
  const out: Partial<Employee>[] = [];
  for (const line of lines.slice(start)) {
    const c = line.split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''));
    if (c.length < 2) continue;
    const raw = (c[9] || '').toUpperCase();
    const status: EmployeeStatus = raw.includes('INACTIVE') ? 'INACTIVE' : raw.includes('DEFAULT') ? 'DEFAULTER' : 'ACTIVE';
    out.push({
      employeeId: c[0] || '',
      name: c[1] || '',
      department: c[2] || '',
      designation: c[3] || '',
      mobile: c[4] || '',
      email: c[5] || '',
      vehicleNumber: (c[6] || '').toUpperCase(),
      vehicleType: vehicleTypeOf(c[7] || ''),
      vehicleBrand: c[8] || '',
      status,
      isActive: status === 'ACTIVE',
    });
  }
  return out;
}

export interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Partial<Employee>[]) => Promise<{ ok: boolean; message: string; errors: string[] }>;
}

/** Import employees from a CSV file (001 /employees/bulk-upload). Shows refused rows instead of closing. */
export const ImportCsvModal: React.FC<ImportCsvModalProps> = ({ open, onClose, onImport }) => {
  const [rows, setRows] = useState<Partial<Employee>[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; errors: string[] } | null>(null);
  const reset = () => {
    setRows([]);
    setFileName('');
    setResult(null);
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setRows(parseEmployeeCsv(String(reader.result || '')));
    reader.readAsText(file);
  };
  const run = async () => {
    setBusy(true);
    try {
      setResult(await onImport(rows));
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    reset();
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Import employees from CSV"
      footer={
        <>
          <Button onClick={close}>{result?.ok ? 'Done' : 'Cancel'}</Button>
          {!result?.ok && (
            <Button variant="primary" icon={Upload} guard disabled={!rows.length} loading={busy} loadingLabel="Importing…" onClick={() => void run()}>
              Import {rows.length ? formatNumber(rows.length) : ''} {rows.length === 1 ? 'employee' : 'employees'}
            </Button>
          )}
        </>
      }
    >
      <div className="pf-stack">
        <p>Use the template from the ⋯ menu: one employee per row, with their number plate. Employees are added to this site.</p>
        <div className="pf-field">
          <label className="pf-field-label" htmlFor="pf-emp-csv">
            CSV file
          </label>
          <input id="pf-emp-csv" className="pf-input pf-file" type="file" accept=".csv,text/csv" onChange={onFile} />
          {fileName && (
            <p className="pf-field-help">
              {fileName}: {formatNumber(rows.length)} {rows.length === 1 ? 'row' : 'rows'} found
            </p>
          )}
        </div>
        {result && (
          <Banner tone={result.ok && !result.errors.length ? 'success' : result.ok ? 'warning' : 'danger'} title={result.message}>
            {result.errors.length > 0 && (
              <ul className="pf-list">
                {result.errors.slice(0, 10).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {result.errors.length > 10 && <li>…and {formatNumber(result.errors.length - 10)} more</li>}
              </ul>
            )}
          </Banner>
        )}
      </div>
    </Modal>
  );
};
