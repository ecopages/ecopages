import { createHash } from 'node:crypto';
import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { RESOLVED_ASSETS_VENDORS_DIR } from '../../config/constants.ts';
import { getAppBrowserBuildPlugins } from '../../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

const BROWSER_VENDOR_CONDITIONS = ['browser', 'module', 'import', 'default'] as const;
const BROWSER_NODE_BUILTIN_GUARD_MARKER = '[browser-build] Node builtin';

type VendorEntry = {
	url: string;
	filePath: string;
};

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

	constructor(options: DevTransformVendorRegistryOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.getRuntimeSpecifierMap = options.getRuntimeSpecifierMap;
		this.resolveVendorBundlePlugins = options.resolveVendorBundlePlugins;
		const distDir = options.appConfig.absolutePaths?.distDir ?? path.join(options.appConfig.rootDir, '.eco');
		this.vendorsDir = path.join(distDir, RESOLVED_ASSETS_VENDORS_DIR);
	}

	resolveKnownVendorUrl(specifier: string): string | undefined {
		return this.getRuntimeSpecifierMap().get(specifier);
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

	tryHandleVendorRequest(pathname: string): Response | null {
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
					return this.createVendorResponse(entry.filePath);
				}
			}
			return null;
		}

		return this.createVendorResponse(filePath);
	}

	invalidateAll(): void {
		this.cache.clear();
		this.inFlight.clear();
	}

	private createVendorResponse(filePath: string): Response {
		return new Response(fileSystem.readFileSync(filePath), {
			headers: {
				'Content-Type': 'application/javascript',
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
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
			entrypoints: [resolvedEntry],
			outdir: this.vendorsDir,
			naming: fileName,
			minify: false,
			externalPackages: false,
			treeshaking: true,
			splitting: false,
			conditions: [...BROWSER_VENDOR_CONDITIONS],
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

	private resolvePackageEntry(specifier: string): string {
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

function hashVendorEntry(specifier: string, entryPath: string): string {
	return createHash('sha256')
		.update(specifier)
		.update('\0')
		.update(fileSystem.readFileSync(entryPath))
		.digest('hex')
		.slice(0, 8);
}
