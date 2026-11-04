import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './lib/store.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>,
);

// Make Learnr installable and available offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
window.__installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; window.dispatchEvent(new Event('learnr:installable')); });
window.addEventListener('appinstalled', () => { window.__installPrompt = null; window.dispatchEvent(new Event('learnr:installable')); });
