import type { Plugin, UserConfig } from 'vite';

/**
 * Concrete Vite plugin type used by the Ecopages composed plugin surface.
 */
export type EcopagesVitePlugin = Plugin;

/**
 * Vite user config fragment returned by Ecopages config hooks.
 */
export type EcopagesViteUserConfig = UserConfig;
