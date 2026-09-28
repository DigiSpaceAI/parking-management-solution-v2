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
  rotateKnownDefaultPasswords,
  DEFAULT_SITE_ID,
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
  deleteSlot,
  getWhitelistedDomains,
  addWhitelistedDomain,
  removeWhitelistedDomain,
  getRegistrationRequests,
  submitRegistrationRequest,
  submitOvernightRequest,
  reviewOvernightRequest,
  getOvernightViolations,
  getEntryMix,
  getSlotUtilization,
  getSlotDailyVehicleCounts,
  getOccupancyTrend,
  getPeakHours,
  migrateSiteData,
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
  setUserPassword,
  clearHistoricalRecords,
  type ClearableCollection
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
  requireAnyPermission,
  hasModulePermission,
  maskPhone,
  createSession,
  generatePasswordResetToken,
  consumePasswordResetToken,
  destroySession,
  extractSessionToken,
  loadAuditLogsFromFirestore
} from './src/server/security';
import { VehicleType, EntryType, SlotStatus, ApiErrorCode, AppModuleId } from './src/types';
import { isFirestoreConfigured } from './src/server/firestoreClient';
import { isMasterAdmin } from './src/utils/rbac';

// Initialize PMS Store with 1,080 parking inventory slots
initDB();
// With Firestore configured, rotation runs after the remote data is loaded
// (bootstrapFirestore) — running it now would act on the boot-time seed store.
if (!isFirestoreConfigured()) rotateKnownDefaultPasswords();
void loadAuditLogsFromFirestore();

const app = express();

// Trust exactly N proxy hops so req.ip is the real client address and cannot
// be spoofed by a client-supplied X-Forwarded-For header. Default 1 = Cloud Run
// only (the direct *.run.app URL): safe against spoofing. If ALL traffic comes
// through Firebase Hosting, req.ip will be the hosting proxy's address for every
// user (rate limits for signed-in users are per-user, so this is harmless
// there; unauthenticated limits become shared). Setting TRUST_PROXY_HOPS=2
// restores real client IPs for that path but makes the direct *.run.app URL
// spoofable — the per-account login throttle still bounds password guessing.
// Verify the `ipAddress` in the audit log after any change.
const TRUST_PROXY_HOPS = process.env.TRUST_PROXY_HOPS !== undefined && Number.isInteger(Number(process.env.TRUST_PROXY_HOPS))
  ? Number(process.env.TRUST_PROXY_HOPS)
  : 1;
app.set('trust proxy', TRUST_PROXY_HOPS);

// Attach Infosec Security HTTP Headers & Payload Limits
app.use(securityHeadersMiddleware);
app.use(cookieParser());

// CORS: an explicit allowlist, never a reflected Origin. Reflecting any origin
// while also sending Access-Control-Allow-Credentials lets any website a
// signed-in admin visits call this API as that admin and read the replies.
// Allowed: the admin web app, the Capacitor mobile shells (https://localhost /
// capacitor://localhost), local dev, and anything in CORS_ALLOWED_ORIGINS
// (comma-separated). Same-origin requests never need CORS and are unaffected.
const ALLOWED_ORIGINS = new Set<string>([
  'https://admin.parkflows.in',
  'https://parkflows.in',
  'https://www.parkflows.in',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
]);

function isOriginAllowed(origin: string, req: express.Request): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    // Same-origin (e.g. the direct Cloud Run URL): Origin host == Host header.
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-site-id, x-session-token, x-view-as');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  // CSRF defence in depth: the session cookie is SameSite=None (needed by the
  // mobile apps), so refuse state-changing requests from a browser page on an
  // origin we don't recognise, even before auth runs.
  if (origin && !['GET', 'HEAD'].includes(req.method) && !isOriginAllowed(origin, req)) {
    return res.status(403).json({ success: false, message: 'Cross-origin request blocked.' });
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
  // employees/profile and employees/update-vehicle were REMOVED from this
  // list as a critical security fix — they used to be reachable with no
  // real authentication at all, protected only by a "BOLA guard" that
  // trusted client-supplied x-user-email/x-employee-id headers with zero
  // verification, and even that check was skippable entirely just by
  // omitting those headers. Both endpoints now require the same real,
  // server-verified session as every other authenticated endpoint (see
  // the identity check rewritten inside bolaIdentityGuard in security.ts).
]);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/v1/') && req.path !== '/login') return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  return requireAuth(req, res, (err?: any) =>
    err ? next(err) : applyViewAs(req, res, () => enforceSiteScope(req, res, next))
  );
});

// ROLE VIEW SIMULATOR, server-enforced (001 design B10, AC-55).
// x-view-as: <userId> is honoured only for a Master Admin session. It is
// read-only: any non-GET is refused. Scope, module permissions and PII
// masking are evaluated as the target (req.effectiveUser); audit entries
// keep the real Master Admin as the actor. Ignored on /auth/* so signing out
// or checking the session always acts on the real account.
function applyViewAs(req: express.Request, res: express.Response, next: () => void) {
  const raw = req.headers['x-view-as'];
  const targetId = typeof raw === 'string' ? raw.trim() : '';
  if (!targetId || req.path.startsWith('/api/v1/auth/')) return next();
  if (!req.user || !isMasterAdmin(req.user)) {
    return sendApiError(res, 403, 'ERR_MASTER_ONLY', 'Only a Platform Master Admin can view as another user.');
  }
  const target = getAppUsers().find((u) => u.id === targetId);
  if (!target) {
    return res.status(404).json({ success: false, message: 'The user you are viewing as no longer exists.' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendApiError(res, 403, 'ERR_VIEW_AS_READ_ONLY', 'View-as is read-only. Exit view to make changes.');
  }
  req.viewAs = target;
  req.effectiveUser = target;
  next();
}


// ---------------------------------------------------------------------------
// SERVER-SIDE SITE SCOPING
// The site a request may touch is derived from the signed-in user's own
// record (siteScopeType / assignedSiteIds) — never from what the client
// claims. Master Admins and ALL_SITES users are unrestricted; everyone else
// is limited to their assigned sites. A client-supplied siteId that is not
// one of them is rejected (403); a missing / "ALL" value falls back to the
// user's first assigned site instead of meaning "every site".
// ---------------------------------------------------------------------------
const NO_SITE_ACCESS = '__no_site_access__';

// null = unrestricted. Otherwise the list of site ids (and site codes, since
// assignedSiteIds has historically held either) the user may access. Site
// ids come first so allowed[0] is always a real site id when one exists.
function getAllowedSiteIds(user: { siteScopeType?: string; roleId?: string; assignedSiteIds?: string[] }): string[] | null {
  if (user.siteScopeType === 'ALL_SITES' || user.roleId === 'role-master-admin') return null;
  const sites = getSites();
  const ids: string[] = [];
  const codes: string[] = [];
  for (const sid of user.assignedSiteIds || []) {
    const m = sites.find((x) => x.id === sid || x.siteCode === sid);
    ids.push(m ? m.id : sid);
    codes.push(sid);
    if (m?.siteCode) codes.push(m.siteCode);
  }
  return Array.from(new Set([...ids, ...codes]));
}

// Records with no siteId are treated as belonging to DEFAULT_SITE_ID, matching
// the read paths elsewhere in this file.
function siteAllowedFor(user: express.Request['user'], siteId?: string): boolean {
  if (!user) return false;
  const allowed = getAllowedSiteIds(user);
  return allowed === null || allowed.includes(siteId || DEFAULT_SITE_ID);
}

// Sends a 403 and returns true when the record's site is outside the caller's scope.
function denyForeignSite(req: express.Request, res: express.Response, siteId?: string): boolean {
  if (siteAllowedFor(req.user, siteId)) return false;
  res.status(403).json({ success: false, message: 'You do not have access to this site.' });
  return true;
}

function rawClientSiteId(req: express.Request): string | undefined {
  const fromQuery = req.query?.siteId;
  if (fromQuery && typeof fromQuery === 'string') return fromQuery;
  const fromHeader = req.headers['x-site-id'];
  return typeof fromHeader === 'string' ? fromHeader : undefined;
}

// Body shapes that carry site-owned records. Routes read either the body
// itself or body.employee / body.slot, and bulk routes send arrays.
function siteCarryingObjects(body: any): any[] {
  if (!body || typeof body !== 'object') return [];
  const out: any[] = [body, body.employee, body.slot];
  for (const key of ['employees', 'slots', 'requests']) {
    if (Array.isArray(body[key])) out.push(...body[key]);
  }
  return out.filter((o) => o && typeof o === 'object');
}

function enforceSiteScope(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = req.user;
  if (!user) return next();
  const allowed = getAllowedSiteIds(user);
  if (allowed === null) return next();

  const deny = () => {
    auditDenied(req, claimed && claimed !== 'ALL' ? claimed : undefined);
    return res.status(403).json({ success: false, message: 'You do not have access to this site.', errorCode: 'ERR_SITE_FORBIDDEN' });
  };

  const claimed = rawClientSiteId(req);
  if (claimed && claimed !== 'ALL' && !allowed.includes(claimed)) return deny();

  const objs = siteCarryingObjects(req.body);
  for (const o of objs) {
    if (o.siteId !== undefined && o.siteId !== null && o.siteId !== '' && o.siteId !== 'ALL' && !allowed.includes(String(o.siteId))) {
      return deny();
    }
  }

  // Create routes now take their site from resolveSite() explicitly (001 B3),
  // so there is one source of truth; this middleware only rejects foreign
  // claims as defence in depth.
  next();
}

// Resolves the requesting site from either a ?siteId= query param (used
// by the admin web app) or an x-site-id header (used by the mobile apps).
// For scoped users the result is always one of their own sites.
function getRequestedSiteId(req: express.Request): string | undefined {
  const raw = rawClientSiteId(req);
  const who = req.effectiveUser || req.user;
  const allowed = who ? getAllowedSiteIds(who) : null;
  if (allowed === null) return raw;
  if (!raw || raw === 'ALL') return allowed[0] ?? NO_SITE_ACCESS;
  return allowed.includes(raw) ? raw : NO_SITE_ACCESS;
}

// ---------------------------------------------------------------------------
// STRICT SITE RESOLUTION (001 tech design, B1)
// Every list / report / write route asks resolveSite() which ONE site the
// request acts on. The client only says which of the caller's sites it wants
// (?siteId= wins over the x-site-id header); the server decides:
//   no site sent            -> 400 ERR_SITE_REQUIRED
//   'ALL'                   -> Master Admin (unrestricted) reads only, else 400 ERR_SITE_ALL_NOT_ALLOWED
//   a site not the caller's -> 403 ERR_SITE_FORBIDDEN + CROSS_SITE_ACCESS_DENIED audit entry
// SITE_SCOPE_MODE=fallback is an env-only kill-switch that restores the
// previous behaviour (missing site = first assigned site / every site for a
// Master Admin) without a rebuild. Default: strict.
// ---------------------------------------------------------------------------
const SITE_SCOPE_MODE: 'strict' | 'fallback' = process.env.SITE_SCOPE_MODE === 'fallback' ? 'fallback' : 'strict';
if (SITE_SCOPE_MODE === 'fallback') {
  console.warn('[site-scope] SITE_SCOPE_MODE=fallback: requests without a site fall back to the caller\'s first site (legacy behaviour).');
}

type SiteRef = { siteId?: string | null };
const recordSite = (x: SiteRef | undefined | null): string => (x && x.siteId) || DEFAULT_SITE_ID;

function sendApiError(res: express.Response, status: number, errorCode: ApiErrorCode, message: string) {
  res.status(status).json({ success: false, message, errorCode });
}

// The user whose scope / permissions / masking apply: the Role View Simulator
// target when a Master Admin is viewing as someone, else the signed-in user.
function scopeUser(req: express.Request) {
  return req.effectiveUser || req.user;
}

function auditDenied(req: express.Request, siteId: string | undefined, details?: string) {
  logSecurityEvent({
    action: 'CROSS_SITE_ACCESS_DENIED',
    actor: req.user?.email || 'unknown',
    actorRole: req.user?.roleName,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    targetResource: `${req.method} ${req.path}`,
    status: 'BLOCKED_UNAUTHORIZED',
    details: details || `${req.user?.email || 'unknown'} tried to act on site ${siteId || 'unknown'} outside their access.`,
    siteId,
  });
}

function denySite(req: express.Request, res: express.Response, siteId: string | undefined, details?: string): null {
  auditDenied(req, siteId, details);
  sendApiError(res, 403, 'ERR_SITE_FORBIDDEN', 'You do not have access to this site.');
  return null;
}

// Returns the canonical site id (or 'ALL'), or null when an error response has
// already been sent.
function resolveSite(req: express.Request, res: express.Response, opts: { allowAll: boolean }): string | null {
  const user = scopeUser(req);
  if (!user) {
    sendApiError(res, 401, 'ERR_SESSION_EXPIRED', 'Not signed in.');
    return null;
  }

  if (SITE_SCOPE_MODE === 'fallback') {
    const legacy = getRequestedSiteId(req);
    if (legacy === NO_SITE_ACCESS) {
      if (opts.allowAll) return NO_SITE_ACCESS; // lists: empty result, as before
      return denySite(req, res, rawClientSiteId(req));
    }
    if (!legacy || legacy === 'ALL') return opts.allowAll ? 'ALL' : DEFAULT_SITE_ID;
    return legacy;
  }

  const raw = rawClientSiteId(req)?.trim();
  const allowed = getAllowedSiteIds(user);
  if (!raw) {
    sendApiError(res, 400, 'ERR_SITE_REQUIRED', 'Choose a site first.');
    return null;
  }
  if (raw === 'ALL') {
    if (allowed === null && opts.allowAll) return 'ALL';
    sendApiError(res, 400, 'ERR_SITE_ALL_NOT_ALLOWED', 'Select one site to make changes.');
    return null;
  }

  const match = getSites().find((x) => x.id === raw || x.siteCode === raw);
  const canonical = match ? match.id : raw;
  if (allowed !== null) {
    if (!allowed.includes(raw) && !allowed.includes(canonical)) return denySite(req, res, canonical);
    return canonical;
  }
  // Unrestricted caller: any real site, plus the legacy default site.
  if (!match && canonical !== DEFAULT_SITE_ID) {
    sendApiError(res, 403, 'ERR_SITE_FORBIDDEN', 'This site does not exist.');
    return null;
  }
  return canonical;
}

// Record-level check: the STORED siteId of the record decides, never the body.
// Returns false (after sending 403 + audit) when the record belongs elsewhere.
function assertRecordSite(req: express.Request, res: express.Response, record: SiteRef | undefined | null, resolvedSite: string): boolean {
  if (!record) return true;
  const stored = recordSite(record);
  if (resolvedSite !== 'ALL' && stored === resolvedSite) return true;
  if (resolvedSite === 'ALL' && siteAllowedFor(scopeUser(req), stored)) return true;
  denySite(req, res, stored, `${req.user?.email || 'unknown'} (site ${resolvedSite}) tried to act on a record of site ${stored}.`);
  return false;
}

// Master Admin only (AC-52). Checks the REAL signed-in user, never the Role
// View Simulator target.
function requireMasterAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.user && isMasterAdmin(req.user)) return next();
  return sendApiError(res, 403, 'ERR_MASTER_ONLY', 'Only a Platform Master Admin can do this.');
}

// List filter for a resolved site ('ALL' = no filter).
function filterBySite<T extends SiteRef>(items: T[], site: string): T[] {
  return site === 'ALL' ? items : items.filter((x) => recordSite(x) === site);
}

function canonicalSiteId(raw: string): string {
  const m = getSites().find((x) => x.id === raw || x.siteCode === raw);
  return m ? m.id : raw;
}

// Site a NEW record (or a bulk row) is written to. Normally the resolved
// site; a body siteId that differs is refused (null). In SITE_SCOPE_MODE=
// fallback, when the client sent no site at all, the legacy behaviour is kept:
// the row's own siteId is used if the caller may access it.
function writeSiteFor(req: express.Request, resolvedSite: string, bodySiteId: unknown): string | null {
  if (bodySiteId === undefined || bodySiteId === null || bodySiteId === '' || bodySiteId === 'ALL') return resolvedSite;
  const wanted = canonicalSiteId(String(bodySiteId));
  if (wanted === resolvedSite) return resolvedSite;
  if (SITE_SCOPE_MODE === 'fallback' && !rawClientSiteId(req) && siteAllowedFor(scopeUser(req), wanted)) return wanted;
  return null;
}

// Validates a single-record save by id (H4). Returns the siteId to store, or
// null after sending a 403. Non-Master callers can never move a record: the
// stored site wins. A Master Admin may move it; that move is audit-logged.
function siteForSave(
  req: express.Request,
  res: express.Response,
  resolvedSite: string,
  stored: SiteRef | undefined,
  bodySiteId: unknown,
  resource: string
): string | null {
  if (stored) {
    if (!assertRecordSite(req, res, stored, resolvedSite)) return null;
    const wanted = bodySiteId ? canonicalSiteId(String(bodySiteId)) : resolvedSite;
    if (wanted !== resolvedSite && req.user && isMasterAdmin(req.user) && !req.viewAs) {
      logSecurityEvent({
        action: 'RECORD_SITE_MOVED',
        actor: req.user.email,
        actorRole: req.user.roleName,
        ipAddress: req.ip,
        targetResource: resource,
        status: 'SUCCESS',
        details: `${req.user.fullName} moved ${resource} from site ${resolvedSite} to ${wanted}.`,
        siteId: wanted,
      });
      return wanted;
    }
    return resolvedSite;
  }
  const site = writeSiteFor(req, resolvedSite, bodySiteId);
  if (site === null) return denySite(req, res, canonicalSiteId(String(bodySiteId)), `${req.user?.email || 'unknown'} tried to create ${resource} in site ${bodySiteId} while working in site ${resolvedSite}.`);
  return site;
}

// Bulk uploads (H4): the WHOLE batch is refused when any row targets another
// site's record or carries a foreign siteId; nothing is written. Otherwise
// every row is stamped with its write site.
function stampBulkRows<T extends { id?: string; siteId?: string }>(
  req: express.Request,
  res: express.Response,
  resolvedSite: string,
  rows: T[],
  findExisting: (row: T) => SiteRef | undefined
): boolean {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    const site = writeSiteFor(req, resolvedSite, row.siteId);
    if (site === null) {
      denySite(req, res, canonicalSiteId(String(row.siteId)), `Bulk upload row ${i + 1} targets site ${row.siteId}; batch refused (working in ${resolvedSite}).`);
      return false;
    }
    const existing = findExisting({ ...row, siteId: site });
    if (existing && recordSite(existing) !== site) {
      denySite(req, res, recordSite(existing), `Bulk upload row ${i + 1} targets a record of site ${recordSite(existing)}; batch refused.`);
      return false;
    }
  }
  for (const row of rows) {
    if (row && typeof row === 'object') row.siteId = writeSiteFor(req, resolvedSite, row.siteId) as string;
  }
  return true;
}

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

// Gemini is billed per call, so every route that reaches it is capped per
// signed-in user per (UTC) day, plus one global daily ceiling, on top of the
// permission check. In-memory: resets on restart / per instance, so also set a
// budget alert and a quota cap on the key in Google Cloud.
const AI_GLOBAL_DAILY_CAP = Number(process.env.AI_DAILY_GLOBAL_CAP) > 0 ? Number(process.env.AI_DAILY_GLOBAL_CAP) : 5000;
const aiUsage = new Map<string, { day: string; count: number }>();
let aiGlobal = { day: '', count: 0 };

function consumeAiQuota(userId: string, perUserLimit: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (aiGlobal.day !== day) {
    aiGlobal = { day, count: 0 };
    aiUsage.clear();
  }
  if (aiGlobal.count >= AI_GLOBAL_DAILY_CAP) return false;
  const rec = aiUsage.get(userId);
  if (rec && rec.count >= perUserLimit) return false;
  aiUsage.set(userId, { day, count: (rec?.count || 0) + 1 });
  aiGlobal.count++;
  return true;
}

// REST API ROUTES
// 1. Health Check
app.get('/api/v1/health', (req, res) => {
  const store = getStore();
  const occupiedCount = store.slots.filter(s => s.status === 'OCCUPIED').length;
  res.json({
    status: 'ok',
    system: 'ParkFlow | Smart Parking Management System (PMS)',
    app_name: 'ParkFlow',
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
  const { basement, status, allocation, slotType, search } = req.query;
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;

  // Records written before site-scoping existed have no siteId at all —
  // treated as DEFAULT_SITE_ID (see recordSite), so existing data keeps
  // working without an active migration write.
  const siteScoped = filterBySite(store.slots, siteId);

  let slots = siteScoped;

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

  // Summary counts per floor — scoped to the same site as the list
  // above (siteScoped), not the whole platform, so these numbers stay
  // consistent with what's actually being shown.
  const summary = {
    total: siteScoped.length,
    b1: {
      total: siteScoped.filter(s => s.basement === 'B1').length,
      free: siteScoped.filter(s => s.basement === 'B1' && s.status === 'VACANT').length,
    },
    b2: {
      total: siteScoped.filter(s => s.basement === 'B2').length,
      free: siteScoped.filter(s => s.basement === 'B2' && s.status === 'VACANT').length,
    },
    b3: {
      total: siteScoped.filter(s => s.basement === 'B3').length,
      free: siteScoped.filter(s => s.basement === 'B3' && s.status === 'VACANT').length,
    },
    ground: {
      total: siteScoped.filter(s => s.basement === 'Ground' || s.basement === 'Driveway').length,
      free: siteScoped.filter(s => (s.basement === 'Ground' || s.basement === 'Driveway') && s.status === 'VACANT').length,
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

// PII visibility for the caller, from their server-side role only (the
// Role View Simulator target when viewing as someone). Never from a query
// parameter.
function piiAccess(req: express.Request): { fullyUnmasked: boolean; platesUnmasked: boolean } {
  const role = scopeUser(req)?.roleName || '';
  const fullyUnmasked = FULL_PII_ROLES.has(role);
  return { fullyUnmasked, platesUnmasked: fullyUnmasked || PLATE_VISIBLE_ROLES.has(role) };
}

app.get('/api/v1/employees', (req, res) => {
  const store = getStore();
  const { search, department } = req.query;
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;

  let employees = filterBySite(store.employees, siteId);

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
  const { fullyUnmasked, platesUnmasked } = piiAccess(req);

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
    const site = resolveSite(req, res, { allowAll: false });
    if (site === null) return;
    const storedEmp = employeeData.id ? getStore().employees.find((e) => e.id === employeeData.id) : undefined;
    const writeSite = siteForSave(req, res, site, storedEmp, employeeData.siteId, `employee/${employeeData.id || employeeData.employeeId || 'new'}`);
    if (writeSite === null) return;
    employeeData.siteId = writeSite;

    if (!isValidLicensePlate(employeeData.vehicleNumber)) {
      logSecurityEvent({
        action: 'INPUT_VALIDATION_FAILED',
        actor: req.user?.email || 'Admin',
        actorRole: req.user?.roleName || 'ADMIN',
        ipAddress: req.ip,
        targetResource: `vehicleNumber: ${employeeData.vehicleNumber}`,
        status: 'VALIDATION_FAILED',
        details: 'Rejected invalid license plate format during employee save.',
      });
      return res.status(400).json({ success: false, message: 'Invalid license plate format. Must be 4-10 alphanumeric characters.' });
    }

    const saved = saveOrUpdateEmployee(employeeData);

    logSecurityEvent({
      action: 'EMPLOYEE_WHITELIST_MODIFIED',
      actor: req.user?.email || 'Admin',
      actorRole: req.user?.roleName || 'ADMIN',
      ipAddress: req.ip,
      targetResource: `employee/${saved.employeeId}`,
      status: 'SUCCESS',
      details: `Saved employee ${saved.name} (${saved.employeeId}) with plate ${saved.vehicleNumber}`,
      siteId: saved.siteId,
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
    const site = resolveSite(req, res, { allowAll: false });
    if (site === null) return;
    const store = getStore();
    if (!stampBulkRows(req, res, site, list, (row: any) => (row.id ? store.employees.find((e) => e.id === row.id) : undefined))) return;

    const result = bulkUploadEmployees(list);

    logSecurityEvent({
      action: 'BULK_EMPLOYEE_WHITELIST_UPLOAD',
      actor: req.user?.email || 'Admin',
      actorRole: req.user?.roleName || 'ADMIN',
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

// 3d / 3e. Employee self-service: profile and registered vehicle (H2, H3).
// The target record is resolved ONCE. Self-service: from the signed-in
// user's own email, never from what the client names. Looking at or changing
// someone else's record needs an admin permission AND passes the site check
// on the record that was actually resolved.
type ProfileTarget = { employee?: ReturnType<typeof getStore>['employees'][number]; handled: boolean };

function resolveEmployeeTarget(
  req: express.Request,
  res: express.Response,
  source: { email?: unknown; employeeId?: unknown },
  adminCheck: () => boolean,
  actionName: string
): ProfileTarget {
  const me = scopeUser(req)!;
  const email = typeof source.email === 'string' ? sanitizeInputString(source.email).trim().toLowerCase() : '';
  const employeeId = typeof source.employeeId === 'string' ? sanitizeInputString(source.employeeId).trim().toUpperCase() : '';
  const employees = getStore().employees;
  const myEmail = me.email.toLowerCase();
  const own = employees.find((e) => (e.email || '').toLowerCase() === myEmail);

  const namesSomeoneElse = (email && email !== myEmail) || (employeeId && (!own || own.employeeId.toUpperCase() !== employeeId));
  if (!namesSomeoneElse) return { employee: own, handled: false };

  if (!adminCheck()) {
    logSecurityEvent({
      action: actionName,
      actor: req.user!.email,
      actorRole: req.user!.roleName,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      targetResource: `targetEmail: ${email || 'N/A'}, targetEmpId: ${employeeId || 'N/A'}`,
      status: 'BLOCKED_UNAUTHORIZED',
      details: `${req.user!.email} tried to reach another employee's record. Blocked.`,
    });
    res.status(403).json({
      success: false,
      message: 'You can only view or change your own pass.',
      errorCode: 'ERR_BOLA_VIOLATION',
    });
    return { handled: true };
  }

  const site = resolveSite(req, res, { allowAll: req.method === 'GET' });
  if (site === null) return { handled: true };
  const matches = (e: { email?: string; employeeId: string }) =>
    (!email || (e.email || '').toLowerCase() === email) && (!employeeId || e.employeeId.toUpperCase() === employeeId);
  const candidates = employees.filter(matches);
  const inScope = candidates.find((e) => (site === 'ALL' ? siteAllowedFor(me, e.siteId) : recordSite(e) === site));
  if (!inScope && candidates.length > 0) {
    assertRecordSite(req, res, candidates[0], site); // sends 403 + audit
    return { handled: true };
  }
  return { employee: inScope, handled: false };
}

app.get('/api/v1/employees/profile', rateLimiterMiddleware(30, 60000), (req, res) => {
  const { email, employeeId } = req.query;
  if (!email && !employeeId) {
    // `query` (free-text match on email, id or plate) was removed (H2).
    return res.status(400).json({ success: false, message: 'Email or Employee ID query parameter is required.' });
  }
  const me = scopeUser(req)!;
  const target = resolveEmployeeTarget(
    req, res, { email, employeeId },
    () => hasModulePermission(me, 'REGISTRATION', 'view') || hasModulePermission(me, 'APPROVALS', 'view'),
    'EMPLOYEE_PROFILE_ACCESS'
  );
  if (target.handled) return;
  const employee = target.employee;
  if (!employee) {
    return res.json({ success: false, message: 'No registered whitelist record found for this employee identifier.', employee: null });
  }

  // Own record: unmasked. Anyone else's: masked by the caller's role.
  const isOwn = (employee.email || '').toLowerCase() === me.email.toLowerCase();
  const { fullyUnmasked, platesUnmasked } = isOwn ? { fullyUnmasked: true, platesUnmasked: true } : piiAccess(req);
  const shown = {
    ...sanitizeEmployeeList([employee], fullyUnmasked)[0],
    vehicleNumber: platesUnmasked ? employee.vehicleNumber : sanitizeEmployeeList([employee], false)[0].vehicleNumber,
  };

  // Currently parked? Only at the pass's own site.
  const currentSlot = getStore().slots.find(
    (s) => s.status === 'OCCUPIED' && recordSite(s) === recordSite(employee) &&
      (s.currentVehicle || '').toUpperCase() === employee.vehicleNumber.toUpperCase()
  );

  logSecurityEvent({
    action: 'EMPLOYEE_PROFILE_LOOKUP',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `employee/${employee.employeeId}`,
    status: 'SUCCESS',
    details: `Profile accessed for ${employee.employeeId}`,
    siteId: recordSite(employee),
  });

  res.json({
    success: true,
    employee: shown,
    currentSlot: currentSlot ? {
      slotNumber: currentSlot.slotNumber,
      basement: currentSlot.basement,
      floorLocation: currentSlot.floorLocation,
      slotType: currentSlot.slotType,
    } : null,
  });
});

app.post('/api/v1/employees/update-vehicle', rateLimiterMiddleware(20, 60000), (req, res) => {
  try {
    const { employeeId, email, vehicleNumber, vehicleType, vehicleBrand, updateReason } = req.body || {};

    if (!vehicleNumber || typeof vehicleNumber !== 'string' || !vehicleNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Vehicle license plate number is required.' });
    }
    const sanitizedPlate = sanitizeInputString(vehicleNumber).toUpperCase();
    if (!isValidLicensePlate(sanitizedPlate)) {
      logSecurityEvent({
        action: 'INVALID_PLATE_FORMAT_REJECTED',
        actor: req.user!.email,
        actorRole: req.user!.roleName,
        ipAddress: req.ip,
        targetResource: `vehicleNumber: ${String(vehicleNumber).slice(0, 40)}`,
        status: 'VALIDATION_FAILED',
        details: 'Rejected invalid license plate format during vehicle update.',
      });
      return res.status(400).json({ success: false, message: 'Invalid license plate format. Must be a valid 4-10 alphanumeric plate code.' });
    }

    const target = resolveEmployeeTarget(
      req, res, { email, employeeId },
      () => hasModulePermission(scopeUser(req), 'REGISTRATION', 'canEdit'),
      'VEHICLE_UPDATE_ATTEMPT'
    );
    if (target.handled) return;
    if (!target.employee) {
      // No auto-create (H3): a new pass goes through registration + approval.
      return res.status(404).json({ success: false, message: 'No pass found — register first.' });
    }

    const result = updateEmployeeVehicle({
      employeeRecordId: target.employee.id,
      vehicleNumber: sanitizedPlate,
      vehicleType,
      vehicleBrand: typeof vehicleBrand === 'string' ? sanitizeInputString(vehicleBrand) : undefined,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }

    logSecurityEvent({
      action: 'VEHICLE_UPDATE_SUCCESS',
      actor: req.user!.email,
      actorRole: req.user!.roleName,
      ipAddress: req.ip,
      targetResource: `employee/${target.employee.employeeId}`,
      status: 'SUCCESS',
      details: `Plate changed from ${result.oldPlate || 'N/A'} to ${sanitizedPlate}. Reason: ${typeof updateReason === 'string' ? sanitizeInputString(updateReason) : 'User Request'}`,
      siteId: recordSite(target.employee),
    });

    const { oldPlate, ...reply } = result;
    res.json(reply);
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Failed to update vehicle record', error: err.message });
  }
});

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
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;
  const requests = filterBySite(getRegistrationRequests(), siteId);
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  res.json({ requests, pendingCount });
});

// Public (no login) — so it gets its own tight limit and field-length caps.
app.post('/api/v1/registrations/submit', rateLimiterMiddleware(10, 60000), (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string' && v.length > 200) {
      return res.status(400).json({ success: false, message: `Field '${k}' is too long.` });
    }
  }
  const result = submitRegistrationRequest(body);
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
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const regReq = getRegistrationRequests().find((r) => r.id === requestId);
  if (!assertRecordSite(req, res, regReq, site)) return;
  const result = approveRegistrationRequest(requestId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'REGISTRATION_APPROVED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `registration/${requestId}`,
    status: 'SUCCESS',
    details: `${req.user!.fullName} approved the pass request for ${regReq?.vehicleNumber || requestId}.`,
    siteId: site,
  });
  res.json(result);
});

app.post('/api/v1/registrations/reject', requirePermission('APPROVALS', 'canEdit'), (req, res) => {
  const { requestId, reason } = req.body;
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'requestId is required.' });
  }
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const regReq = getRegistrationRequests().find((r) => r.id === requestId);
  if (!assertRecordSite(req, res, regReq, site)) return;
  const result = rejectRegistrationRequest(requestId, reason);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'REGISTRATION_REJECTED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `registration/${requestId}`,
    status: 'SUCCESS',
    details: `${req.user!.fullName} rejected the pass request for ${regReq?.vehicleNumber || requestId}. Reason: ${reason || 'none given'}`,
    siteId: site,
  });
  res.json(result);
});

app.post('/api/v1/registrations/bulk-upload', requirePermission('REGISTRATION', 'canCreate'), (req, res) => {
  try {
    const { requests: list, autoApprove } = req.body;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty registration requests list.' });
    }
    const site = resolveSite(req, res, { allowAll: false });
    if (site === null) return;
    // bulkUploadRegistrations updates an existing request matched by plate or
    // email, so a row matching another site's request is a cross-site write.
    const existingRequests = getRegistrationRequests();
    const matchRequest = (row: any) => {
      const plate = String(row.vehicleNumber || '').trim().toUpperCase();
      const email = String(row.email || '').trim().toLowerCase();
      return existingRequests.find((r) => (plate && r.vehicleNumber.toUpperCase() === plate) || (email && r.email.toLowerCase() === email));
    };
    if (!stampBulkRows(req, res, site, list, matchRequest)) return;
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
  // Was the one write route in this file that never resolved a site at
  // all — every other mutation (entry, exit, employee edits, etc.)
  // already goes through getRequestedSiteId, so this was a real gap: an
  // attendant could relocate a vehicle using another site's slot numbers.
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const result = changeVehicleSlot(vehicleNumberOrSlot, newSlotNumber, reason, attendantName, siteId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.get(
  '/api/v1/slots/change-notifications',
  requireAnyPermission([['FLOOR_PLAN', 'view'], ['MOBILE_APP', 'view']]),
  (req, res) => {
    const siteId = resolveSite(req, res, { allowAll: true });
    if (siteId === null) return;
    const { fullyUnmasked } = piiAccess(req);
    const notifications = filterBySite(getSlotChangeNotifications(), siteId).map((n) =>
      fullyUnmasked ? n : { ...n, mobile: n.mobile ? maskPhone(n.mobile, false) : n.mobile }
    );
    res.json({ notifications });
  }
);

// --- Platform Master Site Configuration Endpoints ---
// SECURITY-CONSCIOUS FIX: this used to require MASTER_CONFIG permission,
// which only Master Admin has — meaning a Site Admin couldn't fetch even
// the basic sites list at all. That silently broke their site-switcher,
// their own site initialization, and by extension Reports and the
// Site Admin Home/Live Slots pages, all of which depend on this call
// succeeding to know which site(s) they're even looking at. Viewing
// which sites exist and their names isn't sensitive the way editing
// them is — the global requireAuth middleware (any authenticated
// account) is the right bar here, not MASTER_CONFIG specifically. Every
// write operation below (onboard, status, delete, pricing) correctly
// stays gated to MASTER_CONFIG — only this read was ever the problem.
// H7 (001 design B5): only the caller's own sites (every site for a Master
// Admin / ALL_SITES user), and contact details + pricing only for callers
// with MASTER_CONFIG view. Evaluated for the effective user, so the Role View
// Simulator shows exactly what the target user would get.
function sitesVisibleTo(user: express.Request['user']) {
  const allSites = getSites();
  const allowed = user ? getAllowedSiteIds(user) : [];
  return allowed === null ? allSites : allSites.filter((s) => allowed.includes(s.id) || allowed.includes(s.siteCode));
}

app.get('/api/v1/sites', (req, res) => {
  const user = scopeUser(req);
  const canSeeCommercial = hasModulePermission(user, 'MASTER_CONFIG', 'view');
  const sites = sitesVisibleTo(user).map((site) => {
    if (canSeeCommercial) return site;
    const { contactPerson, contactEmail, contactPhone, pricing, ...rest } = site;
    return rest;
  });
  res.json({ success: true, count: sites.length, sites });
});

// Which site(s) the signed-in caller is actually assigned to (used by the
// attendant mobile portal right after login to resolve its own site) —
// same underlying getAllowedSiteIds() this file already uses to enforce
// scoping everywhere else, just exposed as a read for the client. Unlike
// /api/v1/sites above (which intentionally returns every site to any
// authenticated caller for admin/reporting UIs), this narrows to what
// this specific caller is allowed to touch, so a site-scoped attendant's
// own site list here already matches what the rest of the API will let
// them do.
app.get('/api/v1/my-sites', (req, res) => {
  const sites = sitesVisibleTo(scopeUser(req));
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

// Recurring data-cleanup feature: clears historical records from
// admin-selected collections (parking logs, slot-change notifications,
// valet tickets, security audit logs), optionally only those older than
// a chosen date. See clearHistoricalRecords()'s own comment for exactly
// which records within each collection count as "history" versus
// something still in progress that's never touched here.
// securityAuditLogs is deliberately NOT clearable (M1; retention rules for
// the audit trail are still open, OQ-11c), so no one can erase the record of
// what they did.
const CLEARABLE_COLLECTIONS: ClearableCollection[] = ['logs', 'slotChangeNotifications', 'valetTickets'];

app.post('/api/v1/admin/clear-history', requireMasterAdmin, requirePermission('MASTER_CONFIG', 'canDelete'), async (req, res) => {
  const { collections, olderThan } = req.body as { collections?: string[]; olderThan?: string };

  if (!Array.isArray(collections) || collections.length === 0) {
    return res.status(400).json({ success: false, message: 'collections must be a non-empty array.' });
  }
  const invalid = collections.filter((c) => !CLEARABLE_COLLECTIONS.includes(c as any));
  if (invalid.length > 0) {
    return res.status(400).json({ success: false, message: `Unknown collection(s): ${invalid.join(', ')}` });
  }
  if (olderThan && Number.isNaN(new Date(olderThan).getTime())) {
    return res.status(400).json({ success: false, message: 'olderThan must be a valid date.' });
  }
  // Normalize to a full ISO timestamp so string comparison against
  // stored ISO timestamps (entryTime, changedAt, etc.) works correctly
  // regardless of whether the client sent a bare date or a full
  // datetime.
  const olderThanISO = olderThan ? new Date(olderThan).toISOString() : undefined;

  const result: Record<string, number> = {};
  Object.assign(result, await clearHistoricalRecords(collections as ClearableCollection[], olderThanISO));

  logSecurityEvent({
    action: 'HISTORICAL_DATA_CLEARED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: collections.join(', '),
    status: 'SUCCESS',
    details: `${req.user!.fullName} cleared ${JSON.stringify(result)}${olderThanISO ? ` (older than ${olderThanISO})` : ' (all)'}.`,
  });

  res.json({ success: true, cleared: result });
});

app.post('/api/v1/admin/migrate-site-data', requireMasterAdmin, requirePermission('MASTER_CONFIG', 'canEdit'), (req, res) => {
  const { fromSiteId, toSiteId } = req.body;

  if (!fromSiteId || !toSiteId) {
    return res.status(400).json({ success: false, message: 'fromSiteId and toSiteId are both required.' });
  }
  if (fromSiteId === toSiteId) {
    return res.status(400).json({ success: false, message: 'fromSiteId and toSiteId cannot be the same.' });
  }

  const result = migrateSiteData(fromSiteId, toSiteId);
  if (!result.success) {
    return res.status(400).json(result);
  }

  logSecurityEvent({
    action: 'SITE_DATA_MIGRATED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `site-migration/${fromSiteId}->${toSiteId}`,
    status: 'SUCCESS',
    details: `${req.user!.fullName} migrated ${JSON.stringify(result.migrated)} from '${fromSiteId}' to '${toSiteId}'.`,
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
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;
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

    const site = resolveSite(req, res, { allowAll: false });
    if (site === null) return;
    const storedSlot = rawData.id ? getStore().slots.find((sl) => sl.id === rawData.id) : undefined;
    const writeSite = siteForSave(req, res, site, storedSlot, rawData.siteId, `slot/${rawData.id || slotNumber}`);
    if (writeSite === null) return;

    const slotData = {
      ...rawData,
      siteId: writeSite,
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

app.post('/api/v1/slots/delete', requirePermission('INVENTORY', 'canDelete'), (req, res) => {
  const { slotId, force } = req.body;
  if (!slotId) {
    return res.status(400).json({ success: false, message: 'slotId is required.' });
  }
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const targetSlot = getStore().slots.find((sl) => sl.id === slotId);
  if (!assertRecordSite(req, res, targetSlot, site)) return;
  const result = deleteSlot(slotId, force === true);
  if (!result.success) {
    return res.status(400).json(result);
  }
  logSecurityEvent({
    action: 'SLOT_DELETED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `slot/${slotId}`,
    status: 'SUCCESS',
    details: `${req.user!.fullName} deleted slot ${slotId}${force ? ' (forced, was occupied)' : ''}.`,
    siteId: site,
  });
  res.json(result);
});

// 3e. Bulk Upload Slot Inventory Endpoint
app.post('/api/v1/slots/bulk-upload', requirePermission('INVENTORY', 'canCreate'), (req, res) => {
  try {
    const { slots: list } = req.body;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty slots array for bulk upload.' });
    }
    const site = resolveSite(req, res, { allowAll: false });
    if (site === null) return;
    const store = getStore();
    if (!stampBulkRows(req, res, site, list, (row: any) => (row.id ? store.slots.find((sl) => sl.id === row.id) : undefined))) return;

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
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;

  if (!vehicleNumber) {
    return res.status(400).json({ success: false, message: 'vehicleNumber is required' });
  }

  if (!isValidLicensePlate(String(vehicleNumber))) {
    logSecurityEvent({
      action: 'INVALID_PLATE_FORMAT_REJECTED',
      actor: req.user!.email,
      actorRole: req.user!.roleName,
      ipAddress: req.ip,
      targetResource: `vehicleNumber: ${String(vehicleNumber).slice(0, 40)}`,
      status: 'VALIDATION_FAILED',
      details: 'Rejected invalid license plate format during vehicle entry.',
    });
    return res.status(400).json({
      success: false,
      message: 'Invalid license plate format. Must be 4-10 alphanumeric characters.',
    });
  }

  const result = processVehicleEntry({
    vehicleNumber,
    vehicleType: vehicleType as VehicleType,
    entryType: (entryType || 'MANUAL') as EntryType,
    targetSlotNumber,
    remarks,
    siteId,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  // The plate is also occupied at another site: entry proceeds here, the
  // reply never mentions the other site, and the event is audit-logged.
  const { activeAtOtherSiteId, ...reply } = result;
  if (activeAtOtherSiteId) {
    logSecurityEvent({
      action: 'VEHICLE_ACTIVE_AT_OTHER_SITE',
      actor: req.user!.email,
      actorRole: req.user!.roleName,
      ipAddress: req.ip,
      targetResource: `vehicle/${String(vehicleNumber).trim().toUpperCase()}`,
      status: 'SUCCESS',
      details: `Entry at site ${siteId} for a plate still marked parked at site ${activeAtOtherSiteId}.`,
      siteId,
    });
  }

  res.json(reply);
});

// 5. Vehicle Exit Endpoint
app.post('/api/v1/vehicles/exit', requirePermission('MOBILE_APP', 'canCreate'), (req, res) => {
  const { vehicleNumberOrSlot } = req.body;
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;

  if (!vehicleNumberOrSlot) {
    return res.status(400).json({ success: false, message: 'vehicleNumberOrSlot is required' });
  }

  const result = processVehicleExit(vehicleNumberOrSlot, siteId);

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
    const siteId = resolveSite(req, res, { allowAll: false });
    if (siteId === null) return;
    // Never a random or mock plate (BUG-10 / R8): without an image, an AI
    // key or a readable plate, the attendant types it in.
    const noPlate = () => res.status(400).json({ success: false, message: 'No plate detected. Type it in.' });

    // ~4.5 MB of image is plenty for a plate photo; anything bigger is abuse
    // (or a cost-inflation attempt) rather than a real camera frame.
    if (imageBase64 !== undefined && (typeof imageBase64 !== 'string' || imageBase64.length > 6_000_000)) {
      return res.status(413).json({ success: false, message: 'Image too large or invalid.' });
    }

    if (!imageBase64) return noPlate();

    const ai = getGeminiClient();
    if (!ai) return noPlate();
    let plateNumber = '';
    let detectedType: VehicleType = 'SEDAN';
    let brand = 'Toyota';
    let rawText = '';

    if (ai) {
      if (!consumeAiQuota(req.user!.id, 500)) {
        return res.status(429).json({ success: false, message: 'Daily plate-scan limit reached.' });
      }
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
        plateNumber = match ? match[0].toUpperCase() : '';
      }
    }
    if (!plateNumber) return noPlate();

    // Match with a registered employee at THIS site only (AC-06).
    const matchedEmployee = store.employees.find(
      e => e.vehicleNumber.toUpperCase() === plateNumber.toUpperCase() && recordSite(e) === siteId
    ) || null;

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
app.get('/api/v1/logs', requirePermission('LOGS', 'view'), (req, res) => {
  const store = getStore();
  // maskPII / userRole query params are deliberately ignored (H1): masking
  // comes from the caller's server-side role only, as on /employees.
  const { status, basement, search, limit = '100' } = req.query;
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;

  const siteScoped = filterBySite(store.logs, siteId);

  let logs = siteScoped;

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
  const { fullyUnmasked, platesUnmasked } = piiAccess(req);
  const shouldMask = !fullyUnmasked;

  const sanitizedLogs = logs.slice(0, parsedLimit).map((l) => ({
    ...sanitizeParkingLogs([l], fullyUnmasked)[0],
    vehicleNumber: platesUnmasked ? l.vehicleNumber : sanitizeParkingLogs([l], false)[0].vehicleNumber,
  }));

  res.json({
    total: logs.length,
    activeCount: siteScoped.filter(l => l.status === 'ACTIVE').length,
    completedCount: siteScoped.filter(l => l.status === 'COMPLETED').length,
    piiMasked: shouldMask,
    logs: sanitizedLogs,
  });
});

// 8. Predictive Analytics 24-Hour Forecast Endpoint
app.get('/api/v1/analytics/prediction', (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const forecast = generate24HourPredictiveForecast(siteId);
  res.json(forecast);
});

// 9. Non-Parked Employee Alerts Endpoint
app.get('/api/v1/alerts/non-parked', (req, res) => {
  const store = getStore();
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;
  const alerts = filterBySite(store.alerts, siteId);
  res.json({
    cutoffTime: '10:30 AM',
    totalAlerts: alerts.length,
    alerts,
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
app.post('/api/v1/ai/recommend', requirePermission('ANALYTICS', 'view'), async (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  try {
    // Free text goes into an LLM prompt: cap the length and drop control
    // characters / quotes so it can't break out of the quoted query.
    const prompt = typeof req.body?.prompt === 'string'
      ? req.body.prompt.replace(/[\x00-\x1F\x7F"`\\]/g, ' ').trim().slice(0, 500)
      : '';
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        recommendation: `[Smart PMS Rule Engine] Peak hour is projected at 09:30 AM (96% occupancy). Recommended strategy: Direct incoming SUVs to Basement B1-VIP high clearance bays and redirect two-wheelers to B2-2W dedicated aisle. Enable Automated ANPR Lanes 1 & 2 for rapid entry.`,
      });
    }

    if (!consumeAiQuota(req.user!.id, 30)) {
      return res.status(429).json({ success: false, message: 'Daily AI assistant limit reached. Try again tomorrow.' });
    }

    // Context comes from the selected site only, never the whole platform.
    const store = getStore();
    const siteSlots = filterBySite(store.slots, siteId);
    const siteAlerts = filterBySite(store.alerts, siteId);
    const occupiedCount = siteSlots.filter(s => s.status === 'OCCUPIED').length;
    const occupiedPct = siteSlots.length ? Math.round((occupiedCount / siteSlots.length) * 100) : 0;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `You are the Lead Smart Parking AI Advisor for a ${siteSlots.length}-slot corporate parking site.
Current Inventory Context:
- Total Slots: ${siteSlots.length}
- Occupied Slots: ${occupiedCount} (${occupiedPct}%)
- Available Vacant Slots: ${siteSlots.length - occupiedCount}
- Active Alerts: ${siteAlerts.length} non-parked registered vehicles.

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
const SLOT_STATUSES: SlotStatus[] = ['VACANT', 'OCCUPIED', 'RESERVED', 'MAINTENANCE'];
app.post('/api/v1/slots/update-status', requirePermission('INVENTORY', 'canEdit'), (req, res) => {
  const { slotId, newStatus } = req.body;
  if (!SLOT_STATUSES.includes(newStatus)) {
    return res.status(400).json({ success: false, message: `newStatus must be one of ${SLOT_STATUSES.join(', ')}.` });
  }
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const store = getStore();
  // Slot numbers repeat across sites: an exact id match first, else the slot
  // number within the selected site only.
  const slot =
    store.slots.find(s => s.id === slotId) ||
    store.slots.find(s => s.slotNumber === slotId && recordSite(s) === site);

  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot not found' });
  }
  if (!assertRecordSite(req, res, slot, site)) return;

  slot.status = newStatus;
  slot.updatedAt = new Date().toISOString();
  saveDB();

  logSecurityEvent({
    action: 'SLOT_STATUS_OVERRIDE',
    actor: req.user?.email || 'Admin',
    actorRole: req.user?.roleName || 'ADMIN',
    ipAddress: req.ip,
    targetResource: `slot/${slot.slotNumber}`,
    status: 'SUCCESS',
    details: `Slot ${slot.slotNumber} (${slot.basement}) status altered to ${newStatus}`,
    siteId: site,
  });

  res.json({
    success: true,
    message: `Slot ${slot.slotNumber} status updated to ${newStatus}`,
    slot,
  });
});

// 13. MIS CSV Report Exporter Endpoint
// Spreadsheet formula injection: a value starting with = + - @ (or tab/CR) is
// executed as a formula when the CSV is opened in Excel/Sheets. Prefix with a
// single quote and double any embedded quotes.
const csvCell = (v: unknown): string => {
  let str = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

app.get('/api/v1/export/reports', requirePermission('ANALYTICS', 'canExport'), (req, res) => {
  const store = getStore();
  const { type = 'logs' } = req.query;
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const siteFilter = <T extends SiteRef>(items: T[]) => filterBySite(items, siteId);

  logSecurityEvent({
    action: 'DATA_EXPORT_CSV',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `export/${type}`,
    status: 'SUCCESS',
    details: `Exported ${type} dataset as CSV.`,
    siteId,
  });

  if (type === 'slots') {
    let csv = 'SlotNumber,Basement,FloorLocation,PuzzleNumber,SlotType,ParkingType,Height,Allocation,Status,CurrentVehicle\n';
    siteFilter(store.slots).forEach(s => {
      csv += [s.slotNumber, s.basement, s.floorLocation, s.puzzleNumber || '', s.slotType, s.parkingType, s.height, s.allocation, s.status, s.currentVehicle || ''].map(csvCell).join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pms_slots_inventory.csv"');
    return res.send(csv);
  }

  let csv = 'LogID,VehicleNumber,EmployeeName,Department,SlotNumber,Basement,EntryTime,ExitTime,DurationMinutes,EntryType,Status,Remarks\n';
  siteFilter(store.logs).forEach(l => {
    csv += [l.id, l.vehicleNumber, l.employeeName || '', l.department || '', l.slotNumber, l.basement, l.entryTime, l.exitTime || '', l.durationMinutes || '', l.entryType, l.status, l.remarks || ''].map(csvCell).join(',') + '\n';
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pms_parking_logs.csv"');
  res.send(csv);
});

// 14. VALETX SERVICE API ENDPOINTS
app.get('/api/v1/valet/tickets', (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: true });
  if (siteId === null) return;
  const tickets = filterBySite(getValetTickets(), siteId);
  res.json({ success: true, count: tickets.length, tickets });
});

app.post('/api/v1/valet/checkin', requirePermission('VALET_SERVICE', 'canCreate'), (req, res) => {
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const writeSite = siteForSave(req, res, site, undefined, req.body?.siteId, 'valet/new');
  if (writeSite === null) return;
  const result = createValetTicket({ ...req.body, siteId: writeSite });
  res.json(result);
});

app.post('/api/v1/valet/status', requirePermission('VALET_SERVICE', 'canEdit'), (req, res) => {
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const ticketRef = req.body?.ticketId;
  const matches = (t: { id: string; ticketNumber: string; keyTagNumber: string }) =>
    t.id === ticketRef || t.ticketNumber === ticketRef || t.keyTagNumber === ticketRef;
  // Key tags can repeat across sites: prefer the selected site's ticket.
  const valetTicket = getValetTickets().find((t) => matches(t) && recordSite(t) === site) || getValetTickets().find(matches);
  if (!assertRecordSite(req, res, valetTicket, site)) return;
  const result = updateValetStatus({ ...req.body, ticketId: valetTicket ? valetTicket.id : ticketRef });
  res.json(result);
});

app.post('/api/v1/valet/request-retrieval', requirePermission('VALET_SERVICE', 'canCreate'), (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, message: 'Please provide ticket number, key tag, or phone number.' });
  }
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const result = requestValetRetrieval(query, site);
  res.json(result);
});

// 14b. SITE ADMIN REPORTS — computed from real slot/log/overnight-request
// data, no separate "reports" collection of its own. Gated under
// ANALYTICS (closest existing module — there's no dedicated REPORTS
// module in the permission matrix, and adding one would mean updating
// every role's permission set) for reads, APPROVALS for the
// overnight-request review action (matches the existing
// registration-request approval pattern).
app.get('/api/v1/reports/mix', requirePermission('REPORTS', 'view'), (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const from = (req.query.from as string) || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = (req.query.to as string) || new Date().toISOString();
  res.json(getEntryMix(siteId, from, to));
});

app.get('/api/v1/reports/violations', requirePermission('REPORTS', 'view'), (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const cutoffHour = req.query.cutoffHour ? Number(req.query.cutoffHour) : 22;
  res.json({ violations: getOvernightViolations(siteId, cutoffHour) });
});

app.get('/api/v1/reports/utilization', requirePermission('REPORTS', 'view'), (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const from = (req.query.from as string) || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = (req.query.to as string) || new Date().toISOString();
  res.json({ slots: getSlotUtilization(siteId, from, to) });
});

app.get('/api/v1/reports/slot-daily-vehicles', requirePermission('REPORTS', 'view'), (req, res) => {
  const { slotId } = req.query;
  if (!slotId || typeof slotId !== 'string') {
    return res.status(400).json({ success: false, message: 'slotId is required.' });
  }
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const reportSlot = getStore().slots.find((sl) => sl.id === slotId);
  if (!reportSlot) return res.status(404).json({ success: false, message: 'Slot not found.' });
  if (!assertRecordSite(req, res, reportSlot, siteId)) return;
  const from = (req.query.from as string) || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = (req.query.to as string) || new Date().toISOString();
  res.json({ success: true, days: getSlotDailyVehicleCounts(slotId, from, to) });
});

app.get('/api/v1/reports/occupancy-trend', requirePermission('REPORTS', 'view'), (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const from = (req.query.from as string) || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = (req.query.to as string) || new Date().toISOString();
  res.json({ days: getOccupancyTrend(siteId, from, to) });
});

app.get('/api/v1/reports/peak-hours', requirePermission('REPORTS', 'view'), (req, res) => {
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const from = (req.query.from as string) || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = (req.query.to as string) || new Date().toISOString();
  res.json({ hours: getPeakHours(siteId, from, to) });
});

app.get('/api/v1/reports/overnight-requests', requirePermission('REPORTS', 'view'), (req, res) => {
  const store = getStore();
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const status = req.query.status as string | undefined;
  let requests = filterBySite(store.overnightRequests || [], siteId);
  if (status && status !== 'ALL') requests = requests.filter(r => r.status === status);
  res.json({ requests });
});

app.post('/api/v1/reports/overnight-requests', requirePermission('REPORTS', 'canCreate'), (req, res) => {
  const { vehicleNumber, requestedBy, nights, reason } = req.body;
  const siteId = resolveSite(req, res, { allowAll: false });
  if (siteId === null) return;
  const result = submitOvernightRequest({ siteId, vehicleNumber, requestedBy, nights, reason });
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/v1/reports/overnight-requests/review', requirePermission('APPROVALS', 'canEdit'), (req, res) => {
  const { requestId, decision, rejectionReason } = req.body;
  if (!requestId || !decision) {
    return res.status(400).json({ success: false, message: 'requestId and decision are required.' });
  }
  const site = resolveSite(req, res, { allowAll: false });
  if (site === null) return;
  const overnightReq = (getStore().overnightRequests || []).find((r) => r.id === requestId);
  if (!assertRecordSite(req, res, overnightReq, site)) return;
  const result = reviewOvernightRequest(requestId, decision, req.user!.fullName, rejectionReason);
  if (!result.success) return res.status(400).json(result);

  logSecurityEvent({
    action: 'OVERNIGHT_REQUEST_REVIEWED',
    actor: req.user!.email,
    actorRole: req.user!.roleName,
    ipAddress: req.ip,
    targetResource: `overnightRequest/${requestId}`,
    status: 'SUCCESS',
    details: result.message,
    siteId: site,
  });

  res.json(result);
});

// 15. USER MANAGEMENT & RBAC API ENDPOINTS
// OWASP Compliant Authentication Handler
const handleLoginRequest = (req: express.Request, res: express.Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
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
  const sessionToken = `parkflow_sess_${user.id}_${sessionEntropy}_${Date.now()}`;
  createSession(sessionToken, user.id);

  // Set secure cookie flags: HttpOnly, Secure, SameSite=None, Path=/, Max-Age=86400 (24h)
  // SameSite=None (not Strict) is required so the ParkFlow mobile app —
  // which runs from a different origin than this API once wrapped in
  // Capacitor — can actually send this cookie back on later requests.
  // Still fully HttpOnly + Secure; this doesn't weaken same-origin
  // behavior for the existing web dashboard at all.
  //
  // Cookie name is __session specifically, not something more
  // descriptive like parkorbit_session — Firebase Hosting silently
  // strips every cookie from proxied responses EXCEPT one named exactly
  // __session (a documented, if not obviously so, Firebase behavior,
  // done for its own CDN caching reasons). Since admin.parkflows.in now
  // routes through a Firebase Hosting rewrite to reach this same
  // service, any other cookie name would make login look like it
  // succeeded (the JSON response comes through fine) while the actual
  // session cookie silently never reaches the browser — every
  // subsequent request then fails auth with no visible reason why.
  res.setHeader('Set-Cookie', [
    `__session=${sessionToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`,
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
  // Destroy the session whichever way the client sent it: cookie, bearer or
  // x-session-token (M4, partial). Cookie-only destruction left header-based
  // sessions (the mobile / attendant portal) alive after sign-out.
  const tokens = new Set(
    [req.cookies?.['__session'], req.cookies?.['parkorbit_session'], req.cookies?.['pms_session'], extractSessionToken(req)]
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
  );
  for (const t of tokens) destroySession(t);
  res.clearCookie('__session');
  res.clearCookie('parkorbit_session');
  res.clearCookie('pms_session');
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

    // Real, confirmed vulnerability closed here: this endpoint is
    // reachable by anyone with the User & RBAC module enabled — most
    // notably a Site Admin, who was never meant to have authority over
    // a strictly higher-privileged account. Without this check, that
    // Site Admin could generate a reset token for a Platform Master
    // Admin's account, then redeem it themselves via the ordinary
    // self-service reset flow to take over that account outright.
    // Module permissions govern feature access, not seniority over a
    // specific target account — this is a separate, vertical-privilege
    // check layered on top.
    const isMasterAccount = (u: typeof targetUser) => u.roleId === 'role-master-admin' || (u.roleName && u.roleName.toLowerCase().includes('master admin'));
    if (isMasterAccount(targetUser) && !isMasterAccount(req.user!)) {
      return res.status(403).json({ success: false, message: 'Only a Platform Master Admin can generate a reset token for another Platform Master Admin account.' });
    }
    // H8: a non-Master can only reset accounts at their own sites, and never
    // their own (self-service would bypass the out-of-band handover).
    if (!isMasterAdmin(req.user!) && (targetUser.id === req.user!.id || !userWithinCallerScope(req.user, targetUser))) {
      logSecurityEvent({
        action: 'RBAC_PRIVILEGE_ESCALATION_BLOCKED',
        actor: req.user!.email,
        actorRole: req.user!.roleName,
        ipAddress: req.ip,
        targetResource: `auth/reset-token/${targetUser.id}`,
        status: 'BLOCKED_UNAUTHORIZED',
        details: 'Reset token refused: target is the caller or outside the caller\'s sites.',
      });
      return sendApiError(res, 403, 'ERR_SITE_FORBIDDEN', 'You can only reset passwords for other accounts at your own sites.');
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

  const result = setUserPassword(targetUser.id, cleanPassword, targetUser.id);
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

// SAME FIX, SAME REASONING as the /api/v1/sites permission fix above:
// this was gated to USER_MANAGEMENT (Master Admin only), but is called
// globally on every app load for every role via App.tsx's fetchRoles()
// — meaning every non-Master-Admin user has been silently hitting a 403
// on this since USER_MANAGEMENT existed, not just Site Admins testing
// Reports today. Viewing role names/structure isn't sensitive the way
// editing them is; every write operation for roles remains properly
// gated to USER_MANAGEMENT elsewhere in this file — only this read was
// ever the problem.
app.get('/api/v1/rbac/roles', (req, res) => {
  const roles = getAppRoles();
  res.json({ success: true, count: roles.length, roles });
});

// H8 (001 design B8): USER_MANAGEMENT alone must never let a non-Master
// raise anyone's privileges, their own included.
const PRIVILEGED_MODULES: AppModuleId[] = ['MASTER_CONFIG', 'USER_MANAGEMENT', 'SECURITY_AUDIT'];

function grantsPrivilegedRights(perms: unknown): boolean {
  if (!perms || typeof perms !== 'object') return false;
  return PRIVILEGED_MODULES.some((m) => {
    const r = (perms as Record<string, any>)[m];
    return !!r && typeof r === 'object' && Object.values(r).some((v) => v === true);
  });
}

function masterOnly(res: express.Response, message: string) {
  sendApiError(res, 403, 'ERR_MASTER_ONLY', message);
}

// Target account is inside the caller's own sites (non-empty, every site
// covered) and is not a Master Admin / all-sites account.
function userWithinCallerScope(caller: express.Request['user'], target: { roleId?: string; siteScopeType?: string; assignedSiteIds?: string[] }): boolean {
  if (!caller) return false;
  const allowed = getAllowedSiteIds(caller);
  if (allowed === null) return true;
  if (isMasterAdmin(target) || target.siteScopeType === 'ALL_SITES') return false;
  const targetSites = (target.assignedSiteIds || []).map(canonicalSiteId);
  return targetSites.length > 0 && targetSites.every((sid) => allowed.includes(sid));
}

app.post('/api/v1/rbac/roles', requirePermission('USER_MANAGEMENT', 'canCreate'), (req, res) => {
  const caller = req.user!;
  if (!isMasterAdmin(caller)) {
    const body = req.body || {};
    const existing = body.id ? getAppRoles().find((r) => r.id === body.id) : undefined;
    let refusal = '';
    if (existing?.isSystemDefault) refusal = 'Only a Platform Master Admin can change a built-in role.';
    else if (body.id && (body.id === caller.roleId || existing?.roleCode === caller.roleId)) refusal = 'You can\'t change your own role.';
    else if (grantsPrivilegedRights(body.modulePermissions)) refusal = 'Only a Platform Master Admin can grant Master Config, User Management or Security Audit rights.';
    else if (body.siteScope === 'ALL_SITES') refusal = 'Only a Platform Master Admin can create an all-sites role.';
    if (refusal) {
      logSecurityEvent({
        action: 'RBAC_PRIVILEGE_ESCALATION_BLOCKED',
        actor: caller.email,
        actorRole: caller.roleName,
        ipAddress: req.ip,
        targetResource: `role/${body.id || 'new'}`,
        status: 'BLOCKED_UNAUTHORIZED',
        details: refusal,
      });
      return masterOnly(res, refusal);
    }
  }
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
  const requester = scopeUser(req)!; // the view-as target when simulating
  const requesterIsMasterAdmin = requester.roleId === 'role-master-admin' || (requester.roleName && requester.roleName.toLowerCase().includes('master admin'));

  // Real, confirmed gap closed here: this previously returned every
  // user in the entire system to anyone with view permission on this
  // module — meaning a Site Admin granted User & RBAC would have seen
  // every other site's staff and every Platform Master Admin account
  // too. A Site Admin should only ever see accounts at their own
  // site(s), and should never see Master Admin accounts regardless of
  // site — those two rules, not the module permission alone, define
  // what this endpoint returns for a non-Master-Admin requester.
  const visibleUsers = requesterIsMasterAdmin
    ? users
    : users.filter((u) => {
        const uIsMasterAdmin = u.roleId === 'role-master-admin' || (u.roleName && u.roleName.toLowerCase().includes('master admin'));
        if (uIsMasterAdmin) return false;
        const requesterSiteIds = requester.assignedSiteIds || [];
        const targetSiteIds = u.assignedSiteIds || [];
        return targetSiteIds.some((sid) => requesterSiteIds.includes(sid));
      });

  res.json({ success: true, count: visibleUsers.length, users: toPublicUsers(visibleUsers) });
});

app.post('/api/v1/rbac/users', requirePermission('USER_MANAGEMENT', 'canCreate'), (req, res) => {
  const result = saveAppUser(req.body, req.user!.id);
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
  const result = deleteAppUser(req.params.id, req.user!.id);
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
  const caller = req.user!;
  if (!isMasterAdmin(caller)) {
    const target = getAppUsers().find((u) => u.id === userId);
    let refusal = '';
    if (userId === caller.id) refusal = 'You can\'t change your own module access.';
    else if (target && !userWithinCallerScope(caller, target)) refusal = 'You can only manage accounts at your own sites.';
    else if (enabled && PRIVILEGED_MODULES.includes(moduleId)) refusal = 'Only a Platform Master Admin can grant Master Config, User Management or Security Audit access.';
    if (refusal) {
      logSecurityEvent({
        action: 'RBAC_PRIVILEGE_ESCALATION_BLOCKED',
        actor: caller.email,
        actorRole: caller.roleName,
        ipAddress: req.ip,
        targetResource: `user/${userId}`,
        status: 'BLOCKED_UNAUTHORIZED',
        details: `${refusal} (module ${moduleId})`,
      });
      return sendApiError(res, 403, 'ERR_SITE_FORBIDDEN', refusal);
    }
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
app.get('/api/v1/security/compliance-summary', requireMasterAdmin, requirePermission('SECURITY_AUDIT', 'view'), (req, res) => {
  const summary = getSecurityComplianceSummary();
  res.json({ success: true, summary });
});

// Get Cryptographic Tamper-Evident Audit Logs
app.get('/api/v1/security/audit-logs', requireMasterAdmin, requirePermission('SECURITY_AUDIT', 'view'), (req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const logs = getSecurityAuditLogs(limit);
  res.json({ success: true, total: logs.length, logs });
});

// Mathematically verify SHA-256 HMAC integrity chaining of audit trail
app.post('/api/v1/security/verify-audit-chain', requireMasterAdmin, requirePermission('SECURITY_AUDIT', 'view'), (req, res) => {
  const verification = verifyAuditTrailIntegrity();
  res.json({ success: true, verification });
});

// Interactive Infosec Vulnerability & Remediation Attack Simulator (For Security Testing UI)
app.post('/api/v1/security/simulate-attack', requireMasterAdmin, requirePermission('SECURITY_AUDIT', 'canEdit'), (req, res) => {
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
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Attendant mobile portal (browser-based standalone build, same
    // screens/logic as the native Android app — see src/mobile/ and
    // src/main-mobile.tsx) — served at its own path so it never gets
    // swallowed by the admin dashboard's catch-all below. Must be
    // registered first: Express matches routes in the order they're
    // added, and the admin dashboard's '*' fallback would otherwise
    // intercept every /attendant request before this ever ran.
    const distMobilePath = path.join(process.cwd(), 'dist-mobile');
    app.use('/attendant', express.static(distMobilePath));
    app.get('/attendant*', (req, res) => {
      res.sendFile(path.join(distMobilePath, 'index.html'));
    });

    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start listening BEFORE waiting on Firestore, not after. Cloud Run's
  // health check needs the server to actually be accepting connections —
  // it was previously gated behind `await bootstrapFirestore()`, so any
  // Firestore slowness (a real RESOURCE_EXHAUSTED quota error, or even
  // just the underlying SDK's own retry/backoff before an error surfaces)
  // meant the server never started listening at all, and the health
  // check had no chance of passing within its 4-minute window. This is
  // exactly what caused tonight's repeated deploy failures. Firestore
  // bootstrap now runs in the background instead — requests that arrive
  // before it finishes just use the existing in-memory/local-JSON
  // fallback store, the same fallback behavior that already existed for
  // when Firestore is unavailable, just not blocking startup on it too.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ParkFlow - Smart Parking Management System (PMS) running on http://0.0.0.0:${PORT}`);
  });

  bootstrapFirestore().catch((err) => {
    console.error('[firestore] Background bootstrap failed — continuing on local store:', err);
  });
}

startServer();
