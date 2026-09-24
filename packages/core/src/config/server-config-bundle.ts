import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { build, getAppBuildAdapter } from '../build/build-adapter.ts';
import type { BuildResult } from '../build/contracts/build-contracts.ts';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import { createServerBuildRequest } from '../build/runtime/build-request-policy.ts';
import { requireBuildRuntime } from '../build/runtime/build-runtime.ts';
import type { EcoSourceTransform } from '../plugins/source-transform.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getServerBundleOutputPaths } from '../build/cache/server-entry-build-cache.ts';

export const EMITTED_ECO_CONFIG_FILENAME = 'eco.config.mjs';

export interface BundleEcoConfigModuleResult {
	emittedConfigPath: string;
	buildResult: BuildResult;
}

type AstNode = {
	type?: string;
	start?: number;
	end?: number;
	name?: string;
	[key: string]: unknown;
};

type SourceEdit = {
	start: number;
	end: number;
	replacement: string;
};

function isAstNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null;
}

function walkAst(value: unknown, visit: (node: AstNode) => void): void {
	if (Array.isArray(value)) {
		for (const child of value) walkAst(child, visit);
		return;
	}
	if (!isAstNode(value)) return;

	visit(value);
	for (const child of Object.values(value)) walkAst(child, visit);
}

function isImportMeta(node: unknown): boolean {
	if (!isAstNode(node) || node.type !== 'MetaProperty') return false;
	return (
		isAstNode(node.meta) &&
		node.meta.type === 'Identifier' &&
		node.meta.name === 'import' &&
		isAstNode(node.property) &&
		node.property.type === 'Identifier' &&
		node.property.name === 'meta'
	);
}

function collectImportMetaEdits(
	code: string,
	id: string,
	serverOutdir: string,
): {
	edits: SourceEdit[];
	needsNodePath: boolean;
	pathBinding: string;
} {
	const program = parseModuleSource(id, code, { sourceType: 'module' }).program as unknown as AstNode;
	const fileDir = path.dirname(id);
	const relativeDir = path.relative(serverOutdir, fileDir).replaceAll('\\', '/');
	const relativeFile = relativeDir ? `${relativeDir}/${path.basename(id)}` : `./${path.basename(id)}`;
	const edits: SourceEdit[] = [];
	let needsNodePath = false;
	const identifiers = new Set<string>();
	walkAst(program, (node) => {
		if (node.type === 'Identifier' && typeof node.name === 'string') identifiers.add(node.name);
	});
	let pathBinding = '__ecoConfigPath';
	while (identifiers.has(pathBinding)) pathBinding = `_${pathBinding}`;

	walkAst(program, (node) => {
		if (node.type !== 'MemberExpression' && node.type !== 'StaticMemberExpression') return;
		if (!isImportMeta(node.object) || !isAstNode(node.property) || node.property.type !== 'Identifier') return;
		if (typeof node.start !== 'number' || typeof node.end !== 'number') return;

		if (node.property.name === 'dirname' || node.property.name === 'dir') {
			needsNodePath = true;
			edits.push({
				start: node.start,
				end: node.end,
				replacement: `${pathBinding}.resolve(import.meta.dirname, ${JSON.stringify(relativeDir || '.')})`,
			});
			return;
		}

		if (node.property.name === 'url') {
			edits.push({
				start: node.start,
				end: node.end,
				replacement: `new URL(${JSON.stringify(relativeFile)}, import.meta.url).href`,
			});
		}
	});

	return { edits, needsNodePath, pathBinding };
}

function applySourceEdits(code: string, edits: SourceEdit[]): string {
	let transformed = code;
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		transformed = `${transformed.slice(0, edit.start)}${edit.replacement}${transformed.slice(edit.end)}`;
	}
	return transformed;
}

/**
 * Creates a source transform that preserves source module directory semantics
 * when `eco.config.ts` is relocated into `dist/.server/eco.config.mjs`.
 */
export function createPreserveImportMetaTransform(serverOutdir: string): EcoSourceTransform {
	return {
		name: 'preserve-import-meta-for-server-config',
		filter: /\.[cm]?[jt]sx?$/,
		transform(code, id) {
			if (!code.includes('import.meta')) {
				return undefined;
			}

			const { edits, needsNodePath, pathBinding } = collectImportMetaEdits(code, id, serverOutdir);
			if (edits.length === 0) return undefined;

			const transformed = applySourceEdits(code, edits);
			return {
				code: needsNodePath ? `import * as ${pathBinding} from 'node:path';\n${transformed}` : transformed,
			};
		},
	};
}

/**
 * Compiles the selected Ecopages config module for production server startup.
 */
export async function bundleEcoConfigModule(
	appConfig: EcoPagesAppConfig,
	options: { outputDir?: string; runtimeDir?: string } = {},
): Promise<BundleEcoConfigModuleResult | undefined> {
	const configSourcePath = appConfig.absolutePaths?.config;
	if (!configSourcePath || !fileSystem.exists(configSourcePath)) {
		return undefined;
	}

	const { serverOutdir } = getServerBundleOutputPaths(appConfig);
	const outputDir = options.outputDir ?? serverOutdir;
	const runtimeDir = options.runtimeDir ?? serverOutdir;
	const emittedConfigPath = path.join(outputDir, EMITTED_ECO_CONFIG_FILENAME);
	fileSystem.ensureDir(outputDir);

	const buildOptions = createServerBuildRequest(appConfig, {
		profile: 'server-entry',
		entrypoints: [configSourcePath],
		outdir: outputDir,
		naming: EMITTED_ECO_CONFIG_FILENAME,
		sourcemap: 'hidden',
		sourceTransforms: [createPreserveImportMetaTransform(runtimeDir)],
	});

	const result = await build(buildOptions, requireBuildRuntime(appConfig).getProfile('server-entry'));
	if (!result.success) {
		const errorMessages = result.logs.map((log) => log.message).join('\n');
		throw new Error(`Failed to bundle Ecopages config module:\n${errorMessages}`);
	}

	if (!fileSystem.exists(emittedConfigPath)) {
		throw new Error(`Ecopages config bundle missing at ${emittedConfigPath}`);
	}

	return {
		emittedConfigPath,
		buildResult: result,
	};
}

/**
 * @remarks
 * Ensures build ownership allows app-owned bundling before emitting config artifacts.
 */
export function assertCanBundleServerConfig(appConfig: EcoPagesAppConfig): void {
	const buildAdapter = getAppBuildAdapter(appConfig);
	if (buildAdapter.ownership === 'vite-host') {
		throw new Error(
			'Cannot bundle the server config: build ownership is "vite-host". ' +
				'The host runtime is expected to produce its own server bundle.',
		);
	}
}
