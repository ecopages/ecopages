import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';

const layoutGlobal = globalThis as typeof globalThis & { litLayoutModuleEvaluations?: number };
layoutGlobal.litLayoutModuleEvaluations = (layoutGlobal.litLayoutModuleEvaluations ?? 0) + 1;

export const litLayoutModuleEvaluations = layoutGlobal.litLayoutModuleEvaluations;

export const LitLayout = eco.layout({
	render: ({ children }) => html`<div data-layout="lit">${children}</div>` as unknown as EcoPagesElement,
});
