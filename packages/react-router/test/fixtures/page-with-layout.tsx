import { createElement, type ReactNode } from 'react';

type TierRecorder = { factoryCalls: number };

function Shell({ children, user }: { children?: ReactNode; user?: string }) {
	return createElement('section', null, createElement('span', { 'data-testid': 'user' }, user ?? 'guest'), children);
}

/** Page whose layout props factory is observable through `globalThis.__ecoTierRecorder`. */
export default function PageWithLayout() {
	return createElement('div', { 'data-testid': 'page-label' }, 'with-layout');
}

PageWithLayout.config = {
	layouts: [Shell],
	layoutEntries: [
		{
			component: Shell,
			props: () => {
				(globalThis as { __ecoTierRecorder?: TierRecorder }).__ecoTierRecorder!.factoryCalls += 1;
				return { user: 'factory' };
			},
		},
	],
};
