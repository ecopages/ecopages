import { buildDomPath, resolveDomPath } from './dom-path.ts';

export type A11yIssue = {
	id: string;
	message: string;
	severity: 'warning' | 'error';
	element: Element;
	source: 'axe' | 'builtin';
	targetSelector: string;
	/** Stable child-index path for re-resolving the audited node. */
	domPath: number[];
	/** Index within `querySelectorAll(targetSelector)` when the selector matches multiple nodes. */
	matchIndex: number;
};

export type A11yIssueView = Omit<A11yIssue, 'element'>;

const AXE_RUN_TIMEOUT_MS = 15_000;
const AXE_EXCLUDE_SELECTORS = ['eco-dev-toolbar', '.eco-dev-toolbar__panel-shell'] as const;

let axeRunLock: Promise<void> = Promise.resolve();

function buildCssSelector(element: Element, doc: Document): string {
	if (element.id) {
		const idSelector = `#${CSS.escape(element.id)}`;
		try {
			if (doc.querySelectorAll(idSelector).length === 1) {
				return idSelector;
			}
		} catch {
			// fall through to a structural selector when the id selector is invalid or duplicated
		}
	}

	const segments: string[] = [];
	let current: Element | null = element;

	while (current && current !== current.ownerDocument.documentElement) {
		let segment = current.tagName.toLowerCase();
		const parent: Element | null = current.parentElement;

		if (parent) {
			const siblings = [...parent.children].filter((child) => child.tagName === current!.tagName);
			if (siblings.length > 1) {
				segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
			}
		}

		segments.unshift(segment);
		current = parent;
	}

	return segments.join(' > ');
}

function attachDomTarget(
	doc: Document,
	element: Element,
	targetSelector: string,
): Pick<A11yIssue, 'targetSelector' | 'domPath' | 'matchIndex'> {
	const domPath = buildDomPath(element);
	let matchIndex = 0;

	try {
		const matches = [...doc.querySelectorAll(targetSelector)].filter(
			(candidate) => !candidate.closest('eco-dev-toolbar'),
		);
		const index = matches.indexOf(element);
		if (index >= 0) {
			matchIndex = index;
		}
	} catch {
		// keep the default match index
	}

	return { targetSelector, domPath, matchIndex };
}

export function toA11yIssueView(issue: A11yIssue): A11yIssueView {
	const { element: _element, ...view } = issue;
	return view;
}

/**
 * Re-resolves the DOM node for a cached audit row.
 *
 * @remarks Prefers {@link A11yIssueView.domPath} because selectors can match multiple nodes (for example duplicate ids).
 */
export function resolveA11yIssueElement(
	doc: Document,
	issue: Pick<A11yIssueView, 'targetSelector' | 'domPath' | 'matchIndex'>,
): Element | null {
	if (issue.domPath.length > 0) {
		const fromPath = resolveDomPath(doc, issue.domPath);
		if (fromPath instanceof Element && !fromPath.closest('eco-dev-toolbar')) {
			return fromPath;
		}
	}

	const selectors = issue.targetSelector
		.split(',')
		.map((selector) => selector.trim())
		.filter((selector) => selector.length > 0);

	const candidates = [issue.targetSelector, ...selectors];

	for (const selector of candidates) {
		try {
			const matches = [...doc.querySelectorAll(selector)].filter(
				(candidate) => !candidate.closest('eco-dev-toolbar'),
			);
			if (matches.length === 0) {
				continue;
			}

			const matchIndex = issue.matchIndex ?? 0;
			return matches[matchIndex] ?? matches[0] ?? null;
		} catch {
			continue;
		}
	}

	return null;
}

export function runBuiltinChecks(doc: Document): A11yIssue[] {
	const issues: A11yIssue[] = [];
	const ids = new Map<string, Element>();

	for (const image of doc.querySelectorAll('img')) {
		if (image.closest('eco-dev-toolbar')) {
			continue;
		}

		if (!image.getAttribute('alt')?.trim()) {
			const targetSelector = buildCssSelector(image, doc);
			issues.push({
				id: 'img-alt',
				message: 'Image is missing alt text',
				severity: 'error',
				element: image,
				source: 'builtin',
				...attachDomTarget(doc, image, targetSelector),
			});
		}
	}

	for (const input of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
		'input, textarea, select',
	)) {
		if (input.closest('eco-dev-toolbar')) {
			continue;
		}

		const type = input instanceof HTMLInputElement ? input.type : 'text';
		if (type === 'hidden') {
			continue;
		}
		const hasLabel = Boolean(
			input.labels?.length || input.getAttribute('aria-label') || input.getAttribute('aria-labelledby'),
		);
		if (!hasLabel) {
			const targetSelector = buildCssSelector(input, doc);
			issues.push({
				id: 'form-label',
				message: 'Form control is missing an accessible label',
				severity: 'error',
				element: input,
				source: 'builtin',
				...attachDomTarget(doc, input, targetSelector),
			});
		}
	}

	let previousHeading = 0;
	for (const heading of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
		if (heading.closest('eco-dev-toolbar')) {
			continue;
		}

		const level = Number.parseInt(heading.tagName.slice(1), 10);
		if (previousHeading > 0 && level - previousHeading > 1) {
			const targetSelector = buildCssSelector(heading, doc);
			issues.push({
				id: 'heading-order',
				message: `Heading level skips from h${previousHeading} to h${level}`,
				severity: 'warning',
				element: heading,
				source: 'builtin',
				...attachDomTarget(doc, heading, targetSelector),
			});
		}
		previousHeading = level;
	}

	for (const element of doc.querySelectorAll('[id]')) {
		if (element.closest('eco-dev-toolbar')) {
			continue;
		}

		const id = element.id;
		if (!id) {
			continue;
		}
		const existing = ids.get(id);
		if (existing) {
			const targetSelector = buildCssSelector(element, doc);
			issues.push({
				id: 'duplicate-id',
				message: `Duplicate id "${id}"`,
				severity: 'error',
				element: element,
				source: 'builtin',
				...attachDomTarget(doc, element, targetSelector),
			});
		} else {
			ids.set(id, element);
		}
	}

	return issues;
}

function mapAxeImpact(impact: string | null | undefined): A11yIssue['severity'] {
	if (impact === 'critical' || impact === 'serious') {
		return 'error';
	}
	return 'warning';
}

function resolveAxeTarget(doc: Document, target: string | readonly string[]): Element | null {
	const selector = Array.isArray(target) ? target.join(' ') : String(target);
	if (!selector) {
		return null;
	}

	try {
		return doc.querySelector(selector);
	} catch {
		return null;
	}
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_resolve, reject) => {
			globalThis.setTimeout(() => {
				reject(new Error(`${label}-timeout`));
			}, timeoutMs);
		}),
	]);
}

async function withAxeRunLock<T>(run: () => Promise<T>): Promise<T> {
	const previous = axeRunLock;
	let releaseLock!: () => void;
	axeRunLock = new Promise<void>((resolve) => {
		releaseLock = resolve;
	});

	await previous;

	try {
		return await run();
	} finally {
		releaseLock();
	}
}

async function runAxeChecks(doc: Document): Promise<A11yIssue[]> {
	return withAxeRunLock(async () => {
		const axeModule = await import('axe-core');
		const axe = axeModule.default;
		type AxeResults = import('axe-core').AxeResults;
		const runAxe = axe.run as (
			context: Element,
			options: { exclude: string[][]; iframes: boolean },
		) => Promise<AxeResults>;
		const results = await withTimeout(
			runAxe(doc.documentElement, {
				exclude: AXE_EXCLUDE_SELECTORS.map((selector) => [selector]),
				iframes: false,
			}),
			AXE_RUN_TIMEOUT_MS,
			'axe-run',
		);

		const issues: A11yIssue[] = [];
		for (const violation of results.violations) {
			for (const node of violation.nodes) {
				const selector = Array.isArray(node.target) ? node.target.join(' ') : node.target;
				const element = selector ? resolveAxeTarget(doc, selector) : null;
				if (!(element instanceof Element) || element.closest('eco-dev-toolbar')) {
					continue;
				}

				issues.push({
					id: violation.id,
					message: node.failureSummary?.trim() || violation.help,
					severity: mapAxeImpact(violation.impact),
					element,
					source: 'axe',
					...attachDomTarget(doc, element, selector),
				});
			}
		}

		return issues;
	});
}

function issueKey(issue: A11yIssue): string {
	return `${issue.source}:${issue.id}:${issue.domPath.join('.')}`;
}

function dedupeIssues(issues: A11yIssue[]): A11yIssue[] {
	const seen = new Set<string>();
	const result: A11yIssue[] = [];

	for (const issue of issues) {
		const key = issueKey(issue);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(issue);
	}

	return result;
}

/**
 * Yields to the browser so dock clicks and panel switches stay responsive before heavy work.
 */
export function yieldToBrowser(): Promise<void> {
	return new Promise((resolve) => {
		globalThis.requestAnimationFrame(() => {
			globalThis.setTimeout(resolve, 0);
		});
	});
}

/**
 * Runs built-in checks immediately, then axe-core after yielding to the browser.
 */
export async function runA11yChecks(doc: Document, onBuiltin?: (issues: A11yIssue[]) => void): Promise<A11yIssue[]> {
	const builtinIssues = runBuiltinChecks(doc);
	onBuiltin?.(builtinIssues);

	await yieldToBrowser();

	let axeIssues: A11yIssue[] = [];
	try {
		axeIssues = await runAxeChecks(doc);
	} catch {
		return builtinIssues;
	}

	if (axeIssues.length === 0) {
		return builtinIssues;
	}

	const extraBuiltin = builtinIssues.filter(
		(issue) => !axeIssues.some((axeIssue) => axeIssue.element === issue.element && axeIssue.id === issue.id),
	);

	return dedupeIssues([...axeIssues, ...extraBuiltin]);
}
