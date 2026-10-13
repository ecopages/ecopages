/** @jsxImportSource @ecopages/jsx */
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eco } from '@ecopages/core';
import { type JsxRenderable } from '@ecopages/jsx';
import { createTestAppConfig } from '@ecopages/testing';
import { EcopagesJsxShell } from '@ecopages/testing/kitchen-sink/ecopages-jsx-shell';
import { IntegrationShellGroup } from '@ecopages/testing/kitchen-sink/integration-shell-group';
import { KitaShell } from '@ecopages/testing/kitchen-sink/kita-shell';
import { LitShell } from '@ecopages/testing/kitchen-sink/lit-shell';
import { ReactShell } from '@ecopages/testing/kitchen-sink/react-shell';
import { kitajsPlugin } from '../../../kitajs/src/kitajs.plugin';
import { litPlugin } from '../../../lit/src/lit.plugin';
import { reactPlugin } from '../../../react/src/plugin/react.plugin.ts';
import { EcoEmbed } from '../eco-embed.tsx';
import { ecopagesJsxPlugin } from '../ecopages-jsx.plugin';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer';

/**
 * @remarks
 * The Lit integration renders on a worker thread that loads the app's
 * `eco.config.ts` from `rootDir`, so the app needs a real config file.
 */
const fixtureSourceDir = fileURLToPath(new URL('./fixtures/cross-integration-app', import.meta.url));
const packageNodeModulesDir = fileURLToPath(new URL('../../node_modules', import.meta.url));
const fixtureAppDir = mkdtempSync(path.join(tmpdir(), 'eco-cross-integration-'));
cpSync(path.join(fixtureSourceDir, 'eco.config.ts'), path.join(fixtureAppDir, 'eco.config.ts'));
symlinkSync(packageNodeModulesDir, path.join(fixtureAppDir, 'node_modules'), 'dir');

afterAll(() => {
	rmSync(fixtureAppDir, { recursive: true, force: true });
});

describe('EcopagesJsxRenderer across integrations', () => {
	/**
	 * @remarks
	 * Boots four real integrations. The default 5s timeout flakes under suite
	 * load, and a timeout leaves the global JSX SSR scope stack uncleared,
	 * which pollutes later frame-depth probes.
	 */
	it('renders nested shells of four integrations without leaking foreign renderer objects', async () => {
		const jsx = ecopagesJsxPlugin();
		const kitajs = kitajsPlugin();
		const lit = litPlugin();
		const react = reactPlugin({
			extensions: ['.react.tsx'],
		});
		const config = await createTestAppConfig({
			integrations: [jsx, kitajs, lit, react],
			rootDir: fixtureAppDir,
		});

		const renderer = new EcopagesJsxRenderer({
			appConfig: config,
			assetProcessingService: {
				processDependencies: vi.fn(async () => []),
			} as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
		});

		const Page = eco.component<{}, JsxRenderable>({
			integration: 'ecopages-jsx',
			dependencies: {
				components: [IntegrationShellGroup, KitaShell, LitShell, ReactShell, EcopagesJsxShell],
			},
			render: () => (
				<div>
					<EcoEmbed component={EcopagesJsxShell} props={{ id: 'host-shell' }}>
						<EcoEmbed component={KitaShell} props={{ id: 'kita-shell' }}>
							<EcoEmbed component={LitShell} props={{ id: 'lit-shell' }}>
								<EcoEmbed component={ReactShell} props={{ id: 'react-shell' }}>
									Leaf
								</EcoEmbed>
							</EcoEmbed>
						</EcoEmbed>
					</EcoEmbed>
					<EcoEmbed component={IntegrationShellGroup} props={{ testId: 'shell-group' }} />
				</div>
			),
		});

		const result = await renderer.renderComponentWithForeignChildren({
			component: Page,
			props: {},
			integrationContext: {
				componentInstanceId: 'cross-integration-host',
			},
		});

		for (const marker of [
			'data-ecopages--jsx-shell="host-shell"',
			'data-kita-shell="kita-shell"',
			'data-lit-shell="lit-shell"',
			'data-react-shell="react-shell"',
			'Leaf',
			'data-testid="shell-group"',
			'data-lit-leaf="group-lit"',
		]) {
			expect(result.html).toContain(marker);
		}
		expect(result.html).not.toContain('[object Object]');
	}, 20_000);
});
