import React, { useEffect, useState } from 'react';
import type { Employee, EmployeeStatus, VehicleType } from '../../types';
import { Banner, Button, Select, SidePanel, TextField } from '../../design-system/components';

export interface AddEmployeePanelProps {
  open: boolean;
  /** Edit this employee, or null to add a new one. */
  employee: Employee | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (e: Partial<Employee>) => void;
}

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'SEDAN', label: 'Sedan' },
  { value: 'HATCHBACK', label: 'Hatchback' },
  { value: 'SUV', label: 'SUV' },
  { value: 'CSUV', label: 'Compact SUV' },
  { value: 'EV', label: 'EV' },
  { value: 'TWO_WHEELER', label: 'Two-wheeler' },
];
const STATUSES: { value: EmployeeStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DEFAULTER', label: 'Defaulter' },
];

type Form = Pick<Employee, 'employeeId' | 'name' | 'department' | 'designation' | 'mobile' | 'email' | 'vehicleNumber' | 'vehicleType' | 'vehicleBrand' | 'status'>;
const EMPTY: Form = { employeeId: '', name: '', department: '', designation: '', mobile: '', email: '', vehicleNumber: '', vehicleType: 'SEDAN', vehicleBrand: '', status: 'ACTIVE' };

/** Add or edit one employee with a pass (POST /employees/save; same fields as 001's form, no made-up defaults). */
export const AddEmployeePanel: React.FC<AddEmployeePanelProps> = ({ open, employee, saving, error, onClose, onSave }) => {
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      employee
        ? {
            employeeId: employee.employeeId || '',
            name: employee.name || '',
            department: employee.department || '',
            designation: employee.designation || '',
            mobile: employee.mobile || '',
            email: employee.email || '',
            vehicleNumber: employee.vehicleNumber || '',
            vehicleType: employee.vehicleType || 'SEDAN',
            vehicleBrand: employee.vehicleBrand || '',
            status: employee.status || (employee.isActive ? 'ACTIVE' : 'INACTIVE'),
          }
        : EMPTY
    );
  }, [open, employee]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) next.name = 'Enter the full name.';
    const plate = f.vehicleNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(plate)) next.vehicleNumber = 'Enter the number plate: 4 to 10 letters and digits.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({
      ...(employee ? { id: employee.id, siteId: employee.siteId } : {}),
      ...f,
      name: f.name.trim(),
      email: f.email.trim(),
      vehicleNumber: plate,
      isActive: f.status === 'ACTIVE',
    });
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={employee ? `Edit ${employee.name}` : 'Add employee'}
      subtitle={employee ? undefined : 'They get a parking pass at this site straight away.'}
      footer={
        <>
          <Button type="submit" form="pf-employee-form" variant="primary" guard loading={saving} loadingLabel="Saving…">
            {employee ? 'Save changes' : 'Add employee'}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form id="pf-employee-form" className="pf-stack" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <TextField label="Full name" required value={f.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label="Employee ID" value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} />
        <div className="pf-form-row">
          <TextField label="Department" fieldClassName="pf-grow" value={f.department} onChange={(e) => set('department', e.target.value)} />
          <TextField label="Designation" fieldClassName="pf-grow" value={f.designation} onChange={(e) => set('designation', e.target.value)} />
        </div>
        <TextField label="Work email" type="email" autoComplete="off" value={f.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
        <TextField label="Mobile" type="tel" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} />
        <TextField label="Number plate" mono required value={f.vehicleNumber} error={errors.vehicleNumber} onChange={(e) => set('vehicleNumber', e.target.value)} />
        <div className="pf-form-row">
          <Select label="Vehicle type" options={VEHICLE_TYPES} value={f.vehicleType} onChange={(e) => set('vehicleType', e.target.value as VehicleType)} />
          <TextField label="Make" fieldClassName="pf-grow" value={f.vehicleBrand} onChange={(e) => set('vehicleBrand', e.target.value)} />
        </div>
        <Select label="Pass status" options={STATUSES} value={f.status} onChange={(e) => set('status', e.target.value as EmployeeStatus)} />
      </form>
    </SidePanel>
  );
};
