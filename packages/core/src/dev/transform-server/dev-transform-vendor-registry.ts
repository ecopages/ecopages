import { createHash } from 'node:crypto';
import path from 'node:path';

import { RESOLVED_ASSETS_VENDORS_DIR } from '../../config/constants.ts';
import { getAppBrowserBuildPlugins } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../plugins/package-specifier.ts';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { formatBuildLog } from '../../build/build-log.ts';

const BROWSER_FIRST_VENDOR_CONDITIONS = ['browser', 'module', 'import', 'default'] as const;
const MODULE_FIRST_VENDOR_CONDITIONS = ['module', 'import', 'default'] as const;
const BROWSER_NODE_BUILTIN_GUARD_MARKER = '[browser-build] Node builtin';

type VendorEntry = {
	url: string;
	content: string;
};

function getVendorBundleConditions(specifier: string): readonly string[] {
	return toPackageRootSpecifier(specifier) === '@ecopages/core'
		? BROWSER_FIRST_VENDOR_CONDITIONS
		: MODULE_FIRST_VENDOR_CONDITIONS;
}

export type DevTransformVendorRegistryOptions = {
	appConfig: EcoPagesAppConfig;
	resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
};

/**
 * Lazily prebundles bare npm imports into process-local `/assets/vendors/*` chunks.
 */
export class DevTransformVendorRegistry {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
	private readonly cache = new Map<string, VendorEntry>();
	private readonly inFlight = new Map<string, Promise<VendorEntry>>();

	constructor(options: DevTransformVendorRegistryOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.resolveVendorBundlePlugins = options.resolveVendorBundlePlugins;
	}

	async resolveVendorUrl(specifier: string): Promise<string> {
		const cached = this.cache.get(specifier);
		if (cached) {
			return cached.url;
		}

		const pending = this.inFlight.get(specifier);
		if (pending) {
			return (await pending).url;
		}

		const promise: Promise<VendorEntry> = this.prebundleSpecifier(specifier)
			.then((entry) => {
				if (this.inFlight.get(specifier) === promise) {
					this.cache.set(specifier, entry);
				}
				return entry;
			})
			.finally(() => {
				if (this.inFlight.get(specifier) === promise) {
					this.inFlight.delete(specifier);
				}
			});
		this.inFlight.set(specifier, promise);
		return (await promise).url;
	}

	/**
	 * @remarks
	 * Responses carry `no-cache` and a content `ETag`, so browsers revalidate each
	 * load and get `304` while `ifNoneMatch` still matches the in-memory bundle.
	 */
	tryHandleVendorRequest(pathname: string, ifNoneMatch?: string | null): Response | null {
		const prefix = `/${RESOLVED_ASSETS_VENDORS_DIR}/`;
		if (!pathname.startsWith(prefix)) {
			return null;
		}

		const fileName = pathname.slice(prefix.length);
		if (!fileName || fileName.includes('..')) {
			return null;
		}

		const entry = [...this.cache.values()].find((cachedEntry) => cachedEntry.url === pathname);
		return entry ? this.createVendorResponse(entry, ifNoneMatch) : null;
	}

	invalidateAll(): void {
		this.cache.clear();
		this.inFlight.clear();
	}

	private createVendorResponse(entry: VendorEntry, ifNoneMatch?: string | null): Response {
		const etag = `"${createHash('sha256').update(entry.content).digest('hex').slice(0, 16)}"`;

		const headers = { 'Cache-Control': 'no-cache', ETag: etag };
		if (matchesIfNoneMatch(ifNoneMatch, etag)) {
			return new Response(null, { status: 304, headers });
		}

		return new Response(entry.content, {
			headers: { ...headers, 'Content-Type': 'application/javascript' },
		});
	}

	private async prebundleSpecifier(specifier: string): Promise<VendorEntry> {
		const resolvedEntry = this.resolvePackageEntry(specifier);
		const fileName = `${sanitizeSpecifierForFileName(specifier)}.${hashVendorSpecifier(specifier)}.js`;
		const url = `/${RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;

		const vendorPlugins = this.resolveVendorBundlePlugins ? await this.resolveVendorBundlePlugins() : [];
		const result = await this.browserBundleService.bundle({
			profile: 'browser-script',
			entrypoints: [resolvedEntry.path],
			outdir: path.join(this.appConfig.absolutePaths.workDir, 'vendor-memory'),
			naming: fileName,
			writeToDisk: false,
			minify: false,
			externalPackages: false,
			treeshaking: true,
			splitting: false,
			conditions: [...getVendorBundleConditions(specifier)],
			excludeAppBuildPlugins: getAppBrowserBuildPlugins(this.appConfig).map((plugin) => plugin.name),
			plugins: [...vendorPlugins],
		});

		if (!result.success) {
			const details = result.logs.map(formatBuildLog).join('\n');
			throw new Error(formatVendorPrebundleError(specifier, details));
		}

		const output = result.outputs.find((candidate) => typeof candidate.content === 'string');
		if (!output || typeof output.content !== 'string') {
			throw new Error(`[dev-transform] Vendor prebundle produced no in-memory JavaScript for ${specifier}`);
		}
		return { url, content: output.content };
	}

	private resolvePackageEntry(specifier: string): { path: string } {
		const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier);
		if (!resolved) {
			throw new Error(`[dev-transform] Unable to resolve bare import "${specifier}" for vendor prebundle`);
		}

		return { path: resolved.path };
	}
}

function formatVendorPrebundleError(specifier: string, details: string): string {
	if (details.includes(BROWSER_NODE_BUILTIN_GUARD_MARKER)) {
		return (
			`[dev-transform] Bare import "${specifier}" resolved to a server-only entry. ` +
			`Import a browser subpath or register the package in the browser runtime manifest.` +
			(details ? `\n${details}` : '')
		);
	}

	return details
		? `[dev-transform] Vendor prebundle failed for ${specifier}:\n${details}`
		: `[dev-transform] Vendor prebundle failed for ${specifier}`;
}

function sanitizeSpecifierForFileName(specifier: string): string {
	return specifier.replaceAll(/^@/gu, '').replaceAll(/[/:@]/gu, '-');
}

function hashVendorSpecifier(specifier: string): string {
	return createHash('sha256').update(specifier).digest('hex').slice(0, 8);
}

/**
 * Whether an `If-None-Match` header matches `etag` under the weak comparison of
 * RFC 9110: any listed tag equal to it once `W/` is stripped, or `*`.
 */
function matchesIfNoneMatch(ifNoneMatch: string | null | undefined, etag: string): boolean {
	if (!ifNoneMatch) {
		return false;
	}

	return ifNoneMatch.split(',').some((tag) => {
		const trimmed = tag.trim();
		return trimmed === '*' || trimmed.replace(/^W\//u, '') === etag;
	});
}
