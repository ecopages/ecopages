import '@ecopages/radiant-ui/toast';
import { createRouter } from '@ecopages/browser-router/client';

createRouter({
	viewTransitions: true,
	prefetch: { strategy: 'intent' },
});
