// 008 B1: the 2W / 4W split. Pure and dependency-free (types only), shared by
// the server (Overview) and the browser (Live parking, Overview).
// 2W = Two-wheeler slots; 4W = every other type, and a missing or old type.
import type { ParkingSlot, VehicleGroup } from '../types';

export const VEHICLE_GROUPS: VehicleGroup[] = ['4W', '2W'];
export const isVehicleGroup = (v: unknown): v is VehicleGroup => v === '4W' || v === '2W';

export const groupOf = (slotType: ParkingSlot['slotType'] | string | null | undefined): VehicleGroup =>
  slotType === 'TWO_WHEELER' ? '2W' : '4W';

export const inGroup = (s: Pick<ParkingSlot, 'slotType'>, group: VehicleGroup): boolean => groupOf(s.slotType) === group;
