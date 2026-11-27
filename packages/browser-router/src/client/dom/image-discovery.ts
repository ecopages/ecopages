/**
 * Discovery of the images a page marks as critical, for navigation prefetch.
 * @module
 */

/** One `<source>` of a `<picture>` that wraps a critical image, or a preload that names a type or a media query. */
export interface PriorityImageSource {
	srcset: string;
	sizes?: string;
	media?: string;
	type?: string;
}

/**
 * An image to warm, with every URL resolved against the document it came from.
 *
 * @remarks
 * A candidate list is kept as `srcset` and `sizes`, not collapsed to one URL, so the browser picks the
 * candidate for the viewport and pixel density of this device, as it will for the real page.
 */
export interface PriorityImage {
	src?: string;
	srcset?: string;
	sizes?: string;
	sources: PriorityImageSource[];
	crossOrigin: string | null;
	/**
	 * Identity of the request the image makes, used to warm it once.
	 *
	 * @remarks
	 * A preload link and the `<img>` it hints share a key when they name the same candidates, sizes and
	 * cross-origin mode, so that one image does not use two of the slots.
	 */
	key: string;
}

const ASCII_WHITESPACE = /[\t\n\f\r ]/;

/**
 * Resolves each URL of a `srcset` value against `baseUrl`, keeping its descriptors.
 *
 * @remarks
 * Follows the candidate grammar of the HTML standard: a URL is a run of non-whitespace characters, so it may
 * contain commas, and trailing commas belong to the separator. The detached image that warms a candidate list
 * resolves against the live document, not against the incoming page, so the URLs are made absolute first.
 * `data:` and `blob:` candidates stay as they are, since they cost no request and dropping them would change
 * which candidate the browser selects; a candidate with another scheme is dropped.
 */
export function resolveSrcset(srcset: string, baseUrl: string): string {
	const candidates: string[] = [];
	let position = 0;

	while (position < srcset.length) {
		while (position < srcset.length && (srcset[position] === ',' || ASCII_WHITESPACE.test(srcset[position]!))) {
			position++;
		}
		if (position >= srcset.length) break;

		let urlEnd = position;
		while (urlEnd < srcset.length && !ASCII_WHITESPACE.test(srcset[urlEnd]!)) urlEnd++;
		let url = srcset.slice(position, urlEnd);
		position = urlEnd;

		let descriptor = '';
		if (url.endsWith(',')) {
			url = url.replace(/,+$/, '');
		} else {
			const descriptorEnd = srcset.indexOf(',', position);
			const end = descriptorEnd === -1 ? srcset.length : descriptorEnd;
			descriptor = srcset.slice(position, end).trim();
			position = end;
		}

		const resolved = resolveUrl(url, baseUrl, true);
		if (resolved) candidates.push(descriptor ? `${resolved} ${descriptor}` : resolved);
	}

	return candidates.join(', ');
}

/**
 * Resolves `value` against `baseUrl` when it names something worth warming: an `http(s)` URL, or, in a
 * candidate list, an inline `data:` or `blob:` URL that only exists to take part in the selection.
 */
function resolveUrl(value: string | null | undefined, baseUrl: string, allowInline: boolean): string | null {
	if (!value) return null;
	try {
		const url = new URL(value, baseUrl);
		const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
		const isInline = url.protocol === 'data:' || url.protocol === 'blob:';
		return isHttp || (allowInline && isInline) ? url.href : null;
	} catch {
		return null;
	}
}

function readAttribute(element: Element, name: string): string | undefined {
	return element.getAttribute(name) ?? undefined;
}

function describeImage(image: Omit<PriorityImage, 'key'>): PriorityImage | null {
	const hasCandidates = Boolean(image.src || image.srcset || image.sources.some((source) => source.srcset));
	if (!hasCandidates) return null;

	const key = JSON.stringify([image.src, image.srcset, image.sizes, image.crossOrigin, image.sources]);
	return { ...image, key };
}

/**
 * Returns the `<source>` elements of the picture around `image` that come before it, which are the only ones
 * the browser considers.
 */
function readPictureSources(image: HTMLImageElement): PriorityImageSource[] {
	if (image.parentElement?.localName !== 'picture') return [];

	const sources: PriorityImageSource[] = [];
	for (let sibling = image.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
		if (sibling.localName !== 'source') continue;
		const srcset = resolveSrcset(sibling.getAttribute('srcset') ?? '', image.baseURI);
		if (!srcset) continue;
		sources.unshift({
			srcset,
			sizes: readAttribute(sibling, 'sizes'),
			media: readAttribute(sibling, 'media'),
			type: readAttribute(sibling, 'type'),
		});
	}
	return sources;
}

/**
 * Describes an image preload.
 *
 * @remarks
 * A preload that names a `media` query or a `type` is described as a picture source with no fallback, so the
 * browser skips it on a viewport the query does not match and for a format it cannot decode, as it does for
 * the preload itself.
 */
function describePreload(link: HTMLLinkElement): PriorityImage | null {
	const srcset = resolveSrcset(link.getAttribute('imagesrcset') ?? '', link.baseURI);
	const src = resolveUrl(link.getAttribute('href'), link.baseURI, false) ?? undefined;
	const sizes = readAttribute(link, 'imagesizes');
	const media = readAttribute(link, 'media');
	const type = readAttribute(link, 'type');
	const crossOrigin = link.getAttribute('crossorigin');

	if (media || type) {
		const candidates = srcset || src;
		if (!candidates) return null;
		return describeImage({ sources: [{ srcset: candidates, sizes, media, type }], crossOrigin });
	}

	return describeImage({ src, srcset: srcset || undefined, sizes, sources: [], crossOrigin });
}

/**
 * Returns the images `doc` marks as critical, at most `limit`: head preloads first, then body images, each in
 * document order.
 *
 * @remarks
 * Critical means `<img fetchpriority="high">` in the body, or `<link rel="preload" as="image">` in the head:
 * the page author has already named these as the ones the first paint waits for. Lazy and unmarked images
 * are never returned, and neither is an image inside `<noscript>`, which a script-less parse exposes but a
 * browser with scripting does not render. Images with no usable URL are skipped, and an image that repeats
 * an earlier one counts once.
 */
export function discoverPriorityImages(doc: Document, limit: number): PriorityImage[] {
	const discovered = new Map<string, PriorityImage>();

	const add = (image: PriorityImage | null) => {
		if (image && discovered.size < limit && !discovered.has(image.key)) discovered.set(image.key, image);
	};

	for (const link of doc.head.querySelectorAll<HTMLLinkElement>('link[rel~="preload" i][as="image" i]')) {
		add(describePreload(link));
	}

	for (const image of doc.body.querySelectorAll<HTMLImageElement>(
		'img[fetchpriority="high" i]:not([loading="lazy" i])',
	)) {
		if (image.closest('noscript')) continue;

		const srcset = resolveSrcset(image.getAttribute('srcset') ?? '', image.baseURI);
		add(
			describeImage({
				src: resolveUrl(image.getAttribute('src'), image.baseURI, false) ?? undefined,
				srcset: srcset || undefined,
				sizes: readAttribute(image, 'sizes'),
				sources: readPictureSources(image),
				crossOrigin: image.getAttribute('crossorigin'),
			}),
		);
	}

	return [...discovered.values()];
}

/**
 * Starts loading `image` at low priority into a detached element, so the HTTP cache holds it when the page
 * that uses it renders.
 *
 * @remarks
 * A detached `Image` is used instead of a `<link rel="preload">` because a preload that the current page does
 * not consume makes the browser warn that it was preloaded but not used. The browser keeps the element alive
 * while its request is pending, and nothing holds it afterwards. Rejects when the image fails to load.
 */
export function warmPriorityImage(image: PriorityImage): Promise<void> {
	return new Promise((resolve, reject) => {
		const element = new Image();
		if (image.crossOrigin !== null) element.crossOrigin = image.crossOrigin;
		element.fetchPriority = 'low';
		element.decoding = 'async';
		element.onload = () => resolve();
		element.onerror = () => reject(new Error(`Could not warm ${image.src ?? image.srcset ?? 'an image'}`));

		if (image.sources.length > 0) {
			const picture = document.createElement('picture');
			for (const descriptor of image.sources) {
				const source = document.createElement('source');
				source.srcset = descriptor.srcset;
				if (descriptor.sizes !== undefined) source.sizes = descriptor.sizes;
				if (descriptor.media !== undefined) source.media = descriptor.media;
				if (descriptor.type !== undefined) source.type = descriptor.type;
				picture.append(source);
			}
			picture.append(element);
		}

		if (image.sizes !== undefined) element.sizes = image.sizes;
		if (image.srcset) element.srcset = image.srcset;
		if (image.src) element.src = image.src;
	});
}
