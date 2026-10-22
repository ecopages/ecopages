import { contentHash } from '../../utils/content-hash.ts';
import path from 'node:path';

import { RESOLVED_ASSETS_VENDORS_DIR } from '../../constants.ts';
import { resolveAppBuildPlugins } from '../../build/runtime/build-request-policy.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import {
	isBarePackageImportSpecifier,
	resolveBarePackageBrowserEntry,
} from '../../plugins/tsconfig-import-resolver.ts';
import { toPackageRootSpecifier } from '../../plugins/package-specifier.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { assertBuildSucceeded } from '../../build/build-log.ts';

const BROWSER_FIRST_VENDOR_CONDITIONS = ['browser', 'module', 'import', 'default'] as const;
const MODULE_FIRST_VENDOR_CONDITIONS = ['module', 'import', 'default'] as const;
const BROWSER_NODE_BUILTIN_GUARD_MARKER = '[browser-build] Node builtin';

type VendorEntry = {
	url: string;
	content: string;
};

/** One vendor bundle, keyed by the resolved entry file of the package it bundles. */
type VendorRecord = {
	specifier: string;
	entryPath: string;
	url: string;
	build: Promise<VendorEntry>;
	entry?: VendorEntry;
	error?: unknown;
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
 *
 * @remarks
 * A vendor bundle keeps the ESM imports of other packages external and points them at those packages' own
 * vendor URLs, so a package shared by several vendors, such as a framework core, loads once in the browser
 * and keeps one module identity. `require()` calls stay bundled, since a vendor URL is an ES module that
 * `require()` cannot load.
 */
export class DevTransformVendorRegistry {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly resolveVendorBundlePlugins?: () => Promise<readonly EcoBuildPlugin[]>;
	private records = new Map<string, VendorRecord>();
	private recordsByUrl = new Map<string, VendorRecord>();

	constructor(options: DevTransformVendorRegistryOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.resolveVendorBundlePlugins = options.resolveVendorBundlePlugins;
	}

	async resolveVendorUrl(specifier: string): Promise<string> {
		const entryPath = this.resolvePackageEntry(specifier, this.appConfig.rootDir);
		const record = this.ensureVendor(specifier, entryPath);
		await record.build;
		return record.url;
	}

	/**
	 * @remarks
	 * A vendor that another vendor references may still be building when the browser asks for it, so the
	 * request waits for that build. Responses carry `no-cache` and a content `ETag`, so browsers revalidate
	 * each load and get `304` while `ifNoneMatch` still matches the in-memory bundle.
	 */
	async tryHandleVendorRequest(pathname: string, ifNoneMatch?: string | null): Promise<Response | null> {
		if (!pathname.startsWith(`/${RESOLVED_ASSETS_VENDORS_DIR}/`)) {
			return null;
		}

		const record = this.recordsByUrl.get(pathname);
		if (!record) {
			return null;
		}

		try {
			return this.createVendorResponse(await record.build, ifNoneMatch);
		} catch (error) {
			return new Response(error instanceof Error ? error.message : String(error), {
				status: 500,
				headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
			});
		}
	}

	invalidateAll(): void {
		this.records = new Map();
		this.recordsByUrl = new Map();
	}

	/**
	 * Returns the record for a package entry, starting its build when no build exists yet.
	 *
	 * @remarks
	 * The build is not awaited here: two vendors that import each other would otherwise wait on each other.
	 * Failures are kept on the record and reported to whoever awaits the build or requests the URL.
	 */
	private ensureVendor(specifier: string, entryPath: string): VendorRecord {
		const existing = this.records.get(entryPath);
		if (existing) {
			return existing;
		}

		const records = this.records;
		const record: VendorRecord = {
			specifier,
			entryPath,
			url: `/${RESOLVED_ASSETS_VENDORS_DIR}/${sanitizeSpecifierForFileName(specifier)}.${contentHash(entryPath, 8)}.js`,
			build: Promise.resolve(undefined as unknown as VendorEntry),
		};
		record.build = this.prebundle(record).then(
			(entry) => {
				if (this.records === records) record.entry = entry;
				return entry;
			},
			(error: unknown) => {
				record.error = error;
				throw error;
			},
		);
		record.build.catch(() => {});

		this.records.set(entryPath, record);
		this.recordsByUrl.set(record.url, record);
		return record;
	}

	private createVendorResponse(entry: VendorEntry, ifNoneMatch?: string | null): Response {
		const etag = `"${contentHash(entry.content, 16)}"`;

		const headers = { 'Cache-Control': 'no-cache', ETag: etag };
		if (matchesIfNoneMatch(ifNoneMatch, etag)) {
			return new Response(null, { status: 304, headers });
		}

		return new Response(entry.content, {
			headers: { ...headers, 'Content-Type': 'application/javascript' },
		});
	}

	private async prebundle(record: VendorRecord): Promise<VendorEntry> {
		const vendorPlugins = this.resolveVendorBundlePlugins ? await this.resolveVendorBundlePlugins() : [];
		const result = await this.browserBundleService.bundle({
			lane: 'build',
			entrypoints: [record.entryPath],
			outdir: path.join(this.appConfig.absolutePaths.workDir, 'vendor-memory'),
			naming: path.basename(record.url),
			writeToDisk: false,
			minify: false,
			externalPackages: false,
			treeshaking: true,
			splitting: false,
			conditions: [...getVendorBundleConditions(record.specifier)],
			excludeAppBuildPlugins: resolveAppBuildPlugins(this.appConfig, 'browser').map((plugin) => plugin.name),
			plugins: [...vendorPlugins, this.createSharedPackagePlugin(record)],
		});

		assertBuildSucceeded(result, (details) => formatVendorPrebundleError(record.specifier, details));

		const output = result.outputs.find((candidate) => typeof candidate.content === 'string');
		if (!output || typeof output.content !== 'string') {
			throw new Error(
				`[dev-transform] Vendor prebundle produced no in-memory JavaScript for ${record.specifier}`,
			);
		}
		return { url: record.url, content: output.content };
	}

	/**
	 * Points the ESM imports of other packages inside one vendor bundle at those packages' vendor URLs.
	 *
	 * @remarks
	 * It runs after the vendor plugins, so a specifier the browser runtime manifest owns keeps the manifest's
	 * URL. Each dependency resolves from its importer, where a strict install places it.
	 */
	private createSharedPackagePlugin(record: VendorRecord): EcoBuildPlugin {
		return {
			name: 'ecopages-dev-vendor-shared-packages',
			environments: ['browser'],
			setup: (build) => {
				build.onResolve({ filter: /.*/u }, (args) => {
					if (!args.importer || args.namespace) return undefined;
					if (args.kind !== 'import-statement' && args.kind !== 'dynamic-import') return undefined;
					if (!isBarePackageImportSpecifier(args.path)) return undefined;

					const dependency = resolveBarePackageBrowserEntry(
						this.appConfig.rootDir,
						args.path,
						path.dirname(args.importer),
					);
					if (!dependency || dependency.path === record.entryPath) return undefined;

					return { path: this.ensureVendor(args.path, dependency.path).url, external: true };
				});
			},
		};
	}

	private resolvePackageEntry(specifier: string, fromDirectory: string): string {
		const resolved = resolveBarePackageBrowserEntry(this.appConfig.rootDir, specifier, fromDirectory);
		if (!resolved) {
			throw new Error(`[dev-transform] Unable to resolve bare import "${specifier}" for vendor prebundle`);
		}

		return resolved.path;
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
