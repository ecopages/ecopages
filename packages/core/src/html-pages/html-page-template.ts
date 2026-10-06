import path from 'node:path';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import type { PageMetadataProps, PageRobotsMetadata } from '../types/public-types.ts';
import { escapeHtmlAttribute } from '../utils/html-escaping.ts';
import {
	findElements,
	getAttribute,
	getElementText,
	decodeHtmlEntities,
	HEAD_CONTENT_ELEMENTS,
	parseHtml,
	walkElements,
	type HtmlElementNode,
	type HtmlNode,
} from '../services/html/html-source-parser.ts';

export type HtmlFileAssetKind = 'stylesheet' | 'module-script' | 'classic-script';

type HtmlFileReference = {
	filepath: string;
	/** URL as written, for error messages. */
	reference: string;
	tag: string;
	urlStart: number;
	urlEnd: number;
};

/**
 * A local stylesheet or script tag, a `<style>` block, or a preload hint, that core processes
 * and re-emits where the author wrote it.
 *
 * @remarks
 * `tag` is the original markup. File assets splice their emitted URL over
 * `tag.slice(urlStart, urlEnd)`; inline styles splice processed CSS over
 * `tag.slice(contentStart, contentEnd)`. Every other attribute stays as written.
 * A `preload` (a `rel="preload"` or `rel="modulepreload"` link) is not processed itself: it takes
 * the URL of the file asset with the same file and the kind in `preloads`, or stays as written.
 */
export type HtmlAssetDeclaration =
	| ({ kind: HtmlFileAssetKind } & HtmlFileReference)
	| ({
			kind: 'preload';
			/**
			 * `module-script` for `rel="modulepreload"`, `stylesheet` for `as="style"`,
			 * `classic-script` for `as="script"`; unset for anything else, such as a font.
			 */
			preloads?: HtmlFileAssetKind;
			integrity: boolean;
	  } & HtmlFileReference)
	| {
			kind: 'inline-style';
			content: string;
			tag: string;
			contentStart: number;
			contentEnd: number;
	  };

export type HtmlTemplatePart = string | { asset: number } | { slot: 'children' };

/**
 * One top-level node of a Page `<head>`.
 *
 * @remarks
 * `key` is set only for singleton tags (see {@link getHeadTagKey}); this node
 * replaces the shell tag with the same key.
 */
export type HtmlHeadNode = {
	parts: HtmlTemplatePart[];
	key?: string;
	/** Lowercased encoding of a `<meta charset>`. */
	charset?: string;
};

export type HtmlPageTemplate = {
	kind: 'page';
	file: string;
	assets: HtmlAssetDeclaration[];
	head: HtmlHeadNode[];
	body: HtmlTemplatePart[];
	/** Page `<html>` attributes, with values as written. */
	htmlAttributes: Record<string, string>;
	/** Page `<body>` attributes, with values as written. */
	bodyAttributes: Record<string, string>;
	metadata: Partial<PageMetadataProps>;
};

export type HtmlShellTemplate = {
	kind: 'shell';
	file: string;
	assets: HtmlAssetDeclaration[];
	parts: HtmlTemplatePart[];
};

export type HtmlTemplate = HtmlPageTemplate | HtmlShellTemplate;

export type CompileHtmlTemplateOptions = {
	/** Local assets must resolve inside this directory. */
	srcDir: string;
	/** Receives development warnings for relative URLs core leaves literal. */
	warn?: (message: string) => void;
};

export const CHILDREN_MARKER = 'eco:children';

const CLASSIC_SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript']);

/** Tags whose relative `href` is navigation rather than an asset fetch. */
const NAVIGATION_HREF_TAGS = new Set(['a', 'area', 'base']);

function htmlError(file: string, message: string): Error {
	return new Error(`[ecopages] ${file}: ${message}`);
}

const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

function isRelativeUrl(value: string): boolean {
	const url = value.trim();
	return url.length > 0 && !URL_SCHEME.test(url) && !/^[/#?]/.test(url);
}

/**
 * @remarks
 * Reads `url()` and the string URLs of `image-set()`, and skips comments.
 */
export function findRelativeCssUrls(css: string): string[] {
	const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const urls = [...code.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((match) => match[2]!);
	for (const [, args] of code.matchAll(/image-set\(((?:[^()]|\([^()]*\))*)\)/gi)) {
		const strings = args!.replace(/url\([^)]*\)/gi, '').matchAll(/(['"])(.*?)\1/g);
		urls.push(...[...strings].map((match) => match[2]!));
	}
	return [...new Set(urls)].filter(isRelativeUrl);
}

function attributeValue(element: HtmlElementNode, name: string): string | undefined {
	return getAttribute(element, name)?.value;
}

function relTokens(element: HtmlElementNode): string[] {
	return (attributeValue(element, 'rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

function typeAttribute(element: HtmlElementNode): string {
	return (attributeValue(element, 'type') ?? '').trim().toLowerCase();
}

/**
 * Returns the kind and URL attribute of a stylesheet link, a preload link, or a JavaScript script.
 */
function classifyFileAsset(
	element: HtmlElementNode,
): { kind: HtmlFileAssetKind | 'preload'; urlAttributeName: string } | undefined {
	if (element.tagName === 'link') {
		const rel = relTokens(element);
		if (rel.includes('stylesheet')) return { kind: 'stylesheet', urlAttributeName: 'href' };
		return rel.includes('preload') || rel.includes('modulepreload')
			? { kind: 'preload', urlAttributeName: 'href' }
			: undefined;
	}
	if (element.tagName !== 'script') return undefined;

	const type = typeAttribute(element);
	if (type === 'module') return { kind: 'module-script', urlAttributeName: 'src' };
	return CLASSIC_SCRIPT_TYPES.has(type) ? { kind: 'classic-script', urlAttributeName: 'src' } : undefined;
}

function preloadedKind(element: HtmlElementNode): HtmlFileAssetKind | undefined {
	if (relTokens(element).includes('modulepreload')) return 'module-script';
	const as = attributeValue(element, 'as')?.trim().toLowerCase();
	return as === 'style' ? 'stylesheet' : as === 'script' ? 'classic-script' : undefined;
}

/**
 * Throws when an inline module script imports a relative specifier, statically, by re-export, or
 * by a dynamic `import()` of a string literal.
 *
 * @remarks
 * The error replaces bundling the script: the inline content-script path builds each script
 * alone, from a file outside the source directory, so a relative import would resolve against
 * the wrong directory, and a module it shares with the Page's module scripts would be a second
 * copy that runs again.
 */
function assertNoRelativeImport(file: string, content: string): void {
	const { module } = parseModuleSource(`${file}.inline-module.js`, content);
	const specifiers = [
		...module.staticImports.map((entry) => entry.moduleRequest.value),
		...module.staticExports.flatMap((entry) =>
			entry.entries.map((exported) => exported.moduleRequest?.value ?? ''),
		),
		...module.dynamicImports.map(
			({ moduleRequest }) =>
				/^(['"`])([^'"`$]*)\1$/.exec(content.slice(moduleRequest.start, moduleRequest.end))?.[2] ?? '',
		),
	];
	const specifier = specifiers.find((candidate) => /^\.{1,2}\//.test(candidate));
	if (specifier) {
		throw htmlError(
			file,
			`an inline <script type="module"> imports "${specifier}", which the browser would resolve against the route URL. Move the code to a file and load it with <script type="module" src="...">, so it is built with the Page's other module scripts.`,
		);
	}
}

/**
 * Classifies one element as a processed asset tag.
 *
 * @remarks
 * Returns `undefined` for tags that stay literal: external and root-relative
 * URLs, inline scripts, and scripts with a non-JavaScript `type`.
 */
function readAssetDeclaration(
	source: string,
	element: HtmlElementNode,
	file: string,
	options: CompileHtmlTemplateOptions,
): HtmlAssetDeclaration | undefined {
	const tag = source.slice(element.start, element.end);

	if (element.tagName === 'style') {
		const type = typeAttribute(element);
		if (type !== '' && type !== 'text/css') return undefined;
		return {
			kind: 'inline-style',
			content: getElementText(source, element),
			tag,
			contentStart: element.startTagEnd - element.start,
			contentEnd: element.contentEnd - element.start,
		};
	}

	const fileAsset = classifyFileAsset(element);
	const urlAttribute = fileAsset && getAttribute(element, fileAsset.urlAttributeName);
	if (fileAsset?.kind === 'module-script' && !urlAttribute) {
		assertNoRelativeImport(file, getElementText(source, element));
	}
	if (!fileAsset || !urlAttribute || !isRelativeUrl(urlAttribute.value)) return undefined;

	const reference = urlAttribute.value.trim();
	const filepath = path.resolve(path.dirname(file), reference.replace(/[?#].*$/, ''));
	const fileReference: HtmlFileReference = {
		filepath,
		reference,
		tag,
		urlStart: urlAttribute.valueStart - element.start,
		urlEnd: urlAttribute.valueEnd - element.start,
	};
	if (fileAsset.kind === 'preload') {
		return {
			kind: 'preload',
			preloads: preloadedKind(element),
			integrity: getAttribute(element, 'integrity') !== undefined,
			...fileReference,
		};
	}

	if (getAttribute(element, 'integrity')) {
		throw htmlError(
			file,
			`<${element.tagName} ${fileAsset.urlAttributeName}="${urlAttribute.value}"> has an integrity attribute, but core rewrites local assets so the digest would no longer match. Remove the attribute.`,
		);
	}

	const relativeToSrc = path.relative(options.srcDir, filepath);
	if (relativeToSrc.startsWith('..') || path.isAbsolute(relativeToSrc)) {
		throw htmlError(file, `"${reference}" resolves outside the source directory (${options.srcDir}).`);
	}

	return { kind: fileAsset.kind, ...fileReference };
}

type FetchedUrls = (element: HtmlElementNode, value: string) => string[];

const srcsetUrls: FetchedUrls = (_element, value) =>
	value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0] ?? '');
const urlValue: FetchedUrls = (_element, value) => [value];

/**
 * @remarks
 * `href` is skipped on preload links, which the renderer checks against the files the Page
 * processes.
 */
const hrefUrls: FetchedUrls = (element, value) =>
	NAVIGATION_HREF_TAGS.has(element.tagName) || classifyFileAsset(element)?.kind === 'preload' ? [] : [value];

/** The URLs each attribute makes the browser fetch, by attribute name. */
const FETCHED_URLS = new Map<string, FetchedUrls>([
	['src', urlValue],
	['poster', urlValue],
	['srcset', srcsetUrls],
	['imagesrcset', srcsetUrls],
	['href', hrefUrls],
	['xlink:href', hrefUrls],
	['data', (element, value) => (element.tagName === 'object' ? [value] : [])],
	['style', (_element, value) => findRelativeCssUrls(value)],
]);

const SOCIAL_IMAGE_KEY = /^meta:(og:image(?::url|:secure_url)?|twitter:image(?::src)?)$/;

/**
 * @remarks
 * Link preview crawlers need an absolute URL, so a root-relative value is warned about too.
 */
function warnSocialImage(element: HtmlElementNode, file: string, warn: (message: string) => void): void {
	const key = SOCIAL_IMAGE_KEY.exec(getHeadTagKey(element) ?? '');
	const content = attributeValue(element, 'content')?.trim();
	if (key && content && !URL_SCHEME.test(content)) {
		const attribute = getAttribute(element, 'property') ? 'property' : 'name';
		warn(
			`${file}: content="${content}" on <meta ${attribute}="${key[1]}"> is not an absolute URL, so link previews cannot load the image. Use an absolute URL, such as https://example.com/og.png.`,
		);
	}
}

function warnRelativeUrls(element: HtmlElementNode, file: string, options: CompileHtmlTemplateOptions): void {
	if (!options.warn) return;
	if (element.tagName === 'meta') warnSocialImage(element, file, options.warn);

	for (const attribute of element.attributes) {
		if (FETCHED_URLS.get(attribute.name)?.(element, attribute.value).some(isRelativeUrl)) {
			options.warn(
				`${file}: relative ${attribute.name}="${attribute.value}" on <${element.tagName}> is left as written, so the browser resolves it against the route URL. Move the file to the public directory and use a root-relative URL.`,
			);
		}
	}
}

type TemplateRange = { start: number; end: number; part?: HtmlTemplatePart };

/**
 * Collects processed asset tags and warns about relative URLs on the rest.
 */
function collectAssets(
	source: string,
	nodes: readonly HtmlNode[],
	file: string,
	options: CompileHtmlTemplateOptions,
): { assets: HtmlAssetDeclaration[]; ranges: TemplateRange[] } {
	const assets: HtmlAssetDeclaration[] = [];
	const ranges: TemplateRange[] = [];

	walkElements(nodes, (element) => {
		const asset = readAssetDeclaration(source, element, file, options);
		if (asset) {
			ranges.push({ start: element.start, end: element.end, part: { asset: assets.length } });
			assets.push(asset);
			if (asset.kind !== 'preload') return;
		}
		warnRelativeUrls(element, file, options);
	});

	return { assets, ranges };
}

/**
 * Slices `[from, to)` into template parts, dropping skipped ranges and
 * replacing asset and slot ranges with their part.
 *
 * @remarks
 * Ranges never overlap partially: a range is either outside `[from, to)`,
 * inside it, or nested in an earlier skipped range.
 */
function sliceParts(source: string, from: number, to: number, ranges: readonly TemplateRange[]): HtmlTemplatePart[] {
	const parts: HtmlTemplatePart[] = [];
	const pushText = (text: string) => {
		const last = parts.length - 1;
		if (typeof parts[last] === 'string') parts[last] += text;
		else if (text) parts.push(text);
	};
	let cursor = from;

	for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
		if (range.start < cursor || range.end > to) continue;
		pushText(source.slice(cursor, range.start));
		if (range.part) parts.push(range.part);
		cursor = range.end;
	}

	pushText(source.slice(cursor, to));
	return parts;
}

function trimParts(parts: HtmlTemplatePart[]): HtmlTemplatePart[] {
	const first = parts[0];
	if (typeof first === 'string') parts[0] = first.trimStart();
	const last = parts[parts.length - 1];
	if (typeof last === 'string') parts[parts.length - 1] = last.trimEnd();
	return parts.filter((part) => part !== '');
}

/**
 * Returns attribute values as written, so character references reach the output unchanged.
 */
function readRawAttributes(element: HtmlElementNode | undefined): Record<string, string> {
	return Object.fromEntries(element?.attributes.map((attribute) => [attribute.name, attribute.rawValue]) ?? []);
}

function topLevelElement(nodes: readonly HtmlNode[], tagName: string): HtmlElementNode | undefined {
	return nodes.find((node): node is HtmlElementNode => node.type === 'element' && node.tagName === tagName);
}

function startTagRange(element: HtmlElementNode): TemplateRange {
	return { start: element.start, end: element.startTagEnd };
}

function endTagRange(element: HtmlElementNode): TemplateRange {
	return { start: element.contentEnd, end: element.end };
}

/**
 * Returns the singleton identity of a head tag, if it has one.
 *
 * @remarks
 * Keys are `title`, `base`, `charset`, `meta:<value>` and `link:canonical`. A `<meta>` is keyed
 * `meta:<value>` from the first of `name`, `property` and `http-equiv` it has, in that order, lowercased,
 * so `<meta property="twitter:title">` and `<meta name="twitter:title">` are the same tag.
 */
export function getHeadTagKey(element: HtmlElementNode): string | undefined {
	switch (element.tagName) {
		case 'title':
		case 'base':
			return element.tagName;
		case 'meta': {
			if (getAttribute(element, 'charset')) return 'charset';
			for (const name of ['name', 'property', 'http-equiv']) {
				const value = attributeValue(element, name);
				if (value) return `meta:${value.trim().toLowerCase()}`;
			}
			return undefined;
		}
		case 'link':
			return relTokens(element).includes('canonical') ? 'link:canonical' : undefined;
		default:
			return undefined;
	}
}

function parseRobots(content: string): PageRobotsMetadata {
	const directives = new Set(
		content
			.toLowerCase()
			.split(',')
			.map((directive) => directive.trim()),
	);
	const none = directives.has('none');
	return {
		index: !(none || directives.has('noindex')),
		follow: !(none || directives.has('nofollow')),
		...(directives.has('nocache') ? { nocache: true } : {}),
	};
}

type MetadataReader = (element: HtmlElementNode, source: string, metadata: Partial<PageMetadataProps>) => void;

function withContent(read: (content: string, metadata: Partial<PageMetadataProps>) => void): MetadataReader {
	return (element, _source, metadata) => {
		const content = attributeValue(element, 'content')?.trim();
		if (content !== undefined) read(content, metadata);
	};
}

/** Page head tags that feed `PageMetadataProps`, keyed by {@link getHeadTagKey}. */
const METADATA_READERS: Record<string, MetadataReader> = {
	title: (element, source, metadata) => {
		metadata.title = decodeHtmlEntities(getElementText(source, element)).trim();
	},
	'link:canonical': (element, _source, metadata) => {
		const href = attributeValue(element, 'href')?.trim();
		if (href) metadata.url = href;
	},
	'meta:description': withContent((content, metadata) => {
		metadata.description = content;
	}),
	'meta:keywords': withContent((content, metadata) => {
		metadata.keywords = content
			.split(',')
			.map((keyword) => keyword.trim())
			.filter(Boolean);
	}),
	'meta:og:image': withContent((content, metadata) => {
		metadata.image = content;
	}),
	'meta:robots': withContent((content, metadata) => {
		metadata.robots = parseRobots(content);
	}),
};

/**
 * Open Graph and Twitter tags an HTML Page derives from its own `<title>` and description.
 *
 * @remarks
 * A shell holds one set of these values, so without them every Page would repeat its title
 * and description in four more tags. A tag the Page writes itself wins, and a derived tag
 * replaces the shell's tag with the same value in place, whichever attribute either one uses.
 */
const SOCIAL_TAGS = [
	{ attribute: 'property', name: 'og:title', field: 'title' },
	{ attribute: 'property', name: 'og:description', field: 'description' },
	{ attribute: 'name', name: 'twitter:title', field: 'title' },
	{ attribute: 'name', name: 'twitter:description', field: 'description' },
] as const;

function deriveSocialTags(head: readonly HtmlHeadNode[], metadata: Partial<PageMetadataProps>): HtmlHeadNode[] {
	const written = new Set(head.map((node) => node.key));
	return SOCIAL_TAGS.flatMap(({ attribute, name, field }) => {
		const key = `meta:${name}`;
		const value = metadata[field];
		if (!value || written.has(key)) return [];
		return [{ parts: [`<meta ${attribute}="${name}" content="${escapeHtmlAttribute(value)}">`], key }];
	});
}

function readHeadMetadata(source: string, headChildren: readonly HtmlElementNode[]): Partial<PageMetadataProps> {
	const metadata: Partial<PageMetadataProps> = {};
	for (const element of headChildren) {
		const key = getHeadTagKey(element);
		if (key) METADATA_READERS[key]?.(element, source, metadata);
	}
	return metadata;
}

/**
 * Returns the leading head-content elements of a Page that has no `<head>` element.
 *
 * @remarks
 * Follows the HTML parsing rules for an omitted `<head>`: the doctype, whitespace and comments are skipped,
 * and the first other element or text ends the head. `<noscript>` also ends it: with scripting off, a
 * browser keeps only link, style and meta in a head `<noscript>`, and a leading one usually holds body
 * content.
 */
function implicitHeadElements(source: string, nodes: readonly HtmlNode[]): HtmlElementNode[] {
	const elements: HtmlElementNode[] = [];
	for (const node of nodes) {
		if (node.type === 'doctype' || node.type === 'comment') continue;
		if (node.type === 'text' && source.slice(node.start, node.end).trim() === '') continue;
		if (node.type !== 'element' || node.tagName === 'noscript' || !HEAD_CONTENT_ELEMENTS.has(node.tagName)) break;
		elements.push(node);
	}
	return elements;
}

/**
 * Compiles one HTML Page file.
 *
 * @remarks
 * A Page may be a body fragment, a `<head>` followed by body markup, or a full
 * document. Without a `<head>`, the leading head-content elements (`<title>`, `<meta>`,
 * `<link>` and the like) form the head. The doctype and the `<html>`, `<head>`, and `<body>` wrappers are
 * never emitted: head children and wrapper attributes are reconciled onto the
 * Html shell after rendering, and everything else becomes the body markup.
 *
 * @throws When the file has more than one `<head>`, or a processed asset tag has
 * an `integrity` attribute or resolves outside `options.srcDir`.
 */
export function compileHtmlPage(file: string, source: string, options: CompileHtmlTemplateOptions): HtmlPageTemplate {
	const nodes = parseHtml(source);
	const heads = findElements(nodes, (element) => element.tagName === 'head');
	if (heads.length > 1) {
		throw htmlError(file, 'an HTML Page may contain only one <head> element.');
	}

	const head = heads[0];
	const html = topLevelElement(nodes, 'html');
	const body = findElements(html?.children ?? nodes, (element) => element.tagName === 'body')[0];
	const implicitHead = head ? [] : implicitHeadElements(source, html?.children ?? nodes);
	const { assets, ranges } = collectAssets(source, nodes, file, options);

	const bodyRanges: TemplateRange[] = [
		...ranges.filter((range) => !implicitHead.some((element) => element.start === range.start)),
		...nodes.filter((node) => node.type === 'doctype').map(({ start, end }) => ({ start, end })),
		...(head ? [{ start: head.start, end: head.end }] : []),
		...implicitHead.map(({ start, end }) => ({ start, end })),
		...(html ? [startTagRange(html), endTagRange(html)] : []),
		...(body ? [startTagRange(body), endTagRange(body)] : []),
	];

	const headChildren = (head?.children ?? implicitHead).filter(
		(node) => node.type !== 'text' || source.slice(node.start, node.end).trim() !== '',
	);
	const headElements = headChildren.filter((node): node is HtmlElementNode => node.type === 'element');
	const metadata = readHeadMetadata(source, headElements);
	const headNodes: HtmlHeadNode[] = headChildren.map((node) => {
		const element = node.type === 'element' ? node : undefined;
		const key = element ? getHeadTagKey(element) : undefined;
		const charset =
			element && key === 'charset' ? attributeValue(element, 'charset')?.trim().toLowerCase() : undefined;
		return {
			parts: sliceParts(source, node.start, node.end, ranges),
			...(key ? { key } : {}),
			...(charset ? { charset } : {}),
		};
	});

	return {
		kind: 'page',
		file,
		assets,
		head: [...headNodes, ...deriveSocialTags(headNodes, metadata)],
		body: trimParts(sliceParts(source, 0, source.length, bodyRanges)),
		htmlAttributes: readRawAttributes(html),
		bodyAttributes: readRawAttributes(body),
		metadata,
	};
}

/**
 * Compiles an authored `src/includes/html.html` (or the built-in) Html shell.
 *
 * @throws When the shell lacks an `<html>` element with `<head>` and `<body>`,
 * has anything but exactly one children marker, or has an invalid asset tag as
 * described for {@link compileHtmlPage}.
 */
export function compileHtmlShell(file: string, source: string, options: CompileHtmlTemplateOptions): HtmlShellTemplate {
	const nodes = parseHtml(source);
	const html = topLevelElement(nodes, 'html');
	const hasHead = html && findElements(html.children, (element) => element.tagName === 'head').length > 0;
	const hasBody = html && findElements(html.children, (element) => element.tagName === 'body').length > 0;
	if (!html || !hasHead || !hasBody) {
		throw htmlError(file, 'the HTML template must contain an <html> element with <head> and <body>.');
	}

	const markers: HtmlNode[] = [];
	const visitComments = (children: readonly HtmlNode[]) => {
		for (const node of children) {
			if (node.type === 'comment' && source.slice(node.start + 4, node.end - 3).trim() === CHILDREN_MARKER) {
				markers.push(node);
			} else if (node.type === 'element') {
				visitComments(node.children);
			}
		}
	};
	visitComments(nodes);
	if (markers.length !== 1) {
		throw htmlError(
			file,
			`the HTML template must contain exactly one <!-- ${CHILDREN_MARKER} --> marker; found ${markers.length}.`,
		);
	}

	const { assets, ranges } = collectAssets(source, nodes, file, options);
	const shellRanges: TemplateRange[] = [
		...ranges,
		...nodes.filter((node) => node.type === 'doctype').map(({ start, end }) => ({ start, end })),
		{ start: markers[0]!.start, end: markers[0]!.end, part: { slot: 'children' } },
	];

	return {
		kind: 'shell',
		file,
		assets,
		parts: trimParts(sliceParts(source, 0, source.length, shellRanges)),
	};
}

/**
 * Returns the local files a template's processed tags read.
 */
export function getHtmlTemplateWatchFiles(template: HtmlTemplate): string[] {
	return [
		...new Set(
			template.assets.flatMap((asset) =>
				asset.kind === 'inline-style' || asset.kind === 'preload' ? [] : [asset.filepath],
			),
		),
	];
}

/**
 * Returns the dedupe key of a processed file asset; inline styles and preload hints never dedupe.
 */
export function getHtmlAssetKey(asset: HtmlAssetDeclaration): string | undefined {
	return asset.kind === 'inline-style' || asset.kind === 'preload' ? undefined : `${asset.kind}:${asset.filepath}`;
}
