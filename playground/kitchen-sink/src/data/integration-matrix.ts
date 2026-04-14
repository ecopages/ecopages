export const integrationMatrixEntryRoutes = [
	{
		href: '/integration-matrix/kita',
		label: 'Kita host',
		testId: 'matrix-link-kita',
		description: 'Inspect the broad shell matrix under the explicit Kita-owned route.',
	},
	{
		href: '/integration-matrix/lit-entry',
		label: 'Lit host',
		testId: 'matrix-link-lit',
		description: 'Validate the Lit-first route with nested Kita, React, and counter coverage.',
	},
	{
		href: '/integration-matrix/react-entry',
		label: 'React host',
		testId: 'matrix-link-react',
		description: 'Validate the React-owned shell entry plus the nested Kita and Lit content.',
	},
	{
		href: '/integration-matrix/ecopages-jsx-entry',
		label: 'Ecopages JSX host',
		testId: 'matrix-link-ecopages-jsx',
		description: 'Validate the Ecopages JSX entry plus Radiant SSR and hydration behavior.',
	},
] as const;

export const integrationMatrixShellKinds = ['kita', 'lit', 'react', 'ecopages-jsx'] as const;

export type IntegrationMatrixShellKind = (typeof integrationMatrixShellKinds)[number];

export const integrationMatrixHostShellIds = {
	kita: 'integration-matrix-host-shell-kita',
	lit: 'integration-matrix-host-shell-lit',
	react: 'integration-matrix-host-shell-react',
	'ecopages-jsx': 'integration-matrix-host-shell-ecopages-jsx',
} as const;

export const integrationMatrixHostShellLeafText = 'integration-matrix-host-child';

export const integrationMatrixShellCounterCases = integrationMatrixShellKinds.map((shell) => ({
	shell,
	testId: `integration-matrix-shell-counters-${shell}`,
	radiantId: `integration-matrix-shell-radiant-${shell}`,
	shellId: `integration-matrix-counter-shell-${shell}`,
}));

export const integrationMatrixTestIds = {
	hub: 'page-integration-matrix-index',
	kitaPage: 'page-integration-matrix-kita',
	hostShellStack: 'integration-matrix-host-shell-stack',
	kitaCounters: 'integration-matrix-kita-counters',
	shellCounters: 'integration-matrix-shell-counters',
	litCounters: 'integration-matrix-lit-counters',
	reactCounters: 'integration-matrix-react-counters',
	ecopagesJsxCounters: 'integration-matrix-ecopages-jsx-counters',
} as const;

export const integrationMatrixHostPages = [
	{
		host: 'kita',
		href: '/integration-matrix/kita',
		flatCountersTestId: integrationMatrixTestIds.kitaCounters,
		radiantId: 'kita-entry-radiant',
		radiantInitialValue: '0',
	},
	{
		host: 'lit',
		href: '/integration-matrix/lit-entry',
		flatCountersTestId: integrationMatrixTestIds.litCounters,
		radiantId: 'lit-entry-radiant',
		radiantInitialValue: '0',
	},
	{
		host: 'react',
		href: '/integration-matrix/react-entry',
		flatCountersTestId: integrationMatrixTestIds.reactCounters,
		radiantId: 'react-entry-radiant',
		radiantInitialValue: '0',
	},
	{
		host: 'ecopages-jsx',
		href: '/integration-matrix/ecopages-jsx-entry',
		flatCountersTestId: integrationMatrixTestIds.ecopagesJsxCounters,
		radiantId: 'ecopages-jsx-entry-radiant',
		radiantInitialValue: '0',
	},
] as const;
