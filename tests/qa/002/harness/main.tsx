import React from 'react';
import { createRoot } from 'react-dom/client';
import './harness.css';
import DesignSystemPreview from '../../../../src/design-system/preview/DesignSystemPreview';
// T1 acceptance probe: Tailwind 4 compiles token utilities from theme.css.
const TwProbe = () => <div id="qa-tw-probe" className="bg-navy-600 p-4 text-title-1 rounded-md shadow-2 text-on-navy" aria-hidden="true">probe</div>;
createRoot(document.getElementById('root')!).render(<><DesignSystemPreview /><TwProbe /></>);
