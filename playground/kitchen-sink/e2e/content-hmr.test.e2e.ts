import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS, gotoPathSimple, startEcopagesHmrConnectionWatch } from './test-support';

test('renders an edited content entry without restarting the dev server @hmr', async ({ page }, testInfo) => {
	const root = testInfo.project.metadata.isolatedAppDir;
	if (typeof root !== 'string') throw new Error('Content HMR requires an isolated app');
	const postFile = path.join(root, 'src/content/posts/first-post.mdx');
	const originalPost = fs.readFileSync(postFile, 'utf8');
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/posts/first-post');
		await hmrReady;
		await expect(page.getByTestId('post-content-first-post')).toContainText('It verifies markdown rendering');

		fs.writeFileSync(
			postFile,
			originalPost.replace('It verifies markdown rendering', 'It re-renders edited content'),
		);
		await expect(page.getByTestId('post-content-first-post')).toContainText('It re-renders edited content', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
	} finally {
		fs.writeFileSync(postFile, originalPost);
	}
});
