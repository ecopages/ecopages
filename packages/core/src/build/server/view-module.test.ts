import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isViewModule } from './view-module.ts';

describe('isViewModule', () => {
	it('does not treat a file of plain components as a view', () => {
		const source = [
			'export type SearchIconProps = { class?: string };',
			'export function SearchIcon(props: SearchIconProps) {',
			'\treturn <svg class={props.class} />;',
			'}',
		].join('\n');

		assert.equal(isViewModule('/app/src/lib/search/search-icon.tsx', source), false);
	});

	it('does not treat a barrel without a default as a view', () => {
		assert.equal(isViewModule('/app/src/components/index.tsx', "export * from './button';"), false);
		assert.equal(isViewModule('/app/src/components/index.tsx', "export { Button } from './button';"), false);
	});

	it('does not count a type exported as default', () => {
		assert.equal(
			isViewModule('/app/src/components/props.tsx', "export type { Props as default } from './types';"),
			false,
		);
	});

	it('treats a default export as a view', () => {
		const source = ['export type Props = { title: string };', 'export default eco.page({ render: () => <h1 /> });'];
		assert.equal(isViewModule('/app/src/views/post.tsx', source.join('\n')), true);
		assert.equal(isViewModule('/app/src/views/post.tsx', 'const View = 1;\nexport { View as default };'), true);
		assert.equal(isViewModule('/app/src/views/post.tsx', "export { default } from './post-view';"), true);
	});

	it('treats a script module that does not parse as a view', () => {
		assert.equal(isViewModule('/app/src/views/post.tsx', 'export default <h1>;'), true);
	});

	it('treats files that are not script modules as views', () => {
		assert.equal(isViewModule('/app/src/views/post.html', '<h1>Post</h1>'), true);
		assert.equal(isViewModule('/app/src/views/post.mdx', 'export const meta = {};\n\n# Post'), true);
	});
});
