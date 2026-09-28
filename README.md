# Digi-Parking PMS (Enterprise Multi-Site Parking Management System)

A production-ready, cloud-native Parking Management and Allocation System (PMS) built with React 18, TypeScript, Tailwind CSS, Node.js / Express, and Google Cloud Firestore.

Designed for multi-tenant commercial complexes, IT parks, corporate towers, and multi-level puzzle/stacker parking facilities.

---

## 🚀 Key Modules & Role Workflows

### 1. 🏢 Master Admin (Platform & Multi-Site Governance)
- **Site Provisioning & Onboarding**: Create, configure, put on hold, and decommission individual parking facilities/towers with custom slot height limits, EV charger counts, and tiered hourly/monthly billing rates.
- **Role-Based Access Control (RBAC)**: Manage user accounts, enforce PBKDF2/SHA-256 secure password policies, and assign users with `ALL_SITES` access or scoped access to specific facilities (`SPECIFIC_SITES`).
- **Whitelisted Corporate Email Domains**: Enforce domain-based verification (`@company.com`) for self-service employee pass generation.
- **Relocation & Relocation Audit Logging**: Track emergency vehicle relocations and system configuration changes with immutable timestamps.

### 2. 🏗️ Site Admin (Facility Operations & Inventory Management)
- **Inventory Master & 400-Doc Batch Upload**: Create and manage physical slots (`STANDARD`, `PUZZLE`, `STACKER`, `VALET`) with height clearances (Standard 2.0m, Tall 2.4m, High-Roof 2.8m). Upload thousands of inventory slots in parallelized Firestore batches.
- **Live Interactive Floor Plan**: Real-time 2D floor visualizer with color-coded live states:
  - 🟢 **Vacant**
  - 🔴 **Occupied** (displaying parked vehicle plate & entry timestamp)
  - 🟡 **Reserved** (VIP/Executive slots)
  - ⚪ **Out of Service** (Maintenance/Mechanical Stacker lockdown)
- **Employee Pass Approval**: Review self-registered employee vehicle pass applications, grant approvals, or revoke active passes.

### 3. 🛡️ Attendant & Gate Security (Fast Field Ops Mobile App)
- **ANPR / Fast Plate Scanning & Entry Check-in**: Scan or manually enter license plates. Automated validation against employee pass registry, height clearances, and EV bay requirements.
- **Automated Slot Allocation**: Directs drivers to the optimal vacant slot based on vehicle height and facility rules.
- **Exit Checkout & Duration Tracking**: Computes elapsed parking duration and releases allocated slots back to inventory instantaneously.
- **Live Slot Relocation**: Reallocate vehicles from one mechanical stacker slot to another with automated driver notification dispatch.

### 4. 📱 Employee Self-Service Mobile Portal
- **Self-Registration**: Register employee ID, department, corporate email, mobile number, and vehicle registration certificate.
- **Digital QR Parking Pass**: Instant visual QR pass displaying allocated basement, zone, and real-time valet retrieval status.
- **Non-Parked & Overstay Notifications**: Automated alerts if vehicles remain parked beyond permitted facility shift limits.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide React icons, Motion animations.
- **Backend API**: Express on Node.js running on Port `3000` with high-throughput ANPR rate limiting (600 req/min), CORS, and input sanitization.
- **Cloud Database**: Google Cloud Firestore (`digi-parking-pms`) with real-time `onSnapshot` subscriptions and 400-document batch transactions.
- **Authentication**: Hybrid authentication engine supporting Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`) and PBKDF2/SHA-256 fallback hashing.

---

## 📁 Project Structure

```
.
├── src/
│   ├── components/
│   │   ├── AttendantMobileApp.tsx    # Gate operations, ANPR check-in/out, slot relocation
│   │   ├── EmployeeMobileApp.tsx     # Employee digital pass, live parking status
│   │   ├── EmployeeRegistration.tsx  # Employee pass registration & admin approval table
│   │   ├── Header.tsx                # Context bar, site selector, active user switcher
│   │   ├── InventoryMaster.tsx       # Slot creation, CSV bulk upload, capacity stats
│   │   ├── LiveFloorPlan.tsx         # Interactive 2D basement layout visualizer
│   │   ├── LoginScreen.tsx           # Multi-role authentication & credential creation
│   │   ├── MasterConfigModule.tsx    # Site onboarding, pricing tiers, domain whitelists
│   │   ├── NonParkedAlerts.tsx       # Overstay detection and alert dispatches
│   │   ├── ParkingLogs.tsx           # Filterable entry/exit audit trail & CSV export
│   │   ├── RoleHomePage.tsx          # Role-based landing dashboard
│   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   ├── UserManagementModule.tsx  # User provisioning, RBAC matrix, site scoping
│   │   └── ValetXModule.tsx          # Valet ticketing, runner assignment, retrieval board
│   ├── lib/
│   │   └── firebase.ts               # Firestore DB client, Auth helpers, 400-doc batch ops
│   ├── utils/
│   │   └── plateNormalization.ts     # Vehicle plate normalization (Ind / Intl formats)
│   ├── types.ts                      # Shared TypeScript models & interfaces
│   ├── App.tsx                       # Root container, real-time Firestore synchronization
│   └── main.tsx                      # Vite React mounting point
├── server.ts                         # Custom Express backend API server
├── firestore.rules                   # Granular Cloud Firestore security rules
├── metadata.json                     # AI Studio application manifest
├── package.json                      # Scripts and dependencies
└── README.md                         # Project documentation
```

---

## ⚙️ Local Development & Setup

### Prerequisites
- Node.js 18+ or 20+
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/your-org/digi-parking-pms.git
cd digi-parking-pms

# Install dependencies
npm install

# Start the full-stack development server (Express + Vite on Port 3000)
npm run dev
```

### Building for Production
```bash
npm run build
npm start
```

---

## 🔒 Security & Firestore Rules

The system is guarded by Firestore security rules (`firestore.rules`):
- `/users`: Authenticated user access and individual UID profile ownership.
- `/sites`: Public read for self-registration site selection; write restricted to authenticated managers.
- `/registrations`: Public creation for self-service employee pass onboarding; read/update/delete restricted to administrators.
- `/whitelisted_domains`: Public read for instantaneous domain validation during registration.
- `/inventory_slots`, `/parking_logs`, `/valet_tickets`: Authenticated role-based access.

---

## 📄 License
This project is proprietary and confidential. Developed for Digi-Parking Multi-Site Parking Management.
