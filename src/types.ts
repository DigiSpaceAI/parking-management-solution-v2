export type VehicleType = 'SEDAN' | 'SUV' | 'CSUV' | 'HATCHBACK' | 'TWO_WHEELER' | 'EV';
export type SlotType = 'SEDAN' | 'SUV' | 'CSUV' | 'TWO_WHEELER' | 'EV';
export type ParkingType = 'PUZZLE' | 'STACK' | 'GROUND';
export type Allocation = 'EMPLOYEE' | 'TRANSPORT' | 'VISITOR' | 'VIP' | 'HANDICAP' | 'NOT_AVAILABLE';
export type SlotStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
export type EntryType = 'MANUAL' | 'ANPR_AUTO';
export type LogStatus = 'ACTIVE' | 'COMPLETED' | 'EXCEPTION';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'DEFAULTER';
export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SiteStatus = 'ACTIVE' | 'ON_HOLD' | 'DEACTIVATED';

export type ValetStatus = 'RECEIVED' | 'PARKED' | 'RETRIEVAL_REQUESTED' | 'RETRIEVED_DELIVERED' | 'CANCELLED';
export type ValetTicketType = 'STANDARD' | 'VIP_EXECUTIVE' | 'HOTEL_GUEST' | 'MALL_VISITOR';

export interface ValetTicket {
  id: string;
  ticketNumber: string; // e.g. "VX-8092"
  keyTagNumber: string; // e.g. "TAG-104"
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleBrand?: string;
  guestName: string;
  guestPhone: string;
  assignedValetDriver: string;
  assignedSlotNumber: string;
  status: ValetStatus;
  ticketType: ValetTicketType;
  receivedAt: string;
  parkedAt?: string;
  retrievalRequestedAt?: string;
  deliveredAt?: string;
  retrievalSMSKey?: string;
  parkingNotes?: string;
  tipAmount?: number;
  feeAmount?: number;
  paymentStatus?: 'PAID' | 'COMPLIMENTARY' | 'PENDING';
}

export interface SitePricing {
  hourlyRate: number;
  dailyMaxRate: number;
  monthlyPassRate: number;
  currency: string;
  taxPercentage: number;
}

export interface SiteConfig {
  id: string;
  siteCode: string;
  siteName: string;
  city: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  totalSlots: number;
  basementLevels: number;
  hasPuzzleParking: boolean;
  hasEVCharging: boolean;
  status: SiteStatus;
  pricing: SitePricing;
  onboardedAt: string;
  updatedAt: string;
  holdReason?: string;
}

export interface SiteInvoice {
  id: string;
  invoiceNumber: string;
  siteId: string;
  siteName: string;
  billingPeriod: string;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  dueDate: string;
  status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED';
  createdAt: string;
  notes?: string;
}

export interface SlotChangeNotification {
  id: string;
  vehicleNumber: string;
  oldSlotNumber: string;
  newSlotNumber: string;
  employeeName?: string;
  mobile?: string;
  changedBy: string;
  changedAt: string;
  smsSent: boolean;
  messageText: string;
}

export type RegistrationType = 'EMPLOYEE_SELF' | 'PARKING_ADMIN';

export interface RegistrationRequest {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  email: string;
  mobile: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleBrand: string;
  status: RegistrationStatus;
  registrationType?: RegistrationType;
  createdAt: string;
  updatedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface WhitelistedDomain {
  id: string;
  domain: string; // e.g., "company.com"
  addedBy: string;
  createdAt: string;
  isActive: boolean;
}

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  mobile: string;
  email: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleBrand: string;
  status: EmployeeStatus;
  isActive: boolean;
  registrationType?: RegistrationType;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingSlot {
  id: string;
  slotNumber: string; // e.g., B1-P01-S1
  basement: 'B1' | 'B2' | 'B3' | 'Ground' | 'Driveway';
  floorLocation: string; // e.g., "Basement 1, EV Charging area"
  puzzleNumber?: string; // e.g., "B1-P01"
  cameraNumber?: string; // e.g., "B1-C01"
  slotType: SlotType;
  parkingType: ParkingType;
  height: string; // e.g., "2.0m", "2.5m"
  allocation: Allocation;
  status: SlotStatus;
  currentVehicle?: string | null;
  updatedAt?: string;
}

export interface ParkingLog {
  id: string;
  vehicleNumber: string;
  employeeId?: string | null;
  employeeName?: string | null;
  department?: string | null;
  slotId: string;
  slotNumber: string;
  basement: string;
  entryTime: string;
  exitTime?: string | null;
  durationMinutes?: number | null;
  entryType: EntryType;
  status: LogStatus;
  remarks?: string | null;
}

export interface ForecastHourData {
  hour: string; // e.g., "08:00 AM"
  hour24: number;
  totalOccupancyPct: number;
  b1OccupancyPct: number;
  b2OccupancyPct: number;
  b3OccupancyPct: number;
  evOccupancyPct: number;
  expectedEntries: number;
  expectedExits: number;
  isPeakHour: boolean;
  recommendedAction?: string;
}

export interface PredictiveAnalyticsReport {
  generatedAt: string;
  peakHour: string;
  peakOccupancyPct: number;
  totalSlots: number;
  projectedPeakOccupied: number;
  hourlyForecast: ForecastHourData[];
  aiRecommendations: string[];
  floorBreakdown: {
    floor: string;
    totalSlots: number;
    projectedPeakOccupied: number;
    peakPct: number;
  }[];
}

export interface NonParkedAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  mobile: string;
  cutoffTime: string;
  status: 'PENDING_NOTIFICATION' | 'NOTIFIED_FCM' | 'NOTIFIED_SMS' | 'RESOLVED' | 'UNAUTHORIZED_EXEMPT';
  notifiedAt?: string;
  remarks?: string;
}

export interface ANPRScanResult {
  plateNumber: string;
  confidence: number;
  vehicleType: VehicleType;
  vehicleBrand?: string;
  matchedEmployee?: Employee | null;
  suggestedSlot?: ParkingSlot | null;
  rawAnalysis?: string;
}

export type AppModuleId =
  | 'HOME'
  | 'FLOOR_PLAN'
  | 'VALET_SERVICE'
  | 'LOGS'
  | 'ANALYTICS'
  | 'INVENTORY'
  | 'MOBILE_APP'
  | 'EMPLOYEE_MOBILE_APP'
  | 'REGISTRATION'
  | 'APPROVALS'
  | 'ALERTS'
  | 'MASTER_CONFIG'
  | 'USER_MANAGEMENT'
  | 'SECURITY_AUDIT';

export type SystemRoleType =
  | 'MASTER_ADMIN'
  | 'SITE_MANAGER'
  | 'VALET_SUPERVISOR'
  | 'ATTENDANT_GATE'
  | 'MIS_AUDITOR'
  | 'CUSTOM';

export interface ModuleAccessRights {
  enabled: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export interface RolePermissionConfig {
  id: string;
  roleCode: SystemRoleType | string;
  roleName: string;
  description: string;
  isSystemDefault: boolean;
  siteScope: 'ALL_SITES' | 'ASSIGNED_SITES_ONLY';
  modulePermissions: Record<AppModuleId, ModuleAccessRights>;
  createdAt: string;
}

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  designation: string;
  roleId: string; // references RolePermissionConfig.id
  roleName: string;
  siteScopeType: 'ALL_SITES' | 'SPECIFIC_SITES';
  assignedSiteIds: string[]; // e.g. ["site-101", "site-102"]
  assignedSiteNames?: string[];
  status: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  customModuleOverrides?: Partial<Record<AppModuleId, boolean>>;
  lastLoginAt?: string;
  createdAt: string;
  passwordHash?: string;
  passwordSalt?: string;
  mustChangePassword?: boolean;
}
export type PublicAppUser = Omit<AppUser, 'passwordHash' | 'passwordSalt'>;
export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  actorRole: string;
  ipAddress: string;
  userAgent?: string;
  targetResource: string;
  status: 'SUCCESS' | 'BLOCKED_UNAUTHORIZED' | 'RATE_LIMITED' | 'VALIDATION_FAILED';
  details: string;
  integrityHash: string; // SHA-256 HMAC integrity checksum
}

export interface SecurityComplianceSummary {
  encryptionAtRest: boolean;
  dataMaskingEnabled: boolean;
  rateLimiterActive: boolean;
  bolaProtectionActive: boolean;
  totalAuditLogs: number;
  blockedAttacksCount: number;
  lastTamperCheckStatus: 'VERIFIED_INTACT' | 'ALERT';
  activeSecurityHeaders: string[];
}


