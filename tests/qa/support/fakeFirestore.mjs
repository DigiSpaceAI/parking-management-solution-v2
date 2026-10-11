import { writeFileSync } from 'node:fs';
// In-memory stand-in for the parts of the Firestore Admin API the server uses.
// Every write is recorded in `writes` so tests can assert what (if anything)
// a cold start pushed to "production" Firestore.
export class FakeFirestore {
  // failReads: the first n collection reads (get) throw `failMessage`, like a
  // Firestore DEADLINE_EXCEEDED on a throttled cold start. The append-only
  // securityAuditLogs reads are not counted, so the store load is what fails.
  // persistFile (002 R1b tests): when set, every write and delete rewrites that
  // JSON file, so a later process can start from the same "Firestore" (re-load).
  constructor(seed = {}, { loadDelayMs = 0, failReads = 0, failMessage = '4 DEADLINE_EXCEEDED: Deadline exceeded', persistFile = null } = {}) {
    this.persistFile = persistFile;
    this.data = new Map();
    this.writes = [];
    this.loadDelayMs = loadDelayMs;
    this.failReadsLeft = failReads;
    this.failMessage = failMessage;
    this.readFailures = 0;
    for (const [name, docs] of Object.entries(seed)) {
      this.data.set(name, new Map(docs.map((d) => [String(d.id), structuredClone(d)])));
    }
  }
  _coll(name) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name);
  }
  _persist() {
    if (!this.persistFile) return;
    const out = {};
    for (const [name, docs] of this.data) out[name] = [...docs.values()];
    writeFileSync(this.persistFile, JSON.stringify(out));
  }
  _write(collection, id, value, merge) {
    this.writes.push({ collection, id: String(id) });
    const c = this._coll(collection);
    c.set(String(id), merge && c.has(String(id)) ? { ...c.get(String(id)), ...structuredClone(value) } : structuredClone(value));
    this._persist();
  }
  collection(name) {
    const fs = this;
    const query = {
      orderBy() { return query; },
      limit() { return query; },
      where() { return query; },
      async get() {
        if (fs.loadDelayMs) await new Promise((r) => setTimeout(r, fs.loadDelayMs));
        if (fs.failReadsLeft > 0 && name !== 'securityAuditLogs') {
          fs.failReadsLeft--; fs.readFailures++;
          const err = new Error(fs.failMessage); err.code = 4; throw err;
        }
        const docs = [...fs._coll(name).values()].map((v) => ({ id: v.id, data: () => structuredClone(v), ref: { _c: name, _id: v.id } }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
      doc(id) {
        return {
          _c: name, _id: String(id),
          async set(value, opts) { fs._write(name, id, value, !!opts?.merge); },
          async get() { const v = fs._coll(name).get(String(id)); return { exists: !!v, data: () => (v ? structuredClone(v) : undefined) }; },
          async delete() { fs.writes.push({ collection: name, id: String(id), deleted: true }); fs._coll(name).delete(String(id)); fs._persist(); },
        };
      },
    };
    return query;
  }
  batch() {
    const ops = [];
    const fs = this;
    return {
      set(ref, value, opts) { ops.push(() => fs._write(ref._c, ref._id, value, !!opts?.merge)); },
      delete(ref) { ops.push(() => { fs.writes.push({ collection: ref._c, id: ref._id, deleted: true }); fs._coll(ref._c).delete(ref._id); fs._persist(); }); },
      async commit() { for (const op of ops) op(); },
    };
  }
}

// "Production" data as it looks after the Master Admin changed things:
// the default Site Facility Manager role has ALERTS edit off, company.com
// (dom-1) was removed, and the bootstrap Master's record was edited.
export function productionSeed() {
  const full = { enabled: true, canCreate: true, canEdit: true, canDelete: true, canExport: true };
  return {
    sites: [{ id: 'site-alpha', siteCode: 'ALPHA', siteName: 'Alphatech', status: 'ACTIVE' }],
    appRoles: [{
      id: 'role-site-manager', roleCode: 'SITE_MANAGER', roleName: 'Site Facility Manager', description: 'changed in prod',
      isSystemDefault: true, siteScope: 'ASSIGNED_SITES_ONLY', createdAt: '2026-09-01T00:00:00.000Z',
      modulePermissions: { HOME: full, ALERTS: { enabled: true, canCreate: false, canEdit: false, canDelete: false, canExport: false } },
    }],
    appUsers: [{ id: 'usr-digi-master', username: 'digisolutions', fullName: 'Prod Master (edited)', email: 'digisolutions.fm@gmail.com',
      roleId: 'role-master-admin', roleName: 'Platform Master Admin', status: 'ACTIVE', siteScopeType: 'ALL_SITES', assignedSiteIds: [] }],
    whitelistedDomains: [{ id: 'dom-parkflows', domain: 'parkflows.in', addedBy: 'Master', createdAt: '2026-10-02T00:00:00.000Z', isActive: true }],
  };
}
