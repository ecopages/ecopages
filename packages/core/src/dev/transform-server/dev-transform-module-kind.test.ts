import { describe, expect, it } from 'vitest';
import { materializeDevTransformStylesheet, resolveDevTransformModuleKind } from './dev-transform-module-kind.ts';

describe('dev transform module kind', () => {
	it('classifies script and stylesheet paths', () => {
		expect(resolveDevTransformModuleKind('/app/src/pages/index.tsx')).toBe('script');
		expect(resolveDevTransformModuleKind('/app/src/components/widget.css')).toBe('stylesheet');
	});

	it('materializes stylesheet modules as default-exported strings', () => {
		expect(materializeDevTransformStylesheet(':host { display: block; }\n')).toBe(
			'export default ":host { display: block; }\\n";\n',
		);
	});
});
