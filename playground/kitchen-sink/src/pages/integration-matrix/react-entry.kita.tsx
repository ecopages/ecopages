// @ts-nocheck: This demo intentionally mixes JSX engines on one page, which TypeScript cannot model accurately.
import { eco } from '@ecopages/core';
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

export default eco.page({
	dependencies: {
		components: [BaseLayout, IntegrationCounterGroup, KitaShell, LitShell, EcopagesJsxShell, ReactShell],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'React Entry Matrix',
		description: 'React-first route that renders the same shared shell stack and counter set as the other hosts.',
	}),
	render: () => (
		<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">React shell entry</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					Each host page should expose the same shell stack and the same four counters.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route keeps React as the page entry while rendering the same nested shell composition and
					counter set used by the Kita, Lit, and Ecopages JSX host pages.
				</p>
			</section>

			<section class="card space-y-4" data-testid={integrationMatrixTestIds.hostShellStack}>
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Shared host shell stack</p>
				<ReactShell id={integrationMatrixHostShellIds.react}>
					<KitaShell id={integrationMatrixHostShellIds.kita}>
						<LitShell id={integrationMatrixHostShellIds.lit}>
							<EcopagesJsxShell id={integrationMatrixHostShellIds['ecopages-jsx']}>
								{integrationMatrixHostShellLeafText}
							</EcopagesJsxShell>
						</LitShell>
					</KitaShell>
				</ReactShell>
			</section>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Counters</p>
				<IntegrationCounterGroup
					testId={integrationMatrixTestIds.reactCounters}
					radiantId="react-entry-radiant"
				/>
			</section>

			<section class="card space-y-4" data-testid={integrationMatrixTestIds.shellCounters}>
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Every counter inside every shell</p>
				<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
					{integrationMatrixShellCounterCases.map((item) => {
						const Shell = shellComponents[item.shell];

						return (
							<Shell id={item.shellId}>
								<IntegrationCounterGroup testId={item.testId} radiantId={item.radiantId} />
							</Shell>
						);
					})}
				</div>
			</section>
		</div>
	),
});
