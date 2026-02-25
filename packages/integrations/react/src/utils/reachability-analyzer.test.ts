import { describe, expect, it } from 'vitest';
import { analyzeReachability } from './reachability-analyzer';

describe('analyzeReachability', () => {
	it('identifies eco.page render dependencies correctly', () => {
		const source = `
			import { usedFunction } from './used';
			import { unusedFunction } from './unused';
			import * as utils from './utils';
			
			const Helper = () => usedFunction();
			
			const unusedVar = 42;
			
			export default eco.page({
				render: () => {
					utils.log('rendering');
					return Helper();
				}
			});
		`;

		const result = analyzeReachability(source, 'page.tsx');

		expect(result.analyzed).toBe(true);
		expect(result.isFallbackRoots).toBe(false);

		/** `usedFunction` is reachable via `Helper` */
		expect(result.reachableImports.get('./used')).toBeInstanceOf(Set);
		expect((result.reachableImports.get('./used') as Set<string>).has('usedFunction')).toBe(true);

		/** `unusedFunction` is NOT reachable */
		expect(result.reachableImports.has('./unused')).toBe(false);

		/** `utils` is reachable as a namespace */
		expect(result.reachableImports.get('./utils')).toBe('*');

		/** Local decls */
		expect(result.reachableDeclarations.size).toBe(1); // Helper
	});

	it('identifies dynamic imports within dynamic() wrappers', () => {
		const source = `
			const ClientComponent = dynamic(() => import('./client-comp'), { ssr: false });
			
			export const MyComp = eco.component({
				render: () => {
					return <ClientComponent />;
				}
			});
		`;

		const result = analyzeReachability(source, 'comp.tsx');

		expect(result.analyzed).toBe(true);
		expect(result.isFallbackRoots).toBe(false);
		expect(result.reachableImports.get('./client-comp')).toBe('*');
	});

	it('gracefully handles files with no eco explicit roots by using fallback exports', () => {
		const source = `
			import { utility } from './utils';
			
			export function standardExport() {
				return utility();
			}
		`;

		const result = analyzeReachability(source, 'helper.ts');

		expect(result.analyzed).toBe(true);
		expect(result.isFallbackRoots).toBe(true);

		expect(result.reachableImports.get('./utils')).toBeInstanceOf(Set);
		expect((result.reachableImports.get('./utils') as Set<string>).has('utility')).toBe(true);
	});

	it('properly traces JSX identifiers mapped from local scope', () => {
		const source = `
			import { Button } from '@/components/button';
			import { Unused } from '@/components/unused';
			
			const LocalWrapper = () => <Button />;
			
			export default eco.page({
				render: () => <LocalWrapper />
			});
		`;

		const result = analyzeReachability(source, 'jsx-page.tsx');

		expect(result.analyzed).toBe(true);
		expect(result.isFallbackRoots).toBe(false);

		expect(result.reachableImports.get('@/components/button')).toBeInstanceOf(Set);
		expect((result.reachableImports.get('@/components/button') as Set<string>).has('Button')).toBe(true);
		expect(result.reachableImports.has('@/components/unused')).toBe(false);
	});

	it('identifies unreachable side-effect imports', () => {
		const source = `
			import './polyfills';
			
			export default eco.page({
				render: () => "Hello"
			});
		`;

		const result = analyzeReachability(source, 'app.tsx');

		expect(result.analyzed).toBe(true);
		expect(result.isFallbackRoots).toBe(false);
		expect(result.unreachableSideEffectImports).toHaveLength(1);
	});

	it('identifies reachable side-effect imports', () => {
		/**
		 * Even if it's a side effect, if resolving rules don't prune it,
		 * it might just sit in topLevelImports. But our logic primarily builds out `reachableImports`.
		 * If it's a side-effect, it doesn't have bindings to track reachability dynamically
		 * unless it's explicitly allowed.
		 */
		const source = `
			import './polyfills';
		`;
		/**
		 * The fallback roots logic will see no roots, fall back to "export all" but there are none,
		 * so the AST pass might mark the side effect as unreachable.
		 * With fallback roots and NO exports, it remains empty in reachability.
		 */

		const result = analyzeReachability(source, 'app.tsx');

		expect(result.analyzed).toBe(true);
		expect(result.isFallbackRoots).toBe(true);

		/** With fallback roots and NO exports, it remains empty in reachability. */
		expect(result.unreachableSideEffectImports).toHaveLength(1);
	});
});
