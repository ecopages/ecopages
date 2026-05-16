/** @jsxImportSource @kitajs/html */
import { eco } from '@ecopages/core';
import type { EcoComponent, EcoEmbedProps as CoreEcoEmbedProps, EcoPagesElement } from '@ecopages/core';

/**
 * Props for the Kita-owned `EcoEmbed` adapter.
 */
export type EcoEmbedProps<TComponent extends EcoComponent> = CoreEcoEmbedProps<TComponent>;

/**
 * Renders a foreign or same-integration eco component from a Kita JSX file
 * without forcing inline mixed-JSX authoring.
 */
export function EcoEmbed<TComponent extends EcoComponent>({
	component,
	props,
	children,
}: EcoEmbedProps<TComponent>): EcoPagesElement {
	return eco.embed(component, props, children) as EcoPagesElement;
}
