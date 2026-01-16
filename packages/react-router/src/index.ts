/**
 * EcoPages React Router - SPA navigation for React with SSR support.
 * @module
 */

export { EcoRouter, PageContent } from './router.ts';
export type { EcoRouterProps } from './router.ts';

export { EcoPropsScript } from './props-script.ts';
export type { EcoPropsScriptProps } from './props-script.ts';

export { useRouter } from './context.ts';
export type { RouterContextValue } from './context.ts';

export type { EcoRouterOptions } from './types.ts';

export { morphHead } from './head-morpher.ts';

export type { PageState } from './navigation.ts';

export { ecoRouter } from './adapter.ts';
