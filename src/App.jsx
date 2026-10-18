// Step 1 placeholder: proves the build, auth state and styles are wired together.
// The real screens replace this in the next steps.
import { useApp } from './lib/store.jsx';
import { auth } from './backend/index.js';
import { friendlyError } from './lib/util.js';
import { useState } from 'react';

export default function App() {
  const { status, user, profile, loadError, signOut } = useApp();
  const [err, setErr] = useState('');

  if (status === 'boot') {
    return (
      <div className="boot" role="status">
        <div>
          <svg className="boot-svg" viewBox="0 0 420 150" role="img" aria-label="Learnr">
            <text className="boot-word" x="210" y="108" textAnchor="middle">Learnr</text>
          </svg>
          <div className="boot-sub">Getting things ready</div>
        </div>
      </div>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 520, paddingTop: 64 }}>
      <div className="stack">
        <div className="wordmark" style={{ fontSize: 56 }}>Learnr</div>
        <p className="muted">Learn. Practice. Improve.</p>
        {status === 'out' && (
          <div className="card stack">
            <p>Sign in with your Google account to get started.</p>
            {err && <div className="notice bad" role="alert">{err}</div>}
            <button className="btn" onClick={async () => { setErr(''); try { await auth.signIn(); } catch (e) { setErr(friendlyError(e)); } }}>
              Sign in with Google
            </button>
          </div>
        )}
        {status === 'role' && <div className="card">Signed in as {user.displayName}. Role choice comes next.</div>}
        {status === 'ready' && (
          <div className="card stack">
            <p>Signed in as {user.displayName} ({profile.role}).</p>
            <button className="btn secondary" onClick={signOut}>Sign out</button>
          </div>
        )}
        {status === 'error' && <div className="notice bad" role="alert">{friendlyError(loadError)}</div>}
      </div>
    </main>
  );
}
