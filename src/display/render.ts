/**
 * TV rendering. F2: the page shell (header, a status line per state). F3 draws the boards.
 * Text only ever goes in with textContent (no innerHTML of feed data).
 */
import type { Renderer, ScreenModel } from './app';
import { fmtTime, fmtTimeSeconds } from './time';
import { opensAt } from './hours';

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createRenderer(root: HTMLElement): Renderer {
  const header = el('header', 'tv-head');
  const place = el('div', 'tv-place');
  const updated = el('div', 'tv-updated');
  header.appendChild(place);
  header.appendChild(updated);
  const body = el('main', 'tv-body');
  const line = el('p', 'tv-line');
  body.appendChild(line);
  root.appendChild(header);
  root.appendChild(body);
  let last = '';

  return {
    render(m: ScreenModel) {
      let p = m.feed ? m.feed.place : 'ParkFlows';
      let u = m.lastOkMs !== null ? 'Updated ' + fmtTimeSeconds(m.lastOkMs) : '';
      let t: string;
      switch (m.view) {
        case 'PAIRING':
          t = 'Set up this screen';
          break;
        case 'OFF':
          t = 'This display has been switched off. Ask your site admin.';
          p = 'ParkFlows';
          u = '';
          break;
        case 'INVALID':
          t = "This display link isn't valid. Ask your site admin.";
          p = 'ParkFlows';
          u = '';
          break;
        case 'CLOSED':
          t = 'Closed — opens at ' + (opensAt(m.feed && m.feed.hours) || '—');
          break;
        case 'EMPTY':
          t = 'No slots selected. Ask your site admin.';
          break;
        case 'UNAVAILABLE':
          t = 'Live status unavailable';
          break;
        case 'LIVE':
          t = (m.feed ? m.feed.counts.free : 0) + ' free';
          if (m.stale && m.lastOkMs !== null) t = 'Updating… last updated ' + fmtTime(m.lastOkMs);
          break;
        default:
          t = 'Connecting…';
      }
      const key = p + '|' + u + '|' + t + '|' + m.view;
      if (key === last) return; // nothing changed: don't touch the DOM
      last = key;
      place.textContent = p;
      updated.textContent = u;
      line.textContent = t;
      root.setAttribute('data-view', m.view.toLowerCase());
    },
  };
}
