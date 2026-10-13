import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import {
	createHmrPhaseTimer,
	startEcopagesHmrConnectionWatch,
	installFullDocumentReloadWatcher,
	assertNoMainFrameNavigationAfterHmr,
	gotoPath,
	trackRuntimeErrors,
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
} from './test-support';

const SEO_SUFFIX = '[include-hmr]';
const EXPLICIT_TEAM_SUFFIX = '[explicit-route-hmr]';

function patchSeoTitle(content: string, suffix: string) {
	return content.replace('<title safe>{title}</title>', `<title safe>{\`${'${title}'} ${suffix}\`}</title>`);
}

function patchExplicitRouteHeading(content: string, suffix: string) {
	return content.replace(
		'Explicit routes can still feel native.',
		`Explicit routes can still feel native. ${suffix}`,
	);
}

test.describe('Source mutation HMR @hmr', () => {
	let originalSeoInclude = '';
	let seoIncludeFile = '';
	let originalExplicitTeamView = '';
	let explicitTeamViewFile = '';

	test.describe.configure({ mode: 'serial' });

	function restoreMutatedSources() {
		fs.writeFileSync(seoIncludeFile, originalSeoInclude, 'utf-8');
		fs.writeFileSync(explicitTeamViewFile, originalExplicitTeamView, 'utf-8');
	}

	test.beforeAll(({ app }) => {
		seoIncludeFile = path.join(app.dir, 'src/includes/seo.kita.tsx');
		explicitTeamViewFile = path.join(app.dir, 'src/views/explicit-team-view.kita.tsx');
		originalSeoInclude = fs.readFileSync(seoIncludeFile, 'utf-8');
		originalExplicitTeamView = fs.readFileSync(explicitTeamViewFile, 'utf-8');
	});

	test.afterEach(() => {
		restoreMutatedSources();
	});

	test.afterAll(() => {
		restoreMutatedSources();
	});

	test('refreshes the current page when a shared include template changes', async ({ page }, testInfo) => {
		const timer = createHmrPhaseTimer(`${testInfo.project.name} :: include template`);
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);

		await installFullDocumentReloadWatcher(page);
		await gotoPath(page, '/docs');
		timer.mark('navigation-ready');
		await hmrReady;
		timer.mark('hmr-connected');
		await expect(page.getByTestId('page-docs')).toBeVisible();
		await expect(page).toHaveTitle(/^Ecopages(?! \[include-hmr\])/);
		const initialTitle = await page.title();

		fs.writeFileSync(seoIncludeFile, patchSeoTitle(originalSeoInclude, SEO_SUFFIX), 'utf-8');
		timer.mark('mutation-applied');
		await expect(page).toHaveTitle(`${initialTitle} ${SEO_SUFFIX}`, { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS });
		timer.mark('title-updated');
		await assertNoMainFrameNavigationAfterHmr(page);

		runtime.assertClean();
	});

	test('refreshes an explicit route when its view module changes', async ({ page }, testInfo) => {
		const timer = createHmrPhaseTimer(`${testInfo.project.name} :: explicit route view`);
		const runtime = trackRuntimeErrors(page);
		const hmrReady = startEcopagesHmrConnectionWatch(page);

		await installFullDocumentReloadWatcher(page);
		await gotoPath(page, '/explicit/team');
		timer.mark('navigation-ready');
		await hmrReady;
		timer.mark('hmr-connected');
		await expect(page.getByRole('heading', { name: 'Explicit routes can still feel native.' })).toBeVisible();

		fs.writeFileSync(
			explicitTeamViewFile,
			patchExplicitRouteHeading(originalExplicitTeamView, EXPLICIT_TEAM_SUFFIX),
			'utf-8',
		);
		timer.mark('mutation-applied');
		await expect(
			page.getByRole('heading', { name: `Explicit routes can still feel native. ${EXPLICIT_TEAM_SUFFIX}` }),
		).toBeVisible({ timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS });
		timer.mark('heading-updated');
		await assertNoMainFrameNavigationAfterHmr(page);

		runtime.assertClean();
	});
});
