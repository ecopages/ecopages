import path from 'node:path';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAffectedPageBrowserGraphIdentities,
	invalidatePageBrowserGraphSession,
	type AffectedGraphIdentity,
} from '../route-renderer/orchestration/page-browser-graph-session.ts';

export type HmrFileChangePreparation = {
	affectedGraphIdentities: AffectedGraphIdentity[];
	invalidatedGraphCount: number;
};

/**
 * Invalidates affected Page Browser Graph records before HMR strategy dispatch.
 */
export function prepareHmrFileChange(appConfig: EcoPagesAppConfig, filePath: string): HmrFileChangePreparation {
	const resolvedFilePath = path.resolve(filePath);
	const affectedGraphIdentities = getAffectedPageBrowserGraphIdentities(appConfig, resolvedFilePath);
	const invalidatedGraphCount = invalidatePageBrowserGraphSession(appConfig, resolvedFilePath);

	return {
		affectedGraphIdentities,
		invalidatedGraphCount,
	};
}
