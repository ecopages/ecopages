import type {
	EcoPageFile,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
} from '../../types/public-types.ts';

/**
 * Loads a page module once and collects declarative browser-graph requirements.
 *
 * @remarks
 * Shared by route orchestration prep and the integration route-render adapter so
 * page imports are not duplicated when both paths need the same contribution.
 */
export async function loadPageBrowserGraphContribution(
	routeFile: string,
	importPageFile: (file: string) => Promise<EcoPageFile>,
	collectContribution: (
		context: PageBrowserGraphContributionContext,
	) => Promise<PageBrowserGraphContribution | undefined>,
): Promise<PageBrowserGraphContribution | undefined> {
	const pageModule = await importPageFile(routeFile);
	return collectContribution({ file: routeFile, pageModule });
}
