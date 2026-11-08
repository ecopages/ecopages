import { afterEach, describe, expect, it, vi } from 'vitest';
import { appLogger } from '../../../global/app-logger.ts';
import {
	createLayoutChildrenNotRenderedHandler,
	LayoutChildrenNotRenderedError,
} from './layout-children-not-rendered-error.ts';

const error = new LayoutChildrenNotRenderedError('GateLayout', '/app/pages/account.tsx');

describe('createLayoutChildrenNotRenderedHandler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('throws while rendering static build output', () => {
		const handle = createLayoutChildrenNotRenderedHandler({ staticGeneration: true, production: true });

		expect(() => handle(error)).toThrow(error);
	});

	it('warns on a development request-time render', () => {
		const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
		const handle = createLayoutChildrenNotRenderedHandler({ staticGeneration: false, production: false });

		expect(() => handle(error)).not.toThrow();
		expect(warn).toHaveBeenCalledWith(error.message);
	});

	it('neither throws nor logs on a production request-time render', () => {
		const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
		const handle = createLayoutChildrenNotRenderedHandler({ staticGeneration: false, production: true });

		expect(() => handle(error)).not.toThrow();
		expect(warn).not.toHaveBeenCalled();
	});
});
