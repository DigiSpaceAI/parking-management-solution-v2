/**
 * Browser access for the TV page, each wrapped for old TV browsers (03 "TV browser compatibility"):
 * XMLHttpRequest with a timeout (no fetch / AbortController), localStorage in try/catch,
 * performance.now() with a Date fallback. Tests replace these with fakes (see app.ts `TvEnv`).
 */

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const safeStorage: Store = {
  get: function (key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set: function (key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* private mode or full: the TV still works, it just can't remember across reloads */
    }
  },
  remove: function (key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  },
};

export function monoNow(): number {
  return window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
}

export interface HttpResult {
  /** 0 = network error or timeout. */
  status: number;
  body: unknown;
  retryAfterS?: number;
}

/** One request, JSON in and out, 10 s timeout. */
export function xhrJson(method: 'GET' | 'POST', url: string, headers: { [name: string]: string }, body: unknown, timeoutMs: number, done: (r: HttpResult) => void): void {
  let finished = false;
  const finish = (r: HttpResult) => {
    if (finished) return;
    finished = true;
    done(r);
  };
  let xhr: XMLHttpRequest;
  try {
    xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
  } catch (e) {
    finish({ status: 0, body: null });
    return;
  }
  xhr.timeout = timeoutMs;
  for (const name in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, name)) xhr.setRequestHeader(name, headers[name]);
  }
  if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    let parsed: unknown = null;
    try {
      parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch (e) {
      parsed = null;
    }
    const ra = Number(xhr.getResponseHeader('Retry-After'));
    finish({ status: xhr.status, body: parsed, retryAfterS: isFinite(ra) && ra > 0 ? ra : undefined });
  };
  xhr.onerror = function () {
    finish({ status: 0, body: null });
  };
  xhr.ontimeout = function () {
    finish({ status: 0, body: null });
  };
  try {
    xhr.send(body === undefined ? null : JSON.stringify(body));
  } catch (e) {
    finish({ status: 0, body: null });
  }
}
