import React, { useState } from 'react';
import { CircleCheck, LogOut, Wrench, Clock } from 'lucide-react';
import type { SlotStatus, VehicleType } from '../../types';
import { Button, Modal, PlateText, Select, SiteTag, SlotCode, StatusChip, TextField, formatMetres } from '../../design-system/components';
import { enumLabel, formatSince } from '../../utils/format';
import { decodeSlot, heightOf, type LiveSlot } from '../../utils/slots';

export interface SlotModalProps {
  slot: LiveSlot | null;
  siteCode?: string;
  busy: boolean;
  onClose: () => void;
  onExit: (slot: LiveSlot) => void;
  onEntry: (slot: LiveSlot, plate: string, vehicleType: VehicleType) => void;
  onStatus: (slot: LiveSlot, status: SlotStatus) => void;
}

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'SEDAN', label: 'Sedan' },
  { value: 'HATCHBACK', label: 'Hatchback' },
  { value: 'SUV', label: 'SUV' },
  { value: 'CSUV', label: 'Compact SUV' },
  { value: 'EV', label: 'EV' },
  { value: 'TWO_WHEELER', label: 'Two-wheeler' },
];

const PLATE_RE = /^[A-Z0-9]{4,10}$/;

/**
 * Slot details (UX S3): type and size, parking type, allocation, ANPR camera ("—" when
 * none: the old G-ANPR-CAM01 fallback is gone), one honest PLC line, and the actions:
 * Record exit (occupied), Park a vehicle here (vacant, /vehicles/entry with
 * targetSlotNumber), and Maintenance / Reserve / Set vacant (/slots/update-status).
 * Every action is write-guarded (All sites, view-as). Esc and outside click close it.
 */
export const SlotModal: React.FC<SlotModalProps> = ({ slot, siteCode, busy, onClose, onExit, onEntry, onStatus }) => {
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('SEDAN');
  const [plateError, setPlateError] = useState<string | null>(null);
  const open = !!slot;

  const close = () => {
    setPlate('');
    setPlateError(null);
    onClose();
  };

  if (!slot) return <Modal open={false} onClose={close} title="" />;

  const occupied = slot.status === 'OCCUPIED';
  const submitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const p = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!PLATE_RE.test(p)) {
      setPlateError('Enter the number plate: 4 to 10 letters and digits, e.g. MH12AB1234.');
      return;
    }
    setPlateError(null);
    onEntry(slot, p, vehicleType);
    setPlate('');
  };
  const statusButton = (to: SlotStatus, label: string, icon: typeof Wrench) =>
    slot.status !== to && (
      <Button size="sm" icon={icon} guard disabled={busy} onClick={() => onStatus(slot, to)}>
        {label}
      </Button>
    );

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="pf-row">
          Slot <SlotCode code={slot.slotNumber} /> <StatusChip status={slot.status} /> {siteCode && <SiteTag code={siteCode} />}
        </span>
      }
      footer={
        occupied ? undefined : (
        <>
          {statusButton('MAINTENANCE', 'Maintenance', Wrench)}
          {statusButton('RESERVED', 'Reserve', Clock)}
          {statusButton('VACANT', 'Set vacant', CircleCheck)}
        </>
        )
      }
    >
      <div className="pf-stack">
        <p className="pf-modal-sub">{[decodeSlot(slot), slot.floorLocation].filter(Boolean).join(' · ')}</p>
        <dl className="pf-dl pf-dl--boxed">
          <dt>Slot type</dt>
          <dd>{enumLabel(slot.slotType)}</dd>
          <dt>Size (H × L)</dt>
          <dd>
            {formatMetres(heightOf(slot))} × {formatMetres(slot.lengthM)}
          </dd>
          <dt>Parking type</dt>
          <dd>{enumLabel(slot.parkingType)}</dd>
          <dt>Allocation</dt>
          <dd>{enumLabel(slot.allocation)}</dd>
          <dt>ANPR camera</dt>
          <dd>{slot.cameraNumber || '—'}</dd>
          {slot.parkingType !== 'GROUND' && (
            <>
              <dt>Stacker controller (PLC)</dt>
              <dd>— not connected</dd>
            </>
          )}
        </dl>

        {occupied && (
          <section className="pf-modal-section" aria-label="Parked vehicle">
            <div className="pf-stack pf-stack--tight">
              <PlateText plate={slot.currentVehicle} large />
              <span className="pf-slot-since">In since {slot.inSince ? formatSince(slot.inSince) : '—'}</span>
            </div>
            <Button variant="destructive" icon={LogOut} block guard loading={busy} loadingLabel="Recording exit…" onClick={() => onExit(slot)}>
              Record exit and free slot
            </Button>
          </section>
        )}

        {slot.status === 'VACANT' && (
          <form className="pf-modal-section" onSubmit={submitEntry} noValidate aria-label="Park a vehicle in this slot">
            <h3 className="pf-modal-section-title">Park a vehicle in this slot</h3>
            <div className="pf-form-row">
              <TextField label="Number plate" mono required value={plate} error={plateError} onChange={(e) => setPlate(e.target.value)} fieldClassName="pf-grow" />
              <Select label="Vehicle type" options={VEHICLE_TYPES} value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)} />
            </div>
            <Button type="submit" variant="primary" block guard loading={busy} loadingLabel="Recording entry…">
              Record entry
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
};
