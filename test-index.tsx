import React from 'react';
import ReactDOM from 'react-dom/client';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('React mounting...');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <div style={{ padding: '20px', color: 'white', backgroundColor: 'black', fontSize: '24px' }}>
    <h1>TEST: React is working!</h1>
    <p>If you see this, React is loading correctly.</p>
  </div>
);

console.log('React mounted successfully');
