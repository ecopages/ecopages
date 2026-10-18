export type * from './types/public-types.ts';
export { eco } from './eco/eco.browser.ts';
export {
	bindComponentIdentity,
	getComponentIdentity,
	getComponentOwner,
	type ComponentIdentity,
} from './eco/component-identity.ts';
export { attachDiscoveredDependencies } from './eco/discovered-dependencies.ts';
export { mergePageDependencies } from './eco/page-dependency-contributions.ts';
export { isDevelopmentRuntime, isProductionRuntime } from './browser-env.ts';
