import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/scripts-injector/types';

import type Alpine from 'alpinejs';

declare global {
	interface Window {
		Alpine: typeof Alpine;
	}

	declare module '*.mdx' {
		const content: string;
		export default content;
	}
}
