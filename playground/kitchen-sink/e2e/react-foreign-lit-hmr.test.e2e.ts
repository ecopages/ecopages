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

test.describe('React MDX Page with a foreign Lit Component HMR @hmr', () => {
	let pageFile = '';
	let original = '';

	test.beforeAll(({ app }) => {
		pageFile = path.join(app.dir, PAGE_FILE);
		original = fs.readFileSync(pageFile, 'utf-8');
	});

	test.afterEach(() => {
		fs.writeFileSync(pageFile, original, 'utf-8');
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
});
