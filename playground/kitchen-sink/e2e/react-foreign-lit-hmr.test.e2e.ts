import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import {
	assertCounterInteractivity,
	assertNoMainFrameNavigationAfterHmr,
	gotoPath,
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
	installFullDocumentReloadWatcher,
	startEcopagesHmrConnectionWatch,
	trackRuntimeErrors,
} from './helpers';

const PAGE_FILE = 'src/pages/react-content.mdx';
const COMPONENT_FILE = 'src/components/lit-counter.lit.tsx';

test.describe('React MDX Page with a foreign Lit Component HMR @hmr', () => {
	let pageFile = '';
	let original = '';
	let componentFile = '';
	let originalComponent = '';

	test.beforeAll(({ app }) => {
		pageFile = path.join(app.dir, PAGE_FILE);
		original = fs.readFileSync(pageFile, 'utf-8');
		componentFile = path.join(app.dir, COMPONENT_FILE);
		originalComponent = fs.readFileSync(componentFile, 'utf-8');
	});

	test.afterEach(() => {
		fs.writeFileSync(pageFile, original, 'utf-8');
		fs.writeFileSync(componentFile, originalComponent, 'utf-8');
	});

	test('renders the edited props of the foreign Lit Component without a reload', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await installFullDocumentReloadWatcher(page);
		await gotoPath(page, '/react-content');
		await hmrReady;
		await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, { timeout: 10_000 });

		fs.writeFileSync(
			pageFile,
			original
				.replace('# React MDX', '# React MDX [hmr]')
				.replace('<LitCounter count={1} />', '<LitCounter count={5} />'),
			'utf-8',
		);

		await expect(page.getByRole('heading', { name: 'React MDX [hmr]' })).toBeVisible({
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		await assertCounterInteractivity(page.getByTestId('page-react-content'), { kita: false, lit: '5' });
		await assertNoMainFrameNavigationAfterHmr(page);
		runtime.assertClean();
	});

	/**
	 * React's island takes the Lit Component from its stub module and never imports `lit-counter.lit.tsx`, so this
	 * checks that an edit of that file still reaches the open React Page.
	 */
	test('renders an edit of the foreign Lit Component file on the open React Page', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPath(page, '/react-content');
		await hmrReady;
		await page.waitForFunction(() => !!window.__ECO_PAGES__?.react?.pageRoot, null, { timeout: 10_000 });

		fs.writeFileSync(
			componentFile,
			originalComponent.replace('data-counter-kind="lit"', 'data-counter-kind="lit" data-hmr-edit="1"'),
			'utf-8',
		);

		await expect(page.locator('[data-testid="page-react-content"] lit-counter[data-hmr-edit="1"]')).toBeAttached({
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		await assertCounterInteractivity(page.getByTestId('page-react-content'), { kita: false, lit: '1' });
		runtime.assertClean();
	});
});
