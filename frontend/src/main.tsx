import React from 'react';
import ReactDOM from 'react-dom/client';
import './components/ui/ui.css';
import { initTheme } from './lib/theme';
import { AppRouter } from './routes/index';

// Apply stored theme preference before React hydrates (prevents FOUC)
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
