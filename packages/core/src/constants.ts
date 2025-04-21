/**
 * This file contains constants used throughout the project.
 * @module constants
 **/

import path from 'node:path';
import { FileUtils } from './utils/file-utils.module';

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

interface GeneratedPathOptions {
  root: string;
  module: string;
  subPath?: string;
  ensureDirExists?: boolean;
}

const GENERATED_BASE_PATHS = {
  types: 'node_modules/@types',
  cache: 'node_modules/.cache/@ecopages',
} as const;

/**
 * Resolves a path for generated project files based on the type and options.
 * Used for managing generated files like types, cache, and assets.
 */
export function resolveGeneratedPath(type: keyof typeof GENERATED_BASE_PATHS, options: GeneratedPathOptions): string {
  const { root, module, subPath, ensureDirExists } = options;

  const parts = [root, GENERATED_BASE_PATHS[type], module, subPath].filter(Boolean);

  const fullPath = path.join(...(parts as string[]));

  if (ensureDirExists) {
    FileUtils.ensureDirectoryExists(path.dirname(fullPath));
  }

  return fullPath;
}
