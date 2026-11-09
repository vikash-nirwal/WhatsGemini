import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from 'src/components/organisms/ErrorBoundary';
import { hostBridge } from 'src/features/embed/hostBridge';

// Inside a host app (#264), listen before the first render, so a panic sent
// while the app is still loading isn't missed. Does nothing elsewhere.
hostBridge.start();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
