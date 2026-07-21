import { initNavigationTelemetry } from './runtime/navigation-telemetry.ts';
import { EcoDevToolbar } from './shell/eco-dev-toolbar.tsx';
import { ensureDevToolbarStyles } from './shell/ensure-dev-toolbar-styles.ts';

ensureDevToolbarStyles();
initNavigationTelemetry();
EcoDevToolbar.mount();
