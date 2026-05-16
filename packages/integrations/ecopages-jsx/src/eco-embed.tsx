/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { EcoComponent, EcoEmbedProps as CoreEcoEmbedProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/**
 * Props for the Ecopages JSX-owned `EcoEmbed` adapter.
 */
export type EcoEmbedProps<TComponent extends EcoComponent> = CoreEcoEmbedProps<TComponent>;

/**
 * Renders a foreign or same-integration eco component from an Ecopages JSX
 * file without forcing inline mixed-JSX authoring.
 */
export function EcoEmbed<TComponent extends EcoComponent>({
	component,
	props,
	children,
}: EcoEmbedProps<TComponent>): JsxRenderable {
	return eco.embed(component, props, children) as JsxRenderable;
}