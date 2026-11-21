import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';

// The whole app in local-only mode (no cloud sync configured), for multi-tab tests.
createRoot(document.getElementById('root')!).render(<App />);
