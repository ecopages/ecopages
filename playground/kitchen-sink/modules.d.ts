import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/image-processor/types';
import '@ecopages/mdx/declarations';

declare module 'lit/static-html.js' {
	export const html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
	export const unsafeStatic: (value: string) => unknown;
}

declare module '@ecopages/core' {
	interface RequestLocals {
		featureFlags?: string[];
		requestInfo?: {
			method: string;
			pathname: string;
			receivedAt: string;
			requestId: string;
		};
		viewerRole?: 'admin' | 'viewer';
	}
}
