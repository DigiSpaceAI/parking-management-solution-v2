import React, { useState } from 'react';

interface LegalModalProps {
  onClose: () => void;
}

const C = {
  ink: '#0f172a', inkSoft: '#1e293b', label: '#334155', muted: '#64748b', faint: '#8b95a6',
  border: '#e2e6ee', borderStrong: '#cbd3e0', panel: '#eef1f6', panelAlt: '#f8fafc',
  primary: '#2563eb', primaryDark: '#1d4ed8',
};

type LegalTab = 'privacy' | 'terms';

// Condensed, on-device copy of PRIVACY_POLICY.md / TERMS_OF_SERVICE.md (repo
// root) — kept in sync with those files by hand. This is what GDPR Art. 12
// calls the "easily accessible" copy: available offline, at any time, not
// just once at signup. The full versions (with the complete data-processor
// table) are hosted at https://parkflows.in/privacy and /terms.
const PRIVACY_TEXT = `Last updated: 22 September 2026

WHO WE ARE
ParkFlows Attendant is operated by DigiSpace AI ("we", "us"), the data
controller for the personal data described below. Contact:
digisolutions.fm@gmail.com

WHAT THIS APP IS
A work tool issued to parking attendants to log vehicle entry/exit at a
managed site. It is not a consumer app and is not directed at the public.

DATA WE COLLECT
• Account data: your name, email or username, and role, set up for you by
  your site admin — used to sign you in and attribute the actions you take.
• Vehicle plate numbers you scan or type, plus the timestamp, site, and slot
  — used to run the parking log your employer operates.
• Camera images: when you scan a plate, the frame is read on-device (Google
  ML Kit, or Tesseract OCR as a fallback) to extract the plate text. The
  image itself is never uploaded, stored, or sent anywhere — only the
  recognised plate number and timestamp are sent to the server.
• A 4-digit PIN you may set for quick unlock: stored only as a one-way hash
  in this device's local storage, and never leaves the device.
• Basic technical data (IP address, request timestamps) that our backend
  logs for every request, for security and abuse prevention.
We do not collect device advertising IDs, and this app has no analytics or
advertising SDKs.

WHY WE PROCESS IT
Legal basis: performance of your employment/engagement contract with the
site operator, and our legitimate interest in operating and securing the
parking system. Where the site is in the EU/UK, this is the basis under
GDPR Art. 6(1)(b) and 6(1)(f).

WHO WE SHARE IT WITH
• Your employer / the site operator you work for (they control this data).
• Google Cloud Platform / Firebase — our infrastructure and hosting
  provider, acting as a data processor.
• Nobody else. We do not sell personal data or share it for advertising.

RETENTION
Vehicle and shift logs are retained per your organisation's records policy
(typically tied to the site's operational and legal retention needs). Your
account is removed when your site admin deactivates it.

YOUR RIGHTS
Subject to your jurisdiction (including GDPR for EU/UK users), you may
request access to, correction of, or deletion of your personal data, or
object to its processing, by contacting your site admin or
digisolutions.fm@gmail.com. You may also lodge a complaint with your local
data protection authority.

SECURITY
Data in transit is encrypted (HTTPS). Passwords are hashed, never stored in
plain text. Your device PIN never leaves this device.

CHANGES
We'll update this notice if what we collect or why changes, and update the
"Last updated" date above.`;

const TERMS_TEXT = `Last updated: 22 September 2026

By signing in to ParkFlows Attendant you agree to these terms.

1. PURPOSE. This app is provided to you by your employer or site operator
   as a work tool for logging vehicle entry, exit, and slot status at an
   assigned parking site. It is for authorised personnel only.

2. YOUR ACCOUNT. Your login is issued by your site admin. You're
   responsible for keeping your password and device PIN confidential, and
   for actions taken under your account. Report a lost or compromised
   device to your site admin immediately.

3. ACCEPTABLE USE. Use the app only for genuine attendant duties at your
   assigned site. Don't attempt to access another site's data, bypass
   authentication, or use the camera/OCR feature for anything other than
   scanning vehicle plates at the gate.

4. ACCURACY. Vehicle entries you log (manually or via scan) should reflect
   what you actually observe at the gate — this log is the operational and
   audit record for the site.

5. AVAILABILITY. We aim for the service to be available and accurate but
   don't guarantee uninterrupted access; the app has offline indicators and
   a manual-entry fallback for connectivity gaps.

6. TERMINATION. Your access can be revoked at any time by your site admin,
   e.g. at the end of your engagement.

7. LIABILITY. The app is provided "as is" for internal operational use. To
   the extent permitted by law, DigiSpace AI is not liable for indirect or
   consequential loss arising from use of the app, beyond what applicable
   law requires.

8. GOVERNING LAW. These terms are governed by the laws of India, without
   prejudice to any mandatory consumer/data-protection rights you have
   under the law of your own country of residence.

9. CONTACT. digisolutions.fm@gmail.com`;

export const LegalModal: React.FC<LegalModalProps> = ({ onClose }) => {
  const [tab, setTab] = useState<LegalTab>('privacy');

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(15,23,42,.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '86vh', overflow: 'hidden', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 18px 44px rgba(15,23,42,.22)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '17px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Legal</div>
            <div style={{ marginTop: 6, fontWeight: 700, fontSize: 17, color: C.ink }}>Privacy &amp; Terms</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setTab('privacy')}
            style={{ flex: 1, height: 36, borderRadius: 9, border: `1px solid ${tab === 'privacy' ? C.primary : C.border}`, background: tab === 'privacy' ? '#e8f0fe' : C.panelAlt, color: tab === 'privacy' ? C.primaryDark : C.label, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => setTab('terms')}
            style={{ flex: 1, height: 36, borderRadius: 9, border: `1px solid ${tab === 'terms' ? C.primary : C.border}`, background: tab === 'terms' ? '#e8f0fe' : C.panelAlt, color: tab === 'terms' ? C.primaryDark : C.label, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
          >
            Terms of Service
          </button>
        </div>

        <div style={{ padding: '4px 16px 18px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, color: C.label }}>
          {tab === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT}
        </div>
      </div>
    </div>
  );
};
