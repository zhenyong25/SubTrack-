import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

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
  </React.StrictMode>
);
