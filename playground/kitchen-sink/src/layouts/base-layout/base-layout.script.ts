import { createRouter } from '@ecopages/browser-router/client';

const BASE_LAYOUT_SCRIPT_MARKER = 'BASE_LAYOUT_SCRIPT_BASELINE';
document.documentElement.dataset.baseLayoutScript = BASE_LAYOUT_SCRIPT_MARKER;

createRouter({
	viewTransitions: true,
});
