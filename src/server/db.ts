import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getFirestoreDb, markFirestoreUnavailable, isFirestoreConfigured } from './firestoreClient';
import {
  Employee,
  EmployeeStatus,
  ParkingSlot,
  ParkingLog,
  NonParkedAlert,
  VehicleType,
  SlotType,
  ParkingType,
  Allocation,
  SlotStatus,
  EntryType,
  LogStatus,
  PredictiveAnalyticsReport,
  ForecastHourData,
  RegistrationRequest,
  WhitelistedDomain,
  RegistrationStatus,
  SiteConfig,
  SitePricing,
  SiteInvoice,
  SiteStatus,
  SlotChangeNotification,
  ValetTicket,
  ValetStatus,
  ValetTicketType,
  AppModuleId,
  SystemRoleType,
  RolePermissionConfig,
  AppUser,
  PublicAppUser,
  ModuleAccessRights
} from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'pms_store.json');

interface StoreData {
  slots: ParkingSlot[];
  employees: Employee[];
  logs: ParkingLog[];
  alerts: NonParkedAlert[];
  registrationRequests: RegistrationRequest[];
  whitelistedDomains: WhitelistedDomain[];
  sites: SiteConfig[];
  invoices: SiteInvoice[];
  slotChangeNotifications: SlotChangeNotification[];
  valetTickets: ValetTicket[];
  appRoles: RolePermissionConfig[];
  appUsers: AppUser[];
  lastUpdated: string;
}

let store: StoreData = {
  slots: [],
  employees: [],
  logs: [],
  alerts: [],
  registrationRequests: [],
  whitelistedDomains: [],
  sites: [],
  invoices: [],
  slotChangeNotifications: [],
  valetTickets: [],
  appRoles: [],
  appUsers: [],
  lastUpdated: new Date().toISOString(),
};

// OWASP's current minimum recommendation for PBKDF2-HMAC-SHA512 (2023
// guidance). The previous value (1,000) was far below modern standards.
// IMPORTANT: this is a breaking change for any password hashed under the
// old iteration count — every account's password must be reset for this
// to take effect. This is expected to happen anyway as part of the
// mandatory credential rotation (the old hashes were briefly exposed in
// a public repo), so no separate migration path is provided.
const PBKDF2_ITERATIONS = 210000;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  // Strip leading and trailing null bytes without altering special characters
  const cleanPassword = typeof password === 'string' ? password.replace(/^\x00+|\x00+$/g, '') : '';
  const finalSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(cleanPassword, finalSalt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
  return { hash, salt: finalSalt };
}

export function verifyPassword(password: string, hash?: string, salt?: string): boolean {
  // Always perform hash computation to avoid timing leak for non-existent users
  const cleanPassword = typeof password === 'string' ? password.replace(/^\x00+|\x00+$/g, '') : '';
  
  // Static 128-hex-char dummy hash (64 bytes) and dummy salt for timing equalization
  const dummySalt = 'c0a80101_owasp_sec_salt_timing_safe_9901';
  const dummyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const effectiveSalt = (salt && typeof salt === 'string' && salt.length > 0) ? salt : dummySalt;
  const effectiveHash = (hash && typeof hash === 'string' && hash.length === 128) ? hash : dummyHash;

  const testHashBuffer = crypto.pbkdf2Sync(cleanPassword, effectiveSalt, PBKDF2_ITERATIONS, 64, 'sha512');
  let targetHashBuffer: Buffer;
  try {
    targetHashBuffer = Buffer.from(effectiveHash, 'hex');
    if (targetHashBuffer.length !== 64) {
      targetHashBuffer = Buffer.from(dummyHash, 'hex');
    }
  } catch {
    targetHashBuffer = Buffer.from(dummyHash, 'hex');
  }

  // Constant-time buffer comparison to prevent timing attacks
  const isMatch = crypto.timingSafeEqual(testHashBuffer, targetHashBuffer);
  return Boolean(hash && salt && isMatch && cleanPassword.length >= 8 && cleanPassword.length <= 64);
}

function getDefaultRolesAndUsers(): { roles: RolePermissionConfig[]; users: AppUser[] } {
  const fullAccessRights: ModuleAccessRights = {
    enabled: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canExport: true,
  };

  const readOnlyRights: ModuleAccessRights = {
    enabled: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canExport: true,
  };

  const disabledRights: ModuleAccessRights = {
    enabled: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canExport: false,
  };

  const masterAdminRole: RolePermissionConfig = {
    id: 'role-master-admin',
    roleCode: 'MASTER_ADMIN',
    roleName: 'Platform Master Admin',
    description: 'Full unrestricted platform access across all enterprise sites, billing, and security settings.',
    isSystemDefault: true,
    siteScope: 'ALL_SITES',
    createdAt: new Date().toISOString(),
    modulePermissions: {
      HOME: fullAccessRights,
      FLOOR_PLAN: fullAccessRights,
      VALET_SERVICE: fullAccessRights,
      LOGS: fullAccessRights,
      ANALYTICS: fullAccessRights,
      INVENTORY: fullAccessRights,
      MOBILE_APP: fullAccessRights,
      EMPLOYEE_MOBILE_APP: fullAccessRights,
      REGISTRATION: fullAccessRights,
      APPROVALS: fullAccessRights,
      ALERTS: fullAccessRights,
      MASTER_CONFIG: fullAccessRights,
      USER_MANAGEMENT: fullAccessRights,
      SECURITY_AUDIT: fullAccessRights,
    },
  };

  const siteManagerRole: RolePermissionConfig = {
    id: 'role-site-manager',
    roleCode: 'SITE_MANAGER',
    roleName: 'Site Facility Manager',
    description: 'Manages day-to-day site parking inventory, ANPR logs, alerts, employee approvals, and valet dispatch.',
    isSystemDefault: true,
    siteScope: 'ASSIGNED_SITES_ONLY',
    createdAt: new Date().toISOString(),
    modulePermissions: {
      HOME: fullAccessRights,
      FLOOR_PLAN: fullAccessRights,
      VALET_SERVICE: fullAccessRights,
      LOGS: fullAccessRights,
      ANALYTICS: fullAccessRights,
      INVENTORY: fullAccessRights,
      MOBILE_APP: fullAccessRights,
      EMPLOYEE_MOBILE_APP: readOnlyRights,
      REGISTRATION: fullAccessRights,
      APPROVALS: fullAccessRights,
      ALERTS: fullAccessRights,
      MASTER_CONFIG: disabledRights,
      USER_MANAGEMENT: disabledRights,
      SECURITY_AUDIT: readOnlyRights,
    },
  };

  const valetSupervisorRole: RolePermissionConfig = {
    id: 'role-valet-supervisor',
    roleCode: 'VALET_SUPERVISOR',
    roleName: 'ValetX Operations Lead',
    description: 'Manages valet check-in, key tag lockers, runner dispatch, and guest SMS vehicle retrieval queue.',
    isSystemDefault: true,
    siteScope: 'ASSIGNED_SITES_ONLY',
    createdAt: new Date().toISOString(),
    modulePermissions: {
      HOME: fullAccessRights,
      FLOOR_PLAN: readOnlyRights,
      VALET_SERVICE: fullAccessRights,
      LOGS: readOnlyRights,
      ANALYTICS: disabledRights,
      INVENTORY: readOnlyRights,
      MOBILE_APP: fullAccessRights,
      EMPLOYEE_MOBILE_APP: disabledRights,
      REGISTRATION: disabledRights,
      APPROVALS: disabledRights,
      ALERTS: disabledRights,
      MASTER_CONFIG: disabledRights,
      USER_MANAGEMENT: disabledRights,
      SECURITY_AUDIT: disabledRights,
    },
  };

  const misAuditorRole: RolePermissionConfig = {
    id: 'role-mis-auditor',
    roleCode: 'MIS_AUDITOR',
    roleName: 'MIS & Compliance Auditor',
    description: 'Read-only & MIS report export access for audit, revenue reconciliation, and predictive forecasting.',
    isSystemDefault: true,
    siteScope: 'ALL_SITES',
    createdAt: new Date().toISOString(),
    modulePermissions: {
      HOME: fullAccessRights,
      FLOOR_PLAN: readOnlyRights,
      VALET_SERVICE: readOnlyRights,
      LOGS: readOnlyRights,
      ANALYTICS: readOnlyRights,
      INVENTORY: readOnlyRights,
      MOBILE_APP: disabledRights,
      EMPLOYEE_MOBILE_APP: disabledRights,
      REGISTRATION: readOnlyRights,
      APPROVALS: readOnlyRights,
      ALERTS: readOnlyRights,
      MASTER_CONFIG: disabledRights,
      USER_MANAGEMENT: disabledRights,
      SECURITY_AUDIT: readOnlyRights,
    },
  };

  const gateAttendantRole: RolePermissionConfig = {
    id: 'role-gate-attendant',
    roleCode: 'ATTENDANT_GATE',
    roleName: 'Gate Security Attendant',
    description: 'Field mobile app operator for scanning license plates, manual slot overrides, and entry/exit logs.',
    isSystemDefault: true,
    siteScope: 'ASSIGNED_SITES_ONLY',
    createdAt: new Date().toISOString(),
    modulePermissions: {
      HOME: fullAccessRights,
      FLOOR_PLAN: readOnlyRights,
      VALET_SERVICE: disabledRights,
      LOGS: readOnlyRights,
      ANALYTICS: disabledRights,
      INVENTORY: readOnlyRights,
      MOBILE_APP: fullAccessRights,
      EMPLOYEE_MOBILE_APP: disabledRights,
      REGISTRATION: disabledRights,
      APPROVALS: disabledRights,
      ALERTS: readOnlyRights,
      MASTER_CONFIG: disabledRights,
      USER_MANAGEMENT: disabledRights,
      SECURITY_AUDIT: disabledRights,
    },
  };

  const roles = [masterAdminRole, siteManagerRole, valetSupervisorRole, misAuditorRole, gateAttendantRole];

  const adminCreds = hashPassword('Admin@1234', 'salt_admin_101');
  const siteCreds = hashPassword('Site@1234', 'salt_site_102');
  const valetCreds = hashPassword('Valet@1234', 'salt_valet_103');
  const auditCreds = hashPassword('Audit@1234', 'salt_audit_104');
  const gateCreds = hashPassword('Gate@1234', 'salt_gate_105');

  const users: AppUser[] = [
    {
      id: 'usr-digi-master',
      username: 'digisolutions',
      fullName: 'DigiSolutions Master Admin',
      email: 'digisolutions.fm@gmail.com',
      phone: '+91 98450 11223',
      designation: 'Principal Solutions Architect & Master Admin',
      roleId: 'role-master-admin',
      roleName: 'Platform Master Admin',
      siteScopeType: 'ALL_SITES',
      assignedSiteIds: ['site-1', 'site-2', 'site-3'],
      assignedSiteNames: ['Tech Park HQ Main Hub', 'Cyber Tower Innovation Park', 'BKC Corporate Financial Center'],
      status: 'ACTIVE',
      passwordHash: adminCreds.hash,
      passwordSalt: adminCreds.salt,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
    {
      id: 'usr-101',
      username: 'superadmin',
      fullName: 'Vikramaditya Roy',
      email: 'v.roy@parkos.ai',
      phone: '+91 98450 11223',
      designation: 'VP of Smart Infrastructure',
      roleId: 'role-master-admin',
      roleName: 'Platform Master Admin',
      siteScopeType: 'ALL_SITES',
      assignedSiteIds: ['site-1', 'site-2', 'site-3'],
      assignedSiteNames: ['Tech Park HQ Main Hub', 'Cyber Tower Innovation Park', 'BKC Corporate Financial Center'],
      status: 'ACTIVE',
      passwordHash: adminCreds.hash,
      passwordSalt: adminCreds.salt,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
    {
      id: 'usr-102',
      username: 'ananya.site',
      fullName: 'Ananya Sharma',
      email: 'ananya.sharma@prestige.com',
      phone: '+91 99001 44556',
      designation: 'Senior Facility Manager',
      roleId: 'role-site-manager',
      roleName: 'Site Facility Manager',
      siteScopeType: 'SPECIFIC_SITES',
      assignedSiteIds: ['site-1'],
      assignedSiteNames: ['Tech Park HQ Main Hub'],
      status: 'ACTIVE',
      passwordHash: siteCreds.hash,
      passwordSalt: siteCreds.salt,
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      lastLoginAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'usr-103',
      username: 'suresh.valet',
      fullName: 'Suresh Kumar',
      email: 'suresh.k@valetx.in',
      phone: '+91 98765 43210',
      designation: 'Head Valet Dispatcher',
      roleId: 'role-valet-supervisor',
      roleName: 'ValetX Operations Lead',
      siteScopeType: 'SPECIFIC_SITES',
      assignedSiteIds: ['site-1', 'site-2'],
      assignedSiteNames: ['Tech Park HQ Main Hub', 'Cyber Tower Innovation Park'],
      status: 'ACTIVE',
      passwordHash: valetCreds.hash,
      passwordSalt: valetCreds.salt,
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
      lastLoginAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'usr-104',
      username: 'rajesh.audit',
      fullName: 'Rajesh Malhotra',
      email: 'rajesh.m@auditfirm.com',
      phone: '+91 98888 77665',
      designation: 'Lead MIS Auditor',
      roleId: 'role-mis-auditor',
      roleName: 'MIS & Compliance Auditor',
      siteScopeType: 'ALL_SITES',
      assignedSiteIds: ['site-1', 'site-2', 'site-3'],
      assignedSiteNames: ['All Enterprise Sites'],
      status: 'ACTIVE',
      passwordHash: auditCreds.hash,
      passwordSalt: auditCreds.salt,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      lastLoginAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'usr-105',
      username: 'ramesh.gate',
      fullName: 'Ramesh Gowda',
      email: 'ramesh.g@security.com',
      phone: '+91 91234 56789',
      designation: 'Gate 1 Security Lead',
      roleId: 'role-gate-attendant',
      roleName: 'Gate Security Attendant',
      siteScopeType: 'SPECIFIC_SITES',
      assignedSiteIds: ['site-1'],
      assignedSiteNames: ['Tech Park HQ Main Hub'],
      status: 'ACTIVE',
      passwordHash: gateCreds.hash,
      passwordSalt: gateCreds.salt,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      lastLoginAt: new Date(Date.now() - 900000).toISOString(),
    },
  ];

  return { roles, users };
}

// Generate 1,080 Parking Slots across multi-level basements, puzzle stackers, EV stations
function generate1080Inventory(): StoreData {
  const { roles: defaultRoles, users: defaultUsers } = getDefaultRolesAndUsers();
  const slots: ParkingSlot[] = [];
  const employees: Employee[] = [];
  const logs: ParkingLog[] = [];
  const alerts: NonParkedAlert[] = [];

  const departments = ['Engineering', 'Operations', 'HR & Admin', 'Sales & Marketing', 'Finance & Legal', 'Executive Leadership', 'Transport Fleet'];
  const designations = ['Senior Manager', 'Lead Engineer', 'Director', 'VP', 'Operations Specialist', 'Fleet Driver', 'HR Business Partner', 'Account Executive'];
  const brands = ['Tesla', 'Hyundai', 'Toyota', 'Tata Motors', 'BMW', 'Mercedes-Benz', 'Audi', 'Honda', 'Kia', 'Mahindra', 'Ather', 'Ola Electric'];

  // 1. Generate Employees (150 active employee records)
  for (let i = 1; i <= 150; i++) {
    const empId = `EMP-${1000 + i}`;
    const dept = departments[i % departments.length];
    const desig = designations[i % designations.length];
    const brand = brands[i % brands.length];
    
    let vType: VehicleType = 'SEDAN';
    if (i % 5 === 0) vType = 'EV';
    else if (i % 4 === 0) vType = 'SUV';
    else if (i % 7 === 0) vType = 'TWO_WHEELER';
    else if (i % 3 === 0) vType = 'HATCHBACK';

    const stateCodes = ['KA', 'MH', 'DL', 'TS', 'TN', 'HR', 'GJ'];
    const state = stateCodes[i % stateCodes.length];
    const numPad = (i * 37) % 9000 + 1000;
    const vehicleNum = `${state}-0${(i % 9) + 1}-EX-${numPad}`;

    let empStatus: EmployeeStatus = 'ACTIVE';
    if (i % 17 === 0) empStatus = 'DEFAULTER';
    else if (i % 11 === 0) empStatus = 'INACTIVE';

    employees.push({
      id: `emp-${i}`,
      employeeId: empId,
      name: `Employee ${i} (${dept.split(' ')[0]})`,
      department: dept,
      designation: desig,
      mobile: `+91 98${(10000000 + i * 883).toString().substring(0, 8)}`,
      email: `employee.${i}@company.com`,
      vehicleNumber: vehicleNum,
      vehicleType: vType,
      vehicleBrand: brand,
      status: empStatus,
      isActive: empStatus === 'ACTIVE',
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Helper for generating slot batches
  let totalCreated = 0;

  // Basement B1: 320 slots (Puzzle Stackers P01-P20, EV Hub 30 slots, SUV Clearance, VIP)
  // Puzzle Stackers B1-P01 to B1-P20 (10 slots each = 200 slots)
  for (let p = 1; p <= 20; p++) {
    const puzzleId = `B1-P${p < 10 ? '0' + p : p}`;
    for (let s = 1; s <= 10; s++) {
      totalCreated++;
      const slotNum = `${puzzleId}-S${s < 10 ? '0' + s : s}`;
      const isEv = s === 1 || s === 2;
      const isSuv = s > 7;
      slots.push({
        id: `slot-${totalCreated}`,
        slotNumber: slotNum,
        basement: 'B1',
        floorLocation: `Basement 1, Stacker Grid ${puzzleId}`,
        puzzleNumber: puzzleId,
        cameraNumber: `B1-CAM-${Math.ceil(p / 2)}`,
        slotType: isEv ? 'EV' : isSuv ? 'SUV' : 'SEDAN',
        parkingType: 'PUZZLE',
        height: isSuv ? '2.5m' : '2.0m',
        allocation: isEv ? 'EMPLOYEE' : p <= 2 ? 'VIP' : 'EMPLOYEE',
        status: 'VACANT',
        currentVehicle: null,
      });
    }
  }

  // B1 EV Charging Hub (30 slots)
  for (let ev = 1; ev <= 30; ev++) {
    totalCreated++;
    const slotNum = `B1-EV-${ev < 10 ? '0' + ev : ev}`;
    slots.push({
      id: `slot-${totalCreated}`,
      slotNumber: slotNum,
      basement: 'B1',
      floorLocation: 'Basement 1, Rapid EV Charging Bay',
      cameraNumber: 'B1-CAM-EV',
      slotType: 'EV',
      parkingType: 'GROUND',
      height: '2.5m',
      allocation: 'EMPLOYEE',
      status: 'VACANT',
      currentVehicle: null,
    });
  }

  // B1 SUV & VIP Clearance (90 slots) -> Total B1 = 200 + 30 + 90 = 320
  for (let suv = 1; suv <= 90; suv++) {
    totalCreated++;
    const slotNum = `B1-VIP-${suv < 10 ? '0' + suv : suv}`;
    slots.push({
      id: `slot-${totalCreated}`,
      slotNumber: slotNum,
      basement: 'B1',
      floorLocation: suv <= 20 ? 'Basement 1, VIP Reserve Zone' : 'Basement 1, SUV High Bay',
      cameraNumber: `B1-CAM-VIP${Math.ceil(suv / 30)}`,
      slotType: 'SUV',
      parkingType: 'STACK',
      height: '2.5m',
      allocation: suv <= 20 ? 'VIP' : suv <= 30 ? 'HANDICAP' : 'EMPLOYEE',
      status: 'VACANT',
      currentVehicle: null,
    });
  }

  // Basement B2: 360 slots (Puzzle P01-P25 x 10 = 250, Sedan/Two-wheelers = 110)
  for (let p = 1; p <= 25; p++) {
    const puzzleId = `B2-P${p < 10 ? '0' + p : p}`;
    for (let s = 1; s <= 10; s++) {
      totalCreated++;
      const slotNum = `${puzzleId}-S${s < 10 ? '0' + s : s}`;
      slots.push({
        id: `slot-${totalCreated}`,
        slotNumber: slotNum,
        basement: 'B2',
        floorLocation: `Basement 2, Stacker Grid ${puzzleId}`,
        puzzleNumber: puzzleId,
        cameraNumber: `B2-CAM-${Math.ceil(p / 3)}`,
        slotType: s <= 2 ? 'EV' : 'SEDAN',
        parkingType: 'PUZZLE',
        height: '2.0m',
        allocation: 'EMPLOYEE',
        status: 'VACANT',
        currentVehicle: null,
      });
    }
  }

  // B2 Two-Wheelers & Sedan (110 slots) -> Total B2 = 250 + 110 = 360
  for (let tw = 1; tw <= 110; tw++) {
    totalCreated++;
    const isTw = tw <= 60;
    const slotNum = isTw ? `B2-2W-${tw < 10 ? '0' + tw : tw}` : `B2-SD-${tw < 10 ? '0' + tw : tw}`;
    slots.push({
      id: `slot-${totalCreated}`,
      slotNumber: slotNum,
      basement: 'B2',
      floorLocation: isTw ? 'Basement 2, Two-Wheeler Bay' : 'Basement 2, General Sedan Aisle',
      cameraNumber: 'B2-CAM-BAY2',
      slotType: isTw ? 'TWO_WHEELER' : 'SEDAN',
      parkingType: 'GROUND',
      height: '2.0m',
      allocation: 'EMPLOYEE',
      status: 'VACANT',
      currentVehicle: null,
    });
  }

  // Basement B3: 320 slots (Transport Fleet, Stackers & Employee Overflow)
  for (let p = 1; p <= 20; p++) {
    const puzzleId = `B3-P${p < 10 ? '0' + p : p}`;
    for (let s = 1; s <= 10; s++) {
      totalCreated++;
      const slotNum = `${puzzleId}-S${s < 10 ? '0' + s : s}`;
      slots.push({
        id: `slot-${totalCreated}`,
        slotNumber: slotNum,
        basement: 'B3',
        floorLocation: `Basement 3, Stacker Grid ${puzzleId}`,
        puzzleNumber: puzzleId,
        cameraNumber: `B3-CAM-${Math.ceil(p / 3)}`,
        slotType: s % 3 === 0 ? 'SUV' : 'SEDAN',
        parkingType: 'PUZZLE',
        height: '2.2m',
        allocation: p <= 5 ? 'TRANSPORT' : 'EMPLOYEE',
        status: 'VACANT',
        currentVehicle: null,
      });
    }
  }

  // B3 Transport & General Overflow (120 slots) -> Total B3 = 200 + 120 = 320
  for (let tr = 1; tr <= 120; tr++) {
    totalCreated++;
    const slotNum = `B3-TR-${tr < 10 ? '0' + tr : tr}`;
    slots.push({
      id: `slot-${totalCreated}`,
      slotNumber: slotNum,
      basement: 'B3',
      floorLocation: tr <= 40 ? 'Basement 3, Corporate Shuttle Bay' : 'Basement 3, Employee Overflow',
      cameraNumber: 'B3-CAM-FLEET',
      slotType: tr <= 40 ? 'SUV' : 'SEDAN',
      parkingType: 'GROUND',
      height: '2.5m',
      allocation: tr <= 40 ? 'TRANSPORT' : 'EMPLOYEE',
      status: 'VACANT',
      currentVehicle: null,
    });
  }

  // Ground & Driveway: 80 slots (Visitors, VIP drop-off, Handicap) -> Total = 320+360+320+80 = 1,080 slots!
  for (let g = 1; g <= 80; g++) {
    totalCreated++;
    const slotNum = g <= 40 ? `G-VIS-${g < 10 ? '0' + g : g}` : `G-DRV-${g < 10 ? '0' + g : g}`;
    const isVisitor = g <= 50;
    const isHandicap = g > 50 && g <= 60;
    slots.push({
      id: `slot-${totalCreated}`,
      slotNumber: slotNum,
      basement: g <= 40 ? 'Ground' : 'Driveway',
      floorLocation: g <= 40 ? 'Ground Floor Main Lobby Drive' : 'North Perimeter Driveway',
      cameraNumber: 'G-ANPR-CAM01',
      slotType: g % 4 === 0 ? 'EV' : g % 3 === 0 ? 'SUV' : 'SEDAN',
      parkingType: 'GROUND',
      height: '3.0m',
      allocation: isHandicap ? 'HANDICAP' : isVisitor ? 'VISITOR' : 'VIP',
      status: 'VACANT',
      currentVehicle: null,
    });
  }

  // Occupy ~65% of slots to simulate live real-time operations
  const targetOccupiedCount = Math.floor(slots.length * 0.65); // ~702 slots occupied
  let logIdCounter = 1;

  for (let i = 0; i < targetOccupiedCount; i++) {
    const slot = slots[i * 1]; // distributed
    if (slot && slot.status === 'VACANT') {
      const emp = employees[i % employees.length];
      const vehicleNum = emp ? emp.vehicleNumber : `VIS-REG-${2000 + i}`;
      const entryHoursAgo = (i % 6) + 1;
      const entryTime = new Date(Date.now() - entryHoursAgo * 3600000 - (i * 47000)).toISOString();

      slot.status = i % 25 === 0 ? 'RESERVED' : 'OCCUPIED';
      slot.currentVehicle = vehicleNum;
      slot.updatedAt = entryTime;

      logs.push({
        id: `log-${logIdCounter++}`,
        vehicleNumber: vehicleNum,
        employeeId: emp ? emp.id : null,
        employeeName: emp ? emp.name : 'Visitor / Guest',
        department: emp ? emp.department : 'Guest Visitor',
        slotId: slot.id,
        slotNumber: slot.slotNumber,
        basement: slot.basement,
        entryTime: entryTime,
        exitTime: null,
        durationMinutes: entryHoursAgo * 60,
        entryType: i % 3 === 0 ? 'ANPR_AUTO' : 'MANUAL',
        status: 'ACTIVE',
        remarks: emp ? `Verified Employee ${emp.employeeId}` : 'Visitor Gate Access Pass',
      });
    }
  }

  // Add 15 historical completed logs
  for (let h = 1; h <= 15; h++) {
    const emp = employees[(h * 7) % employees.length];
    const duration = 120 + h * 25;
    const entryTime = new Date(Date.now() - (duration + 60) * 60000).toISOString();
    const exitTime = new Date(Date.now() - 60 * 60000).toISOString();
    logs.push({
      id: `log-${logIdCounter++}`,
      vehicleNumber: emp.vehicleNumber,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      slotId: slots[h].id,
      slotNumber: slots[h].slotNumber,
      basement: slots[h].basement,
      entryTime: entryTime,
      exitTime: exitTime,
      durationMinutes: duration,
      entryType: 'ANPR_AUTO',
      status: 'COMPLETED',
      remarks: 'Completed checkout',
    });
  }

  // Seed sample Non-Parked Vehicle Alerts (for employees who are marked working but not detected in occupied logs)
  const occupiedPlates = new Set(slots.map(s => s.currentVehicle).filter(Boolean));
  const nonParkedEmployees = employees.filter(e => !occupiedPlates.has(e.vehicleNumber));

  nonParkedEmployees.slice(0, 8).forEach((emp, index) => {
    alerts.push({
      id: `alert-${index + 1}`,
      employeeId: emp.employeeId,
      employeeName: emp.name,
      department: emp.department,
      vehicleNumber: emp.vehicleNumber,
      vehicleType: emp.vehicleType,
      mobile: emp.mobile,
      cutoffTime: '10:30 AM',
      status: index < 3 ? 'NOTIFIED_FCM' : 'PENDING_NOTIFICATION',
      notifiedAt: index < 3 ? new Date(Date.now() - index * 1800000).toISOString() : undefined,
      remarks: 'Vehicle not detected in designated PMS basement slots after cutoff time.',
    });
  });

  const registrationRequests: RegistrationRequest[] = [
    {
      id: 'req-1',
      employeeId: 'EMP-3001',
      name: 'John Doe',
      department: 'Engineering',
      designation: 'Staff Software Engineer',
      email: 'john.doe@company.com',
      mobile: '+91 9876543210',
      vehicleNumber: 'KA-01-AB-1234',
      vehicleType: 'EV',
      vehicleBrand: 'Tesla Model 3',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      id: 'req-2',
      employeeId: 'EMP-3002',
      name: 'Samantha Smith',
      department: 'Finance & Legal',
      designation: 'Senior Legal Counsel',
      email: 'samantha.s@corp.org',
      mobile: '+91 9812345678',
      vehicleNumber: 'MH-12-CD-5678',
      vehicleType: 'SUV',
      vehicleBrand: 'Hyundai Creta',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: 'req-3',
      employeeId: 'EMP-3003',
      name: 'Amit Patel',
      department: 'Operations',
      designation: 'Operations Director',
      email: 'amit.patel@techfirm.com',
      mobile: '+91 9988776655',
      vehicleNumber: 'TS-09-EF-9012',
      vehicleType: 'SEDAN',
      vehicleBrand: 'Honda City',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  const whitelistedDomains: WhitelistedDomain[] = [
    { id: 'dom-1', domain: 'company.com', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
    { id: 'dom-2', domain: 'corp.org', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
    { id: 'dom-3', domain: 'techfirm.com', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
    { id: 'dom-4', domain: 'enterprise.io', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
    { id: 'dom-5', domain: 'parkos.ai', addedBy: 'System Default', createdAt: new Date().toISOString(), isActive: true },
  ];

  const valetTickets: ValetTicket[] = [
    {
      id: 'valet-1',
      ticketNumber: 'VX-1001',
      keyTagNumber: 'K-101',
      vehicleNumber: 'KA-01-MJ-8821',
      vehicleType: 'SUV',
      vehicleBrand: 'BMW X5',
      guestName: 'Vikramaditya Roy',
      guestPhone: '+91 98450 11223',
      assignedValetDriver: 'Suresh Kumar',
      assignedSlotNumber: 'B1-VIP-01',
      status: 'RETRIEVAL_REQUESTED',
      ticketType: 'VIP_EXECUTIVE',
      receivedAt: new Date(Date.now() - 7200000).toISOString(),
      parkedAt: new Date(Date.now() - 7000000).toISOString(),
      retrievalRequestedAt: new Date(Date.now() - 300000).toISOString(),
      retrievalSMSKey: 'VX-8821',
      parkingNotes: 'VIP Executive - Left side key tag. Handle with care.',
      feeAmount: 200,
      paymentStatus: 'PAID',
    },
    {
      id: 'valet-2',
      ticketNumber: 'VX-1002',
      keyTagNumber: 'K-104',
      vehicleNumber: 'KA-03-NV-5041',
      vehicleType: 'CSUV',
      vehicleBrand: 'Hyundai Creta',
      guestName: 'Ananya Sharma',
      guestPhone: '+91 99001 44556',
      assignedValetDriver: 'Ramesh Gowda',
      assignedSlotNumber: 'B1-P02-S04',
      status: 'PARKED',
      ticketType: 'MALL_VISITOR',
      receivedAt: new Date(Date.now() - 5400000).toISOString(),
      parkedAt: new Date(Date.now() - 5100000).toISOString(),
      retrievalSMSKey: 'VX-5041',
      parkingNotes: 'Parked in B1 Stacker P02 level 2.',
      feeAmount: 150,
      paymentStatus: 'PAID',
    },
    {
      id: 'valet-3',
      ticketNumber: 'VX-1003',
      keyTagNumber: 'K-108',
      vehicleNumber: 'KA-05-MM-1209',
      vehicleType: 'SEDAN',
      vehicleBrand: 'Mercedes C-Class',
      guestName: 'Rajesh Malhotra',
      guestPhone: '+91 98888 77665',
      assignedValetDriver: 'Mahesh Patil',
      assignedSlotNumber: 'B1-VIP-03',
      status: 'RETRIEVED_DELIVERED',
      ticketType: 'HOTEL_GUEST',
      receivedAt: new Date(Date.now() - 14400000).toISOString(),
      parkedAt: new Date(Date.now() - 14100000).toISOString(),
      retrievalRequestedAt: new Date(Date.now() - 3600000).toISOString(),
      deliveredAt: new Date(Date.now() - 3300000).toISOString(),
      retrievalSMSKey: 'VX-1209',
      parkingNotes: 'Keys returned to guest at Gate 1 Drop-off point.',
      tipAmount: 100,
      feeAmount: 250,
      paymentStatus: 'PAID',
    },
  ];

  return {
    slots,
    employees,
    logs,
    alerts,
    registrationRequests,
    whitelistedDomains,
    sites: [],
    invoices: [],
    slotChangeNotifications: [],
    valetTickets,
    appRoles: defaultRoles,
    appUsers: defaultUsers,
    lastUpdated: new Date().toISOString(),
  };
}

// Ensure database file exists or generate fresh with absolute preservation of existing data
export function initDB(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const loadedStore: Partial<StoreData> = JSON.parse(raw);

      // Safe deep merge: Never overwrite existing collections or user-created records
      const { roles: defaultRoles, users: defaultUsers } = getDefaultRolesAndUsers();
      const seeded = generate1080Inventory();

      // 1. Employees: Preserve all existing user/portal employees
      let finalEmployees = loadedStore.employees && loadedStore.employees.length > 0
        ? loadedStore.employees.map(e => ({
            ...e,
            status: e.status || (e.isActive ? 'ACTIVE' : 'INACTIVE'),
            isActive: (e.status ? e.status === 'ACTIVE' : e.isActive),
          }))
        : seeded.employees;

      // 2. Slots: Preserve all existing slots and user changes
      let finalSlots: ParkingSlot[] = [];
      if (loadedStore.slots && loadedStore.slots.length > 0) {
        finalSlots = loadedStore.slots;
        // If some default slots were missing, fill only missing ones by slotNumber
        if (finalSlots.length < 1080) {
          const existingSlotNumbers = new Set(finalSlots.map(s => s.slotNumber.toUpperCase()));
          for (const s of seeded.slots) {
            if (!existingSlotNumbers.has(s.slotNumber.toUpperCase())) {
              finalSlots.push(s);
            }
          }
        }
      } else {
        finalSlots = seeded.slots;
      }

      // 3. Parking Logs / Transactions: Preserve all historical logs
      const finalLogs = loadedStore.logs && loadedStore.logs.length > 0
        ? loadedStore.logs
        : seeded.logs;

      // 4. Alerts
      const finalAlerts = loadedStore.alerts && loadedStore.alerts.length > 0
        ? loadedStore.alerts
        : seeded.alerts;

      // 5. Valet Tickets: Preserve all valet transactions
      const finalValetTickets = loadedStore.valetTickets && loadedStore.valetTickets.length > 0
        ? loadedStore.valetTickets
        : seeded.valetTickets;

      // 6. Whitelisted Domains
      const finalWhitelistedDomains = loadedStore.whitelistedDomains && loadedStore.whitelistedDomains.length > 0
        ? loadedStore.whitelistedDomains
        : [
            { id: 'dom-1', domain: 'company.com', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
            { id: 'dom-2', domain: 'corp.org', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
            { id: 'dom-3', domain: 'techfirm.com', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
            { id: 'dom-4', domain: 'enterprise.io', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
            { id: 'dom-5', domain: 'parkos.ai', addedBy: 'System Default', createdAt: new Date().toISOString(), isActive: true },
          ];

      // 7. Registration Requests
      const finalRegistrationRequests = loadedStore.registrationRequests || [];

      // 8. Slot Change Notifications
      const finalSlotChangeNotifications = loadedStore.slotChangeNotifications || [];

      // 9. App Roles: Preserve custom roles + ensure default system roles exist
      let finalAppRoles = loadedStore.appRoles && loadedStore.appRoles.length > 0
        ? loadedStore.appRoles
        : defaultRoles;
      // Ensure master admin and standard roles are available if not present
      const roleIdSet = new Set(finalAppRoles.map(r => r.id));
      for (const dRole of defaultRoles) {
        if (!roleIdSet.has(dRole.id)) {
          finalAppRoles.push(dRole);
        }
      }

      // 10. App Users: Preserve all portal-created users + ensure master admin and default roles exist
      let finalAppUsers = loadedStore.appUsers && loadedStore.appUsers.length > 0
        ? loadedStore.appUsers
        : defaultUsers;
      const userUsernameSet = new Set(finalAppUsers.map(u => (u.username || '').toLowerCase()));
      const userEmailSet = new Set(finalAppUsers.map(u => (u.email || '').toLowerCase()));
      
      for (const dUser of defaultUsers) {
        if (!userUsernameSet.has(dUser.username.toLowerCase()) && !userEmailSet.has(dUser.email.toLowerCase())) {
          finalAppUsers.push(dUser);
        }
      }

      // Ensure every user has a valid passwordHash and salt to prevent login failures
      for (const u of finalAppUsers) {
        if (!u.passwordHash || !u.passwordSalt) {
          const matchDefault = defaultUsers.find(
            (d) => d.username.toLowerCase() === (u.username || '').toLowerCase() || d.email.toLowerCase() === (u.email || '').toLowerCase()
          );
          if (matchDefault && matchDefault.passwordHash && matchDefault.passwordSalt) {
            u.passwordHash = matchDefault.passwordHash;
            u.passwordSalt = matchDefault.passwordSalt;
          } else {
            const fallbackCreds = hashPassword('Admin@1234');
            u.passwordHash = fallbackCreds.hash;
            u.passwordSalt = fallbackCreds.salt;
          }
        }
      }

      // 11. Sites: Preserve all onboarded sites
      let finalSites = loadedStore.sites && loadedStore.sites.length > 0
        ? loadedStore.sites
        : [
            {
              id: 'site-1',
              siteCode: 'SITE-BLR-01',
              siteName: 'Tech Park HQ Main Hub',
              city: 'Bengaluru',
              address: 'Outer Ring Road, Marathahalli, Bengaluru 560103',
              contactPerson: 'Rajesh Sharma',
              contactEmail: 'rajesh.sharma@techpark.com',
              contactPhone: '+91 9876500001',
              totalSlots: 1080,
              basementLevels: 3,
              hasPuzzleParking: true,
              hasEVCharging: true,
              status: 'ACTIVE' as SiteStatus,
              pricing: { hourlyRate: 50, dailyMaxRate: 400, monthlyPassRate: 3500, currency: 'INR', taxPercentage: 18 },
              onboardedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'site-2',
              siteCode: 'SITE-HYD-02',
              siteName: 'Cyber Tower Innovation Park',
              city: 'Hyderabad',
              address: 'Hitec City, Madhapur, Hyderabad 500081',
              contactPerson: 'Ananya Rao',
              contactEmail: 'ananya.rao@cybertowers.io',
              contactPhone: '+91 9876500002',
              totalSlots: 650,
              basementLevels: 2,
              hasPuzzleParking: true,
              hasEVCharging: true,
              status: 'ACTIVE' as SiteStatus,
              pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2800, currency: 'INR', taxPercentage: 18 },
              onboardedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'site-3',
              siteCode: 'SITE-MUM-03',
              siteName: 'Mindspace Corporate Bay',
              city: 'Mumbai',
              address: 'Malad West, Mumbai 400064',
              contactPerson: 'Vikram Mehta',
              contactEmail: 'v.mehta@mindspace.co.in',
              contactPhone: '+91 9876500003',
              totalSlots: 420,
              basementLevels: 2,
              hasPuzzleParking: false,
              hasEVCharging: true,
              status: 'ON_HOLD' as SiteStatus,
              holdReason: 'Scheduled Stacker Lift & Hydraulic System Upgrade',
              pricing: { hourlyRate: 60, dailyMaxRate: 500, monthlyPassRate: 4200, currency: 'INR', taxPercentage: 18 },
              onboardedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'site-4',
              siteCode: 'SITE-DEL-04',
              siteName: 'Fintech Plaza South',
              city: 'Gurugram',
              address: 'DLF Cyber City Phase 2, Gurugram 122002',
              contactPerson: 'Siddharth Verma',
              contactEmail: 's.verma@fintechplaza.com',
              contactPhone: '+91 9876500004',
              totalSlots: 300,
              basementLevels: 1,
              hasPuzzleParking: false,
              hasEVCharging: false,
              status: 'DEACTIVATED' as SiteStatus,
              pricing: { hourlyRate: 45, dailyMaxRate: 350, monthlyPassRate: 3200, currency: 'INR', taxPercentage: 18 },
              onboardedAt: new Date(Date.now() - 120 * 86400000).toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];

      // 12. Invoices: Preserve all invoices
      let finalInvoices = loadedStore.invoices && loadedStore.invoices.length > 0
        ? loadedStore.invoices
        : [
            {
              id: 'inv-101',
              invoiceNumber: 'INV-2026-001',
              siteId: 'site-1',
              siteName: 'Tech Park HQ Main Hub',
              billingPeriod: 'July 2026',
              baseAmount: 150000,
              taxAmount: 27000,
              totalAmount: 177000,
              currency: 'INR',
              dueDate: '2026-08-15',
              status: 'PAID' as const,
              createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
              notes: 'Monthly SaaS platform licensing & ANPR camera stream integration fee.',
            },
            {
              id: 'inv-102',
              invoiceNumber: 'INV-2026-002',
              siteId: 'site-2',
              siteName: 'Cyber Tower Innovation Park',
              billingPeriod: 'July 2026',
              baseAmount: 95000,
              taxAmount: 17100,
              totalAmount: 112100,
              currency: 'INR',
              dueDate: '2026-08-20',
              status: 'UNPAID' as const,
              createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
              notes: 'Monthly platform licensing & attendant mobile terminal sync.',
            },
          ];

      store = {
        slots: finalSlots,
        employees: finalEmployees,
        logs: finalLogs,
        alerts: finalAlerts,
        registrationRequests: finalRegistrationRequests,
        whitelistedDomains: finalWhitelistedDomains,
        sites: finalSites,
        invoices: finalInvoices,
        slotChangeNotifications: finalSlotChangeNotifications,
        valetTickets: finalValetTickets,
        appRoles: finalAppRoles,
        appUsers: finalAppUsers,
        lastUpdated: loadedStore.lastUpdated || new Date().toISOString(),
      };
      saveDB();
    } else if (isFirestoreConfigured()) {
      // Local file is missing, but Firestore IS configured for this
      // environment — this could mean a genuinely brand-new deployment,
      // OR it could mean an existing site's data is sitting safely in
      // Firestore and this is just an ephemeral container that lost its
      // local disk copy. We can't tell the difference synchronously here.
      // Seeding full demo data in that second case would be dangerous:
      // it could get written back to Firestore later and silently
      // clobber real data. So: seed only what's needed for the app to be
      // usable at all (login accounts), leave operational data empty,
      // and let bootstrapFirestore() (which runs right after this,
      // before the server starts accepting requests) load the real data
      // if it exists. If Firestore turns out to be unreachable this run
      // too, the app stays visibly empty rather than showing fabricated
      // demo content as if it were real.
      console.log('[initDB] No local data file, but Firestore is configured — seeding accounts only and deferring to Firestore bootstrap for real data.');
      const { roles: defaultRoles, users: defaultUsers } = getDefaultRolesAndUsers();
      store = {
        slots: [],
        employees: [],
        logs: [],
        alerts: [],
        registrationRequests: [],
        whitelistedDomains: [
          { id: 'dom-1', domain: 'company.com', addedBy: 'Parking Admin', createdAt: new Date().toISOString(), isActive: true },
        ],
        sites: [],
        invoices: [],
        slotChangeNotifications: [],
        valetTickets: [],
        appRoles: defaultRoles,
        appUsers: defaultUsers,
        lastUpdated: new Date().toISOString(),
      };
      saveDB();
    } else {
      // Firestore genuinely isn't configured for this environment (no
      // project ID resolvable) — this is the local/dev case, where full
      // demo data is expected and useful.
      console.log('Initializing fresh 1,080 slots database inventory...');
      const seeded = generate1080Inventory();
      store = { ...seeded, lastUpdated: new Date().toISOString() };
      saveDB();
    }
  } catch (err) {
    console.error('Error loading PMS database, initializing in-memory:', err);
    const seeded = generate1080Inventory();
    store = { ...seeded, lastUpdated: new Date().toISOString() };
  }
  return store;
}

// Every top-level array in StoreData maps to one Firestore collection.
// Each item's own `id` field becomes its Firestore document ID.
const FIRESTORE_COLLECTIONS: (keyof StoreData)[] = [
  'slots', 'employees', 'logs', 'alerts', 'registrationRequests',
  'whitelistedDomains', 'sites', 'invoices', 'slotChangeNotifications',
  'valetTickets', 'appRoles', 'appUsers',
];

const FIRESTORE_BATCH_CHUNK = 400; // stay under Firestore's 500-write batch limit

function isFatalFirestoreConfigError(err: any): boolean {
  const msg = String(err?.message || err);
  return (
    msg.includes('Unable to detect a Project Id') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('could not load the default credentials')
  );
}

async function syncStoreToFirestore(snapshot: StoreData) {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    for (const key of FIRESTORE_COLLECTIONS) {
      const items = snapshot[key] as unknown as Array<{ id: string }>;
      if (!Array.isArray(items)) continue;

      const collectionRef = db.collection(key);
      for (let i = 0; i < items.length; i += FIRESTORE_BATCH_CHUNK) {
        const chunk = items.slice(i, i + FIRESTORE_BATCH_CHUNK);
        const batch = db.batch();
        for (const item of chunk) {
          if (!item?.id) continue;
          batch.set(collectionRef.doc(String(item.id)), item, { merge: true });
        }
        await batch.commit();
      }
    }
    await db.collection('_meta').doc('store').set({
      lastUpdated: snapshot.lastUpdated,
    });
  } catch (err) {
    if (isFatalFirestoreConfigError(err)) {
      markFirestoreUnavailable(String((err as any)?.message || err));
    } else {
      console.error('[firestore] Sync failed, local JSON copy is still up to date:', err);
    }
  }
}

async function loadStoreFromFirestore(): Promise<StoreData | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const results = await Promise.all(
      FIRESTORE_COLLECTIONS.map(key => db.collection(key).get())
    );

    const loaded = {} as any;
    let totalDocs = 0;
    FIRESTORE_COLLECTIONS.forEach((key, idx) => {
      const docs = results[idx].docs.map(d => d.data());
      loaded[key] = docs;
      totalDocs += docs.length;
    });

    if (totalDocs === 0) return null;

    loaded.lastUpdated = new Date().toISOString();
    return loaded as StoreData;
  } catch (err) {
    if (isFatalFirestoreConfigError(err)) {
      markFirestoreUnavailable(String((err as any)?.message || err));
    } else {
      console.error('[firestore] Load failed, falling back to local JSON store:', err);
    }
    return null;
  }
}

export async function bootstrapFirestore(): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const remote = await loadStoreFromFirestore();
  if (remote) {
    store = remote;
    console.log('[firestore] Loaded existing data from Firestore.');
  } else {
    console.log('[firestore] No existing data found — seeding Firestore from local store.');
    await syncStoreToFirestore(store);
  }
}

export function saveDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    store.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Error saving PMS database:', err);
  }
  void syncStoreToFirestore(store);
}

export function getStore(): StoreData {
  if (store.slots.length === 0) {
    initDB();
  }
  return store;
}

// Rules Engine: Find best vacant slot based on vehicle height, slotType, allocation, basement
export function findBestSlot(vehicleType: VehicleType, heightNeeded: string = '2.0m', allocationPreference: Allocation = 'EMPLOYEE'): ParkingSlot | null {
  const storeData = getStore();
  const vacantSlots = storeData.slots.filter(s => s.status === 'VACANT');

  if (vacantSlots.length === 0) return null;

  // 1. Strict match for EV (EV must get EV slot or Ground EV hub)
  if (vehicleType === 'EV') {
    const evSlot = vacantSlots.find(s => s.slotType === 'EV');
    if (evSlot) return evSlot;
  }

  // 2. Strict match for SUV height clearance (>= 2.5m)
  if (vehicleType === 'SUV') {
    const suvSlot = vacantSlots.find(s => s.slotType === 'SUV' || (parseFloat(s.height) >= 2.5));
    if (suvSlot) return suvSlot;
  }

  // 3. Two-wheeler match
  if (vehicleType === 'TWO_WHEELER') {
    const twSlot = vacantSlots.find(s => s.slotType === 'TWO_WHEELER');
    if (twSlot) return twSlot;
  }

  // 4. Preferred allocation match
  const allocSlot = vacantSlots.find(s => s.allocation === allocationPreference);
  if (allocSlot) return allocSlot;

  // 5. Fallback to any vacant slot in B1 > B2 > B3 > Ground
  const priorityBasement: ('B1' | 'B2' | 'B3' | 'Ground' | 'Driveway')[] = ['B1', 'B2', 'B3', 'Ground', 'Driveway'];
  for (const b of priorityBasement) {
    const bSlot = vacantSlots.find(s => s.basement === b);
    if (bSlot) return bSlot;
  }

  return vacantSlots[0];
}

// Vehicle Entry Workflow
export function processVehicleEntry(params: {
  vehicleNumber: string;
  vehicleType?: VehicleType;
  entryType: EntryType;
  preferredBasement?: string;
  targetSlotNumber?: string;
  remarks?: string;
}): { success: boolean; message: string; slot?: ParkingSlot; log?: ParkingLog } {
  const storeData = getStore();
  const cleanVehicleNum = params.vehicleNumber.trim().toUpperCase();

  // Check if already parked
  const alreadyParked = storeData.slots.find(s => s.currentVehicle === cleanVehicleNum && s.status === 'OCCUPIED');
  if (alreadyParked) {
    return {
      success: false,
      message: `Vehicle ${cleanVehicleNum} is ALREADY parked in slot ${alreadyParked.slotNumber} (${alreadyParked.basement}).`,
      slot: alreadyParked,
    };
  }

  // Look up employee record
  const employee = storeData.employees.find(e => e.vehicleNumber.toUpperCase() === cleanVehicleNum);
  const detectedType = params.vehicleType || (employee ? employee.vehicleType : 'SEDAN');

  let targetSlot: ParkingSlot | null = null;

  // Check if attendant specified a custom target slot
  if (params.targetSlotNumber) {
    const customSlot = storeData.slots.find(
      s => s.slotNumber.toUpperCase() === params.targetSlotNumber?.toUpperCase()
    );
    if (customSlot && customSlot.status === 'VACANT') {
      targetSlot = customSlot;
    }
  }

  // Allocate slot using Rules Engine if custom slot not provided or unavailable
  if (!targetSlot) {
    targetSlot = findBestSlot(detectedType, detectedType === 'SUV' ? '2.5m' : '2.0m', employee ? 'EMPLOYEE' : 'VISITOR');
  }

  if (!targetSlot) {
    return {
      success: false,
      message: 'FULL CAPACITY: No vacant compatible parking slot available for this vehicle type.',
    };
  }

  // Update Slot
  targetSlot.status = 'OCCUPIED';
  targetSlot.currentVehicle = cleanVehicleNum;
  targetSlot.updatedAt = new Date().toISOString();

  // Create ParkingLog
  const newLog: ParkingLog = {
    id: `log-${Date.now()}`,
    vehicleNumber: cleanVehicleNum,
    employeeId: employee ? employee.id : null,
    employeeName: employee ? employee.name : 'Guest Visitor',
    department: employee ? employee.department : 'Visitor',
    slotId: targetSlot.id,
    slotNumber: targetSlot.slotNumber,
    basement: targetSlot.basement,
    entryTime: new Date().toISOString(),
    exitTime: null,
    durationMinutes: null,
    entryType: params.entryType,
    status: 'ACTIVE',
    remarks: params.remarks || (employee ? `Employee ${employee.employeeId} - ${employee.designation}` : 'Visitor Gate Entry'),
  };

  storeData.logs.unshift(newLog);

  // Clear non-parked alert if previously flagged
  storeData.alerts = storeData.alerts.filter(a => a.vehicleNumber.toUpperCase() !== cleanVehicleNum);

  saveDB();

  return {
    success: true,
    message: `Entry Granted! Assigned Slot: ${targetSlot.slotNumber} (${targetSlot.floorLocation})`,
    slot: targetSlot,
    log: newLog,
  };
}

// Vehicle Exit Workflow
export function processVehicleExit(vehicleNumberOrSlot: string): { success: boolean; message: string; log?: ParkingLog; slot?: ParkingSlot; durationMinutes?: number } {
  const storeData = getStore();
  const searchKey = vehicleNumberOrSlot.trim().toUpperCase();

  // Find slot or active log
  const slot = storeData.slots.find(
    s => (s.currentVehicle && s.currentVehicle.toUpperCase() === searchKey) || s.slotNumber.toUpperCase() === searchKey
  );

  if (!slot || slot.status !== 'OCCUPIED' || !slot.currentVehicle) {
    return {
      success: false,
      message: `No active occupied vehicle found matching '${searchKey}'.`,
    };
  }

  const vehicleNum = slot.currentVehicle;

  // Find active log
  const activeLog = storeData.logs.find(l => l.slotId === slot.id && l.status === 'ACTIVE');

  const exitTime = new Date().toISOString();
  let durationMinutes = 45;

  if (activeLog) {
    const entryDate = new Date(activeLog.entryTime);
    durationMinutes = Math.max(1, Math.round((new Date().getTime() - entryDate.getTime()) / 60000));
    activeLog.exitTime = exitTime;
    activeLog.durationMinutes = durationMinutes;
    activeLog.status = 'COMPLETED';
    activeLog.remarks = `Exit processed at ${new Date().toLocaleTimeString()}. Duration: ${durationMinutes} mins.`;
  }

  // Free slot
  slot.status = 'VACANT';
  slot.currentVehicle = null;
  slot.updatedAt = exitTime;

  saveDB();

  return {
    success: true,
    message: `Exit Processed for ${vehicleNum}. Slot ${slot.slotNumber} is now VACANT. Duration: ${durationMinutes} mins.`,
    log: activeLog,
    slot,
    durationMinutes,
  };
}

// Predictive Analytics Hourly Time-Series Forecast Generator
export function generate24HourPredictiveForecast(): PredictiveAnalyticsReport {
  const storeData = getStore();
  const totalSlots = storeData.slots.length; // 1080

  const hours = [
    '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
    '06:00', '07:00', '08:00', '09:00', '09:30', '10:00',
    '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
  ];

  // Base occupancy curve profile for corporate parking
  const profilePcts = [
    12, 10, 8, 8, 10, 15,
    25, 45, 78, 92, 96, 94,
    91, 88, 86, 85, 82, 79,
    65, 48, 32, 22, 18, 14, 12
  ];

  let peakHour = '09:30 AM';
  let peakOccupancyPct = 96;

  const hourlyForecast: ForecastHourData[] = hours.map((hr, idx) => {
    const basePct = profilePcts[idx];
    const isPeak = basePct >= 92;
    const b1Pct = Math.min(100, Math.round(basePct * 1.05));
    const b2Pct = Math.min(100, Math.round(basePct * 0.98));
    const b3Pct = Math.min(100, Math.round(basePct * 0.88));
    const evPct = Math.min(100, Math.round(basePct * 1.12));

    const expectedEntries = isPeak ? 140 : basePct > 50 ? 45 : 10;
    const expectedExits = hr >= '17:00' ? 120 : basePct > 50 ? 25 : 5;

    let rec = undefined;
    if (isPeak) {
      rec = 'Trigger Stacker Overflow B3 & Restrict Visitor Driveway';
    } else if (hr === '08:00' || hr === '09:00') {
      rec = 'Activate Automated ANPR Gate Lanes 1 & 2 for Express Entry';
    } else if (hr === '17:00' || hr === '18:00') {
      rec = 'Pre-position Puzzle Stackers to Ground Level for Evening Rush Exit';
    }

    return {
      hour: hr,
      hour24: parseInt(hr.split(':')[0], 10),
      totalOccupancyPct: basePct,
      b1OccupancyPct: b1Pct,
      b2OccupancyPct: b2Pct,
      b3OccupancyPct: b3Pct,
      evOccupancyPct: evPct,
      expectedEntries,
      expectedExits,
      isPeakHour: isPeak,
      recommendedAction: rec,
    };
  });

  const projectedPeakOccupied = Math.round(totalSlots * (peakOccupancyPct / 100));

  return {
    generatedAt: new Date().toISOString(),
    peakHour,
    peakOccupancyPct,
    totalSlots,
    projectedPeakOccupied,
    hourlyForecast,
    aiRecommendations: [
      'Morning Peak Notice: High demand expected between 09:15 AM - 10:00 AM reaching 96% occupancy (1,036 slots).',
      'EV Charging Demand Alert: B1 EV Hub projected at 100% capacity by 10:15 AM. Recommend 3-hour dwell time limit rule.',
      'Puzzle Stacker Optimization: B1 & B2 Puzzle stackers should pre-sequence lower pallets before 08:30 AM arrival wave.',
      'Non-Parked Roster Verification: Schedule FCM cutoff alert scan at 10:30 AM for off-site or unregistered employee vehicles.',
    ],
    floorBreakdown: [
      { floor: 'Basement B1', totalSlots: 320, projectedPeakOccupied: 314, peakPct: 98 },
      { floor: 'Basement B2', totalSlots: 360, projectedPeakOccupied: 345, peakPct: 96 },
      { floor: 'Basement B3', totalSlots: 320, projectedPeakOccupied: 288, peakPct: 90 },
      { floor: 'Ground & Driveway', totalSlots: 80, projectedPeakOccupied: 72, peakPct: 90 },
    ],
  };
}

// Run 10:30 AM Non-Parked Employee Roster Scan
export function runNonParkedRosterScan(): { scanTime: string; totalActiveEmployees: number; detectedOccupied: number; nonParkedCount: number; alerts: NonParkedAlert[] } {
  const storeData = getStore();

  const occupiedVehicleSet = new Set(
    storeData.slots.filter(s => s.status === 'OCCUPIED' && s.currentVehicle).map(s => s.currentVehicle!.toUpperCase())
  );

  const activeEmployees = storeData.employees.filter(e => e.isActive);
  const newAlerts: NonParkedAlert[] = [];

  activeEmployees.forEach((emp) => {
    if (!occupiedVehicleSet.has(emp.vehicleNumber.toUpperCase())) {
      const existing = storeData.alerts.find(a => a.employeeId === emp.employeeId);
      if (existing) {
        newAlerts.push(existing);
      } else {
        const createdAlert: NonParkedAlert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          department: emp.department,
          vehicleNumber: emp.vehicleNumber,
          vehicleType: emp.vehicleType,
          mobile: emp.mobile,
          cutoffTime: '10:30 AM',
          status: 'NOTIFIED_FCM',
          notifiedAt: new Date().toISOString(),
          remarks: `System cutoff scan at 10:30 AM: Vehicle ${emp.vehicleNumber} not detected in PMS occupied logs. Push notification dispatched.`,
        };
        newAlerts.push(createdAlert);
      }
    }
  });

  storeData.alerts = newAlerts;
  saveDB();

  return {
    scanTime: new Date().toLocaleTimeString(),
    totalActiveEmployees: activeEmployees.length,
    detectedOccupied: activeEmployees.length - newAlerts.length,
    nonParkedCount: newAlerts.length,
    alerts: newAlerts,
  };
}

// Single Employee Save/Update
export function saveOrUpdateEmployee(empData: Partial<Employee>): Employee {
  const storeData = getStore();
  const now = new Date().toISOString();
  let existingIndex = -1;

  if (empData.id) {
    existingIndex = storeData.employees.findIndex(e => e.id === empData.id);
  } else if (empData.employeeId) {
    existingIndex = storeData.employees.findIndex(e => e.employeeId.toUpperCase() === empData.employeeId!.toUpperCase());
  }

  const status: EmployeeStatus = empData.status || (empData.isActive ? 'ACTIVE' : 'INACTIVE');
  const isActive = status === 'ACTIVE';

  if (existingIndex >= 0) {
    const existing = storeData.employees[existingIndex];
    const updated: Employee = {
      ...existing,
      ...empData,
      employeeId: empData.employeeId || existing.employeeId,
      name: empData.name || existing.name,
      department: empData.department || existing.department,
      designation: empData.designation || existing.designation,
      mobile: empData.mobile || existing.mobile,
      email: empData.email || existing.email,
      vehicleNumber: (empData.vehicleNumber || existing.vehicleNumber).trim().toUpperCase(),
      vehicleType: empData.vehicleType || existing.vehicleType,
      vehicleBrand: empData.vehicleBrand || existing.vehicleBrand,
      status,
      isActive,
      registrationType: empData.registrationType || existing.registrationType || 'PARKING_ADMIN',
      updatedAt: now,
    };
    storeData.employees[existingIndex] = updated;
    saveDB();
    return updated;
  } else {
    const newEmp: Employee = {
      id: empData.id || `emp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeId: empData.employeeId || `EMP-${1000 + storeData.employees.length + 1}`,
      name: empData.name || 'New Whitelist Employee',
      department: empData.department || 'Operations',
      designation: empData.designation || 'Staff',
      mobile: empData.mobile || '+91 9800000000',
      email: empData.email || 'employee@company.com',
      vehicleNumber: (empData.vehicleNumber || 'KA-01-EX-0000').trim().toUpperCase(),
      vehicleType: empData.vehicleType || 'SEDAN',
      vehicleBrand: empData.vehicleBrand || 'Standard',
      status,
      isActive,
      registrationType: empData.registrationType || 'PARKING_ADMIN',
      createdAt: now,
      updatedAt: now,
    };
    storeData.employees.unshift(newEmp);
    saveDB();
    return newEmp;
  }
}

// Bulk Upload Whitelist Registration
export function bulkUploadEmployees(list: Array<Partial<Employee>>): { added: number; updated: number; total: number } {
  let added = 0;
  let updated = 0;

  for (const item of list) {
    if (!item.vehicleNumber && !item.employeeId) continue;
    const storeData = getStore();
    const cleanPlate = (item.vehicleNumber || '').trim().toUpperCase();
    const cleanEmpId = (item.employeeId || '').trim().toUpperCase();

    const existing = storeData.employees.find(
      e => (cleanEmpId && e.employeeId.toUpperCase() === cleanEmpId) || (cleanPlate && e.vehicleNumber.toUpperCase() === cleanPlate)
    );

    if (existing) {
      updated++;
    } else {
      added++;
    }
    saveOrUpdateEmployee({
      ...item,
      registrationType: item.registrationType || 'PARKING_ADMIN',
    });
  }

  return { added, updated, total: getStore().employees.length };
}

// Get Employee by Email or EmployeeId
export function getEmployeeByEmailOrId(query: string): Employee | undefined {
  const storeData = getStore();
  const q = (query || '').trim().toLowerCase();
  if (!q) return undefined;
  return storeData.employees.find(
    e => e.email.toLowerCase() === q || e.employeeId.toLowerCase() === q || e.vehicleNumber.toLowerCase() === q
  );
}

// Update Employee Vehicle directly from Mobile App
export function updateEmployeeVehicle(params: {
  employeeId?: string;
  email?: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  vehicleBrand?: string;
  updateReason?: string;
}): { success: boolean; message: string; employee?: Employee } {
  const storeData = getStore();
  const cleanPlate = (params.vehicleNumber || '').trim().toUpperCase();

  if (!cleanPlate) {
    return { success: false, message: 'Valid vehicle license plate number is required.' };
  }

  // Find employee by employeeId or email
  let emp = storeData.employees.find(e =>
    (params.employeeId && e.employeeId.toUpperCase() === params.employeeId.toUpperCase()) ||
    (params.email && e.email.toLowerCase() === params.email.toLowerCase())
  );

  const now = new Date().toISOString();

  if (!emp && params.email) {
    // Create new active employee on the fly if not in roster
    emp = saveOrUpdateEmployee({
      email: params.email,
      name: params.email.includes('@') ? params.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Corporate Employee',
      employeeId: params.employeeId || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicleNumber: cleanPlate,
      vehicleType: params.vehicleType || 'SEDAN',
      vehicleBrand: params.vehicleBrand || 'Personal Vehicle',
      status: 'ACTIVE',
      isActive: true,
      registrationType: 'EMPLOYEE_SELF',
    });

    return {
      success: true,
      message: `New vehicle ${cleanPlate} registered and whitelisted successfully for ${emp.name}!`,
      employee: emp,
    };
  }

  if (emp) {
    const oldPlate = emp.vehicleNumber;
    emp.vehicleNumber = cleanPlate;
    emp.vehicleType = params.vehicleType || emp.vehicleType;
    if (params.vehicleBrand) {
      emp.vehicleBrand = params.vehicleBrand;
    }
    emp.updatedAt = now;

    // Sync any active registration requests for this user
    if (storeData.registrationRequests) {
      const activeReq = storeData.registrationRequests.find(
        r => r.email.toLowerCase() === emp!.email.toLowerCase() || r.employeeId === emp!.employeeId
      );
      if (activeReq) {
        activeReq.vehicleNumber = cleanPlate;
        activeReq.vehicleType = params.vehicleType || activeReq.vehicleType;
        if (params.vehicleBrand) activeReq.vehicleBrand = params.vehicleBrand;
        activeReq.status = 'APPROVED';
        activeReq.updatedAt = now;
      }
    }

    saveDB();

    return {
      success: true,
      message: `Vehicle successfully updated from ${oldPlate || 'N/A'} to ${cleanPlate} (${emp.vehicleType} - ${emp.vehicleBrand}). Gate ANPR passes updated!`,
      employee: emp,
    };
  }

  return { success: false, message: 'Employee record not found.' };
}

// Single Slot Save/Update

export function saveOrUpdateSlot(slotData: Partial<ParkingSlot>): ParkingSlot {
  const storeData = getStore();
  const now = new Date().toISOString();
  let existingIndex = -1;

  if (slotData.id) {
    existingIndex = storeData.slots.findIndex(s => s.id === slotData.id);
  } else if (slotData.slotNumber) {
    existingIndex = storeData.slots.findIndex(s => s.slotNumber.toUpperCase() === slotData.slotNumber!.toUpperCase());
  }

  if (existingIndex >= 0) {
    const existing = storeData.slots[existingIndex];
    const updated: ParkingSlot = {
      ...existing,
      ...slotData,
      slotNumber: (slotData.slotNumber || existing.slotNumber).trim().toUpperCase(),
      basement: slotData.basement || existing.basement,
      floorLocation: slotData.floorLocation || existing.floorLocation,
      slotType: slotData.slotType || existing.slotType,
      height: slotData.height || existing.height,
      parkingType: slotData.parkingType || existing.parkingType,
      allocation: slotData.allocation || existing.allocation,
      status: slotData.status || existing.status,
      currentVehicle: slotData.status === 'VACANT' ? undefined : (slotData.currentVehicle ?? existing.currentVehicle),
    };
    storeData.slots[existingIndex] = updated;
    saveDB();
    return updated;
  } else {
    const newSlot: ParkingSlot = {
      id: slotData.id || `slot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      slotNumber: (slotData.slotNumber || 'B1-P01-S01').trim().toUpperCase(),
      basement: slotData.basement || 'B1',
      floorLocation: slotData.floorLocation || 'Level 1 Stacker',
      slotType: slotData.slotType || 'SEDAN',
      height: slotData.height || 'Standard (2.0m)',
      parkingType: slotData.parkingType || 'PUZZLE',
      allocation: slotData.allocation || 'EMPLOYEE',
      status: slotData.status || 'VACANT',
      currentVehicle: slotData.currentVehicle,
    };
    storeData.slots.unshift(newSlot);
    saveDB();
    return newSlot;
  }
}

// Bulk Upload Slot Inventory
export function bulkUploadSlots(list: Array<Partial<ParkingSlot>>): { added: number; updated: number; total: number } {
  let added = 0;
  let updated = 0;

  for (const item of list) {
    if (!item.slotNumber) continue;
    const storeData = getStore();
    const cleanSlotNum = item.slotNumber.trim().toUpperCase();

    const existing = storeData.slots.find(
      s => s.slotNumber.toUpperCase() === cleanSlotNum
    );

    if (existing) {
      updated++;
    } else {
      added++;
    }
    saveOrUpdateSlot(item);
  }

  return { added, updated, total: getStore().slots.length };
}

// Domain Whitelist Management
export function getWhitelistedDomains(): WhitelistedDomain[] {
  return getStore().whitelistedDomains || [];
}

export function addWhitelistedDomain(domainInput: string, addedBy: string = 'Parking Admin'): { success: boolean; message: string; domain?: WhitelistedDomain } {
  const storeData = getStore();
  const cleanDomain = domainInput.replace(/^@/, '').trim().toLowerCase();

  if (!cleanDomain || !cleanDomain.includes('.')) {
    return { success: false, message: 'Invalid domain format. Example: company.com' };
  }

  if (!storeData.whitelistedDomains) {
    storeData.whitelistedDomains = [];
  }

  const existing = storeData.whitelistedDomains.find(d => d.domain.toLowerCase() === cleanDomain);
  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      saveDB();
      return { success: true, message: `Domain @${cleanDomain} re-activated on Whitelist.`, domain: existing };
    }
    return { success: false, message: `Domain @${cleanDomain} is ALREADY on the Whitelist.` };
  }

  const newDom: WhitelistedDomain = {
    id: `dom-${Date.now()}`,
    domain: cleanDomain,
    addedBy,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  storeData.whitelistedDomains.push(newDom);
  saveDB();

  return {
    success: true,
    message: `Domain @${cleanDomain} successfully added to Whitelist!`,
    domain: newDom,
  };
}

export function removeWhitelistedDomain(domainId: string): { success: boolean; message: string } {
  const storeData = getStore();
  if (!storeData.whitelistedDomains) return { success: false, message: 'No domains registered.' };

  const idx = storeData.whitelistedDomains.findIndex(d => d.id === domainId || d.domain.toLowerCase() === domainId.toLowerCase());
  if (idx < 0) {
    return { success: false, message: 'Whitelisted domain not found.' };
  }

  const removed = storeData.whitelistedDomains[idx];
  storeData.whitelistedDomains.splice(idx, 1);
  saveDB();

  return {
    success: true,
    message: `Domain @${removed.domain} removed from Whitelist.`,
  };
}

// Registration Requests Workflow
export function getRegistrationRequests(): RegistrationRequest[] {
  return getStore().registrationRequests || [];
}

export function submitRegistrationRequest(data: Partial<RegistrationRequest>): { success: boolean; message: string; request?: RegistrationRequest } {
  const storeData = getStore();
  const email = (data.email || '').trim().toLowerCase();
  const vehicleNumber = (data.vehicleNumber || '').trim().toUpperCase();

  if (!email || !email.includes('@')) {
    return { success: false, message: 'Valid email address is required for domain authentication.' };
  }

  if (!data.name || !vehicleNumber) {
    return { success: false, message: 'Name and Vehicle License Plate Number are required.' };
  }

  // Domain Authentication Verification
  const emailDomain = email && email.includes('@') ? (email.split('@')[1]?.toLowerCase() || '') : '';
  const allowedDomains = (storeData.whitelistedDomains || []).filter(d => d.isActive).map(d => d.domain.toLowerCase());

  if (!emailDomain || (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain))) {
    return {
      success: false,
      message: `DOMAIN AUTHENTICATION FAILED: Email domain '@${emailDomain || 'unknown'}' is NOT whitelisted. Registration is strictly restricted to authorized corporate domains (${allowedDomains.map(d => '@' + d).join(', ')}).`,
    };
  }

  // Check if vehicle already exists in active employees whitelist
  const existingEmp = storeData.employees.find(e => e.vehicleNumber.toUpperCase() === vehicleNumber);
  if (existingEmp) {
    return {
      success: false,
      message: `Vehicle ${vehicleNumber} is ALREADY registered in the Active Employee Whitelist (${existingEmp.name}, ${existingEmp.employeeId}).`,
    };
  }

  // Check if already submitted pending request
  const existingReq = (storeData.registrationRequests || []).find(
    r => r.email.toLowerCase() === email || r.vehicleNumber.toUpperCase() === vehicleNumber
  );

  if (existingReq && existingReq.status === 'PENDING') {
    return {
      success: false,
      message: `A registration request for ${email} / ${vehicleNumber} is ALREADY pending Parking Admin review.`,
    };
  }

  const newRequest: RegistrationRequest = {
    id: `req-${Date.now()}`,
    employeeId: data.employeeId || `EMP-${2000 + Math.floor(Math.random() * 8000)}`,
    name: data.name,
    department: data.department || 'General Staff',
    designation: data.designation || 'Employee',
    email: email,
    mobile: data.mobile || '+91 9800000000',
    vehicleNumber: vehicleNumber,
    vehicleType: data.vehicleType || 'SEDAN',
    vehicleBrand: data.vehicleBrand || 'Standard',
    status: 'PENDING',
    registrationType: data.registrationType || 'EMPLOYEE_SELF',
    createdAt: new Date().toISOString(),
  };

  if (!storeData.registrationRequests) {
    storeData.registrationRequests = [];
  }
  storeData.registrationRequests.unshift(newRequest);
  saveDB();

  return {
    success: true,
    message: `Domain Authenticated (@${emailDomain})! Your registration request for vehicle ${vehicleNumber} has been submitted to Parking Admin for review.`,
    request: newRequest,
  };
}

export function approveRegistrationRequest(requestId: string): { success: boolean; message: string; employee?: Employee } {
  const storeData = getStore();
  if (!storeData.registrationRequests) {
    return { success: false, message: 'No registration requests found.' };
  }

  const req = storeData.registrationRequests.find(r => r.id === requestId);
  if (!req) {
    return { success: false, message: 'Registration request not found.' };
  }

  if (req.status === 'APPROVED') {
    return { success: false, message: 'This registration request has already been APPROVED.' };
  }

  // Update status
  req.status = 'APPROVED';
  req.reviewedAt = new Date().toISOString();

  // Automatically add to Employee Whitelist Master
  const newEmp = saveOrUpdateEmployee({
    employeeId: req.employeeId,
    name: req.name,
    department: req.department,
    designation: req.designation,
    email: req.email,
    mobile: req.mobile,
    vehicleNumber: req.vehicleNumber,
    vehicleType: req.vehicleType,
    vehicleBrand: req.vehicleBrand,
    status: 'ACTIVE',
    isActive: true,
    registrationType: req.registrationType || 'EMPLOYEE_SELF',
  });

  saveDB();

  return {
    success: true,
    message: `APPROVED! Employee ${req.name} (${req.vehicleNumber}) is now active in the Whitelist Master. ANPR access granted.`,
    employee: newEmp,
  };
}

export function rejectRegistrationRequest(requestId: string, reason?: string): { success: boolean; message: string } {
  const storeData = getStore();
  if (!storeData.registrationRequests) {
    return { success: false, message: 'No registration requests found.' };
  }

  const req = storeData.registrationRequests.find(r => r.id === requestId);
  if (!req) {
    return { success: false, message: 'Registration request not found.' };
  }

  req.status = 'REJECTED';
  req.reviewedAt = new Date().toISOString();
  req.rejectionReason = reason || 'Rejected by Parking Admin';

  saveDB();

  return {
    success: true,
    message: `Registration request for ${req.name} (${req.vehicleNumber}) has been REJECTED.`,
  };
}

export function bulkUploadRegistrations(
  items: Partial<RegistrationRequest>[],
  autoApprove: boolean = false
): { success: boolean; added: number; updated: number; message: string; errors: string[] } {
  const storeData = getStore();
  if (!storeData.registrationRequests) {
    storeData.registrationRequests = [];
  }

  let added = 0;
  let updated = 0;
  const errors: string[] = [];

  const allowedDomains = (storeData.whitelistedDomains || [])
    .filter(d => d.isActive)
    .map(d => d.domain.toLowerCase());

  items.forEach((item, index) => {
    const email = (item.email || '').trim().toLowerCase();
    const vehicleNumber = (item.vehicleNumber || '').trim().toUpperCase();
    const name = (item.name || '').trim();

    if (!name || !vehicleNumber || !email) {
      errors.push(`Row ${index + 1}: Missing name, email, or vehicle number.`);
      return;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (allowedDomains.length > 0 && emailDomain && !allowedDomains.includes(emailDomain)) {
      errors.push(`Row ${index + 1} (${email}): Domain '@${emailDomain}' is not whitelisted.`);
      return;
    }

    const existingIndex = storeData.registrationRequests.findIndex(
      r => r.vehicleNumber.toUpperCase() === vehicleNumber || r.email.toLowerCase() === email
    );

    const now = new Date().toISOString();
    const isApproved = autoApprove;
    const reqType = item.registrationType || 'PARKING_ADMIN';

    if (existingIndex !== -1) {
      const existing = storeData.registrationRequests[existingIndex];
      existing.name = name;
      existing.department = item.department || existing.department || 'General Staff';
      existing.designation = item.designation || existing.designation || 'Employee';
      existing.mobile = item.mobile || existing.mobile || '+91 9800000000';
      existing.vehicleType = (item.vehicleType as VehicleType) || existing.vehicleType || 'SEDAN';
      existing.vehicleBrand = item.vehicleBrand || existing.vehicleBrand || 'Standard';
      existing.registrationType = reqType;
      if (autoApprove) {
        existing.status = 'APPROVED';
        existing.reviewedAt = now;
        saveOrUpdateEmployee({
          employeeId: existing.employeeId,
          name: existing.name,
          department: existing.department,
          designation: existing.designation,
          email: existing.email,
          mobile: existing.mobile,
          vehicleNumber: existing.vehicleNumber,
          vehicleType: existing.vehicleType,
          vehicleBrand: existing.vehicleBrand,
          status: 'ACTIVE',
          isActive: true,
          registrationType: reqType,
        });
      }
      updated++;
    } else {
      const newReq: RegistrationRequest = {
        id: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        employeeId: item.employeeId || `EMP-${2000 + Math.floor(Math.random() * 8000)}`,
        name: name,
        department: item.department || 'General Staff',
        designation: item.designation || 'Employee',
        email: email,
        mobile: item.mobile || '+91 9800000000',
        vehicleNumber: vehicleNumber,
        vehicleType: (item.vehicleType as VehicleType) || 'SEDAN',
        vehicleBrand: item.vehicleBrand || 'Standard',
        status: isApproved ? 'APPROVED' : 'PENDING',
        registrationType: reqType,
        createdAt: now,
        reviewedAt: isApproved ? now : undefined,
      };

      if (isApproved) {
        saveOrUpdateEmployee({
          employeeId: newReq.employeeId,
          name: newReq.name,
          department: newReq.department,
          designation: newReq.designation,
          email: newReq.email,
          mobile: newReq.mobile,
          vehicleNumber: newReq.vehicleNumber,
          vehicleType: newReq.vehicleType,
          vehicleBrand: newReq.vehicleBrand,
          status: 'ACTIVE',
          isActive: true,
          registrationType: reqType,
        });
      }

      storeData.registrationRequests.unshift(newReq);
      added++;
    }
  });

  saveDB();

  return {
    success: true,
    added,
    updated,
    message: `Bulk registration completed! Added ${added} new records, updated ${updated} existing records.`,
    errors,
  };
}

// --- Slot Relocation / Changing Option for Attendants ---
export function getSlotChangeNotifications(): SlotChangeNotification[] {
  return getStore().slotChangeNotifications || [];
}

export function changeVehicleSlot(
  vehicleNumberOrSlot: string,
  newSlotNumberInput: string,
  reason: string = 'Attendant Re-allocation',
  attendantName: string = 'Attendant'
): { success: boolean; message: string; notification?: SlotChangeNotification } {
  const storeData = getStore();
  const query = vehicleNumberOrSlot.trim().toUpperCase();
  const targetSlotNum = newSlotNumberInput.trim().toUpperCase();

  if (!query || !targetSlotNum) {
    return { success: false, message: 'Vehicle number (or current slot) and Target Slot Number are required.' };
  }

  // 1. Find the current slot and vehicle number
  let currentSlot = storeData.slots.find(
    (s) => (s.currentVehicle && s.currentVehicle.toUpperCase() === query) || s.slotNumber.toUpperCase() === query
  );

  let vehicleNum = query;
  if (currentSlot && currentSlot.currentVehicle) {
    vehicleNum = currentSlot.currentVehicle.toUpperCase();
  }

  if (!currentSlot || currentSlot.status !== 'OCCUPIED') {
    return {
      success: false,
      message: `No active occupied vehicle slot found for query '${query}'. Please verify vehicle or current slot.`,
    };
  }

  // 2. Find target slot
  const newSlot = storeData.slots.find((s) => s.slotNumber.toUpperCase() === targetSlotNum);
  if (!newSlot) {
    return { success: false, message: `Target slot '${targetSlotNum}' does not exist in inventory.` };
  }

  if (newSlot.id === currentSlot.id) {
    return { success: false, message: `Vehicle is ALREADY parked in slot '${targetSlotNum}'.` };
  }

  if (newSlot.status !== 'VACANT') {
    return {
      success: false,
      message: `Target slot '${targetSlotNum}' is currently ${newSlot.status} (Occupied by ${newSlot.currentVehicle || 'another vehicle'}).`,
    };
  }

  // 3. Move vehicle: vacate old slot & occupy new slot
  const oldSlotNumber = currentSlot.slotNumber;
  currentSlot.status = 'VACANT';
  currentSlot.currentVehicle = null;
  currentSlot.updatedAt = new Date().toISOString();

  newSlot.status = 'OCCUPIED';
  newSlot.currentVehicle = vehicleNum;
  newSlot.updatedAt = new Date().toISOString();

  // 4. Update active Parking Log
  const activeLog = storeData.logs.find(
    (l) => l.vehicleNumber.toUpperCase() === vehicleNum && (l.status === 'ACTIVE' || !l.exitTime)
  );

  if (activeLog) {
    activeLog.slotId = newSlot.id;
    activeLog.slotNumber = newSlot.slotNumber;
    activeLog.basement = newSlot.basement;
    activeLog.remarks = `${activeLog.remarks || ''} [Slot Changed: ${oldSlotNumber} -> ${newSlot.slotNumber} by ${attendantName} (${reason})]`.trim();
  }

  // 5. Check if vehicle belongs to a registered employee for mobile SMS dispatch
  const emp = storeData.employees.find((e) => e.vehicleNumber.toUpperCase() === vehicleNum);
  const smsText = `PARKOS DRIVER ALERT: Vehicle ${vehicleNum} slot updated from ${oldSlotNumber} to ${newSlot.slotNumber} (${newSlot.basement}, ${newSlot.parkingType} Level, ${newSlot.height}). Reason: ${reason}. Attendant: ${attendantName}.`;

  const notification: SlotChangeNotification = {
    id: `notif-${Date.now()}`,
    vehicleNumber: vehicleNum,
    oldSlotNumber,
    newSlotNumber: newSlot.slotNumber,
    employeeName: emp?.name,
    mobile: emp?.mobile || '+91 9800000000',
    changedBy: attendantName,
    changedAt: new Date().toISOString(),
    smsSent: true,
    messageText: smsText,
  };

  if (!storeData.slotChangeNotifications) {
    storeData.slotChangeNotifications = [];
  }
  storeData.slotChangeNotifications.unshift(notification);

  saveDB();

  return {
    success: true,
    message: `SLOT CHANGED SUCCESSFULLY! Vehicle ${vehicleNum} moved from ${oldSlotNumber} to ${newSlot.slotNumber}. SMS notification sent to driver.`,
    notification,
  };
}

// --- Platform Master Site Configuration & Invoicing Functions ---
export function getSites(): SiteConfig[] {
  const storeData = getStore();
  if (!storeData.sites || storeData.sites.length === 0) {
    storeData.sites = [
      {
        id: 'site-1',
        siteCode: 'SITE-BLR-01',
        siteName: 'Tech Park HQ Main Hub',
        city: 'Bengaluru',
        address: 'Outer Ring Road, Marathahalli, Bengaluru 560103',
        contactPerson: 'Rajesh Sharma',
        contactEmail: 'rajesh.sharma@techpark.com',
        contactPhone: '+91 9876500001',
        totalSlots: 1080,
        basementLevels: 3,
        hasPuzzleParking: true,
        hasEVCharging: true,
        status: 'ACTIVE',
        pricing: { hourlyRate: 50, dailyMaxRate: 400, monthlyPassRate: 3500, currency: 'INR', taxPercentage: 18 },
        onboardedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'site-2',
        siteCode: 'SITE-HYD-02',
        siteName: 'Cyber Tower Innovation Park',
        city: 'Hyderabad',
        address: 'Hitec City, Madhapur, Hyderabad 500081',
        contactPerson: 'Ananya Rao',
        contactEmail: 'ananya.rao@cybertowers.io',
        contactPhone: '+91 9876500002',
        totalSlots: 650,
        basementLevels: 2,
        hasPuzzleParking: true,
        hasEVCharging: true,
        status: 'ACTIVE',
        pricing: { hourlyRate: 40, dailyMaxRate: 300, monthlyPassRate: 2800, currency: 'INR', taxPercentage: 18 },
        onboardedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'site-3',
        siteCode: 'SITE-MUM-03',
        siteName: 'BKC Corporate Financial Center',
        city: 'Mumbai',
        address: 'Bandra Kurla Complex, Bandra East, Mumbai 400051',
        contactPerson: 'Vikram Mehta',
        contactEmail: 'vikram.mehta@bkccenter.com',
        contactPhone: '+91 9876500003',
        totalSlots: 820,
        basementLevels: 3,
        hasPuzzleParking: true,
        hasEVCharging: true,
        status: 'ACTIVE',
        pricing: { hourlyRate: 60, dailyMaxRate: 500, monthlyPassRate: 4500, currency: 'INR', taxPercentage: 18 },
        onboardedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    saveDB();
  }
  return storeData.sites;
}

export function onboardSite(siteInput: Partial<SiteConfig>): { success: boolean; message: string; site?: SiteConfig } {
  const storeData = getStore();

  const siteName = (siteInput.siteName || '').trim();
  const siteCode = (siteInput.siteCode || `SITE-${Math.floor(100 + Math.random() * 900)}`).trim().toUpperCase();
  const city = (siteInput.city || '').trim();

  if (!siteName || !city) {
    return { success: false, message: 'Site Name and City location are required.' };
  }

  if (!storeData.sites) {
    storeData.sites = [];
  }

  const existing = storeData.sites.find((s) => s.siteCode === siteCode || s.siteName.toLowerCase() === siteName.toLowerCase());
  if (existing) {
    return { success: false, message: `Site '${siteName}' (${siteCode}) is ALREADY onboarded.` };
  }

  const newSite: SiteConfig = {
    id: `site-${Date.now()}`,
    siteCode,
    siteName,
    city,
    address: siteInput.address || `${city} Parking Complex`,
    contactPerson: siteInput.contactPerson || 'Site Facility Manager',
    contactEmail: siteInput.contactEmail || `admin@${siteCode.toLowerCase()}.com`,
    contactPhone: siteInput.contactPhone || '+91 9800000000',
    totalSlots: siteInput.totalSlots || 500,
    basementLevels: siteInput.basementLevels || 2,
    hasPuzzleParking: siteInput.hasPuzzleParking ?? true,
    hasEVCharging: siteInput.hasEVCharging ?? true,
    status: 'ACTIVE',
    pricing: siteInput.pricing || {
      hourlyRate: 50,
      dailyMaxRate: 350,
      monthlyPassRate: 3000,
      currency: 'INR',
      taxPercentage: 18,
    },
    onboardedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  storeData.sites.unshift(newSite);

  // Generate initial Onboarding setup invoice automatically
  if (!storeData.invoices) storeData.invoices = [];
  const initialInvoice: SiteInvoice = {
    id: `inv-${Date.now()}`,
    invoiceNumber: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
    siteId: newSite.id,
    siteName: newSite.siteName,
    billingPeriod: 'Onboarding & Platform Setup',
    baseAmount: 120000,
    taxAmount: 21600,
    totalAmount: 141600,
    currency: 'INR',
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    status: 'UNPAID',
    createdAt: new Date().toISOString(),
    notes: 'Initial site onboarding fee, telemetry integration, and ANPR camera setup.',
  };
  storeData.invoices.unshift(initialInvoice);

  saveDB();

  return {
    success: true,
    message: `SITE ONBOARDED SUCCESSFULLY! '${newSite.siteName}' (${newSite.siteCode}) is now live. Onboarding invoice generated.`,
    site: newSite,
  };
}

export function updateSiteStatus(
  siteId: string,
  status: SiteStatus,
  holdReason?: string
): { success: boolean; message: string; site?: SiteConfig } {
  const storeData = getStore();
  if (!storeData.sites) return { success: false, message: 'No sites found.' };

  const site = storeData.sites.find((s) => s.id === siteId || s.siteCode === siteId);
  if (!site) return { success: false, message: 'Site not found.' };

  site.status = status;
  site.updatedAt = new Date().toISOString();
  if (status === 'ON_HOLD') {
    site.holdReason = holdReason || 'Service temporarily held by Platform Owner';
  } else {
    delete site.holdReason;
  }

  saveDB();

  const statusLabel = status === 'ACTIVE' ? 'RESUMED / ACTIVE' : status === 'ON_HOLD' ? 'PLACED ON HOLD' : 'DEACTIVATED';
  return {
    success: true,
    message: `Site '${site.siteName}' status updated to ${statusLabel}.`,
    site,
  };
}

export function deleteSite(siteId: string): { success: boolean; message: string } {
  const storeData = getStore();
  if (!storeData.sites) return { success: false, message: 'No sites found.' };

  const idx = storeData.sites.findIndex((s) => s.id === siteId || s.siteCode === siteId);
  if (idx < 0) return { success: false, message: 'Site not found.' };

  const removed = storeData.sites[idx];
  storeData.sites.splice(idx, 1);

  saveDB();

  return {
    success: true,
    message: `Site '${removed.siteName}' (${removed.siteCode}) deleted permanently from Platform Configuration Master.`,
  };
}

export function updateSitePricing(siteId: string, pricing: SitePricing): { success: boolean; message: string; site?: SiteConfig } {
  const storeData = getStore();
  if (!storeData.sites) return { success: false, message: 'No sites found.' };

  const site = storeData.sites.find((s) => s.id === siteId || s.siteCode === siteId);
  if (!site) return { success: false, message: 'Site not found.' };

  site.pricing = pricing;
  site.updatedAt = new Date().toISOString();

  saveDB();

  return {
    success: true,
    message: `Site '${site.siteName}' pricing structure updated successfully.`,
    site,
  };
}

// Invoices
export function getInvoices(siteId?: string): SiteInvoice[] {
  const invoices = getStore().invoices || [];
  if (siteId && siteId !== 'ALL') {
    return invoices.filter((i) => i.siteId === siteId);
  }
  return invoices;
}

export function generateSiteInvoice(data: {
  siteId: string;
  billingPeriod: string;
  baseAmount: number;
  notes?: string;
}): { success: boolean; message: string; invoice?: SiteInvoice } {
  const storeData = getStore();
  const site = (storeData.sites || []).find((s) => s.id === data.siteId);

  if (!site) return { success: false, message: 'Invalid site selected.' };

  const taxRate = (site.pricing?.taxPercentage || 18) / 100;
  const taxAmount = Math.round(data.baseAmount * taxRate);
  const totalAmount = data.baseAmount + taxAmount;

  const newInvoice: SiteInvoice = {
    id: `inv-${Date.now()}`,
    invoiceNumber: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
    siteId: site.id,
    siteName: site.siteName,
    billingPeriod: data.billingPeriod || 'Current Cycle',
    baseAmount: data.baseAmount,
    taxAmount,
    totalAmount,
    currency: site.pricing?.currency || 'INR',
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    status: 'UNPAID',
    createdAt: new Date().toISOString(),
    notes: data.notes || 'Monthly platform software license & hardware telemetry fee.',
  };

  if (!storeData.invoices) storeData.invoices = [];
  storeData.invoices.unshift(newInvoice);

  saveDB();

  return {
    success: true,
    message: `INVOICE ${newInvoice.invoiceNumber} raised for '${site.siteName}' (Total: ₹${totalAmount.toLocaleString()}).`,
    invoice: newInvoice,
  };
}

export function updateInvoiceStatus(
  invoiceId: string,
  status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED'
): { success: boolean; message: string } {
  const storeData = getStore();
  if (!storeData.invoices) return { success: false, message: 'No invoices found.' };

  const inv = storeData.invoices.find((i) => i.id === invoiceId || i.invoiceNumber === invoiceId);
  if (!inv) return { success: false, message: 'Invoice not found.' };

  inv.status = status;
  saveDB();

  return {
    success: true,
    message: `Invoice ${inv.invoiceNumber} status updated to ${status}.`,
  };
}

// ==========================================
// VALETX SERVICE FUNCTIONS
// ==========================================

export function getValetTickets(): ValetTicket[] {
  const storeData = getStore();
  if (!storeData.valetTickets) {
    storeData.valetTickets = [];
    saveDB();
  }
  return storeData.valetTickets;
}

export function createValetTicket(data: {
  vehicleNumber: string;
  vehicleType?: VehicleType;
  vehicleBrand?: string;
  guestName: string;
  guestPhone: string;
  keyTagNumber?: string;
  ticketType?: ValetTicketType;
  assignedValetDriver?: string;
  assignedSlotNumber?: string;
  parkingNotes?: string;
  feeAmount?: number;
}): { success: boolean; message: string; ticket?: ValetTicket } {
  const storeData = getStore();
  if (!storeData.valetTickets) storeData.valetTickets = [];

  const ticketSeq = 1000 + storeData.valetTickets.length + 1;
  const ticketNumber = `VX-${ticketSeq}`;
  const keyTag = data.keyTagNumber || `K-${Math.floor(100 + Math.random() * 900)}`;

  // Auto assign slot if not provided
  let slotNumber = data.assignedSlotNumber;
  if (!slotNumber) {
    const vacantSlot = storeData.slots.find((s) => s.status === 'VACANT');
    slotNumber = vacantSlot ? vacantSlot.slotNumber : 'B1-VIP-VALET';
  }

  const newTicket: ValetTicket = {
    id: `valet-${Date.now()}`,
    ticketNumber,
    keyTagNumber: keyTag,
    vehicleNumber: data.vehicleNumber.toUpperCase().trim(),
    vehicleType: data.vehicleType || 'SEDAN',
    vehicleBrand: data.vehicleBrand || 'Unknown',
    guestName: data.guestName.trim(),
    guestPhone: data.guestPhone.trim(),
    assignedValetDriver: data.assignedValetDriver || 'Unassigned Valet',
    assignedSlotNumber: slotNumber,
    status: 'PARKED',
    ticketType: data.ticketType || 'STANDARD',
    receivedAt: new Date().toISOString(),
    parkedAt: new Date().toISOString(),
    retrievalSMSKey: ticketNumber.replace('VX-', 'VX-'),
    parkingNotes: data.parkingNotes || 'ValetX Check-in complete',
    feeAmount: data.feeAmount || 150,
    paymentStatus: 'PAID',
  };

  storeData.valetTickets.unshift(newTicket);
  saveDB();

  return {
    success: true,
    message: `ValetX Ticket ${ticketNumber} issued successfully for ${newTicket.vehicleNumber} (Key Tag: ${keyTag}).`,
    ticket: newTicket,
  };
}

export function updateValetStatus(data: {
  ticketId: string;
  status: ValetStatus;
  assignedSlotNumber?: string;
  assignedValetDriver?: string;
  tipAmount?: number;
  notes?: string;
}): { success: boolean; message: string; ticket?: ValetTicket } {
  const storeData = getStore();
  if (!storeData.valetTickets) return { success: false, message: 'No tickets found.' };

  const ticket = storeData.valetTickets.find(
    (t) => t.id === data.ticketId || t.ticketNumber === data.ticketId || t.keyTagNumber === data.ticketId
  );

  if (!ticket) {
    return { success: false, message: 'ValetX ticket not found.' };
  }

  ticket.status = data.status;
  if (data.assignedSlotNumber) ticket.assignedSlotNumber = data.assignedSlotNumber;
  if (data.assignedValetDriver) ticket.assignedValetDriver = data.assignedValetDriver;
  if (data.tipAmount !== undefined) ticket.tipAmount = data.tipAmount;
  if (data.notes) ticket.parkingNotes = data.notes;

  if (data.status === 'RETRIEVAL_REQUESTED' && !ticket.retrievalRequestedAt) {
    ticket.retrievalRequestedAt = new Date().toISOString();
  } else if (data.status === 'RETRIEVED_DELIVERED') {
    ticket.deliveredAt = new Date().toISOString();
  }

  saveDB();

  return {
    success: true,
    message: `ValetX Ticket ${ticket.ticketNumber} updated to state ${data.status}.`,
    ticket,
  };
}

export function requestValetRetrieval(query: string): { success: boolean; message: string; ticket?: ValetTicket } {
  const storeData = getStore();
  if (!storeData.valetTickets) return { success: false, message: 'No tickets found.' };

  const cleanQuery = query.toUpperCase().trim();
  const ticket = storeData.valetTickets.find(
    (t) =>
      t.ticketNumber.toUpperCase() === cleanQuery ||
      t.keyTagNumber.toUpperCase() === cleanQuery ||
      t.vehicleNumber.replace(/\s+/g, '').includes(cleanQuery.replace(/\s+/g, '')) ||
      t.guestPhone.includes(cleanQuery)
  );

  if (!ticket) {
    return { success: false, message: 'No active valet record matching ticket, key tag, or phone number.' };
  }

  ticket.status = 'RETRIEVAL_REQUESTED';
  ticket.retrievalRequestedAt = new Date().toISOString();
  saveDB();

  return {
    success: true,
    message: `Vehicle retrieval requested for ${ticket.vehicleNumber} (Key Tag: ${ticket.keyTagNumber}). Valet runner notified.`,
    ticket,
  };
}

// ==========================================
// USER MANAGEMENT & RBAC SERVICE FUNCTIONS
// ==========================================

export function getAppRoles(): RolePermissionConfig[] {
  const storeData = getStore();
  if (!storeData.appRoles || storeData.appRoles.length === 0) {
    const { roles: defaultRoles } = getDefaultRolesAndUsers();
    storeData.appRoles = defaultRoles;
    saveDB();
  }
  return storeData.appRoles;
}

export function saveAppRole(roleConfig: Partial<RolePermissionConfig>): { success: boolean; message: string; role?: RolePermissionConfig } {
  const storeData = getStore();
  if (!storeData.appRoles) storeData.appRoles = [];

  if (roleConfig.id) {
    const index = storeData.appRoles.findIndex((r) => r.id === roleConfig.id);
    if (index !== -1) {
      storeData.appRoles[index] = { ...storeData.appRoles[index], ...roleConfig } as RolePermissionConfig;
      saveDB();
      return { success: true, message: `Role '${storeData.appRoles[index].roleName}' permissions updated successfully.`, role: storeData.appRoles[index] };
    }
  }

  const newRole: RolePermissionConfig = {
    id: `role-${Date.now()}`,
    roleCode: roleConfig.roleCode || 'CUSTOM',
    roleName: roleConfig.roleName || 'Custom Operational Role',
    description: roleConfig.description || 'Custom role with tailored site & module access.',
    isSystemDefault: false,
    siteScope: roleConfig.siteScope || 'ASSIGNED_SITES_ONLY',
    modulePermissions: roleConfig.modulePermissions || {
      HOME: { enabled: true, canCreate: true, canEdit: true, canDelete: false, canExport: true },
      FLOOR_PLAN: { enabled: true, canCreate: true, canEdit: true, canDelete: false, canExport: true },
      VALET_SERVICE: { enabled: true, canCreate: true, canEdit: true, canDelete: false, canExport: true },
      LOGS: { enabled: true, canCreate: false, canEdit: false, canDelete: false, canExport: true },
      ANALYTICS: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      INVENTORY: { enabled: true, canCreate: false, canEdit: true, canDelete: false, canExport: true },
      MOBILE_APP: { enabled: true, canCreate: true, canEdit: true, canDelete: false, canExport: false },
      EMPLOYEE_MOBILE_APP: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      REGISTRATION: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      APPROVALS: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      ALERTS: { enabled: true, canCreate: false, canEdit: true, canDelete: false, canExport: false },
      MASTER_CONFIG: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      USER_MANAGEMENT: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
      SECURITY_AUDIT: { enabled: false, canCreate: false, canEdit: false, canDelete: false, canExport: false },
    },
    createdAt: new Date().toISOString(),
  };

  storeData.appRoles.push(newRole);
  saveDB();

  return { success: true, message: `New role '${newRole.roleName}' created successfully.`, role: newRole };
}

export function deleteAppRole(roleId: string): { success: boolean; message: string } {
  const storeData = getStore();
  if (!storeData.appRoles) return { success: false, message: 'No roles found.' };

  const role = storeData.appRoles.find((r) => r.id === roleId);
  if (!role) return { success: false, message: 'Role not found.' };
  if (role.isSystemDefault) {
    return { success: false, message: 'System default core roles cannot be deleted.' };
  }

  // Check if assigned to any user
  const assignedUsers = (storeData.appUsers || []).filter((u) => u.roleId === roleId);
  if (assignedUsers.length > 0) {
    return { success: false, message: `Cannot delete role '${role.roleName}'. It is assigned to ${assignedUsers.length} user(s). Reassign them first.` };
  }

  storeData.appRoles = storeData.appRoles.filter((r) => r.id !== roleId);
  saveDB();

  return { success: true, message: `Role '${role.roleName}' removed successfully.` };
}

// Explicit allow-list DTO — lists exactly which AppUser fields reach the
// client, rather than spreading the full record and deleting sensitive
// ones. This matters because an allow-list fails safe: a new sensitive
// field added to AppUser later (a new credential type, an internal note,
// etc.) is excluded by default until someone deliberately adds it here.
// A delete-based/blocklist approach fails open — it leaks by default
// until someone remembers to update it. Use this for every AppUser (or
// AppUser[]) that gets sent in any API response, with no exceptions.
export function toPublicUser(user: AppUser): PublicAppUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    designation: user.designation,
    roleId: user.roleId,
    roleName: user.roleName,
    siteScopeType: user.siteScopeType,
    assignedSiteIds: user.assignedSiteIds,
    assignedSiteNames: user.assignedSiteNames,
    status: user.status,
    customModuleOverrides: user.customModuleOverrides,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    mustChangePassword: user.mustChangePassword,
    // passwordHash and passwordSalt deliberately omitted — not present in
    // PublicAppUser's type at all, so including them here would be a
    // compile error, not just a runtime mistake.
  };
}

export function toPublicUsers(users: AppUser[]): PublicAppUser[] {
  return users.map(toPublicUser);
}

export function getAppUsers(): AppUser[] {
  const storeData = getStore();
  if (!storeData.appUsers || storeData.appUsers.length === 0) {
    const { users: defaultUsers } = getDefaultRolesAndUsers();
    storeData.appUsers = defaultUsers;
    saveDB();
  }
  return storeData.appUsers;
}

export function saveAppUser(userData: Partial<AppUser>): { success: boolean; message: string; user?: AppUser } {
  const storeData = getStore();
  if (!storeData.appUsers) storeData.appUsers = [];

  // Match role name
  const role = (storeData.appRoles || []).find((r) => r.id === userData.roleId);
  const roleName = role ? role.roleName : userData.roleName || 'Site Facility Manager';

  // Site Names lookup
  const sites = storeData.sites || [];
  let siteNames: string[] = [];
  if (userData.siteScopeType === 'ALL_SITES') {
    siteNames = ['All Enterprise Sites'];
  } else if (userData.assignedSiteIds && userData.assignedSiteIds.length > 0) {
    siteNames = userData.assignedSiteIds.map((sid) => {
      const match = sites.find((s) => s.id === sid || s.siteCode === sid);
      return match ? match.siteName : sid;
    });
  }

  if (userData.id) {
    const index = storeData.appUsers.findIndex((u) => u.id === userData.id);
    if (index !== -1) {
      const existing = storeData.appUsers[index];
      let passHash = existing.passwordHash;
      let passSalt = existing.passwordSalt;

      if ((userData as any).plainPassword) {
        const hashed = hashPassword((userData as any).plainPassword);
        passHash = hashed.hash;
        passSalt = hashed.salt;
      }

      storeData.appUsers[index] = {
        ...existing,
        ...userData,
        roleName,
        assignedSiteNames: siteNames,
        passwordHash: passHash,
        passwordSalt: passSalt,
      } as AppUser;
      saveDB();
      return { success: true, message: `User '${storeData.appUsers[index].fullName}' updated successfully.`, user: storeData.appUsers[index] };
    }
  }

  // New user password
  const initialPassword = (userData as any).plainPassword || 'Matrix@2026';
  const initialHash = hashPassword(initialPassword);

  const newUser: AppUser = {
    id: `usr-${Date.now()}`,
    username: userData.username || `user.${Math.floor(100 + Math.random() * 899)}`,
    fullName: userData.fullName || 'New Facility Operator',
    email: userData.email || 'operator@parkos.ai',
    phone: userData.phone || '+91 98000 00000',
    designation: userData.designation || 'Parking Operator',
    roleId: userData.roleId || 'role-site-manager',
    roleName,
    siteScopeType: userData.siteScopeType || 'SPECIFIC_SITES',
    assignedSiteIds: userData.assignedSiteIds || ['site-1'],
    assignedSiteNames: siteNames,
    status: userData.status || 'ACTIVE',
    customModuleOverrides: userData.customModuleOverrides || {},
    passwordHash: initialHash.hash,
    passwordSalt: initialHash.salt,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  storeData.appUsers.unshift(newUser);
  saveDB();

  return { success: true, message: `User '${newUser.fullName}' created and credentials generated successfully.`, user: newUser };
}

export function setUserPassword(userIdOrEmail: string, newPlainPassword: string): { success: boolean; message: string; user?: AppUser } {
  const storeData = getStore();
  if (!storeData.appUsers) return { success: false, message: 'No users found.' };

  const clean = userIdOrEmail.toLowerCase().trim();
  const user = storeData.appUsers.find(
    (u) => u.id === userIdOrEmail || u.email.toLowerCase().trim() === clean || u.username.toLowerCase().trim() === clean
  );

  if (!user) {
    return { success: false, message: `User "${userIdOrEmail}" not found.` };
  }

  const cleanPassword = typeof newPlainPassword === 'string' ? newPlainPassword.replace(/^\x00+|\x00+$/g, '') : '';
  if (cleanPassword.length < 8 || cleanPassword.length > 64) {
    return { success: false, message: 'Password must be between 8 and 64 characters in length.' };
  }

  const { hash, salt } = hashPassword(cleanPassword);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  user.mustChangePassword = false;
  saveDB();

  return {
    success: true,
    message: `Password for ${user.fullName} (${user.email}) has been updated successfully.`,
    user,
  };
}

export function deleteAppUser(userId: string): { success: boolean; message: string } {
  const storeData = getStore();
  if (!storeData.appUsers) return { success: false, message: 'No users found.' };

  const user = storeData.appUsers.find((u) => u.id === userId);
  if (!user) return { success: false, message: 'User not found.' };

  storeData.appUsers = storeData.appUsers.filter((u) => u.id !== userId);
  saveDB();

  return { success: true, message: `User '${user.fullName}' removed from the system.` };
}

export function toggleUserModuleOverride(userId: string, moduleId: AppModuleId, enabled: boolean): { success: boolean; message: string; user?: AppUser } {
  const storeData = getStore();
  if (!storeData.appUsers) return { success: false, message: 'No users found.' };

  const user = storeData.appUsers.find((u) => u.id === userId);
  if (!user) return { success: false, message: 'User not found.' };

  if (!user.customModuleOverrides) {
    user.customModuleOverrides = {};
  }

  user.customModuleOverrides[moduleId] = enabled;
  saveDB();

  return {
    success: true,
    message: `Module '${moduleId}' access for ${user.fullName} updated to ${enabled ? 'ENABLED' : 'DISABLED'}.`,
    user,
  };
}



