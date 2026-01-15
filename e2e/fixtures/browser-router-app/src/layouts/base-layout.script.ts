import '@ecopages/scripts-injector';
import { createRouter } from '@ecopages/browser-router/client';

createRouter({
	viewTransitions: true,
	prefetch: {
		strategy: 'intent',
		delay: 65,
	},
});
