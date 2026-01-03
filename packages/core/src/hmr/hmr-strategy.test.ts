import { describe, expect, it } from 'bun:test';
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
		this.matchPattern = options.matchPattern ?? '.mock';
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

	it('ASSET has value 50', () => {
		expect(HmrStrategyType.ASSET).toBe(50);
	});

	it('SCRIPT has value 25', () => {
		expect(HmrStrategyType.SCRIPT).toBe(25);
	});

	it('FALLBACK has value 0', () => {
		expect(HmrStrategyType.FALLBACK).toBe(0);
	});

	it('maintains priority order: INTEGRATION > ASSET > SCRIPT > FALLBACK', () => {
		expect(HmrStrategyType.INTEGRATION).toBeGreaterThan(HmrStrategyType.ASSET);
		expect(HmrStrategyType.ASSET).toBeGreaterThan(HmrStrategyType.SCRIPT);
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
			const strategy = new MockStrategy({ type: HmrStrategyType.ASSET, priorityOffset: -10 });
			expect(strategy.priority).toBe(40);
		});
	});

	describe('strategy selection by priority', () => {
		it('higher priority strategies are selected first', () => {
			const strategies = [
				new MockStrategy({ type: HmrStrategyType.FALLBACK, matchPattern: '.test' }),
				new MockStrategy({ type: HmrStrategyType.INTEGRATION, matchPattern: '.test' }),
				new MockStrategy({ type: HmrStrategyType.SCRIPT, matchPattern: '.test' }),
				new MockStrategy({ type: HmrStrategyType.ASSET, matchPattern: '.test' }),
			];

			const sorted = [...strategies].sort((a, b) => b.priority - a.priority);

			expect(sorted[0].type).toBe(HmrStrategyType.INTEGRATION);
			expect(sorted[1].type).toBe(HmrStrategyType.ASSET);
			expect(sorted[2].type).toBe(HmrStrategyType.SCRIPT);
			expect(sorted[3].type).toBe(HmrStrategyType.FALLBACK);
		});

		it('priorityOffset can override default ordering', () => {
			const assetWithHighOffset = new MockStrategy({
				type: HmrStrategyType.ASSET,
				priorityOffset: 60,
				matchPattern: '.test',
			});
			const integration = new MockStrategy({
				type: HmrStrategyType.INTEGRATION,
				matchPattern: '.test',
			});

			// Asset (50 + 60 = 110) > Integration (100 + 0 = 100)
			expect(assetWithHighOffset.priority).toBeGreaterThan(integration.priority);
		});
	});

	describe('matches', () => {
		it('should be implemented by subclasses', () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.ASSET, matchPattern: '.css' });
			expect(strategy.matches('styles.css')).toBe(true);
			expect(strategy.matches('script.js')).toBe(false);
		});
	});

	describe('process', () => {
		it('should return an HmrAction', async () => {
			const strategy = new MockStrategy({ type: HmrStrategyType.ASSET });
			const action = await strategy.process('/path/to/file.mock');

			expect(action.type).toBe('broadcast');
			expect(action.events).toBeDefined();
			expect(action.events?.[0].type).toBe('update');
			expect(action.events?.[0].path).toBe('/path/to/file.mock');
		});
	});
});
