import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/image-processor/types';
import '@ecopages/react/declarations';

import type { Session } from './src/handlers/auth.server';

declare module '@ecopages/core' {
	interface RequestLocals {
		session?: Session | null;
	}
}
