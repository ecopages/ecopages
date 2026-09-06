import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attributeComponentIdentity, attributeMdxComponentIdentity } from './eco-component-meta-plugin.ts';

const roots: string[] = [];
function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'eco-discovery-'));
	roots.push(root);
	writeFileSync(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }),
	);
	writeFileSync(
		path.join(root, 'child.ts'),
		`import { eco } from '@ecopages/core';
export const Child = eco.component({ render: () => '' });
const Other = eco.component({ render: () => '' });
export { Other as Renamed }; export default Other;
export function utility() { return 1; }`,
	);
	writeFileSync(path.join(root, 'style.css'), 'body { color: red }');
	return {
		root,
		transform: (imports: string, body = `export default eco.page({ render: () => '' });`) =>
			attributeComponentIdentity(
				`${imports}\nimport { eco } from '@ecopages/core';\n${body}`,
				path.join(root, 'page.ts'),
				'lit',
				root,
			),
	};
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('component import discovery', () => {
	it('discovers direct named, default and aliased exports in import order', () => {
		const { transform } = fixture();
		const result = transform(`import Default, { Child as Named, Renamed, utility, type Props } from '@/child';`);
		expect(result).toContain('components: () => [Default, Named, Renamed]');
		expect(result).not.toContain('components: () => [Default, Named, Renamed, utility]');
	});
	it('extracts relative and aliased CSS regardless of position and is idempotent', () => {
		const { root, transform } = fixture();
		const stylePath = realpathSync(path.join(root, 'style.css'));
		const result = transform(`import './style.css';\nimport '@/style.css';`);
		expect(result).not.toContain(`import './style.css'`);
		expect(result).not.toContain(`import '@/style.css'`);
		expect(result).toContain(`stylesheets: ${JSON.stringify([stylePath, stylePath])}`);
		expect(result).toContain('import { eco, bindComponentIdentity }');
		expect(attributeComponentIdentity(result, path.join(root, 'page.ts'), 'lit', root)).toBe(result);
	});
	it('shares imports among multiple declarations without reading them eagerly', () => {
		const { transform } = fixture();
		const result = transform(
			`import { Child } from './child';`,
			`export const A = eco.component({ render: () => '' }); export const B = eco.html({ render: () => '' });`,
		);
		expect(result.match(/components: \(\) => \[Child\]/g)).toHaveLength(2);
	});
	it('leaves type, dynamic, namespace, package and ordinary helper imports alone', () => {
		const { transform } = fixture();
		const result = transform(
			`import type { Child } from './missing'; import * as children from './child'; import { utility } from './child'; import { Remote } from 'remote-package'; const later = () => import('./child');`,
		);
		expect(result).not.toContain('components: ()');
	});
	it('does not discover a component re-exported through export *', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export * from './child';`);
		expect(transform(`import { Child } from './index';`)).not.toContain('components: ()');
	});
	it('discovers named barrel re-exports of the imported binding only', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export { Child, Renamed as Alias } from './child';`);
		expect(transform(`import { Child, Alias } from './index';`)).toContain('components: () => [Child, Alias]');
		expect(transform(`import { Child } from './index';`)).toContain('components: () => [Child]');
		expect(transform(`import { Child } from './index';`)).not.toContain('Alias');
	});
	it('follows nested named barrel re-exports', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'ui.ts'), `export { Child as Button } from './child';`);
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './ui';`);
		expect(transform(`import { Button } from './index';`)).toContain('components: () => [Button]');
	});
	it('discovers two named aliases that converge on the same component', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export { Child as First, Child as Second } from './child';`);
		expect(transform(`import { First, Second } from './index';`)).toContain('components: () => [First, Second]');
	});
	it('does not hang or discover a circular named re-export chain', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'a.ts'), `export { Button } from './b';`);
		writeFileSync(path.join(root, 'b.ts'), `export { Button } from './a';`);
		expect(transform(`import { Button } from './a';`)).not.toContain('components: ()');
	});
	it('discovers default-to-named barrel re-exports', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export { default as Button } from './child';`);
		expect(transform(`import { Button } from './index';`)).toContain('components: () => [Button]');
	});
	it('re-reads a barrel retarget without editing the importing page', () => {
		const { root, transform } = fixture();
		writeFileSync(
			path.join(root, 'button-a.ts'),
			`import { eco } from '@ecopages/core';
export const Button = eco.component({ render: () => '' });`,
		);
		writeFileSync(path.join(root, 'button-b.ts'), `export const Button = () => '';`);
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './button-a';`);
		const imports = `import { Button } from './index';`;
		expect(transform(imports)).toContain('components: () => [Button]');
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './button-b';`);
		expect(transform(imports)).not.toContain('components: ()');
		writeFileSync(path.join(root, 'index.ts'), `export { Button } from './button-a';`);
		expect(transform(imports)).toContain('components: () => [Button]');
	});
	it('leaves CSS Modules, attributed imports and CSS in plain-function modules alone', () => {
		const { transform } = fixture();
		expect(transform(`import './style.module.css'; import './style.css' with { type: 'text' };`)).not.toContain(
			'stylesheets:',
		);
		const plain = transform(`import './style.css';`, `export function Plain() { return ''; }`);
		expect(plain).toContain(`import './style.css'`);
	});
	it('reports missing relative or aliased imports with owner and specifier', () => {
		const { transform, root } = fixture();
		expect(() => transform(`import './missing.css';`)).toThrow(
			`Cannot resolve stylesheet import "./missing.css" from ${root}/page.ts`,
		);
		expect(() => transform(`import '@/missing.css';`)).toThrow(
			`Cannot resolve stylesheet import "@/missing.css" from ${root}/page.ts`,
		);
		expect(() => transform(`import { Child } from './missing';`)).toThrow(
			`Cannot resolve import "./missing" from ${root}/page.ts`,
		);
	});
	it('re-evaluates changed direct exports on the next transform', () => {
		const { root, transform } = fixture();
		expect(transform(`import { Child } from './child';`)).toContain('components: () => [Child]');
		writeFileSync(path.join(root, 'child.ts'), `export const Child = () => '';`);
		expect(transform(`import { Child } from './child';`)).not.toContain('components: ()');
	});

	describe('MDX component import discovery and attribution', () => {
		it('discovers component and stylesheet imports in MDX and strips bare CSS', () => {
			const { root } = fixture();
			const stylePath = realpathSync(path.join(root, 'style.css'));
			const mdxJs = [
				"import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import './style.css';",
				'function _createMdxContent(props) { return _jsx("h1", { children: "Hi" }); }',
				'export default function MDXContent(props = {}) { return _createMdxContent(props); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root);
			expect(result).not.toContain("import './style.css';");
			expect(result).toContain("import { Child } from './child';");
			expect(result).toContain(
				"import { bindComponentIdentity, attachDiscoveredDependencies } from '@ecopages/core';",
			);
			expect(result).toContain(`components: () => [Child], stylesheets: ${JSON.stringify([stylePath])}`);
			expect(result).toContain('export const config = bindComponentIdentity(');
			expect(result).toContain('attachDiscoveredDependencies(config);');
			expect(result).toContain("if (typeof MDXContent === 'function') MDXContent.config = config;");
		});

		it('preserves existing export const config and merges discovered dependencies', () => {
			const { root } = fixture();
			const stylePath = realpathSync(path.join(root, 'style.css'));
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import '@/style.css';",
				'export const config = { layout: "custom-layout" };',
				'export default function MDXContent() { return _jsx("div", {}); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root);
			expect(result).not.toContain("import '@/style.css';");
			expect(result).toContain('layout: "custom-layout"');
			expect(result).toContain(`components: () => [Child], stylesheets: ${JSON.stringify([stylePath])}`);
			expect(result).toContain('export const config = bindComponentIdentity(');
			expect(result).toContain('attachDiscoveredDependencies(config);');
		});

		it('distinguishes top-level imports from imports and functions inside code blocks', () => {
			const { root } = fixture();
			const stylePath = realpathSync(path.join(root, 'style.css'));
			const mdxJs = [
				"import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import './style.css';",
				'function helper() {',
				'  const dynamic = import("./fake.css");',
				'}',
				'function _createMdxContent(props) {',
				'  return _jsxs("div", {',
				'    children: [',
				'      _jsx("pre", {',
				'        children: _jsx("code", {',
				"          children: \"import './fake.css';\\nimport { Fake } from './fake';\"",
				'        })',
				'      })',
				'    ]',
				'  });',
				'}',
				'export default function MDXContent() { return _createMdxContent(); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root);
			// Real top-level bare CSS import was stripped
			expect(result).not.toContain("import './style.css';");
			// Fake CSS import inside the code block is completely preserved
			expect(result).toContain("children: \"import './fake.css';\\nimport { Fake } from './fake';\"");
			// Fake CSS and dynamic imports are NOT added to discovered dependencies
			expect(result).toContain(`stylesheets: ${JSON.stringify([stylePath])}`);
			expect(result).toContain('components: () => [Child]');
			expect(result).not.toContain('components: () => [Child, Fake]');
		});

		it('is idempotent when run multiple times on the same MDX output', () => {
			const { root } = fixture();
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				"import { Child } from './child';",
				"import './style.css';",
				'export default function MDXContent() { return _jsx("h1", {}); }',
			].join('\n');

			const first = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root);
			const second = attributeMdxComponentIdentity(first, path.join(root, 'post.mdx'), 'mdx', root);
			expect(second).toBe(first);
		});

		it('throws an error if projectRoot is missing', () => {
			const mdxJs = 'export default function MDXContent() { return null; }';
			expect(() => attributeMdxComponentIdentity(mdxJs, '/path/post.mdx', 'mdx', '')).toThrow(
				/projectRoot is required/,
			);
		});

		it('always attributes identity even when MDX has no discovered dependencies', () => {
			const { root } = fixture();
			const mdxJs = [
				"import { jsx as _jsx } from 'react/jsx-runtime';",
				'export default function MDXContent() { return _jsx("h1", {}); }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root);
			expect(result).toContain('export const config = bindComponentIdentity(');
			expect(result).toContain('attachDiscoveredDependencies(config);');
			expect(result).toContain("if (typeof MDXContent === 'function') MDXContent.config = config;");
		});

		it('does not re-wrap export const config that is already a bindComponentIdentity call', () => {
			const { root } = fixture();
			const mdxJs = [
				"import { bindComponentIdentity, attachDiscoveredDependencies } from '@ecopages/core';",
				"export const config = bindComponentIdentity({ id: 'abc', file: '/post.mdx', integration: 'mdx' }, { layout: 'base' });",
				'attachDiscoveredDependencies(config);',
				'export default function MDXContent() { return null; }',
			].join('\n');

			const result = attributeMdxComponentIdentity(mdxJs, path.join(root, 'post.mdx'), 'mdx', root);
			expect(result).toBe(mdxJs);
		});
	});
});
