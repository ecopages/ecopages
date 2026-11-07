import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture.ts';
import { findAbsolutePathsInBuildOutput, listServedPagePathnames } from '../../../e2e/utils/moved-build.ts';
import { assertAllCountersInteractivity } from './counters';
import { integrationMatrixHostPages } from '../src/data/integration-matrix';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

test.describe.configure({ mode: 'serial' });

test.describe('A kitchen-sink build moved to another folder under `ecopages start`', () => {
	test('serves every page route', async ({ app, request }) => {
		const failures: string[] = [];
		for (const pathname of listServedPagePathnames(app.dir)) {
			const response = await request.get(pathname);
			if (response.status() !== 200) failures.push(`${pathname} ${response.status()}`);
		}

		expect(failures, app.getServerOutput()).toEqual([]);
	});

	test('hydrates the counters of every Integration', async ({ page }) => {
		const hostPage = integrationMatrixHostPages[0]!;
		await page.goto(hostPage.href);

		await assertAllCountersInteractivity(page.getByTestId(hostPage.flatCountersTestId), {
			radiant: hostPage.radiantInitialValue,
		});
	});

	test('writes no absolute path of the build machine into its output', ({ app }) => {
		expect(findAbsolutePathsInBuildOutput(app.dir, [app.builtDir!, repoRoot])).toEqual([]);
	});
});
