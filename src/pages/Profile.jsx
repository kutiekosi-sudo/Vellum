import { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { PageHead, Card, Avatar, Badge, Button } from '../ui/kit.jsx';

function InstallCard() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); window.addEventListener('learnr:installable', f); return () => window.removeEventListener('learnr:installable', f); }, []);
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (standalone || window.navigator.standalone) return <Card className="stack sm" style={{ maxWidth: 520 }}><strong>Learnr is installed</strong><span className="muted">It opens from your home screen, and works with no signal for the things you have already opened.</span></Card>;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const ev = window.__installPrompt;
  return (
    <Card className="stack sm" style={{ maxWidth: 520 }} aria-label="Install Learnr">
      <strong>Install Learnr on this device</strong>
      <span className="muted">It opens from your home screen like an app, starts faster on weak data, and your timer, statistics, flashcards and notes still work with no signal.</span>
      {ev ? <div><Button onClick={async () => { ev.prompt(); try { await ev.userChoice; } catch { /* closed */ } window.__installPrompt = null; tick((n) => n + 1); }}>Install Learnr</Button></div>
        : ios ? <span className="muted">On iPhone or iPad: tap the Share button in Safari, then "Add to Home Screen".</span>
        : <span className="muted">In your browser's menu, choose "Install app" or "Add to Home screen".</span>}
    </Card>
  );
}

export default function Profile() {
  const { profile, signOut } = useApp();
  return (
    <div className="stack lg">
      <PageHead title="Profile" />
      <Card className="stack" style={{ maxWidth: 520 }}>
        <div className="row"><Avatar name={profile.displayName} src={profile.photoURL} size="lg" />
          <div className="grow"><h2 className="break" style={{ fontSize: 21 }}>{profile.displayName}</h2><div className="muted break">{profile.email}</div></div></div>
        <div><Badge tone="info">{profile.role === 'teacher' ? 'Teacher' : 'Student'}</Badge></div>
        <Button variant="secondary" icon="logout" onClick={signOut}>Sign out</Button>
      </Card>
      <InstallCard />
    </div>
  );
}
