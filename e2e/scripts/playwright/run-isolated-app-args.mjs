const STRING_FLAGS = {
	'--artifactScope': 'artifactScope',
	'--workspace': 'workspace',
	'--sourceDir': 'sourceDir',
	'--runtime': 'runtime',
	'--mode': 'mode',
	'--port': 'port',
};

function createDefaultOptions() {
	return {
		artifactScope: '',
		mode: 'dev',
		port: '',
		runtime: 'bun',
		sourceDir: '',
		workspace: '',
	};
}

function applyArgvFlag(options, arg, nextValue) {
	if (!Object.hasOwn(STRING_FLAGS, arg)) {
		return false;
	}
	const optionKey = STRING_FLAGS[arg];
	if (!nextValue) {
		return false;
	}

	options[optionKey] = nextValue;
	return true;
}

function assertRequiredFields(options) {
	if (!options.sourceDir || !options.workspace || !options.port) {
		throw new Error('Missing required isolated Playwright app launcher arguments.');
	}
}

function assertSupportedMode(options) {
	if (!['dev', 'preview'].includes(options.mode)) {
		throw new Error(`Unsupported isolated app mode: ${options.mode}`);
	}
}

function assertSupportedRuntime(options) {
	if (!['bun', 'node'].includes(options.runtime)) {
		throw new Error(`Unsupported isolated app runtime: ${options.runtime}`);
	}
}

function parsePort(portValue) {
	const port = Number(portValue);
	if (!Number.isInteger(port) || port <= 0) {
		throw new Error(`Invalid isolated app port: ${portValue}`);
	}

	return port;
}

export function parseArgs(argv) {
	const options = createDefaultOptions();

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const nextValue = argv[index + 1];

		if (applyArgvFlag(options, arg, nextValue)) {
			index += 1;
		}
	}

	assertRequiredFields(options);
	assertSupportedMode(options);
	assertSupportedRuntime(options);

	return {
		...options,
		artifactScope: options.artifactScope || options.workspace,
		port: parsePort(options.port),
	};
}
