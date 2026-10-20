import { useEffect, useState } from 'react';
import { auth } from '../backend/index.js';
import { friendlyError } from '../lib/util.js';
import { useApp } from '../lib/store.jsx';
import { Art } from '../ui/art.jsx';
import { Button, Card, Notice, Avatar } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';

export function Boot() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div>
        <svg className="boot-svg" viewBox="0 0 420 150" role="img" aria-label="Learnr">
          <text className="boot-word" x="210" y="108" textAnchor="middle">Learnr</text>
        </svg>
        <div className="boot-sub">Getting things ready</div>
      </div>
    </div>
  );
}

function Hero({ children }) {
  return (
    <main className="auth">
      <div className="auth-art"><Art name="desk" /></div>
      <div className="auth-card stack">
        <div className="wordmark">Learnr</div>
        <p className="tagline">Learn. Practice. Improve.</p>
        {children}
      </div>
    </main>
  );
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [slow, setSlow] = useState(false);
  const [badHost, setBadHost] = useState('');
  useEffect(() => {
    let live = true;
    auth.checkDomain().then((r) => { if (live && r && r.known && !r.ok) setBadHost(r.host); }).catch(() => {});
    auth.redirectError().then((e) => {
      if (!live) return;
      const back = auth.cameBackFromRedirect();
      if (e) { setErr(friendlyError(e) + (e.code ? ` (${e.code})` : '')); setFailed(true); }
      else if (back) { setCameBack(true); setFailed(true); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!busy) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [busy]);
  const [cameBack, setCameBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [trace, setTrace] = useState([]);
  const inApp = /FBAN|FBAV|Instagram|Snapchat|MicroMessenger|Line\/|; wv\)|WebView|Telegram|TikTok/i.test(navigator.userAgent || '');
  const go = async (method) => {
    setErr(''); setFailed(false); setCameBack(false); setBusy(true);
    const log = [];
    const step = (m) => { log.push(m); setTrace([...log]); };
    let storage = 'ok'; try { localStorage.setItem('t', '1'); localStorage.removeItem('t'); } catch { storage = 'blocked'; }
    step(`Tapped. Browser storage: ${storage}. Cookies: ${navigator.cookieEnabled ? 'on' : 'off'}. Online: ${navigator.onLine ? 'yes' : 'no'}.`);
    const onErr = (ev) => step(`Browser error: ${(ev.reason && (ev.reason.code || ev.reason.message)) || ev.message || 'unknown'}`);
    window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onErr);
    const watchdog = setTimeout(() => { step('No answer after 10 seconds.'); setFailed(true); }, 10000);
    try { await auth.signIn(method, step); } catch (e) { console.error(e); setFailed(true); setErr(friendlyError(e) + (e.code ? ` (${e.code})` : '')); } finally { clearTimeout(watchdog); window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr); setBusy(false); }
  };
  return (
    <Hero>
      <Card className="stack">
        <h1 style={{ fontSize: 22 }}>Welcome</h1>
        <p className="muted">Classes, assignments, tests and study tools for teachers and students, in one place.</p>
        {inApp && <Notice tone="warn"><strong>You seem to be inside an app's built-in browser.</strong> Google blocks sign-in there. Copy this address and open it in Chrome or Safari: <b className="break">{window.location.origin}</b></Notice>}
        {badHost && (
          <Notice tone="warn">
            <strong>Google will not let you sign in from this address yet.</strong>
            <p style={{ marginTop: 4 }}>The site address <b className="break">{badHost}</b> is not on Firebase's approved list. In the Firebase console open Authentication, then Settings, then Authorized domains, tap Add domain, and enter <b className="break">{badHost}</b>.</p>
          </Notice>
        )}
        {err && <Notice tone="bad">{err}</Notice>}
        {slow && !err && <Notice>Still waiting for Google. If no sign-in window opened, allow pop-ups for this site, or close any Google window that is still open and try again.</Notice>}
        {cameBack && !err && <Notice tone="warn">Google sent you back, but this browser did not finish signing you in. This usually means it is blocking sign-in cookies. Try the pop-up option below, or open this site in Chrome or Safari directly instead of inside another app.</Notice>}
        <Button block loading={busy} onClick={() => go()}>Continue with Google</Button>
        {trace.length > 0 && (
          <details open={failed || !!err} className="muted small"><summary>What the app is doing</summary>
            <ol style={{ paddingLeft: 18, marginTop: 6 }}>{trace.map((t, i) => <li key={i} className="break">{t}</li>)}</ol></details>
        )}
        {failed && (
          <div className="stack sm">
            <Button block variant="secondary" disabled={busy} onClick={() => go('redirect')}>Sign in on this whole page instead</Button>
            <Button block variant="ghost" disabled={busy} onClick={() => go('popup')}>Try the pop-up window again</Button>
          </div>
        )}
        <p className="muted small">We only use your Google name, email and photo to set up your account.</p>
      </Card>
    </Hero>
  );
}

export function ChooseRole() {
  const { user, chooseRole, signOut, fail } = useApp();
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await chooseRole(pick); } catch (e) { fail(e); setBusy(false); }
  };
  const Opt = ({ role, title, text, icon }) => (
    <button type="button" className="role-opt" role="radio" aria-checked={pick === role} onClick={() => setPick(role)}>
      <span className="role-ic"><Icon name={icon} size={24} /></span>
      <span className="grow"><strong>{title}</strong><span className="muted small" style={{ display: 'block' }}>{text}</span></span>
    </button>
  );
  return (
    <Hero>
      <Card className="stack">
        <div className="row"><Avatar name={user.displayName} src={user.photoURL} /><div className="grow"><strong className="break">{user.displayName || 'Welcome'}</strong><div className="muted small break">{user.email}</div></div></div>
        <h1 style={{ fontSize: 22 }}>How will you use Learnr?</h1>
        <div className="stack" role="radiogroup" aria-label="Your role">
          <Opt role="student" title="I'm a Student" text="Join classes, hand in work, take tests and track your studying." icon="cap" />
          <Opt role="teacher" title="I'm a Teacher" text="Create classes, set work, run tests and see how your students are doing." icon="classes" />
        </div>
        <Notice icon="lock">Your role is permanent for this account. If you pick the wrong one you will need a new account.</Notice>
        <Button block disabled={!pick} loading={busy} onClick={confirm}>{pick ? `Continue as a ${pick}` : 'Choose a role to continue'}</Button>
        <button type="button" className="btn ghost block" onClick={signOut}>Use a different account</button>
      </Card>
    </Hero>
  );
}

export function LoadFailed() {
  const { loadError, retry, signOut } = useApp();
  return (
    <Hero>
      <Card className="stack" role="alert">
        <h1 style={{ fontSize: 22 }}>We couldn't open your account</h1>
        <p className="muted break">{friendlyError(loadError)}</p>
        <Button block icon="refresh" onClick={retry}>Try again</Button>
        <button type="button" className="btn ghost block" onClick={signOut}>Sign out</button>
      </Card>
    </Hero>
  );
}
