import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture.ts';
import { findAbsolutePathsInBuildOutput, listServedPagePathnames } from '../../../e2e/utils/moved-build.ts';
import { listUnreachableClientAssets } from '../../../e2e/utils/client-asset-reachability.ts';
import { assertAllCountersInteractivity } from './counters';
import { integrationMatrixHostPages } from '../src/data/integration-matrix';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

/** Routes `app.ts` registers, which render imported views, so `routes.json` does not list them. */
const explicitRoutes = ['/explicit/team', '/explicit/react-island', '/latest'];

test.describe.configure({ mode: 'serial' });

test.describe('A kitchen-sink build moved to another folder under `ecopages start`', () => {
	test('serves every page route and explicit view without a path of the build machine', async ({ app, request }) => {
		const failures: string[] = [];
		for (const pathname of [...listServedPagePathnames(app.dir), ...explicitRoutes]) {
			const response = await request.get(pathname);
			const html = await response.text();
			if (response.status() !== 200) failures.push(`${pathname} ${response.status()}`);
			for (const folder of [app.builtDir!, repoRoot]) {
				if (html.includes(folder)) failures.push(`${pathname} names ${folder}`);
			}
		}

		expect(failures, app.getServerOutput()).toEqual([]);
	});

	test('writes no browser asset that a served Page cannot reach', async ({ app, request }) => {
		const servedHtml: string[] = [];
		for (const pathname of [...listServedPagePathnames(app.dir), ...explicitRoutes]) {
			servedHtml.push(await (await request.get(pathname)).text());
		}

		expect(listUnreachableClientAssets(path.join(app.dir, 'dist', 'client'), servedHtml)).toEqual([]);
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
