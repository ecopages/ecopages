import { describe, expect, it, beforeEach } from 'vitest';
import type { EcoComponent, EcoComponentConfig } from '@ecopages/core';
import { withActiveSsrScopeValue } from '@ecopages/jsx/server';
import { ECOPAGES_JSX_SSR_RENDER_STATE_KEY, EcopagesJsxRenderSession } from './ecopages-jsx-render-session.ts';
import { getEjsxHmrOwnership, resetEjsxHmrOwnership } from './ecopages-jsx-hmr-ownership.ts';

const PAGES_DIR = '/test/project/src/pages';
const CONTENT_DIR = '/test/project/src/content/docs';

function makeComponent(file: string, config: Partial<EcoComponentConfig> = {}): EcoComponent {
	const fn = (() => undefined) as unknown as EcoComponent;
	(fn as { config?: EcoComponentConfig }).config = {
		__eco: {
			id: `id-${file}`,
			file,
			integration: 'ecopages-jsx',
		},
		...config,
	};
	return fn;
}

describe('EcopagesJsxRenderSession', () => {
	const session = new EcopagesJsxRenderSession((assets) => assets);

	beforeEach(() => {
		resetEjsxHmrOwnership();
	});

	it('publishes merged HMR ownership after nested render scopes complete', async () => {
		const mdx = makeComponent(`${CONTENT_DIR}/intro.mdx`);
		const page = makeComponent(`${PAGES_DIR}/docs/[...slug]/index.tsx`);

		await session.withActiveScope(async () => {
			session.mergeHmrOwnership([page]);
			await session.withActiveScope(async () => {
				session.mergeHmrOwnership([mdx]);
			});
		});

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(`${PAGES_DIR}/docs/[...slug]/index.tsx`)).toBe(true);
		expect(state.fileOwners.has(`${CONTENT_DIR}/intro.mdx`)).toBe(true);
	});

	it('publishes HMR ownership when entering through the JSX SSR scope bridge', async () => {
		const mdx = makeComponent(`${CONTENT_DIR}/intro.mdx`);
		const state = {
			collectedAssetFrames: [] as never[],
			pendingHmrFileOwners: new Set<string>(),
		};

		await withActiveSsrScopeValue(ECOPAGES_JSX_SSR_RENDER_STATE_KEY, state, async () => {
			await session.withActiveScope(async () => {
				session.mergeHmrOwnership([mdx]);
			});
		});

		expect(getEjsxHmrOwnership().fileOwners.has(`${CONTENT_DIR}/intro.mdx`)).toBe(true);
	});
});
