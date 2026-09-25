import { describe, expect, it } from 'vitest';
import { HmrStrategy, HmrStrategyType, type HmrAction } from './hmr-strategy';

/**
 * Mock strategy for testing the base class behavior
 */
class MockStrategy extends HmrStrategy {
	readonly type: HmrStrategyType;
	override readonly priorityOffset: number;
	private matchPattern: string;

	constructor(options: { type: HmrStrategyType; priorityOffset?: number; matchPattern?: string }) {
		super();
		this.type = options.type;
		this.priorityOffset = options.priorityOffset ?? 0;
		this.matchPattern = options.matchPattern ?? '.';
	}

	matches(filePath: string): boolean {
		return filePath.endsWith(this.matchPattern);
	}

	async process(filePath: string): Promise<HmrAction> {
		return {
			type: 'broadcast',
			events: [{ type: 'update', path: filePath, timestamp: Date.now() }],
		};
	}
}

describe('HmrStrategyType', () => {
	it('INTEGRATION has value 100', () => {
		expect(HmrStrategyType.INTEGRATION).toBe(100);
	});

	it('SCRIPT has value 25', () => {
		expect(HmrStrategyType.SCRIPT).toBe(25);
	});

	it('FALLBACK has value 0', () => {
		expect(HmrStrategyType.FALLBACK).toBe(0);
	});

	it('maintains priority order: INTEGRATION > SCRIPT > FALLBACK', () => {
		expect(HmrStrategyType.INTEGRATION).toBeGreaterThan(HmrStrategyType.SCRIPT);
		expect(HmrStrategyType.SCRIPT).toBeGreaterThan(HmrStrategyType.FALLBACK);
	});
});

describe('HmrStrategy', () => {
	describe('priority', () => {
		it('returns type value when priorityOffset is 0', () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.INTEGRATION });
			expect(strategy.priority).toBe(100);
		});

		it('returns type + priorityOffset', () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.INTEGRATION, priorityOffset: 5 });
			expect(strategy.priority).toBe(105);
		});

		it('allows negative priorityOffset', () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.SCRIPT, priorityOffset: -10 });
			expect(strategy.priority).toBe(15);
		});
	});

	describe('strategy selection by priority', () => {
		it('higher priority strategies are selected first', () => {
			const strategies = [
				new MockStrategy({ type: HmrStrategyType.FALLBACK, matchPattern: '.test' }),
				new MockStrategy({ type: HmrStrategyType.INTEGRATION, matchPattern: '.test' }),
				new MockStrategy({ type: HmrStrategyType.SCRIPT, matchPattern: '.test' }),
			];

			const sorted = [...strategies].sort((a, b) => b.priority - a.priority);

			expect(sorted[0].type).toBe(HmrStrategyType.INTEGRATION);
			expect(sorted[1].type).toBe(HmrStrategyType.SCRIPT);
			expect(sorted[2].type).toBe(HmrStrategyType.FALLBACK);
		});

		it('priorityOffset can override default ordering', () => {
			const scriptWithHighOffset = new MockStrategy({
				type: HmrStrategyType.SCRIPT,
				priorityOffset: 80,
				matchPattern: '.test',
			});
			const integration = new MockStrategy({
				type: HmrStrategyType.INTEGRATION,
				matchPattern: '.test',
			});

			expect(scriptWithHighOffset.priority).toBeGreaterThan(integration.priority);
		});
	});

	describe('matches', () => {
		it('should be implemented by subclasses', () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.SCRIPT, matchPattern: '.css' });
			expect(strategy.matches('styles.css')).toBe(true);
			expect(strategy.matches('script.js')).toBe(false);
		});
	});

	describe('process', () => {
		it('should return an HmrAction', async () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.SCRIPT });
			const action = await strategy.process('/path/to/file.');

			expect(action.type).toBe('broadcast');
			expect(action.events).toBeDefined();
			expect(action.events?.[0].type).toBe('update');
			expect(action.events?.[0].path).toBe('/path/to/file.');
		});
	});
});
