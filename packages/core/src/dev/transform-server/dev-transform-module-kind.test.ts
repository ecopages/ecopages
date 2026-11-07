import { describe, expect, it } from 'vitest';
import { createStylesheetKinds } from '../../plugins/stylesheet-kinds.ts';
import { Processor } from '../../plugins/processor.ts';
import { resolveDevTransformModuleKind } from './dev-transform-module-kind.ts';

describe('dev transform module kind', () => {
	it('classifies script and stylesheet paths', () => {
		expect(resolveDevTransformModuleKind('/app/src/pages/index.tsx')).toBe('script');
		expect(resolveDevTransformModuleKind('/app/src/components/widget.css')).toBe('stylesheet');
	});

	it('serves an extension the stylesheet Processor declares as a stylesheet, and only then', () => {
		class SassProcessor extends Processor {
			async setup(): Promise<void> {}
		}
		const sass = new SassProcessor({
			name: 'sass',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.scss'] }],
		});

		expect(resolveDevTransformModuleKind('/app/src/card.scss', createStylesheetKinds([sass]))).toBe('stylesheet');
		expect(resolveDevTransformModuleKind('/app/src/card.scss', createStylesheetKinds([]))).toBe('script');
		expect(resolveDevTransformModuleKind('/app/src/card.scss')).toBe('script');
	});
});
