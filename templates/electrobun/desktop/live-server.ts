export async function startLiveServer(root: string, cli: string, origin: string, port: number) {
	const readinessPath = `/_desktop_ready/${crypto.randomUUID()}`;
	const server = Bun.spawn(['node', cli, 'dev', '--runtime', 'bun'], {
		cwd: root,
		env: { ...process.env, ECOPAGES_PORT: String(port), WORKSPACE_DEV_READY_PATH: readinessPath },
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const stop = () => {
		if (server.exitCode !== null || server.killed) return;
		if (process.platform === 'win32') {
			Bun.spawnSync(['taskkill', '/PID', String(server.pid), '/T', '/F']);
		} else {
			server.kill();
		}
	};
	process.once('exit', stop);

	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline && server.exitCode === null) {
		const response = await fetch(new URL(readinessPath, origin), { signal: AbortSignal.timeout(500) }).catch(
			() => undefined,
		);
		if (response?.status === 204) return stop;
		await Bun.sleep(100);
	}

	stop();
	throw new Error(`The Ecopages development server did not start on ${origin}. Check the server output above.`);
}
