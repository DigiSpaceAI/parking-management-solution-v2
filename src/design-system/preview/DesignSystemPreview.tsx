import React from 'react';
import { ToastProvider } from '../components';
import { ButtonsSection, FieldsSection, ChipsSection, FeedbackSection } from './sections14';
import { CardsSection, NavigationSection, TableSection, SlotsSection } from './sections57';

/**
 * The /design-system preview (002 tech design): every component in every state,
 * so code review and QA can check AC-03 against the reference page. Master Admin
 * only, dev and staging; NOT routed yet — F1/F2 add the hash route after the 001 merge.
 * All names, plates and numbers here are examples.
 */
export const DesignSystemPreview: React.FC = () => (
  <ToastProvider>
    <div className="pf pf-preview">
      <header className="pf-page-head">
        <div className="pf-page-head-text">
          <h1>Design system</h1>
          <p>Every ParkFlows component in every state. Example data only.</p>
        </div>
      </header>
      <ButtonsSection />
      <FieldsSection />
      <ChipsSection />
      <FeedbackSection />
      <CardsSection />
      <NavigationSection />
      <TableSection />
      <SlotsSection />
    </div>
  </ToastProvider>
);

export default DesignSystemPreview;
