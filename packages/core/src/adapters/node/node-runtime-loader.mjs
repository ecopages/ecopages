import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

console.error('[loader] module loaded');

let mainThreadPort = null;
let requestIdCounter = 0;
const pendingRequests = new Map();

const CSS_IMPORT_PATTERN = /import\s+(?:[^'";]+\s+from\s+)?["'][^"']+\.(?:css|scss|sass|less)["']/;

export function initialize({ port }) {
	console.error('[loader] initialize called, port:', !!port);
	mainThreadPort = port;
	port.on('message', (msg) => {
		console.error('[loader] received response for id:', msg.id);
		const pending = pendingRequests.get(msg.id);
		if (pending) {
			pendingRequests.delete(msg.id);
			pending(msg.result);
		}
	});
	port.unref();
}

function sendRequest(type, payload) {
	if (!mainThreadPort) return Promise.resolve(undefined);
	return new Promise((resolve) => {
		const id = requestIdCounter++;
		console.error('[loader] sendRequest:', type, payload?.specifier || payload?.url);
		pendingRequests.set(id, resolve);
		mainThreadPort.postMessage({ id, type, ...payload });
	});
}

function getScriptLoader(filePath) {
	if (filePath.endsWith('.tsx')) return 'tsx';
	if (filePath.endsWith('.ts') || filePath.endsWith('.mts') || filePath.endsWith('.cts')) return 'ts';
	if (filePath.endsWith('.jsx')) return 'jsx';
	if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'js';
	return undefined;
}

function isTranspilableScriptPath(pathname) {
	return getScriptLoader(pathname) !== undefined;
}

async function transpileScript(filePath) {
	const source = await readFile(filePath, 'utf-8');
	const loader = getScriptLoader(filePath);

	if (!loader) return undefined;
	if (!CSS_IMPORT_PATTERN.test(source)) return undefined;

	const transformed = await transform(source, {
		loader,
		format: 'esm',
		target: 'esnext',
		sourcemap: 'inline',
		sourcefile: filePath,
		tsconfigRaw: {
			compilerOptions: {
				experimentalDecorators: true,
				useDefineForClassFields: false,
			},
		},
	});

	return {
		format: 'module',
		source: transformed.code,
		shortCircuit: true,
	};
}

export async function resolve(specifier, context, nextResolve) {
	const result = await sendRequest('resolve', { specifier, parentURL: context.parentURL });
	if (result) return result;
	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	const result = await sendRequest('load', { url });
	if (result) return result;

	if (url.startsWith('file:')) {
		const filePath = fileURLToPath(url);
		if (isTranspilableScriptPath(filePath)) {
			const transpiled = await transpileScript(filePath);
			if (transpiled) return transpiled;
		}
	}

	return nextLoad(url, context);
}
