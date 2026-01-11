/**
 * EcoPages React Router - SPA navigation for React with SSR support.
 * @module
 */

export { EcoRouter, PageContent } from './router';
export type { EcoRouterProps } from './router';

export { EcoPropsScript } from './props-script';
export type { EcoPropsScriptProps } from './props-script';

export { useRouter } from './context';
export type { RouterContextValue } from './context';

export type { EcoRouterOptions } from './types';

export { morphHead } from './head-morpher';

export type { PageState } from './navigation';

export { ecoRouter } from './adapter';
