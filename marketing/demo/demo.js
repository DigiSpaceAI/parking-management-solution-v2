// Book a demo form (002 T6; tech design v1.1, "Marketing site parkflows.in" + API table).
// Posts JSON to /api/v1/demo-requests on this same origin (one Firebase Hosting rewrite → Cloud Run,
// task D1). The endpoint is built in B6; until it is live every submit ends in the error state,
// which offers sales@parkflows.in and the phone number instead.
//
// Client checks mirror the server rules in 03 so people see problems before sending; the server
// stays the authority and its per-field messages are shown when it returns them.

const ENDPOINT = '/api/v1/demo-requests';
const FACILITY_TYPES = ['Office park', 'Tech campus', 'Mall', 'Hospital', 'Residential', 'Other'];
const MESSAGE_MAX = 1000;
const NUMBER_MAX = 100000;
const nf = new Intl.NumberFormat('en-IN');

const form = document.getElementById('demo-form');
const submitBtn = document.getElementById('f-submit');
const errorBox = document.getElementById('form-error');
const errorTitle = document.getElementById('form-error-title');
const errorMail = document.getElementById('form-error-mail');
const successBox = document.getElementById('form-success');
const message = document.getElementById('f-message');
const counter = document.getElementById('f-message-count');

/** Field name → { input to focus/mark, error element }. */
const FIELDS = {
  name: { input: 'f-name', error: 'f-name-err' },
  company: { input: 'f-company', error: 'f-company-err' },
  workEmail: { input: 'f-email', error: 'f-email-err' },
  phone: { input: 'f-phone', error: 'f-phone-err' },
  city: { input: 'f-city', error: 'f-city-err' },
  facilityType: { input: 'f-facility', error: 'f-facility-err' },
  slotsApprox: { input: 'f-slots', error: 'f-slots-err' },
  sitesApprox: { input: 'f-sites', error: 'f-sites-err' },
  preferredContact: { input: null, error: 'f-contact-err' },
  message: { input: 'f-message', error: 'f-message-err' },
  consent: { input: 'f-consent', error: 'f-consent-err' },
};

const ERROR_ICON = '<svg class="pf-icon pf-icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';

const val = (name) => (form.elements.namedItem(name)?.value ?? '').trim();

/** "98206 03518", "+91 98206-03518", "09820603518" → "+919820603518"; anything else → null. */
export function normalisePhone(raw) {
  const digits = raw.replace(/[\s\-()]/g, '');
  const m = digits.match(/^(?:\+91|91|0)?(\d{10})$/);
  return m ? `+91${m[1]}` : null;
}

/** "1,080" or "1080" → 1080; empty → undefined; not a whole number → NaN. */
function parseCount(raw) {
  const s = raw.replace(/[,\s]/g, '');
  if (s === '') return undefined;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

function validate() {
  const errors = {};
  const name = val('name');
  if (name.length < 2 || name.length > 80) errors.name = 'Enter your name (2 to 80 characters).';
  const company = val('company');
  if (company.length < 2 || company.length > 120) errors.company = 'Enter your company name (2 to 120 characters).';
  const email = val('workEmail');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) errors.workEmail = 'Enter a work email, like name@company.com.';
  if (!normalisePhone(val('phone'))) errors.phone = 'Enter a 10-digit Indian phone number, like 98206 03518.';
  const city = val('city');
  if (city.length < 2 || city.length > 80) errors.city = 'Enter your city.';
  if (!FACILITY_TYPES.includes(val('facilityType'))) errors.facilityType = 'Choose a facility type.';
  for (const key of ['slotsApprox', 'sitesApprox']) {
    const n = parseCount(val(key));
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > NUMBER_MAX)) {
      errors[key] = `Enter a whole number from 1 to ${nf.format(NUMBER_MAX)}, or leave it empty.`;
    }
  }
  if (!['Email', 'Phone'].includes(form.elements.namedItem('preferredContact')?.value)) errors.preferredContact = 'Choose how we should contact you.';
  if (message.value.length > MESSAGE_MAX) errors.message = `Keep the message to ${nf.format(MESSAGE_MAX)} characters or fewer.`;
  if (!form.elements.namedItem('consent').checked) errors.consent = 'Tick the box so we can contact you about the demo.';
  return errors;
}

function showFieldErrors(errors) {
  let first = null;
  for (const [key, { input, error }] of Object.entries(FIELDS)) {
    const el = document.getElementById(error);
    const msg = errors[key];
    const inputEl = input ? document.getElementById(input) : null;
    if (msg) {
      el.innerHTML = `${ERROR_ICON}<span></span>`;
      el.querySelector('span').textContent = msg;
      el.hidden = false;
      inputEl?.setAttribute('aria-invalid', 'true');
      first ??= inputEl ?? form.querySelector('input[name="preferredContact"]');
    } else {
      el.hidden = true;
      el.textContent = '';
      inputEl?.removeAttribute('aria-invalid');
    }
  }
  return first;
}

function payload() {
  return {
    name: val('name'),
    company: val('company'),
    workEmail: val('workEmail'),
    phone: normalisePhone(val('phone')),
    city: val('city'),
    facilityType: val('facilityType'),
    slotsApprox: parseCount(val('slotsApprox')),
    sitesApprox: parseCount(val('sitesApprox')),
    preferredContact: form.elements.namedItem('preferredContact').value,
    message: message.value.trim() || undefined,
    consent: true,
    website: form.elements.namedItem('website').value, // honeypot: people leave it empty
  };
}

/** A mailto link carrying what they typed, so the email fallback doesn't make them start again. */
function fallbackMailto(p) {
  const lines = [
    `Name: ${p.name}`, `Company: ${p.company}`, `Work email: ${p.workEmail}`, `Phone: ${p.phone ?? val('phone')}`,
    `City: ${p.city}`, `Facility type: ${p.facilityType}`,
    p.slotsApprox ? `Parking slots: ${p.slotsApprox}` : '', p.sitesApprox ? `Sites: ${p.sitesApprox}` : '',
    `Contact me by: ${p.preferredContact}`, p.message ? `\n${p.message}` : '',
  ].filter(Boolean);
  return `mailto:sales@parkflows.in?subject=${encodeURIComponent(`Demo request — ${p.company || 'ParkFlows'}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

function showError(title, p) {
  errorTitle.textContent = title;
  errorMail.href = fallbackMailto(p);
  errorBox.hidden = false;
  errorBox.focus();
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.setAttribute('aria-busy', String(busy));
  submitBtn.textContent = busy ? 'Sending…' : 'Send request';
}

function updateCounter() {
  const n = message.value.length;
  counter.textContent = `${nf.format(n)} / ${nf.format(MESSAGE_MAX)} characters`;
  counter.dataset.over = String(n > MESSAGE_MAX);
}

if (form) {
  // The markup ships the form hidden and without `novalidate` (05 M-1). Only now that this script owns
  // submit do we switch native validation off (we show our own messages) and reveal the form.
  form.noValidate = true;
  form.hidden = false;
  message.addEventListener('input', updateCounter);
  updateCounter();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const errors = validate();
    const first = showFieldErrors(errors);
    if (first) {
      first.focus();
      return;
    }
    const p = payload();
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(p),
        credentials: 'omit',
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success === true) {
        form.hidden = true;
        successBox.hidden = false;
        successBox.focus();
        return;
      }
      if (res.status === 400 && data && typeof data.errors === 'object' && data.errors) {
        const serverFirst = showFieldErrors(data.errors);
        if (serverFirst) { serverFirst.focus(); return; }
      }
      if (res.status === 429) {
        showError('Too many requests right now', p);
        return;
      }
      showError("We couldn't send your request", p);
    } catch {
      showError("We couldn't send your request", p);
    } finally {
      setBusy(false);
    }
  });
}
