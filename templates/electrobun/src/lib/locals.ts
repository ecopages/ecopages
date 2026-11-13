import type { Session } from './auth.server';

declare module '@ecopages/core' {
	interface RequestLocals {
		workspace?: { session: Session; sidebarOpen: boolean };
	}
}
