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
 * Base directory for all generated content
 */
export const GENERATED_DIR = '.generated';

/**
 * Directory structure for generated content
 */
export const GENERATED_DIRS = {
  types: `${GENERATED_DIR}/types`,
  cache: `${GENERATED_DIR}/cache`,
} as const;
