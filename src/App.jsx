import { useApp } from './lib/store.jsx';
import { Boot, Login, ChooseRole, LoadFailed } from './screens/Auth.jsx';
import Shell from './Shell.jsx';
import { ConfirmProvider, Toaster } from './ui/kit.jsx';

export default function App() {
  const { status } = useApp();
  return (
    <ConfirmProvider>
      {status === 'boot' ? <Boot />
        : status === 'out' ? <Login />
        : status === 'role' ? <ChooseRole />
        : status === 'error' ? <LoadFailed />
        : <Shell />}
      <Toaster />
    </ConfirmProvider>
  );
}
