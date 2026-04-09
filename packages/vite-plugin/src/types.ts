import type { Plugin, UserConfig } from 'vite';

/**
 * Concrete Vite plugin type used by the Ecopages composed plugin surface.
 */
export type EcopagesVitePlugin = Plugin;

/**
 * Recursive Vite plugin option shape accepted by host plugin factories.
 */
export type EcopagesVitePluginOption = EcopagesVitePlugin | false | null | undefined | EcopagesVitePluginOption[];

/**
 * Vite user config fragment returned by Ecopages config hooks.
 */
export type EcopagesViteUserConfig = UserConfig;
