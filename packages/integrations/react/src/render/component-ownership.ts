/**
 * Ownership helpers for deciding whether a component stays in the React render lane.
 */

import type { EcoComponent, EcoComponentConfig, EcoPagesElement } from '@ecopages/core';
import type { FunctionComponent } from 'react';

export type SerializableProps = Record<string, unknown>;

export type ReactRenderableComponent<P extends SerializableProps = SerializableProps> = FunctionComponent<P> & {
	config?: EcoComponentConfig;
	requires?: string | readonly string[];
};

export type RequiresAwareComponent = {
	requires?: string | readonly string[];
};

/**
 * Reads the declared integration name for a component or layout.
 *
 * @remarks
 * Honors both the explicit `config.integration` override and injected
 * `config.__eco.integration` metadata because pages can arrive through authored
 * config as well as build-time component metadata.
 */
export function getComponentIntegration(component?: { config?: EcoComponentConfig } | null): string | undefined {
	return component?.config?.integration ?? component?.config?.__eco?.integration;
}

/**
 * Returns whether a component should stay inside the React render lane.
 *
 * @remarks
 * Components without explicit integration metadata are treated as React-owned
 * because this renderer only receives them after the route pipeline has already
 * selected the React integration.
 */
export function isReactManagedComponent(
	component: { config?: EcoComponentConfig } | null | undefined,
	reactIntegrationName: string,
): boolean {
	const integration = getComponentIntegration(component);
	return integration === undefined || integration === reactIntegrationName;
}

export function getComponentRequires(component?: (EcoComponent & RequiresAwareComponent) | null) {
	return component?.requires;
}

/**
 * Commits a framework-agnostic component to React semantics.
 *
 * @remarks
 * Core keeps `EcoComponent` broad so integrations can share the same public surface;
 * once the React renderer is executing, `createElement()` needs a concrete React
 * component signature.
 */
export function asReactComponent<P extends SerializableProps>(component: unknown): ReactRenderableComponent<P> {
	return component as ReactRenderableComponent<P>;
}

/**
 * Commits a mixed-shell component to the string-returning contract required by
 * non-React layouts and HTML templates.
 */
export function asNonReactShellComponent<P extends SerializableProps>(
	component: unknown,
): (props: P) => EcoPagesElement | Promise<EcoPagesElement> {
	return component as (props: P) => EcoPagesElement | Promise<EcoPagesElement>;
}
