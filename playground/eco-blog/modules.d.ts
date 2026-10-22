import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/jsx/jsx-runtime';
import '@ecopages/image-processor/types';

import type { Session } from './src/lib/auth.server';

declare module '@ecopages/core' {
	interface RequestLocals {
		session?: Session | null;
	}
}
