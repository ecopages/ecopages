import { eco } from '@ecopages/core';
import {
	integrationMatrixHostShellIds,
	integrationMatrixHostShellLeafText,
	integrationMatrixShellCounterCases,
	integrationMatrixTestIds,
} from '@/data/integration-matrix';
import { EcoEmbed } from '@ecopages/kitajs/eco-embed';
import { BaseLayout } from '@/layouts/base-layout';
import { IntegrationCounterGroup } from '@/components/integration-counter-group.kita';
import { EcopagesJsxShell } from '@ecopages/testing/kitchen-sink/ecopages-jsx-shell';
import { KitaShell } from '@ecopages/testing/kitchen-sink/kita-shell';
import { LitShell } from '@ecopages/testing/kitchen-sink/lit-shell';
import { ReactShell } from '@ecopages/testing/kitchen-sink/react-shell';

export default eco.page({
	dependencies: {
		components: [BaseLayout, IntegrationCounterGroup, KitaShell, LitShell, EcopagesJsxShell, ReactShell],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Kita Integration Matrix',
		description: 'Kita-hosted cross-integration matrix page for the kitchen sink.',
	}),
	render: () => (
		<div class="space-y-8" data-testid={integrationMatrixTestIds.kitaPage}>
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Kita route entry</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					Each host page should expose the same shell stack and the same four counters.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route keeps Kita as the page entry while rendering the same nested shell composition and
					counter set used by the Lit, React, and Ecopages JSX host pages.
				</p>
			</section>

			<section class="card space-y-4" data-testid={integrationMatrixTestIds.hostShellStack}>
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Shared host shell stack</p>
				<EcoEmbed component={KitaShell} props={{ id: integrationMatrixHostShellIds.kita }}>
					<EcoEmbed component={LitShell} props={{ id: integrationMatrixHostShellIds.lit }}>
						<EcoEmbed component={ReactShell} props={{ id: integrationMatrixHostShellIds.react }}>
							<EcoEmbed
								component={EcopagesJsxShell}
								props={{ id: integrationMatrixHostShellIds['ecopages-jsx'] }}
							>
								{integrationMatrixHostShellLeafText}
							</EcoEmbed>
						</EcoEmbed>
					</EcoEmbed>
				</EcoEmbed>
			</section>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Counters across integrations</p>
				<IntegrationCounterGroup
					testId={integrationMatrixTestIds.kitaCounters}
					radiantId="kita-entry-radiant"
				/>
			</section>

			<section class="card space-y-4" data-testid={integrationMatrixTestIds.shellCounters}>
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Every counter inside every shell</p>
				<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
					{integrationMatrixShellCounterCases.map((item) => {
						const component = {
							kita: KitaShell,
							lit: LitShell,
							react: ReactShell,
							'ecopages-jsx': EcopagesJsxShell,
						}[item.shell];

						return (
							<EcoEmbed component={component} props={{ id: item.shellId }}>
								<IntegrationCounterGroup testId={item.testId} radiantId={item.radiantId} />
							</EcoEmbed>
						);
					})}
				</div>
			</section>
		</div>
	),
});
