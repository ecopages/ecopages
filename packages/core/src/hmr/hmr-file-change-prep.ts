import path from 'node:path';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import {
	getAffectedPageBrowserGraphIdentities,
	invalidatePageBrowserGraphSession,
	type AffectedGraphIdentity,
} from '../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';

export type HmrFileChangePreparation = {
	affectedGraphIdentities: AffectedGraphIdentity[];
};

/**
 * Invalidates affected Page Browser Graph records before HMR strategy dispatch.
 */
export function prepareHmrFileChange(appConfig: EcoPagesAppConfig, filePath: string): HmrFileChangePreparation {
	const resolvedFilePath = path.resolve(filePath);
	const affectedGraphIdentities = getAffectedPageBrowserGraphIdentities(appConfig, resolvedFilePath);
	invalidatePageBrowserGraphSession(appConfig, resolvedFilePath);

	return { affectedGraphIdentities };
}
