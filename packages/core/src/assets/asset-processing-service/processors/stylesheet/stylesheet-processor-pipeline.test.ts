import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { Processor } from '../../../../plugins/processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

class FixtureStylesheetProcessor extends Processor {
	async setup(): Promise<void> {}
	override async transformStylesheet(css: string): Promise<string> {
		return `${css}\n/* processed */`;
	}
}

function configWith(extensions: string[] | undefined): EcoPagesAppConfig {
	const processors = new Map<string, Processor>();
	if (extensions) {
		processors.set(
			'sass',
			new FixtureStylesheetProcessor({ name: 'sass', capabilities: [{ kind: 'stylesheet', extensions }] }),
		);
	}
	return { processors } as unknown as EcoPagesAppConfig;
}

describe('applyStylesheetProcessors', () => {
	it('processes an extension the stylesheet Processor declares', async () => {
		const config = configWith(['*.scss']);
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.scss')).toBe('.a {}\n/* processed */');
	});

	it('passes a stylesheet through when no Processor is registered', async () => {
		const config = configWith(undefined);
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.css')).toBe('.a {}');
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.scss')).toBe('.a {}');
	});

	it('leaves a file the Processor does not declare alone', async () => {
		const config = configWith(['*.scss']);
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.less')).toBe('.a {}');
	});
});
