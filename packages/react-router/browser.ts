/**
 * Browser entry point for @ecopages/react-router.
 * This file exports only the client-side components needed for hydration.
 * @module
 */

export { EcoRouter, PageContent, EcoReactRouter } from './src/router';
export type { EcoRouterProps, EcoReactRouterProps } from './src/router';

export { useRouter } from './src/context';
export type { RouterContextValue } from './src/context';

export { morphHead } from './src/head-morpher';

export type { PageState } from './src/navigation';
