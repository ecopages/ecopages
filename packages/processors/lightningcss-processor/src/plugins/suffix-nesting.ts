/**
 * Opt-in Sass-style suffix nesting for the Lightning CSS Processor
 * @module @ecopages/lightningcss-processor/plugins/suffix-nesting
 */

import { tokenizeCss, type CssToken } from '@ecopages/core/processor';
import { StylesheetDiagnosticsError } from '../lightningcss-engine.ts';
import type { LightningCssPlugin } from '../lightningcss-engine.ts';

/** A statement or declaration of a block, as written. */
type TextNode = { kind: 'text'; start: number; end: number };

/** A block: a rule or an at-rule with a body. */
type BlockNode = {
	kind: 'block';
	/** Where the item starts, including the whitespace and comments before its prelude. */
	start: number;
	/** Where the prelude starts and ends (at the `{`). */
	preludeStart: number;
	preludeEnd: number;
	/** The index just after the `{`. */
	bodyStart: number;
	/** The index just after the closing `}`. */
	end: number;
	children: Node[];
};

type Node = TextNode | BlockNode;

/** The rule a hoisted or rewritten block is written out as. */
type RuleParts = {
	/** The text before the prelude: whitespace and comments. */
	leading: string;
	/** The prelude exactly as it is written back, ending where the `{` begins. */
	prelude: string;
	/** The comma separated selectors of the prelude, without comments. */
	entries: string[];
	children: Node[];
};

/** A piece of a rule body in order: what stays in the rule, or a rule that moves after it. */
type BodyPart = { kind: 'body'; text: string } | { kind: 'hoisted'; text: string };

/** The at-rules whose bodies hold rules, so a rule inside them is expanded and a rule nested in a rule keeps working. */
const CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'document']);

/** The pseudo-classes whose selector list is one a suffix can be written in. */
const SELECTOR_LIST_PSEUDOS = new Set(['is', 'where', 'not']);

/** A `&` that spells a suffix: `&--x`, `&__x` or `&-x`. */
type SuffixOccurrence = { start: number; end: number; suffix: string };

const isOpening = (char: string) => char === '(' || char === '[';
const isClosing = (char: string) => char === ')' || char === ']';
const depthAfter = (depth: number, char: string) =>
	isOpening(char) ? depth + 1 : isClosing(char) ? Math.max(0, depth - 1) : depth;

/** The characters that end an item of a block or open and close a block. */
const STRUCTURAL = new Set(['{', ';', '}']);

/** The offset of the first token from the token `from` that is not whitespace or a comment, or `end`. */
function skipTrivia(tokens: readonly CssToken[], from: number, end: number): number {
	for (let index = from; index < tokens.length && tokens[index]!.start < end; index++) {
		const type = tokens[index]!.type;
		if (type !== 'space' && type !== 'comment') return tokens[index]!.start;
	}
	return end;
}

/** What reading a structural character of a block body means for the loop that walks it. */
type Step = 'advance' | 'continue' | 'close' | 'fail';

/** Reads a stylesheet as nested blocks. */
class BlockParser {
	private position = 0;

	constructor(
		private readonly css: string,
		private readonly tokens: readonly CssToken[],
	) {}

	/** The top-level nodes, or `undefined` when the braces do not balance, which Lightning CSS reports. */
	parse(): Node[] | undefined {
		return this.body(false);
	}

	private body(nested: boolean): Node[] | undefined {
		const nodes: Node[] = [];
		const item = { start: this.tokens[this.position]?.start ?? this.css.length, first: this.position };
		let parentheses = 0;
		while (this.position < this.tokens.length) {
			const token = this.tokens[this.position]!;
			const char = token.type === 'punct' ? this.css[token.start]! : '';
			const structural = parentheses === 0 && STRUCTURAL.has(char);
			parentheses = depthAfter(parentheses, char);
			if (structural) {
				const step = this.structural(char, token, nodes, item, nested);
				if (step === 'fail') return undefined;
				if (step === 'close') return nodes;
				if (step === 'continue') continue;
			}
			this.position += 1;
		}
		if (nested) return undefined;
		if (item.start < this.css.length) nodes.push({ kind: 'text', start: item.start, end: this.css.length });
		return nodes;
	}

	private structural(
		char: string,
		token: CssToken,
		nodes: Node[],
		item: { start: number; first: number },
		nested: boolean,
	): Step {
		if (char === ';') {
			nodes.push({ kind: 'text', start: item.start, end: token.end });
			item.start = token.end;
			item.first = this.position + 1;
			return 'advance';
		}
		if (char === '}') {
			if (!nested) return 'fail';
			if (item.start < token.start) nodes.push({ kind: 'text', start: item.start, end: token.start });
			this.position += 1;
			return 'close';
		}
		if (/^--[^\s:]*\s*:/u.test(this.css.slice(item.start, token.start).trimStart())) {
			return this.skipBraces() ? 'advance' : 'fail';
		}
		const preludeStart = skipTrivia(this.tokens, item.first, token.start);
		this.position += 1;
		const children = this.body(true);
		if (!children) return 'fail';
		const end = this.tokens[this.position - 1]!.end;
		nodes.push({
			kind: 'block',
			start: item.start,
			preludeStart,
			preludeEnd: token.start,
			bodyStart: token.end,
			end,
			children,
		});
		item.start = end;
		item.first = this.position;
		return 'continue';
	}

	/** Moves to the `}` that closes the `{` at the current position, which a custom property value holds as text. */
	private skipBraces(): boolean {
		let depth = 0;
		for (; this.position < this.tokens.length; this.position++) {
			const token = this.tokens[this.position]!;
			if (token.type !== 'punct') continue;
			if (this.css[token.start] === '{') depth += 1;
			if (this.css[token.start] === '}' && --depth === 0) return true;
		}
		return false;
	}
}

/** The selectors of a selector list: split at the commas outside parentheses, brackets, strings and comments. */
function splitSelectorList(list: string): string[] {
	const entries: string[] = [];
	let current = '';
	let depth = 0;
	for (const token of tokenizeCss(list)) {
		const text = list.slice(token.start, token.end);
		if (token.type === 'comment') continue;
		if (token.type === 'punct') {
			if (isOpening(text)) depth += 1;
			else if (isClosing(text)) depth = Math.max(0, depth - 1);
			else if (text === ',' && depth === 0) {
				entries.push(current.trim());
				current = '';
				continue;
			}
		}
		current += text;
	}
	entries.push(current.trim());
	return entries;
}

/** Whether the `(` at `index` opens the selector list of `:is()`, `:where()` or `:not()`. */
function opensSelectorList(entry: string, tokens: readonly CssToken[], index: number): boolean {
	const name = tokens[index - 1];
	return (
		entry[tokens[index]!.start] === '(' &&
		name?.type === 'word' &&
		entry[name.start - 1] === ':' &&
		SELECTOR_LIST_PSEUDOS.has(entry.slice(name.start, name.end).toLowerCase())
	);
}

/** The index of the last token of the suffix the `&` at `index` spells, or `undefined` when it spells none. */
function suffixEnd(entry: string, tokens: readonly CssToken[], index: number): number | undefined {
	const first = tokens[index + 1];
	if (first?.type !== 'word' || !/^[-_]/u.test(entry.slice(first.start, first.end))) return undefined;
	let last = index + 1;
	while (tokens[last + 1] && (tokens[last + 1]!.type === 'word' || tokens[last + 1]!.type === 'escape')) last += 1;
	return last;
}

/**
 * The suffixes `entry` spells with a `&`, at the start of a compound selector or inside `:is()`, `:where()` and `:not()`.
 *
 * @remarks
 * A `&` followed by a name that does not start with `-` or `_`, such as `&div`, is not a suffix.
 */
function suffixOccurrences(entry: string): SuffixOccurrence[] {
	const tokens = tokenizeCss(entry);
	const found: SuffixOccurrence[] = [];
	const listed: boolean[] = [];
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]!;
		const char = token.type === 'punct' ? entry[token.start]! : '';
		if (isOpening(char)) listed.push(opensSelectorList(entry, tokens, index));
		else if (isClosing(char)) listed.pop();
		else if (char === '&' && listed.every(Boolean)) {
			const last = suffixEnd(entry, tokens, index);
			if (last === undefined) continue;
			found.push({
				start: token.start,
				end: tokens[last]!.end,
				suffix: entry.slice(token.end, tokens[last]!.end),
			});
			index = last;
		}
	}
	return found;
}

/** Whether `entry` still has a `&` that is not part of a suffix, or sits where a suffix cannot be expanded. */
function hasPlainNesting(entry: string, occurrences: readonly SuffixOccurrence[]): boolean {
	const starts = new Set(occurrences.map((occurrence) => occurrence.start));
	return tokenizeCss(entry).some(
		(token) => token.type === 'punct' && entry[token.start] === '&' && !starts.has(token.start),
	);
}

/** Whether `entry` is one compound selector: no combinator and no whitespace outside parentheses and brackets. */
function isCompound(entry: string): boolean {
	let depth = 0;
	for (const token of tokenizeCss(entry)) {
		const text = entry.slice(token.start, token.end);
		if (token.type === 'punct' && isOpening(text)) depth += 1;
		else if (token.type === 'punct' && isClosing(text)) depth = Math.max(0, depth - 1);
		else if (depth === 0 && (token.type === 'space' || (token.type === 'punct' && '>+~'.includes(text))))
			return false;
	}
	return true;
}

/** Whether a name can be appended to `compound`: its last simple selector is a class, an id, a type or `&`. */
function acceptsSuffix(compound: string): boolean {
	let last: 'name' | 'other' | undefined;
	let depth = 0;
	let first = true;
	for (const token of tokenizeCss(compound)) {
		const text = compound.slice(token.start, token.end);
		if (token.type === 'punct' && isOpening(text)) {
			if (depth === 0 && text === '[') last = 'other';
			depth += 1;
		} else if (token.type === 'punct' && isClosing(text)) {
			depth = Math.max(0, depth - 1);
		} else if (depth === 0) {
			if (token.type === 'punct') last = text === '.' || text === '#' || text === '&' ? 'name' : 'other';
			else if (first) last = 'name';
		}
		first = false;
	}
	return last === 'name';
}

/**
 * Rewrites Sass-style suffix nesting into native nesting.
 *
 * @remarks
 * Every failure is collected and thrown together, so one build names every offending rule.
 */
class SuffixExpander {
	private readonly tokens: CssToken[];
	private readonly lineStarts: number[] = [0];
	readonly errors: string[] = [];

	constructor(
		private readonly css: string,
		private readonly file: string,
	) {
		this.tokens = tokenizeCss(css);
		for (let index = 0; index < css.length; index++) if (css[index] === '\n') this.lineStarts.push(index + 1);
	}

	expand(): string {
		const nodes = new BlockParser(this.css, this.tokens).parse();
		return nodes ? this.renderNodes(nodes, false) : this.css;
	}

	private locate(offset: number): string {
		let line = this.lineStarts.length - 1;
		while (this.lineStarts[line]! > offset) line -= 1;
		return `${this.file}:${line + 1}:${offset - this.lineStarts[line]! + 1}`;
	}

	private fail(offset: number, message: string): void {
		this.errors.push(`${this.locate(offset)} ${message}`);
	}

	private text(node: Node): string {
		return node.kind === 'text' ? this.css.slice(node.start, node.end) : this.raw(node);
	}

	/** A block exactly as written. */
	private raw(node: BlockNode): string {
		return this.css.slice(node.start, node.end);
	}

	private atRuleName(node: BlockNode): string | undefined {
		return /^@([\w-]+)/u.exec(this.css.slice(node.preludeStart, node.preludeEnd))?.[1]?.toLowerCase();
	}

	private isAtRule(node: BlockNode): boolean {
		return this.css[node.preludeStart] === '@';
	}

	private isConditional(node: BlockNode): boolean {
		return CONDITIONAL_AT_RULES.has(this.atRuleName(node) ?? '');
	}

	private parts(node: BlockNode): RuleParts {
		const prelude = this.css.slice(node.preludeStart, node.preludeEnd);
		return {
			leading: this.css.slice(node.start, node.preludeStart),
			prelude,
			entries: splitSelectorList(prelude),
			children: node.children,
		};
	}

	/** The nodes of the top level or of the body of an at-rule, with every rule expanded. */
	private renderNodes(nodes: readonly Node[], nested: boolean): string {
		let output = '';
		for (const node of nodes) {
			if (node.kind === 'text') {
				output += this.text(node);
			} else if (!this.isAtRule(node)) {
				output += this.renderRule(this.parts(node), nested);
			} else if (this.isConditional(node)) {
				output += `${this.css.slice(node.start, node.bodyStart)}${this.renderNodes(node.children, nested)}}`;
			} else {
				output += this.raw(node);
			}
		}
		return output;
	}

	/** A rule followed by the rules moved out of it. */
	private renderRule(rule: RuleParts, nested: boolean): string {
		const parts = this.walkBody(rule.children, rule.entries, nested);
		const head = `${rule.prelude}{`;
		let output = '';
		parts.forEach((part, index) => {
			if (part.kind === 'hoisted') output += part.text;
			else if (index === 0) output += `${rule.leading}${head}${part.text}}`;
			else if (part.text.trim() !== '') output += `\n\n${head}${part.text}}`;
		});
		return output;
	}

	/**
	 * Walks the body of a rule and moves each suffix nesting rule out, after the part of the body that precedes it.
	 *
	 * @remarks
	 * The moved rule sits next to the rule it came from, so it keeps its place in the cascade; the declarations that
	 * follow it stay in the rule, in a second piece, so they still come after it.
	 */
	private walkBody(children: readonly Node[], parents: readonly string[], nested: boolean): BodyPart[] {
		const parts: BodyPart[] = [];
		let current = '';
		const flush = () => {
			parts.push({ kind: 'body', text: current });
			current = '';
		};
		for (const child of children) {
			if (child.kind === 'text') {
				current += this.text(child);
			} else if (this.isAtRule(child)) {
				if (!this.isConditional(child)) {
					current += this.raw(child);
					continue;
				}
				const head = this.css.slice(child.start, child.bodyStart);
				const inner = this.walkBody(child.children, parents, nested);
				inner.forEach((part, index) => {
					if (part.kind === 'body') {
						if (inner.length === 1 || index === 0 || part.text.trim() !== '')
							current += `${index === 0 ? head : `\n\n${head.trimStart()}`}${part.text}}`;
					} else {
						flush();
						parts.push({ kind: 'hoisted', text: `\n\n${head.trimStart()}${part.text}\n}` });
					}
				});
			} else {
				const rule = this.parts(child);
				const found = rule.entries.map(suffixOccurrences);
				const withSuffix = found.filter((occurrences) => occurrences.length > 0).length;
				if (withSuffix === 0) {
					current += this.renderRule(rule, true);
				} else if (withSuffix < rule.entries.length) {
					this.fail(
						child.preludeStart,
						`\`${rule.prelude.trim()}\` mixes suffix nesting with other selectors; give each its own rule.`,
					);
					current += this.raw(child);
				} else {
					const entries = this.expandEntries(child, rule, found, parents, nested);
					if (!entries) {
						current += this.raw(child);
						continue;
					}
					flush();
					const expanded: RuleParts = {
						leading: '\n\n',
						prelude: `${entries.join(', ')} `,
						entries,
						children: rule.children,
					};
					parts.push({ kind: 'hoisted', text: this.renderRule(expanded, nested) });
				}
			}
		}
		flush();
		return parts;
	}

	/** The selectors a suffix nesting rule stands for, or `undefined` after reporting why it cannot be expanded. */
	private expandEntries(
		child: BlockNode,
		rule: RuleParts,
		found: readonly SuffixOccurrence[][],
		parents: readonly string[],
		nested: boolean,
	): string[] | undefined {
		const location = child.preludeStart;
		for (const parent of parents) {
			if (!isCompound(parent)) {
				this.fail(
					location,
					`\`${rule.prelude.trim()}\` cannot be expanded: its parent \`${parent}\` is not a simple compound selector, since it has a combinator or whitespace. Write the full selector instead.`,
				);
				return undefined;
			}
			if (!acceptsSuffix(parent)) {
				this.fail(
					location,
					`\`${rule.prelude.trim()}\` cannot be expanded: a suffix can only follow a class, an id or a type selector, and \`${parent}\` ends in something else. Write the full selector instead.`,
				);
				return undefined;
			}
		}
		const expanded: string[] = [];
		for (const [index, entry] of rule.entries.entries()) {
			const occurrences = found[index]!;
			if (hasPlainNesting(entry, occurrences)) {
				this.fail(location, `\`${entry}\` mixes a suffix with another \`&\`. Write the full selector instead.`);
				return undefined;
			}
			if (nested && occurrences.some((occurrence) => occurrence.start !== 0)) {
				this.fail(
					location,
					`\`${entry}\` writes a suffix away from the start of the selector inside a rule that is itself nested. Write the full selector instead.`,
				);
				return undefined;
			}
			for (const parent of parents) {
				let output = '';
				let from = 0;
				for (const occurrence of occurrences) {
					output += `${entry.slice(from, occurrence.start)}${parent}${occurrence.suffix}`;
					from = occurrence.end;
				}
				expanded.push(`${output}${entry.slice(from)}`);
			}
		}
		return expanded;
	}
}

/**
 * Rewrites Sass-style suffix nesting into native nesting before Lightning CSS parses the stylesheet.
 *
 * @param css - Stylesheet source.
 * @param file - Name of the stylesheet, which the errors carry.
 * @throws StylesheetDiagnosticsError listing every rule that cannot be expanded, with file, line and column.
 */
export function expandSuffixNesting(css: string, file: string): string {
	if (!/&[-_]/u.test(css)) return css;
	const expander = new SuffixExpander(css, file);
	const expanded = expander.expand();
	if (expander.errors.length > 0) throw new StylesheetDiagnosticsError(expander.errors.join('\n'));
	return expanded;
}

/**
 * A plugin for the Lightning CSS Processor that supports Sass-style suffix nesting: `&--x`, `&__x` and `&-x`.
 *
 * @remarks
 * Native CSS nesting cannot concatenate selectors, so Lightning CSS fails a stylesheet that writes `&--primary`. This
 * plugin rewrites each such rule before Lightning CSS parses the stylesheet, into a rule written out with the parent
 * selectors, next to the rule it came from: `.button, a.button { &--primary { ... } }` becomes
 * `.button--primary, a.button--primary { ... }` after `.button, a.button`. Nested rules and pseudo-classes inside it keep
 * working. A parent that is not one compound selector per entry, such as `.card .title`, fails with the file, line and
 * column, instead of a guess.
 *
 * @example
 * ```typescript
 * import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
 * import { suffixNesting } from '@ecopages/lightningcss-processor/plugins/suffix-nesting';
 *
 * lightningCssProcessorPlugin({ plugins: [suffixNesting()] });
 * ```
 */
export function suffixNesting(): LightningCssPlugin {
	return {
		name: 'suffix-nesting',
		transformSource: expandSuffixNesting,
	};
}
