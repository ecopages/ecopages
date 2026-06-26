import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
	createHmrPhaseTimer,
	startEcopagesHmrConnectionWatch,
	installFullDocumentReloadWatcher,
	assertNoMainFrameNavigation,
	watchForMainFrameNavigation,
	gotoPath,
	trackRuntimeErrors,
} from './test-support';

const SEO_INCLUDE_FILE = fileURLToPath(new URL('../src/includes/seo.kita.tsx', import.meta.url));
const EXPLICIT_TEAM_VIEW_FILE = fileURLToPath(new URL('../src/views/explicit-team-view.kita.tsx', import.meta.url));
const SEO_SUFFIX = '[include-hmr]';
const EXPLICIT_TEAM_SUFFIX = '[explicit-route-hmr]';

function getSeoIncludeFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return SEO_INCLUDE_FILE;
	}

	return path.join(isolatedAppDir, 'src/includes/seo.kita.tsx');
}

function getExplicitTeamViewFile(projectMetadata: Record<string, unknown> | undefined) {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;

	if (!isolatedAppDir) {
		return EXPLICIT_TEAM_VIEW_FILE;
	}

	return path.join(isolatedAppDir, 'src/views/explicit-team-view.kita.tsx');
}

function patchSeoTitle(content: string, suffix: string) {
	return content.replace('<title safe>{title}</title>', `<title safe>{\`${'${title}'} ${suffix}\`}</title>`);
}

function patchExplicitRouteHeading(content: string, suffix: string) {
	return content.replace(
		'Explicit routes can still feel native.',
		`Explicit routes can still feel native. ${EXPLICIT_TEAM_SUFFIX}`,
	);
}

test.describe('Source mutation HMR @hmr', () => {
	let originalSeoInclude = '';
	let seoIncludeFile = SEO_INCLUDE_FILE;
	let originalExplicitTeamView = '';
	let explicitTeamViewFile = EXPLICIT_TEAM_VIEW_FILE;

	test.describe.configure({ mode: 'serial' });

	// oxlint-disable-next-line no-empty-pattern
	test.beforeAll(async ({}, testInfo) => {
		seoIncludeFile = getSeoIncludeFile(testInfo.project.metadata as Record<string, unknown> | undefined);
		originalSeoInclude = fs.readFileSync(SEO_INCLUDE_FILE, 'utf-8');
		explicitTeamViewFile = getExplicitTeamViewFile(
			testInfo.project.metadata as Record<string, unknown> | undefined,
		);
		originalExplicitTeamView = fs.readFileSync(EXPLICIT_TEAM_VIEW_FILE, 'utf-8');
	});

	test.afterAll(() => {
		fs.writeFileSync(seoIncludeFile, originalSeoInclude, 'utf-8');
		fs.writeFileSync(explicitTeamViewFile, originalExplicitTeamView, 'utf-8');
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
		const titleReadyTimeout = testInfo.project.name.includes('vite') ? 45_000 : 10_000;
		let initialTitle = '';
		await expect
			.poll(async () => {
				const title = await page.title();
				if (title.length > 0 && !title.startsWith('Loading ')) {
					initialTitle = title;
					return true;
				}

				return false;
			}, { timeout: titleReadyTimeout })
			.toBe(true);
		const navigationWatch = watchForMainFrameNavigation(page);

		fs.writeFileSync(seoIncludeFile, patchSeoTitle(originalSeoInclude, SEO_SUFFIX), 'utf-8');
		timer.mark('mutation-applied');
		await expect(page).toHaveTitle(`${initialTitle} ${SEO_SUFFIX}`, { timeout: 10_000 });
		timer.mark('title-updated');
		await assertNoMainFrameNavigation(navigationWatch);

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

		const navigationWatch = watchForMainFrameNavigation(page);
		fs.writeFileSync(
			explicitTeamViewFile,
			patchExplicitRouteHeading(originalExplicitTeamView, EXPLICIT_TEAM_SUFFIX),
			'utf-8',
		);
		timer.mark('mutation-applied');
		await expect(
			page.getByRole('heading', { name: `Explicit routes can still feel native. ${EXPLICIT_TEAM_SUFFIX}` }),
		).toBeVisible({ timeout: 10_000 });
		timer.mark('heading-updated');
		await assertNoMainFrameNavigation(navigationWatch);

		runtime.assertClean();
	});
});
