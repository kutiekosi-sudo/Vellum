// The signed-in frame: sidebar on desktop, bottom tabs on phones, top bar with search / alerts / profile.
import { useEffect, useRef } from 'react';
import { useRoute, href } from './lib/router.js';
import { useApp } from './lib/store.jsx';
import { useLive, useTitle } from './lib/hooks.js';
import { Icon } from './ui/icons.jsx';
import { Avatar, Empty, Button } from './ui/kit.jsx';
import { routeFor } from './routes.jsx';

const STUDENT_NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/classes', label: 'Classes', icon: 'classes' },
  { to: '/study', label: 'Study', icon: 'study' },
  { to: '/coach', label: 'Coach', icon: 'coach' },
  { to: '/pod', label: 'Pod', icon: 'pod' },
];
const TEACHER_NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/classes', label: 'Classes', icon: 'classes' },
  { to: '/coach', label: 'Coach', icon: 'coach' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

const isActive = (item, path) => (item.to === '/' ? path === '/' : path === item.to || path.startsWith(item.to + '/') || (item.to === '/classes' && path.startsWith('/class/')));

export default function Shell() {
  const { role, user, profile, online, signOut } = useApp();
  const route = useRoute();
  const nav = role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const main = useRef(null);
  const notes = useLive('users/' + user.uid + '/notifications');
  const unread = (notes.data || []).filter((n) => !n.read).length;

  const match = routeFor(role, route);
  useTitle(match.title ? `${match.title} · Learnr` : 'Learnr');

  // After navigating, send focus to the page and start at the top (keyboard / screen reader users).
  useEffect(() => { window.scrollTo(0, 0); if (main.current) main.current.focus({ preventScroll: true }); }, [route.path]);

  const Page = match.Page;
  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); main.current && main.current.focus(); }}>Skip to content</a>
      <aside className="sidebar" aria-label="Main">
        <div className="wordmark">Learnr</div>
        <nav className="stack sm" aria-label="Primary">
          {nav.map((n) => (
            <a key={n.to} className="side-link" href={href(n.to)} aria-current={isActive(n, route.path) ? 'page' : undefined}><Icon name={n.icon} />{n.label}</a>
          ))}
        </nav>
        <div className="side-foot">
          <a className="side-link" href={href('/profile')} aria-current={route.path === '/profile' ? 'page' : undefined}><Avatar name={profile.displayName} src={profile.photoURL} size="sm" /><span className="grow clamp-2">{profile.displayName || 'Profile'}</span></a>
          <button type="button" className="side-link" style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }} onClick={signOut}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="wordmark" style={{ fontSize: 30 }}>Learnr</div>
          <div className="grow" />
          <a className="btn icon ghost" href={href('/search')} aria-label="Search"><Icon name="search" /></a>
          <a className="btn icon ghost nav-bell" href={href('/notifications')} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
            <Icon name="bell" />{unread > 0 && <span className="dot-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
          </a>
          <a className="btn icon ghost topbar-me" href={href('/profile')} aria-label="Profile"><Avatar name={profile.displayName} src={profile.photoURL} size="sm" /></a>
        </header>
        {!online && <div className="offline-bar" role="status">You are offline. You can read what you have already opened, but changes will not save until you reconnect.</div>}
        <main id="main" className="page" tabIndex={-1} ref={main}>
          {Page ? <Page {...match.props} /> : (
            <Empty art="search" title="We couldn't find that page" text="The link may be old or mistyped.">
              <a className="btn" href={href('/')}>Go home</a>
            </Empty>
          )}
        </main>
      </div>
      <nav className="tabbar" aria-label="Primary" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((n) => (
          <a key={n.to} className="tab" href={href(n.to)} aria-current={isActive(n, route.path) ? 'page' : undefined}><Icon name={n.icon} />{n.label}</a>
        ))}
      </nav>
    </div>
  );
}
