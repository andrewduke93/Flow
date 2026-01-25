import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Unregister any old service workers for this scope and reload once we've removed one
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    try {
      const promises = regs.map(reg => {
        if (reg.scope && reg.scope.includes('/Flow/')) {
          return reg.unregister();
        }
        return Promise.resolve(false);
      });
      const results = await Promise.all(promises);
      // If any registration was removed, reload to ensure fresh assets are loaded
      if (results.some(Boolean)) {
        try {
          window.location.reload();
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      /* ignore */
    }
  }).catch(() => {/* ignore */});
}

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