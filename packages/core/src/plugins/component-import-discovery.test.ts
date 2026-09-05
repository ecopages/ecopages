import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { attributeComponentIdentity } from './eco-component-meta-plugin.ts';

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
	it('does not discover a component re-exported through a barrel', () => {
		const { root, transform } = fixture();
		writeFileSync(path.join(root, 'index.ts'), `export * from './child';`);
		expect(transform(`import { Child } from './index';`)).not.toContain('components: ()');
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
});
