
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './Flow-main/App';
// Service worker update handler (vite-plugin-pwa)
// `registerSW` is provided by the plugin at build time via virtual:pwa-register
// it returns an `update` function you can call to skipWaiting and apply the new SW.
let updateServiceWorker: (reloadPage?: boolean) => Promise<void> | undefined;
// Dynamically import the virtual register helper provided by vite-plugin-pwa
import('virtual:pwa-register')
  .then(({ registerSW }) => {
    updateServiceWorker = registerSW({
      onNeedRefresh() {
        try {
          const should = window.confirm('A new version of Flow is available. Update now?');
          if (should && updateServiceWorker) updateServiceWorker(true);
        } catch (e) {
          console.warn('Update prompt failed', e);
        }
      },
      onOfflineReady() {
        console.log('App is ready to work offline');
      }
    });
  })
  .catch((e) => {
    // If plugin not installed during dev, import will fail — ignore silently.
    console.debug('PWA register not available', e);
  });

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'white', backgroundColor: 'black' }}>
          <h1>Something went wrong</h1>
          <pre style={{ color: 'red', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('Mounting App...');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
