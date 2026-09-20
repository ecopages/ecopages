export function waitForProcessExit(childProcess) {
	return new Promise((resolve) => {
		if (childProcess.exitCode !== null) {
			resolve(childProcess.exitCode);
			return;
		}

		childProcess.once('exit', (code) => resolve(code));
	});
}

export function attachProcessOutput(childProcess) {
	const output = [];

	const record = (chunk) => {
		output.push(String(chunk));
	};

	childProcess.stdout.on('data', record);
	childProcess.stderr.on('data', record);

	return {
		getOutput() {
			return output.join('');
		},
	};
}

export async function waitForHttpReady(baseUrl, childProcess, output, timeoutMs = 120_000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (childProcess.exitCode !== null) {
			throw new Error(
				`Dev server exited before becoming ready (code=${childProcess.exitCode})\n${output.getOutput()}`,
			);
		}

		try {
			const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(2_000) });
			if (response.status < 500) {
				return;
			}
		} catch (error) {
			if (childProcess.exitCode !== null) {
				throw new Error(
					`Dev server exited before becoming ready (code=${childProcess.exitCode})\n${output.getOutput()}`,
				);
			}

			if (!(error instanceof Error) || error.name !== 'TimeoutError') {
				// Retry until the deadline; connection errors are expected while booting.
			}
		}

		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	throw new Error(`Timed out waiting for dev server HTTP ready at ${baseUrl}\n${output.getOutput()}`);
}

export async function stopChildProcess(childProcess) {
	if (childProcess.exitCode !== null) {
		return;
	}

	childProcess.kill('SIGTERM');

	const exited = await Promise.race([
		waitForProcessExit(childProcess),
		new Promise((resolve) => setTimeout(() => resolve(null), 5_000)),
	]);

	if (exited === null) {
		childProcess.kill('SIGKILL');
		await waitForProcessExit(childProcess);
	}
}
