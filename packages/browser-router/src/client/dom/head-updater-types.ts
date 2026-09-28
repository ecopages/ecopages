import type { PendingRerunScript } from '@ecopages/core/client/navigation-scripts';

export type PendingHeadScript = {
	attributes: Array<[string, string]>;
	textContent: string;
	src: string | null;
	scriptId: string | null;
	replaceExisting: boolean;
};

export type MorphHeadResult = {
	bodyStrategy: 'morph' | 'replace';
	pendingHeadScripts: PendingHeadScript[];
	pendingRerunScripts: PendingRerunScript[];
};
