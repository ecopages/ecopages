import { hashString } from '../../../hash.ts';

export type Random = () => number;

/** Mulberry32: a small seeded generator, so the same seed always yields the same sequence. */
export function createRandom(seed: string): Random {
	let state = hashString(seed);
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function pick<T>(items: readonly T[], random: Random): T {
	return items[Math.floor(random() * items.length)]!;
}

/** A shuffled copy of `items` (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
	}
	return copy;
}
