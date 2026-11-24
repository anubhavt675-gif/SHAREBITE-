import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './components/states/ErrorBoundary';
import App from './App.tsx';

// Auto-reload on Vite chunk preload error following new production deployments
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  let lastReload = 0;
  try {
    lastReload = Number(sessionStorage.getItem('sharebite_chunk_reload_ts') || '0');
  } catch {}
  if (Date.now() - lastReload > 15000) {
    try {
      sessionStorage.setItem('sharebite_chunk_reload_ts', Date.now().toString());
    } catch {}
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="ShareBite could not start">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
