/**
 * Browser entry point for @ecopages/react-router.
 * This file exports only the client-side components needed for hydration.
 * @module
 */

export { EcoRouter, PageContent } from './src/router.ts';
export type { EcoRouterProps } from './src/router.ts';

export { useRouter } from './src/context.ts';
export type { RouterContextValue } from './src/context.ts';
export { EcoPropsScript } from './src/props-script.ts';
export type { EcoPropsScriptProps } from './src/props-script.ts';

export { morphHead } from './src/head-morpher.ts';

export type { PageState } from './src/navigation.ts';
