import type { EcoPagesElement, LayoutProps } from '@ecopages/core';
import { html } from 'lit';

const layoutGlobal = globalThis as typeof globalThis & { litLayoutModuleEvaluations?: number };
layoutGlobal.litLayoutModuleEvaluations = (layoutGlobal.litLayoutModuleEvaluations ?? 0) + 1;

export const litLayoutModuleEvaluations = layoutGlobal.litLayoutModuleEvaluations;

export function LitLayout({ children }: LayoutProps<EcoPagesElement>) {
	return html`<div data-layout="lit">${children}</div>` as unknown as EcoPagesElement;
}
