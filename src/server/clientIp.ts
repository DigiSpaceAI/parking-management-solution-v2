// 002 B6b (03 v1.3, review 05 R1b M-1): the client IP for POST /api/v1/demo-requests.
//
// The route is reached through the parkflows.in Firebase Hosting rewrite. With
// the global `trust proxy` of 1, req.ip there is Hosting's egress address for
// every visitor. This route reads X-Forwarded-For itself:
//   - off Cloud Run, X-Forwarded-For is ignored (socket address);
//   - on Cloud Run, the rightmost hop (appended by Google's front end, so the
//     client can't change it) must be a configured Hosting egress address, and
//     the hop just left of it (appended by Hosting) is the visitor;
//   - anything else is refused (the direct *.run.app URL can't submit).
// Pure functions only (no store, no request object), so they are unit-tested
// directly. Node's own `net` module, no dependency.
import net from 'node:net';

export interface HostingCidrs {
  list: net.BlockList;
  count: number;
}

export type DemoClientIp =
  | { ok: true; key: string }
  | { ok: false; reason: 'no-edge-hop' | 'not-via-hosting' | 'no-client-hop' };

// Parses DEMO_HOSTING_EGRESS_CIDRS ("a.b.c.d/n, xxxx::/n, ..."). A bad entry is
// skipped and reported in `invalid` (the caller warns at startup); the others
// still count. A bare address counts as /32 (IPv4) or /128 (IPv6).
export function parseHostingCidrs(raw: string | undefined): { cidrs: HostingCidrs; invalid: string[] } {
  const list = new net.BlockList();
  const invalid: string[] = [];
  let count = 0;
  for (const entry of (raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [addr, prefixRaw, extra] = entry.split('/');
    const family = net.isIP(addr || '');
    const max = family === 4 ? 32 : 128;
    const prefix = prefixRaw === undefined ? max : /^\d{1,3}$/.test(prefixRaw) ? Number(prefixRaw) : NaN;
    if (!family || extra !== undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > max) {
      invalid.push(entry);
      continue;
    }
    list.addSubnet(addr, prefix, family === 4 ? 'ipv4' : 'ipv6');
    count++;
  }
  return { cidrs: { list, count }, invalid };
}

// One hop -> a plain address, or null when it isn't one. Strips one
// "::ffff:" prefix from an IPv4-mapped IPv6, a ":port" from IPv4 and the
// "[ ]" (and port) around IPv6.
export function normalizeHop(hop: string | undefined | null): string | null {
  let h = String(hop ?? '').trim();
  if (!h) return null;
  const bracket = h.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) h = bracket[1];
  if (/^::ffff:/i.test(h) && net.isIP(h.slice(7)) === 4) h = h.slice(7);
  const v4port = h.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4port) h = v4port[1];
  return net.isIP(h) ? h.toLowerCase() : null;
}

// The 8 groups of an IPv6 address, expanded (handles "::" and a dotted tail).
function ipv6Groups(ip: string): string[] {
  let s = ip;
  const dotted = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const o = dotted[1].split('.').map(Number);
    s = s.slice(0, -dotted[1].length) + `${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? new Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => parseInt(g, 16).toString(16));
}

// Limiter key for an address: IPv4 as is; IPv6 as its /64 prefix, so one
// allocation can't rotate through addresses.
export function clientKey(ip: string): string {
  return net.isIP(ip) === 6 ? `${ipv6Groups(ip).slice(0, 4).join(':')}::/64` : ip;
}

export function pickDemoClientIp(input: {
  xff: string | string[] | undefined;
  socketIp: string | undefined;
  onCloudRun: boolean;
  hostingCidrs: HostingCidrs;
}): DemoClientIp {
  if (!input.onCloudRun) {
    // Local dev and tests without K_SERVICE: X-Forwarded-For is never read.
    const own = normalizeHop(input.socketIp);
    return { ok: true, key: own ? clientKey(own) : 'unknown' };
  }
  const joined = Array.isArray(input.xff) ? input.xff.join(',') : input.xff || '';
  const hops = joined.split(',').map((s) => s.trim()).filter(Boolean);
  if (hops.length === 0) return { ok: false, reason: 'no-edge-hop' };
  const edge = normalizeHop(hops[hops.length - 1]);
  if (!edge) return { ok: false, reason: 'no-edge-hop' };
  if (input.hostingCidrs.count === 0 || !input.hostingCidrs.list.check(edge, net.isIP(edge) === 4 ? 'ipv4' : 'ipv6')) {
    return { ok: false, reason: 'not-via-hosting' };
  }
  const client = hops.length >= 2 ? normalizeHop(hops[hops.length - 2]) : null;
  if (!client) return { ok: false, reason: 'no-client-hop' };
  return { ok: true, key: clientKey(client) };
}
