import React from 'react';
import { Building2, Globe, Lock, MapPin } from 'lucide-react';
import type { SiteConfig } from '../../types';
import { Button, Card, EmptyState, Icon, PageHeader, Skeleton } from '../../design-system/components';
import { ALL_SITES } from '../../utils/withSite';

/**
 * S-NA "No access" inside the shell (AC-08): unknown route, or a page the role can't open.
 * It has the page template's H1 (05 R1b m-2), so focus-to-H1 and screen readers get a page title.
 */
export const NoAccessPage: React.FC<{ homeHref: string | null; homeLabel: string | null }> = ({ homeHref, homeLabel }) => (
  <>
  <PageHeader title="No access" />
  <Card>
    <EmptyState
      icon={Lock}
      title="You don't have access to this page"
      text="Ask your administrator if you need it."
      actions={
        homeHref && homeLabel ? (
          <a className="pf-btn pf-btn--primary" href={homeHref}>
            Go to {homeLabel}
          </a>
        ) : undefined
      }
    />
  </Card>
  </>
);

/**
 * "Choose a site" (001 §3.0, L-3): no site-scoped call is made until a choice. The H1 is the
 * page the user asked for (or "Choose a site" before a page is known), 05 R1b m-2.
 */
export const ChooseSitePrompt: React.FC<{ title?: string; sites: SiteConfig[]; allowAllSites: boolean; onChoose: (id: string) => void }> = ({ title, sites, allowAllSites, onChoose }) => (
  <>
  <PageHeader title={title || 'Choose a site'} description="This page shows one site's data. Choose a site to continue." />
  <Card className="pf-choose">
    <EmptyState icon={MapPin} title="Choose a site to see its data" text="You can switch sites at any time from the top bar." />
    <ul className="pf-choose-list">
      {sites.map((s) => (
        <li key={s.id}>
          <button type="button" className="pf-menu-item" onClick={() => onChoose(s.id)}>
            <Icon icon={MapPin} size={16} />
            <span className="pf-menu-item-text">
              <span>{s.siteName}</span>
              <small>{[s.siteCode, s.city].filter(Boolean).join(' · ')}</small>
            </span>
          </button>
        </li>
      ))}
      {allowAllSites && (
        <li>
          <button type="button" className="pf-menu-item" onClick={() => onChoose(ALL_SITES)}>
            <Icon icon={Globe} size={16} />
            <span className="pf-menu-item-text">
              <span>All sites</span>
              <small>Read-only lists across {sites.length} sites</small>
            </span>
          </button>
        </li>
      )}
    </ul>
  </Card>
  </>
);

/** S-0 "No site assigned" (001 L-4): full page with Sign out, or inside the shell while viewing as such a user. */
export const NoSitePage: React.FC<{ onSignOut?: () => void }> = ({ onSignOut }) => {
  const body = (
    <>
      <PageHeader title="No site assigned" />
      <Card>
        <EmptyState
          icon={Building2}
          title="Your account isn't linked to a site yet"
          text="Contact your administrator."
          actions={onSignOut ? <Button onClick={onSignOut}>Sign out</Button> : undefined}
        />
      </Card>
    </>
  );
  return onSignOut ? (
    <main className="pf pf-fullpage">
      <div className="pf-stack pf-fullpage-body">{body}</div>
    </main>
  ) : (
    body
  );
};

/** Loading placeholder for a whole page (site switch, first load). */
export const PageSkeleton: React.FC = () => (
  <div className="pf-stack" aria-busy="true">
    <span className="pf-sr-only" role="status">
      Loading
    </span>
    <Skeleton variant="title" width="30%" />
    <div className="pf-card pf-stack">
      <Skeleton width="90%" />
      <Skeleton width="75%" />
      <Skeleton width="82%" />
      <Skeleton width="60%" />
    </div>
  </div>
);
