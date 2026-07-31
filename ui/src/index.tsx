import * as React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import WrappedApp from './App';
import theme from './theme';

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <WrappedApp />
        </BrowserRouter>
      </ThemeProvider>
    </React.StrictMode>,
  );
} else {
  console.error('Root container missing in index.html');
}
