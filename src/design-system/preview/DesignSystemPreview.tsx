import React from 'react';
import { Building2, LayoutGrid, Users } from 'lucide-react';
import { ToastProvider, PageHeader, NavGroupList, SiteSwitcher, Button } from '../components';
import { SiteContext, buildSiteContextValue } from '../../utils/withSite';
import type { SiteConfig } from '../../types';
import { ButtonsSection, FieldsSection, ChipsSection, FeedbackSection } from './sections14';
import { CardsSection, NavigationSection, TableSection, SlotsSection } from './sections57';

/**
 * The /design-system preview (002 tech design): every component in every state,
 * so code review and QA can check AC-03 against the reference page. Master Admin
 * only, dev and staging; NOT routed yet — F1/F2 add the hash route after the 001 merge.
 * All names, plates and numbers here are examples.
 */
/** One example site, so guarded buttons show their enabled state (the guard needs one site chosen). */
const PREVIEW_SITE = { id: 'preview-site', siteCode: 'DEMO', siteName: 'Example site', city: 'Pune' } as SiteConfig;
const previewContext = buildSiteContextValue(PREVIEW_SITE.id, [PREVIEW_SITE], false);

/** App shell parts (order 8): page header, grouped nav, site switcher. */
const ShellSection: React.FC = () => {
  const [site, setSite] = React.useState<string>('a');
  return (
    <section className="pf-preview-section">
      <h2>App shell</h2>
      <PageHeader
        title="Live parking"
        description="Example page header: one primary action, the rest in the ⋯ menu."
        updatedAt={Date.now()}
        primary={<Button variant="primary">Primary action</Button>}
        menu={[{ label: 'Export CSV', onSelect: () => undefined }, { label: 'Delete', destructive: true, guard: true, onSelect: () => undefined }]}
      />
      <div className="pf-preview-grid">
        <NavGroupList
          label="Example nav"
          current="live"
          groups={[
            { label: 'Operations', items: [{ id: 'live', label: 'Live parking', icon: LayoutGrid, href: '#' }] },
            { label: 'People', items: [{ id: 'emp', label: 'Employees & vehicles', icon: Users, href: '#', count: 3, countLabel: 'pending requests' }] },
            { label: 'Setup', items: [{ id: 'sites', label: 'Sites', icon: Building2, href: '#' }] },
          ]}
          onNavigate={(_id, e) => e.preventDefault()}
        />
        <div>
          <SiteSwitcher
            sites={[{ id: 'a', name: 'Example site A', code: 'EXA', city: 'Pune' }, { id: 'b', name: 'Example site B', code: 'EXB', city: 'Mumbai' }]}
            value={site}
            allowAll
            allId="ALL"
            onSelect={setSite}
          />
        </div>
      </div>
    </section>
  );
};

export const DesignSystemPreview: React.FC = () => (
  <SiteContext.Provider value={previewContext}>
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
      <ShellSection />
    </div>
  </ToastProvider>
  </SiteContext.Provider>
);

export default DesignSystemPreview;
