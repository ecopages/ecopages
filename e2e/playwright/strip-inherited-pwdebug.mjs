/**
 * Side-effect import: clear inherited `PWDEBUG` before Playwright loads.
 *
 * @remarks
 * Must be the first import in Playwright/Vitest browser configs. ESM evaluates
 * imports in source order, and `playwright-core` snapshots `PWDEBUG` on first
 * load. `--debug` keeps the inspector because the CLI sets `PWDEBUG` before
 * the config file is evaluated.
 */
import { stripInheritedPlaywrightInspectorEnv, shouldKeepPlaywrightInspector } from './playwright-color-env.mjs';

if (!shouldKeepPlaywrightInspector()) {
	stripInheritedPlaywrightInspectorEnv(process.env);
}
