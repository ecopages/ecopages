/**
 * Whether the child has already exited, by exit code or by signal.
 *
 * @remarks
 * A child killed by a signal has `exitCode === null` and a set `signalCode`, so checking the exit code alone
 * reads a finished child as still running.
 */
export function hasProcessExited(childProcess) {
	return childProcess.exitCode !== null || childProcess.signalCode !== null;
}

/**
 * Resolves with `{ code, signal }` once the child has exited.
 *
 * @remarks
 * The result is always an object so callers can tell an exit from a timeout marker such as `null`, even when
 * the child died of a signal and `code` is `null`.
 */
export function waitForProcessExit(childProcess) {
	return new Promise((resolve) => {
		if (hasProcessExited(childProcess)) {
			resolve({ code: childProcess.exitCode, signal: childProcess.signalCode });
			return;
		}

		childProcess.once('exit', (code, signal) => resolve({ code, signal }));
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
		if (hasProcessExited(childProcess)) {
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
			if (hasProcessExited(childProcess)) {
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

export async function stopChildProcess(childProcess, timeoutMs = 5_000) {
	if (hasProcessExited(childProcess)) {
		return;
	}

	childProcess.kill('SIGTERM');

	let timer;
	const exited = await Promise.race([
		waitForProcessExit(childProcess),
		new Promise((resolve) => {
			timer = setTimeout(() => resolve(null), timeoutMs);
		}),
	]);
	clearTimeout(timer);

	if (exited === null) {
		childProcess.kill('SIGKILL');
		await waitForProcessExit(childProcess);
	}
}
