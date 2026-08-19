import * as React from 'react';
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClickUIProvider, ThemeName } from '@clickhouse/click-ui';
import { BrowserRouter } from 'react-router-dom';
import WrappedApp from './App';
import './styles.css';

const themeStorageKey = 'clickhouse-playground-theme';

function loadTheme(): ThemeName {
  const saved = localStorage.getItem(themeStorageKey);
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function Root() {
  const [theme, setTheme] = useState<ThemeName>(loadTheme);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeName = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(themeStorageKey, next);
      return next;
    });
  }, []);

  return (
    <ClickUIProvider theme={theme}>
      <BrowserRouter>
        <WrappedApp theme={theme} onThemeToggle={toggleTheme} />
      </BrowserRouter>
    </ClickUIProvider>
  );
}

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
} else {
  console.error('Root container missing in index.html');
}
