import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../../config/constants.ts';
import { getAppBrowserBuildPlugins } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../plugins/package-specifier.ts';
import { resolveRuntimeSpecifierPublicPath } from '../../build/browser/browser-runtime-manifest.ts';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

const BROWSER_FIRST_VENDOR_CONDITIONS = ['browser', 'module', 'import', 'default'] as const;
const MODULE_FIRST_VENDOR_CONDITIONS = ['module', 'import', 'default'] as const;
const BROWSER_NODE_BUILTIN_GUARD_MARKER = '[browser-build] Node builtin';

type VendorEntry = {
	url: string;
	filePath: string;
};

type ResolvedVendorEntry = { path: string; packageJsonPath?: string };

function getVendorBundleConditions(specifier: string): readonly string[] {
	return toPackageRootSpecifier(specifier) === '@ecopages/core'
		? BROWSER_FIRST_VENDOR_CONDITIONS
		: MODULE_FIRST_VENDOR_CONDITIONS;
}

export type DevTransformVendorRegistryOptions = {
	appConfig: EcoPagesAppConfig;
	getRuntimeSpecifierMap: () => ReadonlyMap<string, string>;
	resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
};

/**
 * Lazily prebundles bare npm imports into cacheable `/assets/vendors/*` chunks.
 */
export class DevTransformVendorRegistry {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly getRuntimeSpecifierMap: () => ReadonlyMap<string, string>;
	private readonly resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
	private readonly vendorsDir: string;
	private readonly cache = new Map<string, VendorEntry>();
	private readonly inFlight = new Map<string, Promise<VendorEntry>>();
	private readonly etags = new Map<string, { stamp: string; etag: string }>();

	constructor(options: DevTransformVendorRegistryOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.getRuntimeSpecifierMap = options.getRuntimeSpecifierMap;
		this.resolveVendorBundlePlugins = options.resolveVendorBundlePlugins;
		const distDir = options.appConfig.absolutePaths?.distDir ?? path.join(options.appConfig.rootDir, '.eco');
		this.vendorsDir = path.join(distDir, RESOLVED_ASSETS_VENDORS_DIR);
	}

	resolveKnownVendorUrl(specifier: string): string | undefined {
		return resolveRuntimeSpecifierPublicPath(specifier, this.getRuntimeSpecifierMap());
	}

	async resolveVendorUrl(specifier: string): Promise<string> {
		const known = this.resolveKnownVendorUrl(specifier);
		if (known && this.resolveExistingVendorPath(known)) {
			return known;
		}

		const cached = this.cache.get(specifier);
		if (cached) {
			return cached.url;
		}

		const pending = this.inFlight.get(specifier);
		if (pending) {
			return (await pending).url;
		}

		const promise = this.prebundleSpecifier(specifier).finally(() => {
			this.inFlight.delete(specifier);
		});
		this.inFlight.set(specifier, promise);
		return (await promise).url;
	}

	/**
	 * @remarks
	 * Responses carry `no-cache` and a content `ETag`, so browsers revalidate vendor
	 * files each load and get `304` while `ifNoneMatch` still matches the file on disk.
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

		const filePath = path.join(this.vendorsDir, fileName);
		if (!fileSystem.exists(filePath)) {
			for (const entry of this.cache.values()) {
				if (entry.url === pathname && fileSystem.exists(entry.filePath)) {
					return this.createVendorResponse(entry.filePath, ifNoneMatch);
				}
			}
			return null;
		}

		return this.createVendorResponse(filePath, ifNoneMatch);
	}

	invalidateAll(): void {
		this.cache.clear();
		this.inFlight.clear();
	}

	private createVendorResponse(filePath: string, ifNoneMatch?: string | null): Response {
		const { mtimeMs, size } = statSync(filePath);
		const stamp = `${mtimeMs}:${size}`;
		const cached = this.etags.get(filePath);
		let body: string | undefined;
		let etag = cached?.stamp === stamp ? cached.etag : undefined;
		if (!etag) {
			body = fileSystem.readFileSync(filePath);
			etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
			this.etags.set(filePath, { stamp, etag });
		}

		const headers = { 'Cache-Control': 'no-cache', ETag: etag };
		if (matchesIfNoneMatch(ifNoneMatch, etag)) {
			return new Response(null, { status: 304, headers });
		}

		return new Response(body ?? fileSystem.readFileSync(filePath), {
			headers: { ...headers, 'Content-Type': 'application/javascript' },
		});
	}

	private resolveExistingVendorPath(url: string): string | undefined {
		const prefix = `/${RESOLVED_ASSETS_VENDORS_DIR}/`;
		const pathname = new URL(url, 'http://ecopages.local').pathname;
		if (!pathname.startsWith(prefix)) {
			return undefined;
		}

		const fileName = pathname.slice(prefix.length);
		if (!fileName || fileName.includes('..')) {
			return undefined;
		}

		const filePath = path.join(this.vendorsDir, fileName);
		return fileSystem.exists(filePath) ? filePath : undefined;
	}

	private async prebundleSpecifier(specifier: string): Promise<VendorEntry> {
		const resolvedEntry = this.resolvePackageEntry(specifier);
		fileSystem.ensureDir(this.vendorsDir);

		const fileName = `${sanitizeSpecifierForFileName(specifier)}.${hashVendorEntry(specifier, resolvedEntry)}.js`;
		const outPath = path.join(this.vendorsDir, fileName);
		const url = `/${RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;

		if (fileSystem.exists(outPath)) {
			const entry = { url, filePath: outPath };
			this.cache.set(specifier, entry);
			return entry;
		}

		const vendorPlugins = this.resolveVendorBundlePlugins ? await this.resolveVendorBundlePlugins() : [];
		const result = await this.browserBundleService.bundle({
			profile: 'browser-script',
			entrypoints: [resolvedEntry.path],
			outdir: this.vendorsDir,
			naming: fileName,
			minify: false,
			externalPackages: false,
			treeshaking: true,
			splitting: false,
			conditions: [...getVendorBundleConditions(specifier)],
			excludeAppBuildPlugins: getAppBrowserBuildPlugins(this.appConfig).map((plugin) => plugin.name),
			plugins: [...vendorPlugins],
		});

		if (!result.success) {
			const details = result.logs.map((log) => log.message).join('\n');
			throw new Error(formatVendorPrebundleError(specifier, details));
		}

		const outputPath = result.outputs[0]?.path ?? outPath;
		const entry = { url, filePath: outputPath };
		this.cache.set(specifier, entry);
		return entry;
	}

	private resolvePackageEntry(specifier: string): ResolvedVendorEntry {
		const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier);
		if (!resolved) {
			throw new Error(`[dev-transform] Unable to resolve bare import "${specifier}" for vendor prebundle`);
		}

		return resolved;
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

/**
 * @remarks
 * Includes the installed package's `version` because an entry file can stay
 * byte-identical across releases, and a bundle whose name already exists on disk
 * is reused, even after a restart. The manifest is the resolver's package root,
 * so aliased installs (`npm:react@x`) and renamed forks are versioned too.
 */
function hashVendorEntry(specifier: string, entry: ResolvedVendorEntry): string {
	return createHash('sha256')
		.update(specifier)
		.update('\0')
		.update(readPackageVersion(entry.packageJsonPath))
		.update('\0')
		.update(fileSystem.readFileSync(entry.path))
		.digest('hex')
		.slice(0, 8);
}

function readPackageVersion(packageJsonPath: string | undefined): string {
	if (!packageJsonPath) {
		return '';
	}

	const manifest: { version?: unknown } = JSON.parse(fileSystem.readFileSync(packageJsonPath));
	return typeof manifest.version === 'string' ? manifest.version : '';
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
