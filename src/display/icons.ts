/**
 * Stroke icons for the TV (the lucide shapes the UX boards use), built with createElementNS so
 * no markup string is ever parsed. Decorative: aria-hidden.
 */
const NS = 'http://www.w3.org/2000/svg';
const CIRCLE = 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0';
/** A circle as a path (no <circle> elements: one shape type keeps setIcon simple). */
function ring(cx: number, cy: number, r: number): string {
  return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0';
}

export const ICON: { [name: string]: string[] } = {
  vacant: ['M20 6 9 17l-5-5'],
  occupied: [CIRCLE, 'M8 12h8'],
  reserved: [CIRCLE, 'M12 6v6l4 2'],
  maintenance: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z'],
  ev: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  height: ['M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4'],
  length: ['M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4'],
  full: [CIRCLE, 'M8 12h8'],
  stale: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  megaphone: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  unavailable: ['M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.8M16.9 11.3A10 10 0 0 1 19 12.9M12 20h.01'],
  off: ['M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10'],
  noslots: ['M3 3h18v18H3zM3 9h18M9 21V9'],
  pairing: ['M4 5h16v11H4zM8 20h8M12 16v4'],
  // 003 v1.5 summary columns: one icon per vehicle type, next to the word (never the icon alone).
  'type-sedan': ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', 'M9 17h6', ring(7, 17, 2), ring(17, 17, 2)],
  'type-hatchback': ['M19 17h2c.6 0 1-.4 1-1v-4l-3-5H7.5L4 11.5 2.6 12A1 1 0 0 0 2 13v3c0 .6.4 1 1 1h2', 'M9 17h6', 'M8 11.5h11', ring(7, 17, 2), ring(17, 17, 2)],
  'type-suv': ['M3 17H2v-6l2-5h13l3 5h1a1 1 0 0 1 1 1v5h-2', 'M9 17h6', 'M5 11h15', ring(7, 17, 2), ring(17, 17, 2)],
  'type-csuv': ['M3 17H2v-5l2.5-4.5h11L19 12h1.5a1 1 0 0 1 1 1v4h-2', 'M9 17h6', 'M5 12h14', ring(7, 17, 2), ring(17, 17, 2)],
  'type-two_wheeler': [ring(5.5, 17.5, 3.5), ring(18.5, 17.5, 3.5), 'M15 6h2l3 11.5', 'M5.5 17.5 9 10h6l-3 7.5h-6.5'],
  'type-ev': ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
};

export function svgIcon(name: string, strokeWidth: number): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  setIcon(svg, name);
  return svg;
}

/** Swap the shape of an existing icon (cards are reused). */
export function setIcon(svg: SVGSVGElement, name: string): void {
  if (svg.getAttribute('data-icon') === name) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const paths = ICON[name] || [];
  for (let i = 0; i < paths.length; i++) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', paths[i]);
    svg.appendChild(p);
  }
  svg.setAttribute('data-icon', name);
}
