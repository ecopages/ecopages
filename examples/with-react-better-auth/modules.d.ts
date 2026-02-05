/// <reference types="@ecopages/core/declarations" />
/// <reference types="@ecopages/core/env" />
/// <reference types="@ecopages/image-processor/types" />

import type { Session } from './src/handlers/auth.server';

declare module '@ecopages/core' {
	interface RequestLocals {
		session?: Session | null;
	}
}
