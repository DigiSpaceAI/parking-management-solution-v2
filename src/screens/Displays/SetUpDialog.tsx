import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Banner, Button, Modal, TextField, useToast } from '../../design-system/components';
import { COPY_SAVE_ERROR, saveErrorMessage } from '../../utils/withSite';
import { displaysApi, TV_SHORT_ADDRESS, type DisplayRow } from './api';

const CODE_ERROR = 'That code doesn’t match a screen waiting to pair. Check the code on the screen — it changes every 10 minutes.';
/** The TV code alphabet: no 0/O, 1/I/L (03 "Pairing"). */
const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;

export interface SetUpDialogProps {
  open: boolean;
  display: DisplayRow | null;
  /** The display's own link: only right after Create or Replace link (it is never shown again). */
  link: string | null;
  /** Opened straight after Save display. */
  justSaved: boolean;
  onClose: () => void;
  onPaired: () => void;
  /** No link to show any more: offer Replace link instead. */
  onReplace: (d: DisplayRow) => void;
  onGuide: () => void;
}

/**
 * Set up the screen (UX C5; AC-03): pair with the code the TV shows at parkflows.in/tv, or open
 * the display's own link (PC, Raspberry Pi, signage URL launcher). The link is shown once, at
 * create or replace; it is a read-only credential for this display, so the copy warns not to post it.
 */
export const SetUpDialog: React.FC<SetUpDialogProps> = ({ open, display, link, justSaved, onClose, onPaired, onReplace, onGuide }) => {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
      setPaired(false);
    }
  }, [open, display?.id]);

  if (!display) return <Modal open={false} onClose={onClose} title="" />;

  const pair = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!CODE_RE.test(c)) {
      setError(CODE_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await displaysApi.pair(display.id, c);
      if (r.ok) {
        setPaired(true);
        toast.show({ tone: 'success', message: 'Screen paired' });
        onPaired();
      } else setError(r.status === 400 ? (r.data.errors && r.data.errors.code) || CODE_ERROR : saveErrorMessage(r.data));
    } catch {
      setError(COPY_SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.show({ tone: 'success', message: 'Link copied' });
    } catch {
      toast.show({ tone: 'error', message: 'Couldn’t copy. Select the link and copy it yourself.' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set up “${display.name}” on its screen`}
      className="pf-modal--wide"
      footer={
        <>
          <button type="button" className="pf-link pf-push-start" onClick={onGuide}>
            Screen set-up guide
          </button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="pf-stack">
        {justSaved && <Banner tone="success">Display saved. Now connect the screen.</Banner>}
        <section className="pf-stack" aria-labelledby="pf-pair-title">
          <h3 className="pf-modal-section-title" id="pf-pair-title">
            Easiest on a TV: pair with a code
          </h3>
          <ol className="pf-list">
            <li>
              On the screen’s browser, open <b>{TV_SHORT_ADDRESS}</b>.
            </li>
            <li>The screen shows a 6-character code. Type it here:</li>
          </ol>
          {paired ? (
            <Banner tone="success">Screen paired. It starts showing slots within a few seconds.</Banner>
          ) : (
            <form className="pf-form-row pf-form-row--end" onSubmit={pair} noValidate>
              <TextField
                label="Pairing code"
                mono
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={8}
                placeholder="K7M 4QP"
                value={code}
                error={error}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button type="submit" variant="primary" guard loading={busy} loadingLabel="Pairing…">
                Pair screen
              </Button>
            </form>
          )}
          <p className="pf-field-help">The screen starts showing slots within a few seconds. One screen per display: pairing a new screen switches off the previous one.</p>
        </section>
        <section className="pf-stack pf-modal-section" aria-labelledby="pf-link-title">
          <h3 className="pf-modal-section-title" id="pf-link-title">
            Or open this display’s own link
          </h3>
          <p className="pf-text-secondary">For a PC, Raspberry Pi or a signage screen with a URL launcher.</p>
          {link ? (
            <>
              <div className="pf-form-row pf-form-row--end">
                <TextField label="Display link" mono readOnly value={link} fieldClassName="pf-grow" onFocus={(e) => e.currentTarget.select()} />
                <Button icon={Copy} onClick={() => void copy()}>
                  Copy link
                </Button>
              </div>
              <p className="pf-field-help">Anyone with this link can see this display’s slots and plates. Don’t post it. You can replace it at any time.</p>
            </>
          ) : (
            <p className="pf-field-help">
              The link is shown only once, when it is made. To get a new link, replace it: the screen using the old one stops within 1 minute.{' '}
              <button type="button" className="pf-link pf-link--inline" onClick={() => onReplace(display)}>
                Replace link
              </button>
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
};

/** "Which screens work?" / "Screen set-up guide" (UX C3/C5; PRD hardware; 03 gap 7). */
export const ScreensGuide: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Which screens work?" footer={<Button onClick={onClose}>Close</Button>}>
    <div className="pf-stack">
      <p>Any landscape screen with a web browser works. These are the models we support:</p>
      <ul className="pf-list">
        <li>
          <b>Samsung Smart Signage QM55C</b>: set the URL Launcher to the display’s link and use its on/off timer.
        </li>
        <li>
          <b>LG 55UR640S</b> (UHD Signage): put the display’s link in the SI Server / URL setting; its power schedule can match the display hours.
        </li>
        <li>
          <b>Any Google TV or Android TV</b>: install a browser app that opens a start page full screen at power-on, open {TV_SHORT_ADDRESS} to pair, and turn off the screensaver and auto power-off.
        </li>
        <li>
          <b>A PC or Raspberry Pi with Chromium</b> in kiosk mode, opening the display’s link.
        </li>
      </ul>
      <p className="pf-text-secondary">Use wired Ethernet where you can, and a power timer for the site’s hours. Consumer TVs aren’t built to run all day.</p>
    </div>
  </Modal>
);
