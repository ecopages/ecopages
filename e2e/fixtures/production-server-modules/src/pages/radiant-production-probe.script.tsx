/** @jsxImportSource @ecopages/jsx */
import { RadiantElement, customElement } from '@ecopages/radiant';
import HelloSsrDefault, { HelloSsr } from './hello.script.ts';
import LitPage from './lit.lit.tsx';
import { LitLayout, litLayoutModuleEvaluations } from '../layouts/lit-layout.lit.tsx';

if (HelloSsrDefault !== HelloSsr) {
	throw new Error('The SSR script shared module did not preserve its exports.');
}

if (LitPage.config.layouts?.[0] !== LitLayout || litLayoutModuleEvaluations !== 1) {
	throw new Error(
		`The SSR script did not reuse the collected Lit Page and layout module instances (layout match: ${LitPage.config.layouts?.[0] === LitLayout}, layout evaluations: ${litLayoutModuleEvaluations}).`,
	);
}

class RadiantProductionProbe extends RadiantElement {
	override render() {
		return <span data-radiant-production-probe="true">radiant-production-probe</span>;
	}
}

customElement('radiant-production-probe')(RadiantProductionProbe);
