/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { EcoComponent, EcoEmbedProps as CoreEcoEmbedProps } from '@ecopages/core';
import type { ReactNode } from 'react';

/**
 * Props for the React-owned `EcoEmbed` adapter.
 */
export type EcoEmbedProps<TComponent extends EcoComponent> = CoreEcoEmbedProps<TComponent>;

/**
 * Renders a foreign or same-integration eco component from a React JSX file
 * without forcing inline mixed-JSX authoring.
 */
export function EcoEmbed<TComponent extends EcoComponent>({
	component,
	props,
	children,
}: EcoEmbedProps<TComponent>): ReactNode {
	return eco.embed(component, props, children) as ReactNode;
}
