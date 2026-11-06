import { test } from '@playwright/test';
import { WORKER_PAGES, expectWorkerReply } from './worker-reply.ts';

for (const pathname of WORKER_PAGES) {
	test(`a Page script on ${pathname} starts a module worker that imports a local helper and replies`, async ({
		page,
	}, testInfo) => {
		test.skip(
			pathname === '/dynamic' && testInfo.project.name === 'web-workers-preview-e2e',
			'`ecopages preview` serves the static export, which has no Dynamic Page',
		);
		await expectWorkerReply(page, pathname);
	});
}
