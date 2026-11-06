import { test } from '../../app-fixture';
import { WORKER_PAGES, expectWorkerReply } from './worker-reply.ts';

for (const pathname of WORKER_PAGES) {
	test(`in development, a Page script on ${pathname} starts a module worker that imports a local helper and replies`, async ({
		page,
	}) => {
		await expectWorkerReply(page, pathname);
	});
}
