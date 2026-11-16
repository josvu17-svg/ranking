import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Board from './Board.jsx';
import { LangProvider } from './lang.jsx';
import { installWebBridge } from './webBridge.js';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800-italic.css';
import './styles.css';

installWebBridge();
if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

const isBoard = window.location.hash === '#standings';
createRoot(document.getElementById('root')).render(<LangProvider>{isBoard ? <Board /> : <App />}</LangProvider>);
