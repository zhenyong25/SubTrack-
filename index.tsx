import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import LogoAttribution from './components/LogoAttribution';
import { hasLogoDevKey } from './services/subscriptionLogoService';
import './styles.css';

// The plugin's default injected register script only calls
// navigator.serviceWorker.register() once on load — it never checks for
// updates again, so an already-installed PWA can keep serving a stale
// deployment indefinitely. registerSW() from virtual:pwa-register wires up
// workbox-window's update detection instead, and with registerType:
// 'autoUpdate' in vite.config.ts it activates a new service worker and
// reloads the page automatically as soon as one is found — no user prompt.
// A manual poll covers PWAs that are resumed from the home screen rather
// than freshly navigated to, since those don't reliably trigger the
// browser's own update check.
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });
  void updateSW;
}

const shouldIgnoreExternalError = (event: ErrorEvent) => {
  const message = event.message || '';
  const source = event.filename || '';

  return (
    message.includes('Cannot redefine property: ethereum') ||
    source.includes('contentscript.js') ||
    source.includes('evmAsk.js')
  );
};

window.addEventListener('error', (event) => {
  if (shouldIgnoreExternalError(event)) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = typeof reason === 'string' ? reason : reason?.message || '';

  if (message.includes('Cannot redefine property: ethereum')) {
    event.preventDefault();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
    {hasLogoDevKey && <footer className="bg-background pb-24"><LogoAttribution /></footer>}
  </React.StrictMode>
);
