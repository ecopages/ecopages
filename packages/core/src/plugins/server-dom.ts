/**
 * Process-wide server DOM installation for Integrations that render custom elements.
 *
 * @remarks
 * Lit and Radiant each need constructors on `globalThis`. Installing a complete
 * surface after an incomplete one replaces `customElements` and drops defined
 * elements. Core therefore runs every configured `complete` installer, then
 * every `repair`, before Integration `setup()` continues. Config order does not
 * change the result. Installers must be idempotent and must not replace an
 * existing custom element registry.
 */

export type ServerDomSurfaceKind = 'complete' | 'repair';

export type ServerDomInstaller = {
	kind: ServerDomSurfaceKind;
	install: () => void | Promise<void>;
};

export type ServerDomContributor = {
	serverDom?: ServerDomInstaller;
};

let tail: Promise<void> = Promise.resolve();

/**
 * Installs the configured server DOM surfaces, serializing concurrent callers.
 *
 * @remarks
 * Complete surfaces run first, then repairs, regardless of Integration order.
 * Each caller runs its own installers after the previous pass, so a second app
 * that starts while the first is still installing is not skipped. Installers
 * must be idempotent and must not replace an existing custom element registry.
 */
export async function installConfiguredServerDom(integrations: ReadonlyArray<ServerDomContributor>): Promise<void> {
	const run = tail.then(() => runInstallers(integrations));
	tail = run.then(
		() => undefined,
		() => undefined,
	);
	await run;
}

async function runInstallers(integrations: ReadonlyArray<ServerDomContributor>): Promise<void> {
	const installers = integrations
		.map((integration) => integration.serverDom)
		.filter((installer): installer is ServerDomInstaller => installer !== undefined);
	const complete = installers.filter((installer) => installer.kind === 'complete');
	const repair = installers.filter((installer) => installer.kind !== 'complete');

	for (const installer of [...complete, ...repair]) {
		await installer.install();
	}
}
