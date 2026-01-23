/**
 * This file contains constants used throughout the project.
 * @module constants
 **/

/**
 * Collection of status messages used in the application.
 */
export const STATUS_MESSAGE = {
	404: '404 Not Found',
};

/**
 *Variables used to determine if the app is running on Bun
 */
export const IS_BUN = typeof Bun !== 'undefined';

/**
 * Directory used for storing assets.
 */
export const RESOLVED_ASSETS_DIR = 'assets';

/**
 * Directory used for storing vendor assets.
 * This is a subdirectory of the assets directory.
 */
export const RESOLVED_ASSETS_VENDORS_DIR: string = `${RESOLVED_ASSETS_DIR}/vendors`;

/**
 * Base paths for generated project files.
 */
export const GENERATED_BASE_PATHS = {
	types: 'node_modules/@types',
	cache: 'cache',
} as const;

export const DEFAULT_ECOPAGES_PORT = 3000;

export const DEFAULT_ECOPAGES_HOSTNAME = 'localhost';
