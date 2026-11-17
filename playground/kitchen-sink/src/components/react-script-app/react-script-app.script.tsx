/** @jsxImportSource react */
import { createRoot } from 'react-dom/client';
import { ReactCounter } from '@/components/react-counter.react';

const mount = document.querySelector('[data-react-script-app]');
if (mount) createRoot(mount).render(<ReactCounter />);
