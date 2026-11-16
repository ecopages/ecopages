import '@ecopages/core/declarations';

import type { Session } from './src/handlers/auth.server';

declare module '@ecopages/core' {
	interface RequestLocals {
		session?: Session | null;
	}
}

declare module 'other-package' {
	interface RequestLocals {
		ignored: true;
	}
}
