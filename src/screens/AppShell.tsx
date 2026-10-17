import React, { useState } from 'react';
import { Bell, LogOut, Menu } from 'lucide-react';
import type { AppUser, SiteConfig } from '../types';
import {
  Banner,
  Brand,
  CountBadge,
  Icon,
  IconButton,
  NavDrawer,
  NavGroupList,
  SiteSwitcher,
  TopBarMenu,
  ViewingAsBar,
  initials,
  type NavGroup,
  type TopBarMenuEntry,
} from '../design-system/components';
import { ALL_SITES, WRITE_DISABLED_ALL_SITES } from '../utils/withSite';

export interface AppShellProps {
  /** The real signed-in account (the account menu always shows it). */
  user: AppUser;
  /** Master Admin viewing the console as this user (AC-25), or null. */
  viewAs: AppUser | null;
  viewSiteLabel: string;
  onExitViewAs: () => void;
  sites: SiteConfig[];
  siteId: string | null;
  allowAllSites: boolean;
  onSelectSite: (siteId: string) => void;
  nav: NavGroup[];
  current: string | null;
  onNavigate?: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
  homeHref: string;
  onHome?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  /** Bell menu entries: counts that need attention, each a link to its page. */
  attention: TopBarMenuEntry[];
  onSignOut: () => void;
  children: React.ReactNode;
}

/**
 * The console shell (002 F1, AC-07/AC-18/AC-23): top bar (menu button below 1024px, logo,
 * site switcher, notifications, account), the grouped nav (permanent from 1024px, a drawer
 * below) and the page area. The current site is shown only in the switcher (AC-23).
 */
export const AppShell: React.FC<AppShellProps> = ({
  user, viewAs, viewSiteLabel, onExitViewAs, sites, siteId, allowAllSites, onSelectSite, nav, current, onNavigate,
  homeHref, onHome, attention, onSignOut, children,
}) => {
  const [drawer, setDrawer] = useState(false);
  const total = attention.reduce((n, e) => n + (e.count || 0), 0);
  // WCAG 2.5.3 Label in Name (06 BUG-R1B-6): each accessible name starts with the text the
  // button shows, so a voice-control user can say what they see ("click 91", "click DA").
  // The bell shows only its badge ("91", or "99+" over 99, as CountBadge does).
  const bellShown = total > 99 ? '99+' : String(total);
  const bellLabel = total
    ? `${bellShown} ${total === 1 ? 'notification' : 'notifications'}: ${attention.filter((e) => e.count).map((e) => `${e.count} ${e.label.toLowerCase()}`).join(', ')}`
    : 'Notifications: nothing needs your attention';
  const userInitials = initials(user.fullName);
  const switcherSites = sites.map((s) => ({ id: s.id, name: s.siteName, code: s.siteCode, city: s.city }));
  return (
    <div className="pf pf-app">
      <a className="pf-skip" href="#pf-main" onClick={(e) => { e.preventDefault(); document.getElementById('pf-main')?.focus(); }}>
        Skip to content
      </a>
      <div className="pf-app-top">
        {viewAs && <ViewingAsBar userName={viewAs.fullName} roleName={viewAs.roleName} siteLabel={viewSiteLabel} onExit={onExitViewAs} />}
        <header className="pf-topbar">
          <IconButton icon={Menu} label="Open menu" className="pf-topbar-menu" aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)} />
          <Brand href={homeHref} onClick={onHome} />
          <SiteSwitcher sites={switcherSites} value={siteId} allowAll={allowAllSites} allId={ALL_SITES} onSelect={onSelectSite} />
          <span className="pf-topbar-spacer" />
          <TopBarMenu
            triggerClassName="pf-icon-btn pf-bell"
            label={bellLabel}
            trigger={
              <>
                <Icon icon={Bell} size={20} />
                <CountBadge count={total} />
              </>
            }
            head={total ? undefined : <>Nothing needs your attention.</>}
            entries={attention.filter((e) => e.count)}
          />
          <TopBarMenu
            triggerClassName="pf-account"
            label={`${userInitials} ${user.fullName}, ${user.roleName}: account`}
            trigger={
              <>
                <span className="pf-avatar" aria-hidden="true">
                  {userInitials}
                </span>{' '}
                <span className="pf-account-name">{user.fullName}</span>
              </>
            }
            head={
              <>
                <strong>{user.fullName}</strong>
                {user.email}
                <br />
                {user.roleName}
              </>
            }
            entries={[{ label: 'Sign out', icon: LogOut, onSelect: onSignOut }]}
          />
        </header>
      </div>
      <div className="pf-app-body">
        <div className="pf-app-nav">
          <NavGroupList groups={nav} current={current} onNavigate={onNavigate} />
        </div>
        <NavDrawer open={drawer} onClose={() => setDrawer(false)}>
          <NavGroupList
            groups={nav}
            current={current}
            label="Main (menu)"
            onNavigate={(id, e) => {
              setDrawer(false);
              onNavigate?.(id, e);
            }}
          />
        </NavDrawer>
        <main id="pf-main" className="pf-main" tabIndex={-1}>
          {siteId === ALL_SITES && (
            <Banner tone="info" role="none">
              You're viewing all sites. {WRITE_DISABLED_ALL_SITES}.
            </Banner>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};
