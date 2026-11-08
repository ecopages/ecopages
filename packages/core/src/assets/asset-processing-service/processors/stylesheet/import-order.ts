import { wrapInConditions } from './css-scanner.ts';

/** One inlined `@import`: the stylesheet it names, its inlined CSS (which holds the placeholders of its own `@import`s) and its conditions. */
type ImportOccurrence = { stylesheet: string; css: string; conditions?: string };

const PLACEHOLDER = /\u0000(\d+)\u0000/g;

/**
 * Orders inlined `@import`s the way the cascade does: a stylesheet imported more than once keeps only its last
 * instance, where Lightning CSS and `postcss-import`-style bundlers place it.
 *
 * @remarks
 * Equal-specificity rules cascade by their last occurrence, so an earlier copy of a stylesheet that is imported again
 * later changes nothing except the order of what lies between. The scan cannot know which import is last until it
 * has read the rest, so each inlined `@import` is written as a placeholder, and {@link ImportOrder.resolve} fills in
 * the last instance of each stylesheet and drops the others. A placeholder is a NUL-delimited number, which no CSS
 * source holds.
 */
export class ImportOrder {
	private readonly occurrences: ImportOccurrence[] = [];

	/** Records an inlined `@import` and returns the placeholder that stands for it in the importing CSS. */
	add(stylesheet: string, css: string, conditions?: string): string {
		this.occurrences.push({ stylesheet, css, conditions });
		return `\u0000${this.occurrences.length - 1}\u0000`;
	}

	/** Whether any `@import` was recorded. */
	get isEmpty(): boolean {
		return this.occurrences.length === 0;
	}

	/** Replaces the placeholders in `css` with the last instance of each stylesheet, wrapped in its conditions. */
	resolve(css: string): string {
		const last = new Map<string, number>();
		const visit = (text: string) => {
			for (const match of text.matchAll(PLACEHOLDER)) {
				const id = Number(match[1]);
				const occurrence = this.occurrences[id]!;
				last.set(occurrence.stylesheet, id);
				visit(occurrence.css);
			}
		};
		visit(css);
		const render = (text: string): string =>
			text.replace(PLACEHOLDER, (_, rawId: string) => {
				const id = Number(rawId);
				const occurrence = this.occurrences[id]!;
				if (last.get(occurrence.stylesheet) !== id) return '';
				const inlined = render(occurrence.css);
				return occurrence.conditions ? (wrapInConditions(inlined, occurrence.conditions) ?? inlined) : inlined;
			});
		return render(css);
	}
}
