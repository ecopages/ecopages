import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/image-processor/types';
import '@ecopages/mdx/declarations';

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
