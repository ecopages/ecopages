import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS, gotoPathSimple, startEcopagesHmrConnectionWatch } from './test-support';

test('renders an edited content entry without restarting the dev server @hmr', async ({ page, app }) => {
	const postFile = path.join(app.dir, 'src/content/posts/first-post.mdx');
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
