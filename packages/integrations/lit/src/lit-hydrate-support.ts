/**
 * Browser module that installs Lit SSR hydration support for the app's own `lit` instance.
 *
 * @remarks
 * `@lit-labs/ssr-client/lit-element-hydrate-support.js` sets `globalThis.litElementHydrateSupport`, which
 * `lit-element` calls once when its module evaluates. Both imports resolve from this package, in development as in
 * the production build. This module is part of the app's browser graph, so when `lit` from here and from the app
 * resolve to the same installed file, as a deduplicated install gives, hydration patches the `LitElement` that the
 * app's custom elements extend and renders with the same `lit-html`.
 *
 * A bundler may place `lit-element` in a chunk that evaluates before this module's body, and then the hook has
 * already been skipped. The hook defines `observedAttributes` on `LitElement` itself, so its absence shows the
 * patch is missing and this module applies it. Core loads this module before any other module script of the
 * page, so the patch is in place before an element is defined.
 */
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import { LitElement } from 'lit';

type LitElementHydrateSupport = (options: { LitElement: typeof LitElement }) => void;

const hydrateSupport = (globalThis as { litElementHydrateSupport?: LitElementHydrateSupport }).litElementHydrateSupport;
if (hydrateSupport && !Object.hasOwn(LitElement, 'observedAttributes')) {
	hydrateSupport({ LitElement });
}
