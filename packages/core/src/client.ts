export { manageWindowScroll, type ManageWindowScrollOptions, type WindowScrollBehavior } from './client/scroll.ts';
export {
	applyViewTransitionNames,
	clearViewTransitionNames,
	ensureRootViewTransitionStyles,
	navigationHasNamedViewTransitions,
} from './client/view-transitions.ts';
export { ensurePageConfigLayouts } from './eco/page-layout-normalization.ts';
export { type DefineDevToolOptions, defineDevTool } from './dev-toolbar/define-dev-tool.ts';
export * from './dev-toolbar/build-error-contract.ts';
export {
	DEV_MANIFEST_ELEMENT_ID,
	type DevManifestAsset,
	type DevManifestPageBrowserGraph,
	type EcoDevManifest,
} from './dev-toolbar/dev-toolbar-manifest-contract.ts';
export {
	isNonExecutableHeadScript,
	isRerunScript,
	shouldPersistExecutableInlineHeadScript,
} from './client/navigation-scripts/classification.ts';
export {
	getNavigationScriptIdentity,
	type NavigationScriptIdentity,
	type NavigationScriptIdentitySource,
} from './client/navigation-scripts/identity.ts';
export {
	getRegisteredRerunScript,
	RERUN_SRC_ATTR,
	type RerunScriptCallback,
} from './client/navigation-scripts/registry.ts';
export {
	collectRerunScripts,
	type PendingRerunScript,
	toRerunScriptActivation,
} from './client/navigation-scripts/rerun-queue.ts';
export {
	type EcoPendingNavigationIntent,
	getAnchorFromNavigationEvent,
	isStaticAssetHref,
	recoverPendingNavigationHref,
} from './router/client/link-intent.ts';
export {
	getLinkNavigationDecision,
	getNavigableHrefFromClick,
	isSamePageHashNavigationHref,
	isSamePageHref,
	shouldPrefetchLink,
} from './router/client/link-navigation-policy.ts';
export {
	ECO_DOCUMENT_OWNER_ATTRIBUTE,
	type EcoNavigationDirection,
	type EcoNavigationOwner,
	type EcoNavigationRequest,
	type EcoNavigationRuntime,
	type EcoNavigationTransaction,
	type EcoReloadRequest,
	getEcoDocumentOwner,
	getEcoNavigationRuntime,
} from './router/client/navigation-coordinator.ts';
export { ECO_NAVIGATION_LIFECYCLE_EVENTS, type EcoNavigationEvent } from './router/client/navigation-lifecycle.ts';
export {
	activatePreparedNavigationScripts,
	activateScriptsInOrder,
	cacheNavigationHtml,
	clearNavigationHtmlCache,
	commitNavigationPage,
	decideQueuedNavigationReplay,
	ECO_PERSIST_ATTRIBUTE,
	fetchNavigationPage,
	getCachedNavigationHtml,
	invalidateNavigationHtml,
	type NavigationHeadUpdate,
	parseNavigationDocument,
	prepareNavigationHead,
	type ScriptActivation,
} from './router/client/navigation-pipeline.ts';
