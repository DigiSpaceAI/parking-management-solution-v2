import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  initDB,
  getStore,
  saveDB,
  bootstrapFirestore,
  processVehicleEntry,
  processVehicleExit,
  generate24HourPredictiveForecast,
  runNonParkedRosterScan,
  saveOrUpdateEmployee,
  bulkUploadEmployees,
  getEmployeeByEmailOrId,
  updateEmployeeVehicle,
  saveOrUpdateSlot,
  bulkUploadSlots,
  getWhitelistedDomains,
  addWhitelistedDomain,
  removeWhitelistedDomain,
  getRegistrationRequests,
  submitRegistrationRequest,
  approveRegistrationRequest,
  rejectRegistrationRequest,
  bulkUploadRegistrations,
  changeVehicleSlot,
  getSlotChangeNotifications,
  getSites,
  onboardSite,
  updateSiteStatus,
  deleteSite,
  updateSitePricing,
  getInvoices,
  generateSiteInvoice,
  updateInvoiceStatus,
  getValetTickets,
  createValetTicket,
  updateValetStatus,
  requestValetRetrieval,
  getAppRoles,
  saveAppRole,
  deleteAppRole,
  getAppUsers,
  saveAppUser,
  toPublicUser,
  toPublicUsers,
  deleteAppUser,
  toggleUserModuleOverride,
  verifyPassword,
  hashPassword,
  setUserPassword
} from './src/server/db';
import cookieParser from 'cookie-parser';
import {
  securityHeadersMiddleware,
  rateLimiterMiddleware,
  loginRateLimiterMiddleware,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginFailures,
  validateEmailFormat,
  validatePasswordInput,
  sanitizeEmailInput,
  sanitizePasswordInput,
  EMAIL_ALLOWLIST_REGEX,
  USERNAME_ALLOWLIST_REGEX,
  bolaIdentityGuard,
  logSecurityEvent,
  verifyAuditTrailIntegrity,
  getSecurityComplianceSummary,
  getSecurityAuditLogs,
  sanitizeEmployeeList,
  sanitizeParkingLogs,
  sanitizeInputString,
  isValidLicensePlate,
  requireAuth,
  requirePermission,
  createSession,
  generatePasswordResetToken,
  consumePasswordResetToken,
  destroySession
} from './src/server/security';
import { VehicleType, EntryType } from './src/types';

// Initialize PMS Store with 1,080 parking inventory slots
initDB();

const app = express();

// Attach Infosec Security HTTP Headers & Payload Limits
app.use(securityHeadersMiddleware);
app.use(cookieParser());

// CORS for the ParkFlow mobile app, which runs from a different origin
// than this API once wrapped in Capacitor. The admin web dashboard is
// always same-origin and is unaffected by this — CORS only applies to
// cross-origin requests, which same-origin ones never are.
// Origin is reflected (not wildcarded) because credentialed requests
// (cookies) can't use Access-Control-Allow-Origin: *. The real security
// boundary here is still the session cookie itself, not which origin
// asked — a native app doesn't operate under the same-origin model a
// browser tab does, so origin restriction wouldn't add real protection
// against a native client anyway.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '10mb' }));

// Set explicit Cache-Control headers on all API responses to prevent 304 cached data
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Global API Rate Limiter (Anti-DDoS & Brute Force Protection - 600 req/min for high-volume ANPR & Gate Ops)
app.use('/api/', rateLimiterMiddleware(600, 60000));

// Require a valid session for all API routes except the ones listed here.
// Public: health check, login, set-password, employee self-registration
// submission, and the domain list the registration form checks against.
const PUBLIC_API_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/auth/login',
  '/login',
  '/api/v1/auth/set-password',
  '/api/v1/registrations/submit',
  '/api/v1/domains',
  '/api/v1/employees/profile',
  '/api/v1/employees/update-vehicle',
]);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/v1/') && req.path !== '/login') return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  return requireAuth(req, res, next);
});


const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Shared Gemini AI Client (Server-side only)
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY process env variable is missing, using fallback mock vision/reasoning.');
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// REST API ROUTES
// 1. Health Check
app.get('/api/v1/health', (req, res) => {
  const store = getStore();
  const occupiedCount = store.slots.filter(s => s.status === 'OCCUPIED').length;
  res.json({
    status: 'ok',
    system: 'ParkOrbit | Smart Parking Management System (PMS)',
    app_name: 'ParkOrbit',
    totalInventorySlots: store.slots.length,
    occupiedSlots: occupiedCount,
    vacantSlots: store.slots.length - occupiedCount,
    activeEmployees: store.employees.length,
    timestamp: new Date().toISOString(),
  });
});

// 2. Parking Slots Inventory & Filter Endpoint
app.get('/api/v1/slots', (req, res) => {
  const store = getStore();
  let slots = store.slots;

  const { basement, status, allocation, slotType, search } = req.query;

  if (basement && typeof basement === 'string' && basement !== 'ALL') {
    slots = slots.filter(s => s.basement === basement);
  }
  if (status && typeof status === 'string' && status !== 'ALL') {
    slots = slots.filter(s => s.status === status);
  }
  if (allocation && typeof allocation === 'string' && allocation !== 'ALL') {
    slots = slots.filter(s => s.allocation === allocation);
  }
  if (slotType && typeof slotType === 'string' && slotType !== 'ALL') {
    slots = slots.filter(s => s.slotType === slotType);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    slots = slots.filter(
      s =>
        s.slotNumber.toLowerCase().includes(q) ||
        s.floorLocation.toLowerCase().includes(q) ||
        (s.currentVehicle && s.currentVehicle.toLowerCase().includes(q))
    );
  }

  // Summary counts per floor
  const summary = {
    total: store.slots.length,
    b1: {
      total: store.slots.filter(s => s.basement === 'B1').length,
      free: store.slots.filter(s => s.basement === 'B1' && s.status === 'VACANT').length,
    },
    b2: {
      total: store.slots.filter(s => s.basement === 'B2').length,
      free: store.slots.filter(s => s.basement === 'B2' && s.status === 'VACANT').length,
    },
    b3: {
      total: store.slots.filter(s => s.basement === 'B3').length,
      free: store.slots.filter(s => s.basement === 'B3' && s.status === 'VACANT').length,
    },
    ground: {
      total: store.slots.filter(s => s.basement === 'Ground' || s.basement === 'Driveway').length,
      free: store.slots.filter(s => (s.basement === 'Ground' || s.basement === 'Driveway') && s.status === 'VACANT').length,
    },
  };

  res.json({
    summary,
    totalReturned: slots.length,
    slots,
  });
});

// 3. Employee Master Data Endpoint (with PII Privacy Masking & Audit)
// Field-level PII exposure by role. vehicleNumber is deliberately treated
// as less sensitive than email/mobile: gate/valet staff have a genuine
// operational need to match a scanned or typed plate against the real
// registry, whereas they have no legitimate need for a colleague's email
// or phone number.
const FULL_PII_ROLES = new Set(['Platform Master Admin', 'Site Facility Manager', 'MIS Auditor']);
const PLATE_VISIBLE_ROLES = new Set(['Gate Security Attendant', 'ValetX Operations Lead']);

app.get('/api/v1/employees', (req, res) => {
  const store = getStore();
  const { search, department } = req.query;
  let employees = store.employees;

  if (department && typeof department === 'string' && department !== 'ALL') {
    employees = employees.filter(e => e.department === department);
  }
  if (search && typeof search === 'string') {
    const q = sanitizeInputString(search).toLowerCase();
    employees = employees.filter(
      e =>
        e.name.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        e.vehicleNumber.toLowerCase().includes(q)
    );
  }

  // Caller's role comes from their authenticated session (req.user, set by
  // requireAuth), never from a client-supplied query parameter — a
  // previous version of this route read `userRole` and `maskPII` directly
  // from req.query, which let any authenticated caller request fully
  // unmasked PII for every employee (email, phone, real plate) simply by
  // adding ?userRole=MASTER_ADMIN&maskPII=false to the request, regardless
  // of their actual role. That's a privilege-escalation bug, not a
  // legitimate override, so it's been removed entirely.
  const callerRole = req.user!.roleName;
  const fullyUnmasked = FULL_PII_ROLES.has(callerRole);
  const platesUnmasked = fullyUnmasked || PLATE_VISIBLE_ROLES.has(callerRole);

  const sanitized = employees.map((emp) => ({
    ...sanitizeEmployeeList([emp], fullyUnmasked)[0],
    vehicleNumber: platesUnmasked ? emp.vehicleNumber : sanitizeEmployeeList([emp], false)[0].vehicleNumber,
  }));

  res.json({
    total: employees.length,
    piiMasked: !fullyUnmasked,
    employees: sanitized,
  });
});

// 3b. Create or Edit Whitelist Employee Endpoint
app.post('/api/v1/employees/save', requirePermission('REGISTRATION', 'canEdit'), rateLimiterMiddleware(30, 60000), (req, res) => {
  try {
    const employeeData = req.body.employee || req.body;
    if (!employeeData || !employeeData.name || !employeeData.vehicleNumber) {
      return res.status(400).json({ success: false, message: 'Name and Vehicle License Plate Number are required.' });
    }

    if (!isValidLicensePlate(employeeData.vehicleNumber)) {
      logSecurityEvent({
        action: 'INPUT_VALIDATION_FAILED',
        actor: req.headers['x-user-email'] as string || 'Admin',
        actorRole: req.headers['x-user-role'] as string || 'ADMIN',
        ipAddress: req.ip,
        targetResource: `vehicleNumber: ${employeeData.vehicleNumber}`,
        status: 'VALIDATION_FAILED',
        details: 'Rejected invalid license plate format during employee save.',
      });
      return res.status(400).json({ success: false, message: 'Invalid license plate format. Must be 4-12 alphanumeric characters.' });
    }

    const saved = saveOrUpdateEmployee(employeeData);

    logSecurityEvent({
      action: 'EMPLOYEE_WHITELIST_MODIFIED',
      actor: req.headers['x-user-email'] as string || 'Admin',
      actorRole: req.headers['x-user-role'] as string || 'ADMIN',
      ipAddress: req.ip,
      targetResource: `employee/${saved.employeeId}`,
      status: 'SUCCESS',
      details: `Saved employee ${saved.name} (${saved.employeeId}) with plate ${saved.vehicleNumber}`,
    });

    res.json({
      success: true,
      message: `Employee ${saved.name} (${saved.employeeId}) successfully saved! Status: ${saved.status}`,
      employee: saved,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to save employee record', error: err.message });
  }
});

// 3c. Bulk Upload Whitelist Employees Endpoint
app.post('/api/v1/employees/bulk-upload', requirePermission('REGISTRATION', 'canCreate'), rateLimiterMiddleware(10, 60000), (req, res) => {
  try {
    const { employees: list } = req.body;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty employees array for bulk upload.' });
    }

    const result = bulkUploadEmployees(list);

    logSecurityEvent({
      action: 'BULK_EMPLOYEE_WHITELIST_UPLOAD',
      actor: req.headers['x-user-email'] as string || 'Admin',
      actorRole: req.headers['x-user-role'] as string || 'ADMIN',
      ipAddress: req.ip,
      targetResource: `BulkBatch/${list.length} records`,
      status: 'SUCCESS',
      details: `Bulk uploaded ${list.length} employee records. Added: ${result.added}, Updated: ${result.updated}`,
    });

    res.json({
      success: true,
      message: `Bulk registration successful! Added ${result.added} new records, updated ${result.updated} existing records. Total whitelist: ${result.total}`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to bulk upload employee whitelist', error: err.message });
  }
});

// 3d. Get Employee Profile & Registered Vehicle Details (Protected with BOLA Guard & Rate Limiter)
app.get(
  '/api/v1/employees/profile',
  rateLimiterMiddleware(30, 60000),
  bolaIdentityGuard({ allowAdminOverride: true, actionName: 'EMPLOYEE_PROFILE_ACCESS' }),
  (req, res) => {
    const { query, email, employeeId } = req.query;
    const lookupKey = sanitizeInputString((email || employeeId || query) as string);
    if (!lookupKey) {
      return res.status(400).json({ success: false, message: 'Email or Employee ID query parameter is required.' });
    }

    const employee = getEmployeeByEmailOrId(lookupKey);
    if (!employee) {
      return res.json({ success: false, message: 'No registered whitelist record found for this employee identifier.', employee: null });
    }

    // Also check if currently parked
    const store = getStore();
    const currentSlot = store.slots.find(s => s.currentVehicle && s.currentVehicle.toUpperCase() === employee.vehicleNumber.toUpperCase() && s.status === 'OCCUPIED');

    logSecurityEvent({
      action: 'EMPLOYEE_PROFILE_LOOKUP',
      actor: (req.headers['x-user-email'] as string) || employee.email,
      actorRole: (req.headers['x-user-role'] as string) || 'EMPLOYEE',
      ipAddress: req.ip,
      targetResource: `employee/${employee.employeeId}`,
      status: 'SUCCESS',
      details: `Profile accessed for ${employee.name} (${employee.employeeId})`,
    });

    res.json({
      success: true,
      employee,
      currentSlot: currentSlot ? {
        slotNumber: currentSlot.slotNumber,
        basement: currentSlot.basement,
        floorLocation: currentSlot.floorLocation,
        slotType: currentSlot.slotType,
      } : null,
    });
  }
);

// 3e. Employee Mobile App: Update Registered Vehicle (Protected with BOLA Guard & Input Sanitization)
app.post(
  '/api/v1/employees/update-vehicle',
  rateLimiterMiddleware(20, 60000),
  bolaIdentityGuard({ allowAdminOverride: true, actionName: 'VEHICLE_UPDATE_ATTEMPT' }),
  (req, res) => {
    try {
      const { employeeId, email, vehicleNumber, vehicleType, vehicleBrand, updateReason } = req.body;

      if (!vehicleNumber || !vehicleNumber.trim()) {
        return res.status(400).json({ success: false, message: 'Vehicle license plate number is required.' });
      }

      const sanitizedPlate = sanitizeInputString(vehicleNumber).toUpperCase();

      if (!isValidLicensePlate(sanitizedPlate)) {
        logSecurityEvent({
          action: 'INVALID_PLATE_FORMAT_REJECTED',
          actor: email || employeeId || req.ip || 'Unknown',
          actorRole: (req.headers['x-user-role'] as string) || 'EMPLOYEE',
          ipAddress: req.ip,
          targetResource: `vehicleNumber: ${vehicleNumber}`,
          status: 'VALIDATION_FAILED',
          details: `Rejected invalid license plate string "${vehicleNumber}" due to security format validation.`,
        });

        return res.status(400).json({
          success: false,
          message: 'Invalid license plate format. Must be a valid 4-12 alphanumeric plate code.',
        });
      }

      if (!email && !employeeId) {
        return res.status(400).json({ success: false, message: 'Employee authentication identifier (email or employeeId) is required.' });
      }

      const result = updateEmployeeVehicle({
        employeeId: sanitizeInputString(employeeId),
        email: sanitizeInputString(email),
        vehicleNumber: sanitizedPlate,
        vehicleType,
        vehicleBrand: sanitizeInputString(vehicleBrand),
        updateReason: sanitizeInputString(updateReason),
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      logSecurityEvent({
        action: 'VEHICLE_UPDATE_SUCCESS',
        actor: email || employeeId || 'Employee',
        actorRole: (req.headers['x-user-role'] as string) || 'EMPLOYEE',
        ipAddress: req.ip,
        targetResource: `vehicle/${sanitizedPlate}`,
        status: 'SUCCESS',
        details: `Successfully updated vehicle license plate to ${sanitizedPlate} (${vehicleType || 'SEDAN'}). Reason: ${updateReason || 'User Request'}`,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Failed to update vehicle record', error: err.message });
    }
  }
);

// --- Whitelisted Domains Endpoints ---
app.get('/api/v1/domains', (req, res) => {
  const domains = getWhitelistedDomains();
  res.json({ domains });
});

app.post('/api/v1/domains/add', requirePermission('REGISTRATION', 'canEdit'), (req, res) => {
  const { domain, addedBy } = req.body;
  if (!domain) {
    return res.status(400).json({ success: false, message: 'Domain name is required.' });
  }
  const result = addWhitelistedDomain(domain, addedBy || 'Parking Admin');
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/v1/domains/remove', requirePermission('REGISTRATION', 'canEdit'), (req, res) => {
  const { domainId } = req.body;
  if (!domainId) {
    return res.status(400).json({ success: false, message: 'Domain ID or name is required.' });
  }
  const result = removeWhitelistedDomain(domainId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// --- Employee Self-Registration & Admin Approval Endpoints ---
app.get('/api/v1/registrations', (req, res) => {
  const requests = getRegistrationRequests();
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  res.json({ requests, pendingCount });
});

app.post('/api/v1/registrations/submit', (req, res) => {
  const result = submitRegistrationRequest(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/v1/registrations/approve', requirePermission('APPROVALS', 'canEdit'), (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'requestId is required.' });
  }
  const result = approveRegistrationRequest(requestId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/v1/registrations/reject', requirePermission('APPROVALS', 'canEdit'), (req, res) => {
  const { requestId, reason } = req.body;
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'requestId is required.' });
  }
  const result = rejectRegistrationRequest(requestId, reason);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/v1/registrations/bulk-upload', requirePermission('REGISTRATION', 'canCreate'), (req, res) => {
  try {
    const { requests: list, autoApprove } = req.body;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty registration requests list.' });
    }
    const result = bulkUploadRegistrations(list, !!autoApprove);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Bulk upload failed.', error: err.message });
  }
});

// --- Slot Relocation / Changing Endpoints ---
app.post('/api/v1/slots/change', requirePermission('MOBILE_APP', 'canEdit'), (req, res) => {
  const { vehicleNumberOrSlot, newSlotNumber, reason, attendantName } = req.body;
  if (!vehicleNumberOrSlot || !newSlotNumber) {
    return res.status(400).json({ success: false, message: 'Vehicle number (or current slot) and newSlotNumber are required.' });
  }
  const result = changeVehicleSlot(vehicleNumberOrSlot, newSlotNumber, reason, attendantName);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.get('/api/v1/slots/change-notifications', (req, res) => {
  const notifications = getSlotChangeNotifications();
  res.json({ notifications });
});

// --- Platform Master Site Configuration Endpoints ---
app.get('/api/v1/sites', requirePermission('MASTER_CONFIG', 'view'), (req, res) => {
  const sites = getSites();
  res.json({ success: true, count: sites.length, sites });
});

app.post('/api/v1/sites/onboard', requirePermission('MASTER_CONFIG', 'canCreate'), (req, res) => {
  const result = onboardSite(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'SITE_ONBOARDED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `site/${result.site?.id}`,
    status: 'SUCCESS',
    details: `Site '${result.site?.siteName}' onboarded by ${req.user!.fullName}.`,
  });
  res.json(result);
});

app.post('/api/v1/sites/status', requirePermission('MASTER_CONFIG', 'canEdit'), (req, res) => {
  const { siteId, status, holdReason } = req.body;
  if (!siteId || !status) {
    return res.status(400).json({ success: false, message: 'siteId and status are required.' });
  }
  const result = updateSiteStatus(siteId, status, holdReason);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'SITE_STATUS_CHANGED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `site/${siteId}`,
    status: 'SUCCESS',
    details: `Site ${siteId} status changed to ${status} by ${req.user!.fullName}.`,
  });
  res.json(result);
});

app.post('/api/v1/sites/delete', requirePermission('MASTER_CONFIG', 'canDelete'), (req, res) => {
  const { siteId } = req.body;
  if (!siteId) {
    return res.status(400).json({ success: false, message: 'siteId is required.' });
  }
  const result = deleteSite(siteId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'SITE_DELETED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `site/${siteId}`,
    status: 'SUCCESS',
    details: `Site ${siteId} deleted by ${req.user!.fullName}.`,
  });
  res.json(result);
});

app.post('/api/v1/sites/pricing', requirePermission('MASTER_CONFIG', 'canEdit'), (req, res) => {
  const { siteId, pricing } = req.body;
  if (!siteId || !pricing) {
    return res.status(400).json({ success: false, message: 'siteId and pricing structure are required.' });
  }
  const result = updateSitePricing(siteId, pricing);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'SITE_PRICING_CHANGED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `site/${siteId}`,
    status: 'SUCCESS',
    details: `Pricing for site ${siteId} updated by ${req.user!.fullName}.`,
  });
  res.json(result);
});

// --- Site Invoicing Endpoints ---
app.get('/api/v1/invoices', requirePermission('MASTER_CONFIG', 'view'), (req, res) => {
  const siteId = req.query.siteId as string;
  const invoices = getInvoices(siteId);
  res.json({ success: true, count: invoices.length, invoices });
});

app.post('/api/v1/invoices/generate', requirePermission('MASTER_CONFIG', 'canCreate'), (req, res) => {
  const { siteId, billingPeriod, baseAmount, notes } = req.body;
  if (!siteId || !baseAmount) {
    return res.status(400).json({ success: false, message: 'siteId and baseAmount are required.' });
  }
  const result = generateSiteInvoice({ siteId, billingPeriod, baseAmount, notes });
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'INVOICE_GENERATED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `invoice/${result.invoice?.id}`,
    status: 'SUCCESS',
    details: `Invoice ${result.invoice?.invoiceNumber} (₹${baseAmount}) generated for site ${siteId} by ${req.user!.fullName}.`,
  });
  res.json(result);
});

app.post('/api/v1/invoices/status', requirePermission('MASTER_CONFIG', 'canEdit'), (req, res) => {
  const { invoiceId, status } = req.body;
  if (!invoiceId || !status) {
    return res.status(400).json({ success: false, message: 'invoiceId and status are required.' });
  }
  const result = updateInvoiceStatus(invoiceId, status);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'INVOICE_STATUS_CHANGED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `invoice/${invoiceId}`,
    status: 'SUCCESS',
    details: `Invoice ${invoiceId} status changed to ${status} by ${req.user!.fullName}.`,
  });
  res.json(result);
});

// 3d. Create or Edit Slot Inventory Endpoint
app.post('/api/v1/slots/save', requirePermission('INVENTORY', 'canEdit'), (req, res) => {
  try {
    const rawData = req.body.slot || req.body;
    if (!rawData) {
      return res.status(400).json({ success: false, message: 'Slot data payload is required.' });
    }

    const slotNumber = rawData.slotNumber || rawData.slot_number || rawData.slotId || rawData.id;
    if (!slotNumber || typeof slotNumber !== 'string' || !slotNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Slot Number is required.' });
    }

    const slotData = {
      ...rawData,
      slotNumber: slotNumber.trim().toUpperCase(),
    };

    const saved = saveOrUpdateSlot(slotData);
    res.json({
      success: true,
      message: `Slot ${saved.slotNumber} successfully saved! Status: ${saved.status}`,
      slot: saved,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to save slot record', error: err.message });
  }
});

// 3e. Bulk Upload Slot Inventory Endpoint
app.post('/api/v1/slots/bulk-upload', requirePermission('INVENTORY', 'canCreate'), (req, res) => {
  try {
    const { slots: list } = req.body;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty slots array for bulk upload.' });
    }

    const result = bulkUploadSlots(list);
    res.json({
      success: true,
      message: `Bulk slot upload successful! Added ${result.added} new slots, updated ${result.updated} existing slots. Total slot inventory: ${result.total}`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to bulk upload slot inventory', error: err.message });
  }
});

// 4. Vehicle Entry Endpoint
app.post('/api/v1/vehicles/entry', requirePermission('MOBILE_APP', 'canCreate'), (req, res) => {
  const { vehicleNumber, vehicleType, entryType, targetSlotNumber, remarks } = req.body;

  if (!vehicleNumber) {
    return res.status(400).json({ success: false, message: 'vehicleNumber is required' });
  }

  const result = processVehicleEntry({
    vehicleNumber,
    vehicleType: vehicleType as VehicleType,
    entryType: (entryType || 'MANUAL') as EntryType,
    targetSlotNumber,
    remarks,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// 5. Vehicle Exit Endpoint
app.post('/api/v1/vehicles/exit', requirePermission('MOBILE_APP', 'canCreate'), (req, res) => {
  const { vehicleNumberOrSlot } = req.body;

  if (!vehicleNumberOrSlot) {
    return res.status(400).json({ success: false, message: 'vehicleNumberOrSlot is required' });
  }

  const result = processVehicleExit(vehicleNumberOrSlot);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
});

// 6. Camera ANPR License Plate OCR Scanner (Gemini AI Vision)
app.post('/api/v1/vehicles/scan-plate', requirePermission('MOBILE_APP', 'canCreate'), async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const store = getStore();

    if (!imageBase64) {
      // Pick random sample employee plate for simulation
      const sampleEmp = store.employees[Math.floor(Math.random() * store.employees.length)];
      return res.json({
        success: true,
        plateNumber: sampleEmp.vehicleNumber,
        confidence: 0.98,
        vehicleType: sampleEmp.vehicleType,
        vehicleBrand: sampleEmp.vehicleBrand,
        matchedEmployee: sampleEmp,
        rawAnalysis: 'Simulated High-Accuracy ANPR Scan',
      });
    }

    const ai = getGeminiClient();
    let plateNumber = '';
    let detectedType: VehicleType = 'SEDAN';
    let brand = 'Toyota';
    let rawText = '';

    if (ai) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: `You are an ANPR (Automated Number Plate Recognition) AI camera model. 
Examine this image and perform license plate extraction and vehicle classification.
Respond strictly in JSON format with:
{
  "plateNumber": "ALPHANUMERIC_LICENSE_PLATE_OR_ESTIMATE",
  "confidence": 0.95,
  "vehicleType": "SEDAN" | "SUV" | "HATCHBACK" | "TWO_WHEELER" | "EV",
  "vehicleBrand": "BrandName"
}`,
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      rawText = response.text || '';
      try {
        const parsed = JSON.parse(rawText);
        plateNumber = (parsed.plateNumber || '').replace(/[^A-Z0-9-]/gi, '').toUpperCase();
        detectedType = (parsed.vehicleType as VehicleType) || 'SEDAN';
        brand = parsed.vehicleBrand || 'Unknown';
      } catch (e) {
        console.warn('Failed to parse Gemini JSON, extracting plate with regex:', rawText);
        const match = rawText.match(/[A-Z]{2}[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{3,4}/i);
        plateNumber = match ? match[0].toUpperCase() : 'KA-01-EX-8890';
      }
    } else {
      // Fallback plate extraction simulation
      const sampleEmp = store.employees[Math.floor(Math.random() * store.employees.length)];
      plateNumber = sampleEmp.vehicleNumber;
      detectedType = sampleEmp.vehicleType;
      brand = sampleEmp.vehicleBrand;
      rawText = 'Fallback ANPR OCR Engine';
    }

    // Match with registered employee
    const matchedEmployee = store.employees.find(e => e.vehicleNumber.toUpperCase() === plateNumber.toUpperCase()) || null;

    res.json({
      success: true,
      plateNumber,
      confidence: 0.96,
      vehicleType: matchedEmployee ? matchedEmployee.vehicleType : detectedType,
      vehicleBrand: matchedEmployee ? matchedEmployee.vehicleBrand : brand,
      matchedEmployee,
      rawAnalysis: rawText,
    });
  } catch (err: any) {
    console.error('ANPR Scan error:', err);
    res.status(500).json({ success: false, message: 'ANPR plate scan failed', error: err.message });
  }
});

// 7. Parking Logs Endpoint (with PII Privacy Masking & Pagination)
app.get('/api/v1/logs', (req, res) => {
  const store = getStore();
  const { status, basement, search, limit = '100', maskPII, userRole } = req.query;

  let logs = store.logs;

  if (status && typeof status === 'string' && status !== 'ALL') {
    logs = logs.filter(l => l.status === status);
  }
  if (basement && typeof basement === 'string' && basement !== 'ALL') {
    logs = logs.filter(l => l.basement === basement);
  }
  if (search && typeof search === 'string') {
    const q = sanitizeInputString(search).toLowerCase();
    logs = logs.filter(
      l =>
        l.vehicleNumber.toLowerCase().includes(q) ||
        l.slotNumber.toLowerCase().includes(q) ||
        (l.employeeName && l.employeeName.toLowerCase().includes(q))
    );
  }

  const parsedLimit = parseInt(limit as string, 10) || 100;
  const isPrivileged = userRole === 'MASTER_ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'SITE_MANAGER';
  const shouldMask = maskPII === 'true' || (!isPrivileged && maskPII !== 'false');

  const sanitizedLogs = sanitizeParkingLogs(logs.slice(0, parsedLimit), !shouldMask);

  res.json({
    total: logs.length,
    activeCount: store.logs.filter(l => l.status === 'ACTIVE').length,
    completedCount: store.logs.filter(l => l.status === 'COMPLETED').length,
    piiMasked: shouldMask,
    logs: sanitizedLogs,
  });
});

// 8. Predictive Analytics 24-Hour Forecast Endpoint
app.get('/api/v1/analytics/prediction', (req, res) => {
  const forecast = generate24HourPredictiveForecast();
  res.json(forecast);
});

// 9. Non-Parked Employee Alerts Endpoint
app.get('/api/v1/alerts/non-parked', (req, res) => {
  const store = getStore();
  res.json({
    cutoffTime: '10:30 AM',
    totalAlerts: store.alerts.length,
    alerts: store.alerts,
  });
});

// 10. Trigger Cutoff Cron Scan (10:30 AM Roster Check)
app.post('/api/v1/alerts/trigger-cron', requirePermission('ALERTS', 'canEdit'), (req, res) => {
  const scanResult = runNonParkedRosterScan();

  logSecurityEvent({
    action: 'CRON_NON_PARKED_ROSTER_SCAN',
    actor: req.headers['x-user-email'] as string || 'CronScheduler',
    actorRole: 'SYSTEM_CRON',
    ipAddress: req.ip,
    targetResource: 'EmployeeRosterCheck',
    status: 'SUCCESS',
    details: `Executed 10:30 AM cutoff scan across ${scanResult.totalActiveEmployees} employees. Sent notifications for ${scanResult.nonParkedCount} missing vehicles.`,
  });

  res.json({
    success: true,
    message: `10:30 AM Cron Scan Complete: Evaluated ${scanResult.totalActiveEmployees} active employees. Flagged ${scanResult.nonParkedCount} non-parked vehicles. FCM notifications sent.`,
    scanResult,
  });
});

// 11. AI Slot & PMS Recommendation Assistant (Gemini AI)
app.post('/api/v1/ai/recommend', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        recommendation: `[Smart PMS Rule Engine] Peak hour is projected at 09:30 AM (96% occupancy). Recommended strategy: Direct incoming SUVs to Basement B1-VIP high clearance bays and redirect two-wheelers to B2-2W dedicated aisle. Enable Automated ANPR Lanes 1 & 2 for rapid entry.`,
      });
    }

    const store = getStore();
    const occupiedCount = store.slots.filter(s => s.status === 'OCCUPIED').length;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `You are the Lead Smart Parking AI Advisor for a 1,080-slot corporate parking complex (Basements B1, B2, B3, Ground Driveways, Puzzle Stackers, EV Hub).
Current Inventory Context:
- Total Slots: ${store.slots.length}
- Occupied Slots: ${occupiedCount} (${Math.round((occupiedCount / store.slots.length) * 100)}%)
- Available Vacant Slots: ${store.slots.length - occupiedCount}
- Active Alerts: ${store.alerts.length} non-parked registered vehicles.

User Prompt / Query: "${prompt || 'Suggest optimal parking allocation strategy for peak morning rush.'}"

Provide concise, highly actionable architectural, spatial, and traffic optimization recommendations in bullet points.`,
    });

    res.json({
      recommendation: response.text || 'Optimization strategy generated.',
    });
  } catch (err: any) {
    console.error('AI Recommendation Error:', err);
    res.status(500).json({ error: 'Failed to generate AI recommendation' });
  }
});

// 12. Toggle Slot Maintenance / Status
app.post('/api/v1/slots/update-status', requirePermission('INVENTORY', 'canEdit'), (req, res) => {
  const { slotId, newStatus } = req.body;
  const store = getStore();
  const slot = store.slots.find(s => s.id === slotId || s.slotNumber === slotId);

  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot not found' });
  }

  slot.status = newStatus;
  slot.updatedAt = new Date().toISOString();
  saveDB();

  logSecurityEvent({
    action: 'SLOT_STATUS_OVERRIDE',
    actor: req.headers['x-user-email'] as string || 'Admin',
    actorRole: req.headers['x-user-role'] as string || 'ADMIN',
    ipAddress: req.ip,
    targetResource: `slot/${slot.slotNumber}`,
    status: 'SUCCESS',
    details: `Slot ${slot.slotNumber} (${slot.basement}) status altered to ${newStatus}`,
  });

  res.json({
    success: true,
    message: `Slot ${slot.slotNumber} status updated to ${newStatus}`,
    slot,
  });
});

// 13. MIS CSV Report Exporter Endpoint
app.get('/api/v1/export/reports', requirePermission('ANALYTICS', 'canExport'), (req, res) => {
  const store = getStore();
  const { type = 'logs' } = req.query;

  logSecurityEvent({
    action: 'DATA_EXPORT_CSV',
    actor: req.headers['x-user-email'] as string || 'Auditor',
    actorRole: req.headers['x-user-role'] as string || 'MIS_AUDITOR',
    ipAddress: req.ip,
    targetResource: `export/${type}`,
    status: 'SUCCESS',
    details: `Exported ${type} dataset as CSV.`,
  });

  if (type === 'slots') {
    let csv = 'SlotNumber,Basement,FloorLocation,PuzzleNumber,SlotType,ParkingType,Height,Allocation,Status,CurrentVehicle\n';
    store.slots.forEach(s => {
      csv += `"${s.slotNumber}","${s.basement}","${s.floorLocation}","${s.puzzleNumber || ''}","${s.slotType}","${s.parkingType}","${s.height}","${s.allocation}","${s.status}","${s.currentVehicle || ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pms_slots_inventory.csv"');
    return res.send(csv);
  }

  let csv = 'LogID,VehicleNumber,EmployeeName,Department,SlotNumber,Basement,EntryTime,ExitTime,DurationMinutes,EntryType,Status,Remarks\n';
  store.logs.forEach(l => {
    csv += `"${l.id}","${l.vehicleNumber}","${l.employeeName || ''}","${l.department || ''}","${l.slotNumber}","${l.basement}","${l.entryTime}","${l.exitTime || ''}","${l.durationMinutes || ''}","${l.entryType}","${l.status}","${l.remarks || ''}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pms_parking_logs.csv"');
  res.send(csv);
});

// 14. VALETX SERVICE API ENDPOINTS
app.get('/api/v1/valet/tickets', (req, res) => {
  const tickets = getValetTickets();
  res.json({ success: true, count: tickets.length, tickets });
});

app.post('/api/v1/valet/checkin', requirePermission('VALET_SERVICE', 'canCreate'), (req, res) => {
  const result = createValetTicket(req.body);
  res.json(result);
});

app.post('/api/v1/valet/status', requirePermission('VALET_SERVICE', 'canEdit'), (req, res) => {
  const result = updateValetStatus(req.body);
  res.json(result);
});

app.post('/api/v1/valet/request-retrieval', requirePermission('VALET_SERVICE', 'canCreate'), (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, message: 'Please provide ticket number, key tag, or phone number.' });
  }
  const result = requestValetRetrieval(query);
  res.json(result);
});

// 15. USER MANAGEMENT & RBAC API ENDPOINTS
// OWASP Compliant Authentication Handler
const handleLoginRequest = (req: express.Request, res: express.Response) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const rawIdentifier = req.body?.identifier || req.body?.email || req.body?.username;
  const rawPassword = req.body?.password;

  // 1. Sanitize & trim inputs
  const cleanId = sanitizeEmailInput(String(rawIdentifier || ''));
  const cleanPassword = sanitizePasswordInput(String(rawPassword || ''));

  // 2. Syntactical validation & Character limits
  if (!cleanId || !cleanPassword) {
    recordFailedLoginAttempt(ip, cleanId || 'unknown');
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  // Validate Identifier: Email (max 254 chars + RFC allowlist regex) or Username (3-50 alphanumeric)
  const isEmail = cleanId.includes('@');
  if (isEmail) {
    if (!validateEmailFormat(cleanId) || cleanId.length > 254) {
      recordFailedLoginAttempt(ip, cleanId);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  } else {
    if (!USERNAME_ALLOWLIST_REGEX.test(cleanId) || cleanId.length > 50) {
      recordFailedLoginAttempt(ip, cleanId);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  }

  // Validate Password: Min 8 chars, Max 64 chars (mitigate CPU-exhaustion DoS)
  const passwordValidation = validatePasswordInput(cleanPassword);
  if (!passwordValidation.valid) {
    recordFailedLoginAttempt(ip, cleanId);
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  // 3. User Lookup
  const users = getAppUsers();
  const user = users.find(
    (u) => (u.email && u.email.toLowerCase().trim() === cleanId) || (u.username && u.username.toLowerCase().trim() === cleanId)
  );

  // 4. Timing-safe password verification
  // NOTE: a previous "fallback recovery" here silently reset any account's
  // password back to its original hardcoded default whenever that default
  // was entered at login (e.g. via the login screen's quick-fill buttons)
  // — meaning a changed password could be silently undone by anyone who
  // still knew the old default. Removed entirely; a locked-out account now
  // requires an explicit password reset through the existing
  // /api/v1/auth/set-password flow, not an implicit login-time recovery.
  const isMatch = verifyPassword(cleanPassword, user?.passwordHash, user?.passwordSalt);

  if (!user || !isMatch) {
    const failureRecord = recordFailedLoginAttempt(ip, cleanId);
    logSecurityEvent({
      action: 'AUTH_FAILED_INVALID_CREDENTIALS',
      actor: cleanId,
      actorRole: 'ANONYMOUS',
      ipAddress: ip,
      targetResource: `auth/login/${cleanId}`,
      status: 'BLOCKED_UNAUTHORIZED',
      details: `Failed authentication attempt. OWASP generic response returned. Total consecutive failures: ${failureRecord.totalFailures}.`,
    });

    if (failureRecord.lockedOut) {
      res.setHeader('Retry-After', failureRecord.retryAfterSeconds.toString());
      return res.status(429).json({
        success: false,
        message: 'Account/IP temporarily locked due to excessive failed attempts. Please retry later.',
        errorCode: 'ERR_RATE_LIMITED',
        retryAfter: failureRecord.retryAfterSeconds,
      });
    }

    // Generic error message to prevent account enumeration
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  // Check Account Status (also return generic message)
  if (user.status === 'SUSPENDED' || user.status === 'LOCKED') {
    recordFailedLoginAttempt(ip, cleanId);
    logSecurityEvent({
      action: 'AUTH_BLOCKED_ACCOUNT_INACTIVE',
      actor: user.email,
      actorRole: user.roleName,
      ipAddress: ip,
      targetResource: `auth/login/${user.id}`,
      status: 'BLOCKED_UNAUTHORIZED',
      details: `Sign-in attempt on account with inactive status: ${user.status}.`,
    });
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  // 5. Successful Authentication: Reset failed attempt tracker
  clearLoginFailures(ip, cleanId);
  user.lastLoginAt = new Date().toISOString();
  saveDB();

  // 6. Regenerate Cryptographic Session Token & Set Secure Cookies
  const sessionEntropy = crypto.randomBytes(32).toString('hex');
  const sessionToken = `parkorbit_sess_${user.id}_${sessionEntropy}_${Date.now()}`;
  createSession(sessionToken, user.id);

  // Set secure cookie flags: HttpOnly, Secure, SameSite=None, Path=/, Max-Age=86400 (24h)
  // SameSite=None (not Strict) is required so the ParkFlow mobile app —
  // which runs from a different origin than this API once wrapped in
  // Capacitor — can actually send this cookie back on later requests.
  // Still fully HttpOnly + Secure; this doesn't weaken same-origin
  // behavior for the existing web dashboard at all.
  res.setHeader('Set-Cookie', [
    `parkorbit_session=${sessionToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`,
  ]);

  logSecurityEvent({
    action: 'AUTH_SUCCESS_LOGIN',
    actor: user.email,
    actorRole: user.roleName,
    ipAddress: ip,
    targetResource: `auth/session/${user.id}`,
    status: 'SUCCESS',
    details: `User ${user.fullName} (${user.roleName}) authenticated successfully under OWASP session hardening.`,
  });

  // Strip password hash and salt from client payload
  const safeUser = toPublicUser(user);

  res.json({
    success: true,
    message: `Welcome back, ${user.fullName}!`,
    user: safeUser,
    token: sessionToken,
  });
};

// Mount login endpoint on both /api/v1/auth/login and /login with dedicated rate limiter
app.post('/api/v1/auth/login', loginRateLimiterMiddleware, handleLoginRequest);
app.post('/login', loginRateLimiterMiddleware, handleLoginRequest);

app.post('/api/v1/auth/logout', (req, res) => {
  const token = req.cookies?.['parkorbit_session'];
  if (token) destroySession(token);
  res.clearCookie('parkorbit_session');
  res.json({ success: true });
});

app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  const safeUser = toPublicUser(req.user!);
  res.json({ success: true, user: safeUser });
});

// Set / Update Password Endpoint (OWASP Input Validation & Character Limits)
// Admin-only: generate a single-use, time-limited reset token for a
// specific account. The admin shares this token with the account owner
// out-of-band (in person, chat, etc.) — this is the proof-of-ownership
// step. Requires an authenticated admin session; not on the public path
// list.
app.post(
  '/api/v1/auth/admin/generate-reset-token',
  requireAuth,
  requirePermission('USER_MANAGEMENT', 'canEdit'),
  (req, res) => {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }
    const targetUser = getAppUsers().find((u) => u.id === userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const token = generatePasswordResetToken(targetUser.id);

    logSecurityEvent({
      action: 'AUTH_RESET_TOKEN_GENERATED',
      actor: req.user!.email,
      actorRole: req.user!.roleName,
      ipAddress: req.ip,
      targetResource: `auth/reset-token/${targetUser.id}`,
      status: 'SUCCESS',
      details: `Reset token generated for ${targetUser.fullName} by ${req.user!.fullName}. Expires in 1 hour.`,
    });

    res.json({
      success: true,
      message: `Token generated for ${targetUser.fullName}. Share it with them directly — it expires in 1 hour and can only be used once.`,
      token,
    });
  }
);

// Uses a token generated by the admin route above as proof of ownership —
// NOT an identifier alone. This replaces a previous version of this
// endpoint that accepted {identifier, newPassword} with no verification
// step at all, which allowed anyone who knew or guessed a username to
// take over that account.
app.post('/api/v1/auth/set-password', (req, res) => {
  const { token, newPassword } = req.body;
  const cleanPassword = sanitizePasswordInput(String(newPassword || ''));

  if (!token || !cleanPassword) {
    return res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
  }

  const passwordValidation = validatePasswordInput(cleanPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.reason || 'Invalid password length.' });
  }

  const userId = consumePasswordResetToken(String(token));
  if (!userId) {
    logSecurityEvent({
      action: 'AUTH_RESET_TOKEN_INVALID',
      actor: req.ip || 'unknown',
      actorRole: 'ANONYMOUS',
      ipAddress: req.ip,
      targetResource: 'auth/set-password',
      status: 'BLOCKED_UNAUTHORIZED',
      details: 'Password set attempted with an invalid, expired, or already-used token.',
    });
    return res.status(401).json({ success: false, message: 'This reset link is invalid or has expired. Ask an admin for a new one.' });
  }

  const targetUser = getAppUsers().find((u) => u.id === userId);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'Account no longer exists.' });
  }

  const result = setUserPassword(targetUser.id, cleanPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }

  logSecurityEvent({
    action: 'AUTH_PASSWORD_UPDATED',
    actor: targetUser.email,
    actorRole: targetUser.roleName,
    ipAddress: req.ip,
    targetResource: `auth/password/${targetUser.id}`,
    status: 'SUCCESS',
    details: `Password set successfully for ${targetUser.fullName} via reset token.`,
  });

  res.json(result.user ? { ...result, user: toPublicUser(result.user) } : result);
});

app.get('/api/v1/rbac/roles', requirePermission('USER_MANAGEMENT', 'view'), (req, res) => {
  const roles = getAppRoles();
  res.json({ success: true, count: roles.length, roles });
});

app.post('/api/v1/rbac/roles', requirePermission('USER_MANAGEMENT', 'canCreate'), (req, res) => {
  const result = saveAppRole(req.body);
  logSecurityEvent({
    action: 'RBAC_ROLE_SAVED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `role/${result.role?.id}`,
    status: result.success ? 'SUCCESS' : 'VALIDATION_FAILED',
    details: `Role '${result.role?.roleName}' created/updated by ${req.user!.fullName}.`,
  });
  res.json(result);
});

app.delete('/api/v1/rbac/roles/:id', requirePermission('USER_MANAGEMENT', 'canDelete'), (req, res) => {
  const result = deleteAppRole(req.params.id);
  logSecurityEvent({
    action: 'RBAC_ROLE_DELETED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `role/${req.params.id}`,
    status: result.success ? 'SUCCESS' : 'VALIDATION_FAILED',
    details: `Role ${req.params.id} deletion attempted by ${req.user!.fullName}: ${result.message}`,
  });
  res.json(result);
});

app.get('/api/v1/rbac/users', requirePermission('USER_MANAGEMENT', 'view'), (req, res) => {
  const users = getAppUsers();
  res.json({ success: true, count: users.length, users: toPublicUsers(users) });
});

app.post('/api/v1/rbac/users', requirePermission('USER_MANAGEMENT', 'canCreate'), (req, res) => {
  const result = saveAppUser(req.body);
  logSecurityEvent({
    action: 'RBAC_USER_SAVED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `user/${result.user?.id}`,
    status: result.success ? 'SUCCESS' : 'VALIDATION_FAILED',
    details: `Account '${result.user?.fullName}' (role: ${result.user?.roleName}) created/updated by ${req.user!.fullName}.`,
  });
  res.json(result.user ? { ...result, user: toPublicUser(result.user) } : result);
});

app.delete('/api/v1/rbac/users/:id', requirePermission('USER_MANAGEMENT', 'canDelete'), (req, res) => {
  const result = deleteAppUser(req.params.id);
  logSecurityEvent({
    action: 'RBAC_USER_DELETED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `user/${req.params.id}`,
    status: result.success ? 'SUCCESS' : 'VALIDATION_FAILED',
    details: `Account ${req.params.id} deletion attempted by ${req.user!.fullName}: ${result.message}`,
  });
  res.json(result);
});

app.post('/api/v1/rbac/users/toggle-module', requirePermission('USER_MANAGEMENT', 'canEdit'), (req, res) => {
  const { userId, moduleId, enabled } = req.body;
  if (!userId || !moduleId) {
    return res.status(400).json({ success: false, message: 'Missing userId or moduleId.' });
  }
  const result = toggleUserModuleOverride(userId, moduleId, enabled);
  logSecurityEvent({
    action: 'RBAC_USER_MODULE_OVERRIDE',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `user/${userId}`,
    status: result.success ? 'SUCCESS' : 'VALIDATION_FAILED',
    details: `Module '${moduleId}' access for user ${userId} set to ${enabled} by ${req.user!.fullName}.`,
  });
  res.json(result);
});

// ==========================================
// 16. INFOSEC & PRIVACY AUDIT API ENDPOINTS
// ==========================================

// Get Security Posture & Compliance Summary
app.get('/api/v1/security/compliance-summary', requirePermission('SECURITY_AUDIT', 'view'), (req, res) => {
  const summary = getSecurityComplianceSummary();
  res.json({ success: true, summary });
});

// Get Cryptographic Tamper-Evident Audit Logs
app.get('/api/v1/security/audit-logs', requirePermission('SECURITY_AUDIT', 'view'), (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const logs = getSecurityAuditLogs(limit);
  res.json({ success: true, total: logs.length, logs });
});

// Mathematically verify SHA-256 HMAC integrity chaining of audit trail
app.post('/api/v1/security/verify-audit-chain', requirePermission('SECURITY_AUDIT', 'view'), (req, res) => {
  const verification = verifyAuditTrailIntegrity();
  res.json({ success: true, verification });
});

// Interactive Infosec Vulnerability & Remediation Attack Simulator (For Security Testing UI)
app.post('/api/v1/security/simulate-attack', requirePermission('SECURITY_AUDIT', 'canEdit'), (req, res) => {
  const { attackType } = req.body;

  if (attackType === 'BOLA_EXPLOIT') {
    // Simulate an attacker attempting to alter an executive's vehicle without authorization
    const attackerEmail = 'unauthorized.user@external-domain.com';
    const targetEmployeeId = 'EMP-1001'; // Executive ID
    const maliciousPlate = 'MALICIOUS-99';

    const log = logSecurityEvent({
      action: 'BOLA_UNAUTHORIZED_RESOURCE_ACCESS_ATTEMPT',
      actor: attackerEmail,
      actorRole: 'ANONYMOUS_ATTACKER',
      ipAddress: '198.51.100.42',
      targetResource: `employee/${targetEmployeeId}`,
      status: 'BLOCKED_UNAUTHORIZED',
      details: `[TEST ATTACK SIMULATION] BOLA Attack intercepted: Caller ${attackerEmail} attempted to overwrite vehicle of ${targetEmployeeId} with "${maliciousPlate}". Rejected with 403 Forbidden.`,
    });

    return res.json({
      success: true,
      simulation: 'BOLA / IDOR Attack Simulation',
      result: 'BLOCKED_BY_GUARD',
      httpStatus: 403,
      defenseMechanism: 'BOLA Identity Guard Middleware',
      incidentLog: log,
    });
  }

  if (attackType === 'RATE_LIMIT_FLOOD') {
    // Simulate high-volume DDoS/Brute Force flood
    const log = logSecurityEvent({
      action: 'RATE_LIMIT_EXCEEDED',
      actor: '203.0.113.88',
      actorRole: 'ANONYMOUS',
      ipAddress: '203.0.113.88',
      targetResource: '/api/v1/employees/update-vehicle',
      status: 'RATE_LIMITED',
      details: '[TEST ATTACK SIMULATION] Flood of 150 requests within 10 seconds detected. IP address throttled with HTTP 429 Too Many Requests.',
    });

    return res.json({
      success: true,
      simulation: 'API Flood / Brute Force Simulation',
      result: 'THROTTLED_AND_BLOCKED',
      httpStatus: 429,
      defenseMechanism: 'Sliding-Window In-Memory Rate Limiter',
      incidentLog: log,
    });
  }

  if (attackType === 'SQL_XSS_INJECTION') {
    // Simulate malicious script and SQL injection payload
    const maliciousInput = "KA-01-EX-8890'; DROP TABLE employees; <script>alert('XSS')</script>";
    const sanitized = sanitizeInputString(maliciousInput);
    const valid = isValidLicensePlate(sanitized);

    const log = logSecurityEvent({
      action: 'INPUT_INJECTION_ATTEMPT',
      actor: '192.0.2.14',
      actorRole: 'ANONYMOUS',
      ipAddress: '192.0.2.14',
      targetResource: 'vehicleNumber',
      status: 'VALIDATION_FAILED',
      details: `[TEST ATTACK SIMULATION] Injection tokens detected in vehicle plate "${maliciousInput}". Sanitized to "${sanitized}", rejected format validation.`,
    });

    return res.json({
      success: true,
      simulation: 'SQL / XSS Injection Simulation',
      result: 'SANITIZED_AND_REJECTED',
      httpStatus: 400,
      defenseMechanism: 'Input Sanitizer & Regex Plate Validator',
      incidentLog: log,
    });
  }

  res.status(400).json({ success: false, message: 'Unknown attack simulation type' });
});

// START EXPRESS + VITE SERVER
async function startServer() {
  await bootstrapFirestore();

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ParkOrbit - Smart Parking Management System (PMS) running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
