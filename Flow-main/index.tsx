import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';


// Unregister any old service workers for this scope
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      if (reg.scope.includes('/Flow/')) {
        reg.unregister();
      }
    });
  });
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