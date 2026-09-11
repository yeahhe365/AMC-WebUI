import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { toast, toastSuccess, toastError, toastInfo, toastWarning } from './stores/toastStore';

if (typeof window !== 'undefined') {
  Object.assign(window, {
    toast,
    toastSuccess,
    toastError,
    toastInfo,
    toastWarning,
  });
}

import './styles/main.css';
import './styles/animations.css';
import './styles/markdown.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
