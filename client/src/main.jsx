import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context';
import { NotificationsProvider } from './components/Notifications';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationsProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </NotificationsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
