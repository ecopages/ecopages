// @ts-nocheck: This demo intentionally mixes JSX engines on one page, which TypeScript cannot model accurately.
import { eco } from '@ecopages/core';
import { html } from 'lit';
import {
	integrationMatrixHostShellIds,
	integrationMatrixHostShellLeafText,
	integrationMatrixShellCounterCases,
	integrationMatrixTestIds,
} from '@/data/integration-matrix';
import { BaseLayout } from '@/layouts/base-layout';
import { IntegrationCounterGroup } from '@/components/integration-counter-group.kita';
import { KitaShell } from '@/components/kita-shell.kita';
import { LitShell } from '@/components/lit-shell.lit';
import { EcopagesJsxShell } from '@/components/ecopages-jsx-shell.eco';
import { ReactShell } from '@/components/react-shell.react';

const shellComponents = {
	kita: KitaShell,
	lit: LitShell,
	react: ReactShell,
	'ecopages-jsx': EcopagesJsxShell,
};

const renderShell = (shell: keyof typeof shellComponents, id: string, children: unknown) => {
	const Shell = shellComponents[shell];
	return Shell({ id, children });
};

export default eco.page({
	integration: 'lit',
	dependencies: {
		components: [BaseLayout, IntegrationCounterGroup, KitaShell, LitShell, EcopagesJsxShell, ReactShell],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Lit Entry Matrix',
		description: 'Lit-first route that renders the same shared shell stack and counter set as the other hosts.',
	}),
	render: () =>
		html`<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Lit route entry</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					Each host page should expose the same shell stack and the same four counters.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route keeps Lit as the page entry while rendering the same nested shell composition and counter
					set used by the Kita, React, and Ecopages JSX host pages.
				</p>
			</section>

			<section class="card space-y-4" data-testid=${integrationMatrixTestIds.hostShellStack}>
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Shared host shell stack</p>
				${renderShell(
					'lit',
					integrationMatrixHostShellIds.lit,
					renderShell(
						'kita',
						integrationMatrixHostShellIds.kita,
						renderShell(
							'react',
							integrationMatrixHostShellIds.react,
							renderShell(
								'ecopages-jsx',
								integrationMatrixHostShellIds['ecopages-jsx'],
								integrationMatrixHostShellLeafText,
							),
						),
					),
				)}
			</section>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Counters</p>
				${IntegrationCounterGroup({
					testId: integrationMatrixTestIds.litCounters,
					radiantId: 'lit-entry-radiant',
				})}
			</section>

			<section class="card space-y-4" data-testid=${integrationMatrixTestIds.shellCounters}>
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Every counter inside every shell</p>
				<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
					${integrationMatrixShellCounterCases.map((item) =>
						renderShell(
							item.shell,
							item.shellId,
							IntegrationCounterGroup({ testId: item.testId, radiantId: item.radiantId }),
						),
					)}
				</div>
			</section>
		</div>` as unknown,
});
