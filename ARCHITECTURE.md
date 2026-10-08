# Enterprise Smart Parking & Multi-Site Facility Management System
## Technical Architecture, Backend API Registry, Database Models & State Synchronization Pipelines

---

## 1. System Architecture Overview

The system is built as an enterprise-grade, high-throughput, multi-tenant parking and facility management platform designed with a hybrid full-stack architecture combining a reactive TypeScript client and a Node.js/Express server runtime backed by persistent JSON storage engines with SHA-256 cryptographic audit trails.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER (React 18 + Vite)                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  • Role Home Launchpad (Dynamic RBAC)      • Live Floor Plan & Puzzle Stacker Matrix   │
│  • Field Attendant Mobile Station         • ValetX Automation & Fast Tag Retrieval     │
│  • Master Site & Zone Configuration        • Enterprise RBAC & Site Scope Governance    │
│  • Employee Parking Registration & Passes  • Analytics & Predictive Occupancy Engine    │
└──────────────────────────┬─────────────────────────────────┬───────────────────────────┘
                           │ HTTP / JSON REST Requests       │ Client State Broadcast
                           ▼                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              API & GATEWAY LAYER (Express Server)                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  • /api/v1/auth/*        • /api/v1/rbac/*         • /api/v1/sites/*                    │
│  • /api/v1/slots/*       • /api/v1/valet/*        • /api/v1/employees/*                │
│  • /api/v1/parking/*     • /api/v1/audit/*        • /api/v1/analytics/*                │
└──────────────────────────┬─────────────────────────────────────────────────────────────┘
                           │ Synchronous Data Read/Write & HMAC Cryptographic Hashing
                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA & PERSISTENCE LAYER (src/server/db.ts)                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  • Master Sites & Facility Invoicing       • Parking Slots, Pits & Pallet Matrix       │
│  • RBAC Roles & User Account Directory    • Employee Directory & Vehicle Whitelist    │
│  • Active & Historical Parking Logs        • Valet Staging & Retrieval Queue           │
│  • Tamper-Evident SHA-256 Audit Records    • Non-Parked / Overstay Alert Engine        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Database Models & Schemas

All persistence models are strictly defined in `src/types.ts` and managed in `src/server/db.ts`.

### 2.1 Master Site & Configuration Model (`SiteConfig`, `SiteInvoice`)
```typescript
interface SiteConfig {
  id: string;                      // e.g. "SITE-01"
  siteCode: string;                // e.g. "DLF-CYBER-T3"
  siteName: string;                // e.g. "DLF CyberCity Tower 3"
  facilityType: 'OFFICE' | 'MALL' | 'HOSPITAL' | 'AIRPORT' | 'WAREHOUSE' | 'RESIDENTIAL';
  address: string;
  city: string;
  state: string;
  pincode: string;
  totalCapacity: number;
  twoWheelerCapacity: number;
  fourWheelerCapacity: number;
  status: 'ACTIVE' | 'ON_HOLD' | 'MAINTENANCE' | 'DECOMMISSIONED';
  holdReason?: string;
  billingType: 'MONTHLY_FLAT' | 'PER_SLOT_PER_DAY' | 'USAGE_TIER';
  baseRatePerSlot: number;
  taxPercentage: number;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  amenities: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 2.2 RBAC Role & User Entity Model (`AppUser`, `RolePermissionConfig`)
```typescript
interface RolePermissionConfig {
  roleId: string;                  // e.g. "SUPER_ADMIN", "SITE_MANAGER", "VALET_HEAD"
  roleName: string;
  description: string;
  isSystemRole: boolean;
  allowedModules: string[];        // Array of active module tabs
  permissionLevel: 'FULL_CONTROL' | 'OPERATIONAL_READ_WRITE' | 'OPERATIONAL_WRITE_ONLY' | 'READ_ONLY';
  siteScopePolicy: 'ALL_SITES' | 'ASSIGNED_SITES_ONLY';
  canManageUsers: boolean;
  canManageMasterConfig: boolean;
  canExportReports: boolean;
  canApprovePasses: boolean;
  canOverrideSlots: boolean;
}

interface AppUser {
  id: string;                      // e.g. "USR-001"
  username: string;
  email: string;
  fullName: string;
  phone: string;
  roleId: string;
  roleName: string;
  designation: string;
  siteScopeType: 'ALL_SITES' | 'SPECIFIC_SITES';
  assignedSiteIds: string[];       // Foreign keys to SiteConfig.id
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  customAllowedModules?: string[]; // Per-user module overrides
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 Parking Slot & Mechanical Stacker Pallet (`ParkingSlot`)
```typescript
interface ParkingSlot {
  id: string;
  siteId: string;                  // Foreign key to SiteConfig.id
  slotNumber: string;              // e.g. "P1-A01"
  slotType: 'STANDARD' | 'MECHANICAL_PUZZLE' | 'EV_CHARGING' | 'VIP_RESERVED' | 'HANDICAPPED';
  vehicleType: 'TWO_WHEELER' | 'FOUR_WHEELER';
  floorLevel: string;              // e.g. "B1", "B2", "G"
  zone: string;                    // e.g. "Zone A", "Zone B"
  pitNumber?: string;              // Stacker Pit Reference
  palletLevel?: number;            // Stacker level: 0 (Ground), 1 (Upper), -1 (Pit)
  status: 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE' | 'BLOCKED';
  currentVehicle?: string;         // Vehicle Plate Number
  employeeId?: string;             // Associated Employee/Driver ID
  occupiedSince?: string;
  isLocked?: boolean;
}
```

### 2.4 Active & Historic Movement Logs (`ParkingLog`, `ValetTask`)
```typescript
interface ParkingLog {
  id: string;
  siteId: string;
  ticketNumber: string;
  vehicleNumber: string;
  vehicleType: 'TWO_WHEELER' | 'FOUR_WHEELER';
  entryTime: string;
  exitTime?: string;
  slotNumber: string;
  driverName?: string;
  driverPhone?: string;
  entryGate: string;
  exitGate?: string;
  status: 'ACTIVE_PARKED' | 'EXITED' | 'OVERSTAY' | 'UNAUTHORIZED';
  amountDue?: number;
  paymentStatus?: 'PAID' | 'UNPAID' | 'COMPLIMENTARY';
  paymentMode?: 'CASH' | 'UPI' | 'FASTAG' | 'PAYROLL_DEDUCTION';
}
```

---

## 3. Backend API Route Registry

All endpoints are hosted on `http://0.0.0.0:3000/api/v1/` and serve pure JSON payloads.

| Method | Endpoint Route | Description & Data Handling |
|---|---|---|
| **GET** | `/api/v1/health` | Service health status check. |
| **POST** | `/api/v1/auth/login` | Validates credentials, returns authenticated user entity with role matrix. |
| **GET** | `/api/v1/sites` | Fetches all onboarded enterprise facilities. |
| **POST** | `/api/v1/sites/onboard` | Provisions a new facility with capacities, rates, and amenities. |
| **POST** | `/api/v1/sites/status` | Updates facility operational state (`ACTIVE`, `ON_HOLD`, `MAINTENANCE`). |
| **POST** | `/api/v1/sites/pricing` | Modifies billing structure, base slot fees, and tax percentages. |
| **DELETE** | `/api/v1/sites/delete` | Decommissions a site from active management. |
| **GET** | `/api/v1/rbac/roles` | Retrieves all system roles and fine-grained permission configs. |
| **POST** | `/api/v1/rbac/roles` | Creates or updates a role's permissions, site scope policy, and module access. |
| **GET** | `/api/v1/rbac/users` | Lists all administrative and operational users. |
| **POST** | `/api/v1/rbac/users` | Creates or updates an enterprise user, role assignment, and site scopes. |
| **POST** | `/api/v1/rbac/users/status` | Toggles user status (`ACTIVE`, `SUSPENDED`). |
| **POST** | `/api/v1/rbac/users/toggle-module` | Applies user-specific module access overrides. |
| **GET** | `/api/v1/slots` | Returns real-time slot and mechanical pallet inventory. |
| **POST** | `/api/v1/slots/status` | Modifies slot operational status or clears occupation. |
| **POST** | `/api/v1/slots/bulk-upload` | Imports structured CSV slot inventory with pit and zone mapping. |
| **POST** | `/api/v1/parking/entry` | Records vehicle check-in and occupies corresponding slot. |
| **POST** | `/api/v1/parking/exit` | Marks vehicle exit, vacates pallet/slot, and calculates tariff. |
| **GET** | `/api/v1/valet/tasks` | Retrieves active valet staging, parked keys, and retrieval queue. |
| **POST** | `/api/v1/valet/tasks` | Updates valet lifecycle (Staged &rarr; Parked &rarr; Requested &rarr; Delivered). |
| **GET** | `/api/v1/employees` | Fetches registered employees, authorized plates, and digital passes. |
| **POST** | `/api/v1/employees/register` | Submits new employee parking pass application. |
| **POST** | `/api/v1/employees/approve` | Approves or rejects pending employee pass requests. |
| **GET** | `/api/v1/audit/logs` | Fetches immutable SHA-256 cryptographic compliance audit entries. |
| **GET** | `/api/v1/analytics/dashboard` | Generates predictive occupancy, dwell times, and revenue metrics. |

---

## 4. State Synchronization Pipelines

The platform implements bidirectional state synchronization to ensure data consistency across multi-user environments:

```
[ Master Site Configuration ] ──(Site Scope Mapping)──► [ User Management & RBAC ]
             │                                                      │
     (Site Context ID)                                      (Role Permission)
             ▼                                                      ▼
[ Site Filter / Scope Header ] ◄──(Active Scope Filter)──► [ Module Visibility Engine ]
             │                                                      │
             ▼                                                      ▼
[ Live Stacker & Floor Plan ] ◄──(Real-time State)──────► [ Field Attendant Mobile ]
             │                                                      │
             └────────────────► [ Audit Logging Pipeline ] ◄────────┘
                                 (SHA-256 HMAC Signature)
```

### 4.1 Master Config & Site Scope Synchronization
1. When a facility is added, edited, or put on hold via **Master Configuration**, the server commits changes to the database and invokes `onRefresh()`.
2. `fetchSites()` triggers across `App.tsx`, immediately updating:
   - The **Site Scope Switcher** in the top navigation bar.
   - The **Site Allocation Multi-Select** inside User Management.
   - The **Permitted Sites Directory** within the logged-in User Profile popover.

### 4.2 RBAC Permission & Session Synchronization
1. When an administrator modifies a role's permissions or toggles a user's module access, `onRefreshAll()` broadcasts updates to `App.tsx`.
2. `fetchUsers()` fetches the fresh record for the active session and re-synchronizes `localStorage`.
3. The **Sidebar Navigation** and **Role Home Launchpad** dynamically recalculate visible modules without requiring a logout or hard refresh.

### 4.3 Slot Inventory & Vehicle Exit Synchronization
1. When a parking attendant or operator triggers **Mark Exit** from the Floor Plan, Inventory Master, or Field App:
   - `handleVehicleExit()` dispatches `POST /api/v1/parking/exit`.
   - The assigned slot/pallet immediately flips from `OCCUPIED` to `VACANT`.
   - The vehicle plate is unmapped, freeing up the mechanical stacker pallet.
   - An immutable cryptographic log entry is appended to the audit ledger.

---

## 5. Security, Audit & Cryptographic Integrity

- **Cryptographic Audit Log**: Every administrative action, slot override, pass approval, and gate transaction is recorded with an incremental SHA-256 HMAC digest:
  $$\text{Record Hash} = \text{HMAC-SHA256}(\text{Timestamp} + \text{UserId} + \text{Action} + \text{PreviousHash})$$
- **Session Protection**: User profile tokens and permissions are maintained in structured session state with client-side RBAC route guarding.
- **Data Isolation**: Multi-site filtering ensures operators only access data within their authorized site scopes (`ALL_SITES` vs `ASSIGNED_SITES_ONLY`).
