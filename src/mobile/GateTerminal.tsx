import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { createWorker, type Worker } from 'tesseract.js';
import type { ParkingSlot, Employee } from '../types';
import { apiFetch } from './api';
import { extractPlateCandidates, PlateConsensusTracker } from './plateUtils';
import { MlKitOcr } from './MlKitOcr';

interface GateTerminalProps {
  slots: ParkingSlot[];
  onRefresh: () => void;
  onOpenManual: () => void;
  onNavigateToSlots: (level: string) => void;
}

type GateTab = 'entry' | 'exit' | 'change';
type ResultMode = 'idle' | 'result' | 'change' | 'done';

const C = {
  bg: '#f5f6f8', primary: '#2563eb', primaryDark: '#1d4ed8',
  ink: '#0f172a', inkSoft: '#1e293b', label: '#334155', muted: '#64748b', faint: '#8b95a6',
  border: '#e2e6ee', borderStrong: '#cbd3e0', panel: '#eef1f6', panelAlt: '#f8fafc',
  danger: '#f43f5e', success: '#059669', successBg: '#e7f8f0', successBorder: '#a7e3c8',
  amber: '#f59e0b',
};

export const GateTerminal: React.FC<GateTerminalProps> = ({ slots, onRefresh, onOpenManual, onNavigateToSlots }) => {
  const [tab, setTab] = useState<GateTab>('entry');
  const [isScanning, setIsScanning] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [plate, setPlate] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [mode, setMode] = useState<ResultMode>('idle');
  const [matchedEmployeeName, setMatchedEmployeeName] = useState<string | undefined>(undefined);
  const [currentSlotForChange, setCurrentSlotForChange] = useState<ParkingSlot | null>(null);
  const [changeOptions, setChangeOptions] = useState<ParkingSlot[]>([]);
  const [doneMessage, setDoneMessage] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // On-device OCR pipeline (real camera + on-device recognition + a
  // multi-read consensus check), replacing the previous single-frame
  // capture sent to the backend's Gemini-based /scan-plate endpoint. That
  // approach had a hard dependency on a GEMINI_API_KEY being configured
  // server-side — when it wasn't, every scan silently fell back to a
  // random simulated plate regardless of what the camera actually saw.
  // This pipeline has no backend dependency for plate detection at all:
  // recognition runs entirely in the WebView. Tesseract is genuinely
  // slower/less accurate than a native ML Kit-based OCR, which is why
  // the consensus tracker (3 matching reads within a rolling window)
  // matters even more here than it would on native hardware.
  const workerRef = useRef<Worker | null>(null);
  const workerLoadingRef = useRef<Promise<Worker> | null>(null);
  const trackerRef = useRef(new PlateConsensusTracker({ requiredMatches: 3, windowMs: 9000 }));
  const scanCancelledRef = useRef(true);
  const employeesRef = useRef<Employee[]>([]);

  // Same reasoning as the Manual Entry modal's registry lookup — loaded
  // once, used to attach a matched employee's name to a confirmed plate
  // without any server round-trip.
  useEffect(() => {
    apiFetch('/api/v1/employees')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.employees) ? data.employees : Array.isArray(data) ? data : [];
        employeesRef.current = list;
      })
      .catch(() => {
        employeesRef.current = [];
      });
  }, []);

  const getWorker = async (): Promise<Worker> => {
    if (workerRef.current) return workerRef.current;
    if (!workerLoadingRef.current) {
      setOcrStatus('Loading OCR engine…');
      // Explicit local paths for all three pieces Tesseract needs (worker
      // script, WASM core, language data) — without these it silently
      // fetches from a CDN by default, which would defeat the entire
      // point of "no network dependency for scanning" the moment a gate
      // has poor connectivity. These files are bundled into the app
      // itself (public/tesseract/), not fetched at scan time.
      //
      // The logger callback surfaces Tesseract's own internal init
      // progress (e.g. "loading tesseract core", "initializing api")
      // directly into the on-screen status text. This is deliberately
      // NOT console.log — that requires a full USB-debugging setup to
      // see on a real device, which hasn't been reliably reachable in
      // this environment. Showing it directly in the UI needs nothing
      // extra: whatever step it's actually stuck on becomes plain,
      // readable text on the screen itself.
      const loadPromise = createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
        langPath: '/tesseract/',
        workerBlobURL: false,
        // Bundled as raw, uncompressed traineddata rather than the
        // typical .gz — Capacitor's local asset server doesn't reliably
        // send the Content-Encoding headers a browser needs for
        // transparent gzip decompression, which is the most likely
        // reason loading previously hung indefinitely at "loading
        // language traindata 0%" and never progressed or errored.
        // Larger bundled file, but eliminates that failure mode outright.
        gzip: false,
        logger: (m: { status?: string; progress?: number }) => {
          if (m?.status) {
            const pct = typeof m.progress === 'number' ? ` ${Math.round(m.progress * 100)}%` : '';
            setOcrStatus(`${m.status}${pct}…`);
          }
        },
      } as any).then(async (w) => {
        // Two real accuracy gaps, both well-known for this exact use
        // case, neither set until now:
        //
        // 1. Page segmentation mode. Tesseract defaults to assuming a
        //    full page of paragraphs/columns (PSM 3) — completely wrong
        //    for a small, cropped, single-line plate image. PSM 7
        //    ("treat the image as a single text line") is the standard
        //    setting for exactly this kind of input.
        // 2. No character whitelist. Left unrestricted, Tesseract will
        //    happily "recognize" punctuation, symbols, and non-Latin
        //    characters from background noise, watermarks, or the
        //    state-emblem/registration-district text many Indian plates
        //    carry — actively working against a regex that only expects
        //    A-Z and 0-9. Restricting the character set removes an
        //    entire class of misreads rather than just hoping the regex
        //    filters them out downstream.
        await w.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        } as any);
        workerRef.current = w;
        return w;
      });

      // Hard timeout so a genuine hang (whatever the cause) never leaves
      // the attendant staring at a frozen screen indefinitely — surfaces
      // a clear, actionable error and falls back to manual entry instead.
      const timeoutPromise = new Promise<Worker>((_, reject) => {
        setTimeout(() => reject(new Error('OCR engine took too long to load')), 20000);
      });

      workerLoadingRef.current = Promise.race([loadPromise, timeoutPromise]).catch((err) => {
        workerLoadingRef.current = null;
        throw err;
      });
    }
    return workerLoadingRef.current;
  };

  const usingNativeOcr = Capacitor.isNativePlatform();
  // Tracks whether ML Kit has already failed once this scan session, so
  // a broken native call doesn't get retried every single frame — fall
  // back to Tesseract for the rest of this session once that happens.
  const mlKitFailedRef = useRef(false);

  // Engine-agnostic: tries the native ML Kit plugin first when running
  // on Android (hardware-accelerated, genuinely fast — the same engine
  // the original native app used), and only falls back to the
  // Tesseract/WASM path if that's unavailable or a specific call fails.
  // Both paths return the same {text, lines} shape, so the rest of the
  // scan loop below doesn't need to know or care which one actually ran.
  const recognizeFrame = async (canvas: HTMLCanvasElement): Promise<{ text: string; lines: string[] }> => {
    if (usingNativeOcr && !mlKitFailedRef.current) {
      try {
        setOcrStatus((s) => (s.startsWith('Read') || s.startsWith('Reading') ? s : 'Scanning for plate…'));
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);
        const result = await MlKitOcr.recognizeText({ imageBase64 });
        return { text: result.text || '', lines: result.lines || [] };
      } catch (err) {
        // Native call failed (plugin not registered, ML Kit model not
        // ready, etc.) — fall back to Tesseract for the rest of this
        // session rather than re-attempting a broken native call on
        // every single frame.
        mlKitFailedRef.current = true;
        showToast('On-device fast scan unavailable — using fallback OCR (slower).');
      }
    }

    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    const text = data.text || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    return { text, lines };
  };

  const basements = ['B1', 'B2', 'B3'];
  const levelSummary = basements.map((b) => {
    const bSlots = slots.filter((s) => s.basement === b);
    const vacant = bSlots.filter((s) => s.status === 'VACANT').length;
    const occupied = bSlots.filter((s) => s.status === 'OCCUPIED').length;
    const reserved = bSlots.filter((s) => s.status === 'RESERVED').length;
    const total = bSlots.length || 1;
    return {
      id: b,
      vacant,
      total: bSlots.length,
      occPct: Math.round((occupied / total) * 100),
      resPct: Math.round((reserved / total) * 100),
    };
  });
  const totalVacant = slots.filter((s) => s.status === 'VACANT').length;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // If the attendant navigates away (switches tabs, backgrounds the app)
  // mid-scan, the camera stream was previously left running indefinitely
  // — never stopped, since stopCamera() was only ever called from inside
  // startScan()'s own success path. That's a real resource/battery leak
  // and can block the next scan attempt from getting camera access at all.
  // Also terminates the Tesseract worker (a real WASM instance with its
  // own memory footprint) and cancels any in-flight recognition loop.
  useEffect(() => {
    return () => {
      scanCancelledRef.current = true;
      stopCamera();
      workerRef.current?.terminate();
      workerRef.current = null;
      workerLoadingRef.current = null;
    };
  }, []);

  const switchTab = (t: GateTab) => {
    scanCancelledRef.current = true;
    setTab(t);
    resetToScan();
  };

  // Crops to a centered band before running OCR — same idea as the
  // native app's SCAN_REGION: faster recognition on a smaller image, and
  // avoids picking up irrelevant text elsewhere in frame (bumper
  // stickers, background signage). Percentages match the dashed overlay
  // box rendered below, so what the attendant sees lining up with the
  // plate is actually the region being read.
  const captureRegionCanvas = (video: HTMLVideoElement): HTMLCanvasElement | null => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;
    const rx = Math.round(vw * 0.08);
    const ry = Math.round(vh * 0.33);
    const rw = Math.round(vw * 0.84);
    const rh = Math.round(vh * 0.32);
    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, rx, ry, rw, rh, 0, 0, rw, rh);
    if (ctx) preprocessForOcr(ctx, rw, rh);
    return canvas;
  };

  // Grayscale + adaptive contrast stretch. A raw color camera frame — with
  // real-world glare, shadow, and uneven exposure — is a genuinely hard
  // input for Tesseract, which does best on clean, high-contrast
  // dark-text-on-light-background input. This finds the actual
  // brightness range present in THIS specific capture (not a fixed
  // threshold, since lighting varies frame to frame) and stretches it to
  // use the full 0-255 range, which pushes plate text and its background
  // further apart without the risk a hard binarization threshold carries
  // of just erasing real text on an unusually light or dark plate.
  const preprocessForOcr = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const imageData = ctx.getImageData(0, 0, w, h);
    const { data } = imageData;
    const n = data.length;

    let min = 255;
    let max = 0;
    const lum = new Uint8ClampedArray(n / 4);
    for (let i = 0, j = 0; i < n; i += 4, j++) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lum[j] = l;
      if (l < min) min = l;
      if (l > max) max = l;
    }

    const range = max - min;
    if (range < 10) return; // Flat/blank frame — stretching would just amplify noise.

    for (let i = 0, j = 0; i < n; i += 4, j++) {
      const stretched = ((lum[j] - min) / range) * 255;
      data[i] = data[i + 1] = data[i + 2] = stretched;
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const findEmployeeForPlate = (plateNumber: string): Employee | undefined => {
    const clean = plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return employeesRef.current.find((e) => (e.vehicleNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === clean);
  };

  const startScan = async () => {
    setIsScanning(true);
    setPlate(null);
    setMode('idle');
    setOcrStatus('Starting camera…');
    scanCancelledRef.current = false;
    trackerRef.current.reset();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          // Higher capture resolution gives the OCR crop more actual
          // detail to work with — a plate that's a small part of frame
          // stays legible instead of turning to mush at a low default
          // resolution. 'ideal' lets the device pick its closest actual
          // supported mode rather than failing outright if it can't hit
          // this exactly.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Camera preview not ready');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (scanCancelledRef.current) return;
      setOcrStatus(usingNativeOcr ? 'Scanning for plate…' : 'Loading OCR engine…');

      // Self-pacing loop: waits for each recognition call to actually
      // finish before scheduling the next one, rather than a fixed
      // setInterval. This matters even more for the Tesseract fallback
      // path — recognition time varies a lot with device and image
      // size, and a fixed interval risks overlapping calls if a single
      // recognize() takes longer than the interval.
      while (!scanCancelledRef.current) {
        const video = videoRef.current;
        if (!video) break;
        const canvas = captureRegionCanvas(video);
        if (canvas) {
          try {
            const { text, lines } = await recognizeFrame(canvas);
            const candidates = extractPlateCandidates(text, lines);

            // Surfaces exactly what each cycle actually read, right on
            // screen — without this, a static "scanning…" message looks
            // identical whether it's genuinely working through frames or
            // silently stuck, with no way to tell the difference.
            const rawPreview = text.trim().slice(0, 24) || '(no text found)';
            setOcrStatus(candidates.length > 0 ? `Read: ${candidates[0].normalized}` : `Reading… "${rawPreview}"`);

            for (const candidate of candidates) {
              const confirmed = trackerRef.current.push(candidate.normalized);
              if (confirmed) {
                scanCancelledRef.current = true;
                stopCamera();
                const emp = findEmployeeForPlate(confirmed);
                setPlate(confirmed);
                // Confidence isn't available in a directly comparable
                // form from ML Kit the way Tesseract reports it — rather
                // than show a fabricated number, the badge is simply
                // hidden when we don't have a real one (see the render
                // section below).
                setConfidence(null);
                setMatchedEmployeeName(emp?.name);
                setIsScanning(false);
                setOcrStatus('');
                routeAfterScan(confirmed);
                return;
              }
            }
          } catch {
            // A single malformed frame/OCR hiccup shouldn't kill the
            // whole loop — just try again on the next frame.
          }
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    } catch (camErr) {
      const detail = camErr instanceof Error ? camErr.message : String(camErr);
      showToast(`Scan failed: ${detail} — try manual entry instead.`);
    } finally {
      stopCamera();
      setIsScanning(false);
      setOcrStatus('');
    }
  };

  const cancelScan = () => {
    scanCancelledRef.current = true;
    stopCamera();
    setIsScanning(false);
    setOcrStatus('');
  };

  // Which action happens next is determined by the SELECTED TAB, not by
  // auto-detecting the vehicle's current state — matches the design's
  // explicit Entry/Exit/Change-slot tabs, where the attendant declares
  // intent before scanning rather than the app inferring it afterward.
  const routeAfterScan = (plateNumber: string) => {
    if (tab === 'entry') {
      setMode('result');
      return;
    }
    // Normalize both sides (strip spaces/hyphens, not just case) before
    // comparing — a plate stored as "KA01EX8821" wouldn't match an
    // ANPR-returned "KA 01 EX 8821" under a plain toUpperCase() compare,
    // which would incorrectly tell the attendant a parked vehicle "isn't
    // here" just because of formatting.
    const normalize = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanScanned = normalize(plateNumber);
    const occupiedSlot = slots.find((s) => s.currentVehicle && normalize(s.currentVehicle) === cleanScanned && s.status === 'OCCUPIED');
    if (!occupiedSlot) {
      showToast(`${plateNumber} isn't currently parked here — nothing to ${tab === 'exit' ? 'release' : 'move'}.`);
      resetToScan();
      return;
    }
    setCurrentSlotForChange(occupiedSlot);
    if (tab === 'exit') {
      setMode('result');
    } else {
      const vacantSameLevel = slots.filter((s) => s.status === 'VACANT' && s.basement === occupiedSlot.basement).slice(0, 4);
      setChangeOptions(vacantSameLevel);
      setMode('change');
    }
  };

  const confirmEntry = async () => {
    if (!plate) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/vehicles/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumber: plate, entryType: 'ANPR_AUTO' }),
      });
      const data = await res.json();
      if (data.success) {
        setDoneMessage(`${plate} → ${data.slot?.slotNumber || ''}`);
        setMode('done');
        onRefresh();
      } else {
        showToast(data.message || 'Entry failed.');
      }
    } catch {
      showToast('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const confirmExit = async () => {
    if (!plate) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/vehicles/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumberOrSlot: plate }),
      });
      const data = await res.json();
      if (data.success) {
        setDoneMessage(`${plate} checked out · ${data.durationMinutes || 0} min`);
        setMode('done');
        onRefresh();
      } else {
        showToast(data.message || 'Exit failed.');
      }
    } catch {
      showToast('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const confirmChange = async (newSlotNumber: string) => {
    if (!plate) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/slots/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleNumberOrSlot: plate, newSlotNumber, reason: 'Attendant reassignment', attendantName: 'Attendant' }),
      });
      const data = await res.json();
      if (data.success) {
        setDoneMessage(`${plate} moved to ${newSlotNumber}`);
        setMode('done');
        onRefresh();
      } else {
        showToast(data.message || 'Slot change failed.');
      }
    } catch {
      showToast('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const resetToScan = () => {
    setPlate(null);
    setMode('idle');
    setMatchedEmployeeName(undefined);
    setChangeOptions([]);
    setCurrentSlotForChange(null);
  };

  const tabConfig: { key: GateTab; label: string }[] = [
    { key: 'entry', label: 'Entry' },
    { key: 'exit', label: 'Exit' },
    { key: 'change', label: 'Change slot' },
  ];

  return (
    <div>
      {toast && (
        <div style={{ margin: '12px 16px 0', padding: '11px 13px', borderRadius: 11, background: '#fdeaee', border: '1px solid #f7b6c2', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.danger, marginTop: 5, flex: 'none' }} />
          <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.45, color: '#be123c' }}>{toast}</div>
        </div>
      )}

      {/* Explicit intent tabs — attendant picks what they're doing before
          scanning, matching the original design rather than inferring it
          from the scan result. */}
      <div style={{ margin: '14px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: 4, borderRadius: 13, background: C.panel, border: `1px solid ${C.border}` }}>
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            style={{
              height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t.key ? C.primary : 'transparent',
              color: tab === t.key ? '#fff' : C.muted,
              fontWeight: 700, fontSize: 12.5,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', margin: '12px 16px 0', height: 440, borderRadius: 18, overflow: 'hidden', background: '#04070f', border: '1px solid #1e293b' }}>
        <video ref={videoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: isScanning ? 0.6 : 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(115% 85% at 50% 42%, rgba(37,99,235,.13), rgba(2,6,23,.85) 72%)' }} />

        <div style={{ position: 'absolute', left: '8%', top: '33%', width: '84%', height: '32%', border: `1.5px dashed ${plate ? C.success : '#38bdf8'}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {plate && (
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 24, color: '#f8fafc', letterSpacing: '.06em', textShadow: '0 2px 12px rgba(0,0,0,.9)' }}>{plate}</div>
          )}
        </div>

        {!isScanning && !plate && (
          <button onClick={startScan} style={{ position: 'absolute', inset: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ width: 78, height: 78, borderRadius: '50%', background: C.primary, border: '3px solid #93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #fff' }} />
            </div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, letterSpacing: '.2em', color: '#bfdbfe' }}>
              TAP TO SCAN — {tabConfig.find((t) => t.key === tab)?.label.toUpperCase()}
            </div>
          </button>
        )}
        {isScanning && (
          <button onClick={cancelScan} style={{ position: 'absolute', inset: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5, letterSpacing: '.14em', color: '#7dd3fc' }}>
              {ocrStatus || 'SCANNING…'}
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: -4, textAlign: 'center', fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.1em', color: '#64748b' }}>
              tap to cancel
            </div>
          </button>
        )}
        {plate && (
          <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', gap: 6 }}>
            {confidence !== null && (
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10, color: '#a7f3d0', background: '#052e22', border: '1px solid #065f46', padding: '5px 7px', borderRadius: 6 }}>MATCH {confidence}%</span>
            )}
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10, color: '#bfdbfe', background: '#0b2350', border: '1px solid #1d4ed8', padding: '5px 7px', borderRadius: 6 }}>ANPR AUTO</span>
          </div>
        )}
      </div>

      <button onClick={onOpenManual} style={{ margin: '12px 16px 0', width: 'calc(100% - 32px)', height: 50, borderRadius: 12, border: `1.5px dashed #b9cffb`, background: '#e8f0fe', color: C.primaryDark, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        Scan failed? Enter vehicle manually
      </button>

      {mode === 'idle' && (
        <div style={{ margin: '14px 16px 0', padding: '13px 14px', borderRadius: 14, background: '#fff', border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Basement occupancy</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 10.5, color: C.muted }}>{totalVacant}/{slots.length} vacant</span>
          </div>
          <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {levelSummary.map((b) => (
              <div
                key={b.id}
                onClick={() => onNavigateToSlots(b.id)}
                style={{ padding: '9px 10px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.panelAlt, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: C.label }}>{b.id}</span>
                  <span style={{ fontWeight: 600, fontSize: 11, color: C.muted }}>{b.vacant} vacant</span>
                </div>
                <div style={{ marginTop: 7, height: 7, borderRadius: 4, background: C.panel, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${b.occPct}%`, background: C.danger }} />
                  <div style={{ width: `${b.resPct}%`, background: C.amber }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'result' && tab === 'entry' && (
        <div style={{ margin: '14px 16px 0', padding: 15, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Detected vehicle</div>
          <div style={{ marginTop: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: 19, color: C.ink }}>{plate}</div>
          {matchedEmployeeName && (
            <div style={{ marginTop: 13, padding: '10px 12px', borderRadius: 10, background: '#e8f0fe', border: '1px solid #b9cffb', fontWeight: 600, fontSize: 12, color: C.primaryDark }}>
              Registered to {matchedEmployeeName}
            </div>
          )}
          <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 9 }}>
            <button onClick={resetToScan} style={{ height: 52, borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Rescan</button>
            <button onClick={confirmEntry} disabled={busy} style={{ height: 52, borderRadius: 12, border: 'none', background: C.primary, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Confirming…' : 'Confirm entry'}
            </button>
          </div>
        </div>
      )}

      {mode === 'result' && tab === 'exit' && currentSlotForChange && (
        <div style={{ margin: '14px 16px 0', padding: 15, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Checkout</div>
          <div style={{ marginTop: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: 19, color: C.ink }}>{plate}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>Currently in {currentSlotForChange.slotNumber}</div>
          <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 9 }}>
            <button onClick={resetToScan} style={{ height: 52, borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Rescan</button>
            <button onClick={confirmExit} disabled={busy} style={{ height: 52, borderRadius: 12, border: 'none', background: C.danger, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Processing…' : 'Release slot'}
            </button>
          </div>
        </div>
      )}

      {mode === 'change' && currentSlotForChange && (
        <div style={{ margin: '14px 16px 0', padding: 15, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 9.5, letterSpacing: '.16em', color: C.faint, textTransform: 'uppercase' }}>Current</div>
          <div style={{ marginTop: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#e11d48' }}>{currentSlotForChange.slotNumber}</div>
          <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
            {changeOptions.map((opt) => (
              <button key={opt.id} onClick={() => confirmChange(opt.slotNumber)} disabled={busy} style={{ padding: 11, borderRadius: 11, textAlign: 'left', cursor: busy ? 'default' : 'pointer', background: C.panel, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: C.inkSoft }}>{opt.slotNumber}</div>
                <div style={{ marginTop: 5, fontWeight: 500, fontSize: 10.5, color: C.muted }}>{opt.slotType}</div>
              </button>
            ))}
            {changeOptions.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No vacant slots found nearby.</div>}
          </div>
          <button onClick={resetToScan} style={{ marginTop: 13, width: '100%', height: 44, borderRadius: 11, border: `1px solid ${C.borderStrong}`, background: C.panel, color: C.label, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {mode === 'done' && (
        <div style={{ margin: '14px 16px 0', padding: '18px 15px', borderRadius: 16, background: C.successBg, border: `1px solid ${C.successBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, color: '#fff' }}>✓</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#065f46' }}>Done</div>
              <div style={{ marginTop: 4, fontFamily: 'monospace', fontWeight: 500, fontSize: 12, color: '#047857' }}>{doneMessage}</div>
            </div>
          </div>
          <button onClick={resetToScan} style={{ marginTop: 14, width: '100%', height: 52, borderRadius: 12, border: 'none', background: C.panel, color: C.inkSoft, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Scan next vehicle
          </button>
        </div>
      )}
    </div>
  );
};
