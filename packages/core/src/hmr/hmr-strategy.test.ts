import { describe, expect, it } from 'vitest';
import { HmrStrategy, HmrStrategyType, type HmrAction } from './hmr-strategy';

class MockStrategy extends HmrStrategy {
	override readonly priorityOffset: number;

	constructor(
		readonly type: HmrStrategyType,
		priorityOffset = 0,
	) {
		super();
		this.priorityOffset = priorityOffset;
	}

	matches(): boolean {
		return true;
	}

	async process(): Promise<HmrAction> {
		return { type: 'none' };
	}
}

describe('HmrStrategy', () => {
	it.each([
		{ type: HmrStrategyType.INTEGRATION, offset: 0, priority: 100 },
		{ type: HmrStrategyType.SCRIPT, offset: -10, priority: 15 },
	])('derives priority $priority from the type plus priorityOffset', ({ type, offset, priority }) => {
		expect(new MockStrategy(type, offset).priority).toBe(priority);
	});
});
