import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Was rendering the stale, pre-ML-Kit AttendantMobileApp.tsx via a
// hand-rolled MobileRoot wrapper. Replaced with the same ParkFlowsApp
// used by the native Android build (ported into src/mobile/) so the
// browser-based attendant portal and the native app share the exact
// same screens, API calls, and site-scoping logic instead of being two
// independently-maintained implementations that drift apart.
import { ParkFlowsApp } from './mobile/ParkFlowsApp';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary boundaryName="ParkFlows">
      <ParkFlowsApp />
    </ErrorBoundary>
  </StrictMode>,
);
