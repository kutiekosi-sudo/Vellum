import { useApp } from './lib/store.jsx';
import { Boot, Login, ChooseRole, LoadFailed } from './screens/Auth.jsx';
import { Button } from './ui/kit.jsx';
import { ConfirmProvider, Toaster } from './ui/kit.jsx';

// The signed-in shell arrives in the next step.
function Home() {
  const { profile, signOut } = useApp();
  return (
    <main className="page" style={{ maxWidth: 520, paddingTop: 64 }}>
      <div className="card stack">
        <p>Signed in as {profile.displayName} ({profile.role}).</p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    </main>
  );
}

export default function App() {
  const { status } = useApp();
  return (
    <ConfirmProvider>
      {status === 'boot' ? <Boot />
        : status === 'out' ? <Login />
        : status === 'role' ? <ChooseRole />
        : status === 'error' ? <LoadFailed />
        : <Home />}
      <Toaster />
    </ConfirmProvider>
  );
}
