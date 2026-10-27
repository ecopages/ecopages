import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../../app-fixture';

const READY_LINE = /(?:Bun|Node) server running at/g;
const EDIT_TIMEOUT_MS = 45_000;

const VIEW_EDITS = [
	{
		file: 'src/views/latest-view.kita.tsx',
		path: '/latest',
		from: 'Version 1',
		to: 'Version 2',
		status: 200,
	},
	{
		file: 'src/views/partial-view.kita.tsx',
		path: '/partial',
		from: 'Partial 1',
		to: 'Partial 2',
		status: 200,
	},
	{
		file: 'src/views/static-view.kita.tsx',
		path: '/static-view',
		from: 'Static 1',
		to: 'Static 2',
		status: 200,
	},
	{
		file: 'src/views/not-found-view.kita.tsx',
		path: '/missing-imported-view',
		from: 'Missing 1',
		to: 'Missing 2',
		status: 404,
	},
] as const;

function readyLineCount(output: string): number {
	return output.match(READY_LINE)?.length ?? 0;
}

async function expectResponseContains(
	request: { get: (url: string) => Promise<{ status: () => number; text: () => Promise<string> }> },
	url: string,
	status: number,
	marker: string,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const response = await request.get(url);
				if (response.status() !== status) {
					return `${url} status ${response.status()}`;
				}
				const body = await response.text();
				return body.includes(marker) ? marker : `${url} ${body.slice(0, 200)}`;
			},
			{ timeout: EDIT_TIMEOUT_MS },
		)
		.toBe(marker);
}

test.describe('Imported views reload without a process restart', () => {
	/** Worker app copy is shared; edits overlap on `/latest`. */
	test.describe.configure({ mode: 'serial' });

	test('reloads ctx.render, ctx.renderPartial, app.static, and an error page after an edit', async ({
		request,
		app,
	}) => {
		const originals = VIEW_EDITS.map((edit) => ({
			...edit,
			absolute: path.join(app.dir, edit.file),
			source: readFileSync(path.join(app.dir, edit.file), 'utf8'),
		}));
		const readyBefore = readyLineCount(app.getServerOutput());

		try {
			for (const edit of originals) {
				await expectResponseContains(request, edit.path, edit.status, edit.from);
			}

			for (const edit of originals) {
				await writeFile(edit.absolute, edit.source.replace(edit.from, edit.to), { flush: true });
			}

			for (const edit of originals) {
				await expectResponseContains(request, edit.path, edit.status, edit.to);
			}

			expect(readyLineCount(app.getServerOutput())).toBe(readyBefore);
		} finally {
			await Promise.all(originals.map((edit) => writeFile(edit.absolute, edit.source, { flush: true })));
		}
	});

	test('reloads when a component the imported view uses is edited', async ({ request, app }) => {
		const badgeFile = path.join(app.dir, 'src/components/badge.kita.tsx');
		const original = readFileSync(badgeFile, 'utf8');
		const readyBefore = readyLineCount(app.getServerOutput());

		try {
			await expectResponseContains(request, '/latest', 200, 'Badge 1');

			await writeFile(badgeFile, original.replace('Badge 1', 'Badge 2'), { flush: true });

			await expectResponseContains(request, '/latest', 200, 'Badge 2');
			expect(readyLineCount(app.getServerOutput())).toBe(readyBefore);
		} finally {
			await writeFile(badgeFile, original, { flush: true });
		}
	});
});
