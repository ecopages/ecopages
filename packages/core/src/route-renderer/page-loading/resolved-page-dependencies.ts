import type {
	EcoComponent,
	GetDynamicPageDependencies,
	PageBrowserGraphContribution,
	PageBrowserGraphContributionContext,
} from '../../types/contracts.ts';
import type { EcoPageComponent } from '../../types/contracts.ts';
import { listFileOwnedDependencyContributions } from '../../eco/page-dependency-contributions.ts';
import { collectPageDependencyComponents } from './file-scoped-dependency-components.ts';

export type ResolvedPageDependencies = {
	ownerFile: string;
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>;
	contribution?: PageBrowserGraphContribution;
};

export type ResolvePageDependenciesContribution = (
	components: ReadonlyArray<EcoComponent | Partial<EcoComponent>>,
	ownerFile: string,
) => Promise<PageBrowserGraphContribution | undefined>;

/**
 * Calls the Page's dependency resolver, with the props only when the Page is not a Dynamic Page.
 *
 * @remarks
 * A Dynamic Page's props come from the request, while its Page Browser Graph is planned at build and cached by
 * Params and Query, so its resolver reads Params and Query only.
 */
function callDependencyResolver(
	page: EcoPageComponent<Record<string, unknown>>,
	context: PageBrowserGraphContributionContext,
): ReturnType<GetDynamicPageDependencies> {
	if (page.cache === 'dynamic') {
		return page.resolveDependencies?.({ params: context.params, query: context.query });
	}
	return page.resolveDependencies?.({ props: context.props ?? {}, params: context.params, query: context.query });
}

/**
 * Resolves `eco.page().dependencies()` once for one graph contribution context.
 */
export async function resolvePageDependenciesFromContext(
	context: PageBrowserGraphContributionContext,
	integrationName: string,
	materializeContribution?: ResolvePageDependenciesContribution,
): Promise<ResolvedPageDependencies | undefined> {
	const pageComponent = context.pageModule.default as EcoPageComponent<Record<string, unknown>>;
	const dependenciesResult = await callDependencyResolver(pageComponent, context);

	if (!dependenciesResult) {
		return undefined;
	}

	const contributions = listFileOwnedDependencyContributions(dependenciesResult);
	const resolvedOwnerFile = contributions.length === 1 ? (contributions[0]?.ownerFile ?? context.file) : context.file;
	const components = collectPageDependencyComponents({
		result: dependenciesResult,
		fallbackOwnerFile: context.file,
		integrationName,
	});

	if (components.length === 0 || !materializeContribution) {
		return {
			ownerFile: resolvedOwnerFile,
			components,
		};
	}

	const contribution = await materializeContribution(components, resolvedOwnerFile);

	return {
		ownerFile: resolvedOwnerFile,
		components,
		contribution,
	};
}
