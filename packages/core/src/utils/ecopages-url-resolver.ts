import path from 'node:path';
import type { EcoPagesAppConfig } from '../internal-types';

/**
 * A utility class for manipulating and resolving file paths and URLs in the EcoPages application.
 * Provides a fluent interface for common path operations.
 *
 * @example
 * ```ts
 * const resolver = new EcopagesUrlResolver(appConfig);
 * const url = resolver
 *   .from('/path/to/file.txt')
 *   .toRelativePath()
 *   .withLeadingSlash()
 *   .build();
 * ```
 *
 * @remarks
 * All methods (except constructor) return `this` for method chaining.
 * Most methods will throw an Error if no path is set via the `from()` method first.
 *
 * @throws {Error} Most methods will throw if no path is set via `from()`
 *
 * @see {@link EcoPagesAppConfig} Required configuration object for initialization
 */
export class EcopagesUrlResolver {
  private appConfig: EcoPagesAppConfig;
  private currentPath = '';

  constructor(appConfig: EcoPagesAppConfig) {
    this.appConfig = appConfig;
  }

  /**
   * Sets the starting path for URL manipulation
   * @param filePath Absolute or relative file path
   * @returns this for method chaining
   * @example
   * ```ts
   * resolver.from('/path/to/file.tsx')
   * ```
   */
  from(filePath: string) {
    this.currentPath = filePath;
    return this;
  }

  /**
   * Converts an absolute path to a path relative to the source directory
   * @returns this for method chaining
   * @throws {Error} If no path is set via from()
   * @example
   * ```ts
   * // Given srcDir: '/project/src'
   * resolver.from('/project/src/pages/index.tsx').toRelativePath()
   * // Results in: '/pages/index.tsx'
   * ```
   */
  toRelativeSrcPath() {
    if (!this.currentPath) throw new Error('No path set. Call from() first');
    const relativePath = path.relative(this.appConfig.srcDir, this.currentPath);
    this.currentPath = path.join('/', relativePath);
    return this;
  }

  /**
   * Sets a new parent directory for the current path
   * @param dir The new parent directory
   * @returns this for method chaining
   * @throws {Error} If no path is set via from()
   * @example
   * ```ts
   * resolver.from('pages/index.tsx').setParentDir('assets')
   * // Results in: 'assets/pages/index.tsx'
   * ```
   */
  setParentDir(dir: string) {
    if (!this.currentPath) throw new Error('No path set. Call from() first');
    this.currentPath = path.join(dir, this.currentPath);
    return this;
  }

  /**
   * Ensures the path starts with a forward slash
   * @returns this for method chaining
   * @throws {Error} If no path is set via from()
   * @example
   * ```ts
   * resolver.from('pages/index.tsx').withLeadingSlash()
   * // Results in: '/pages/index.tsx'
   * ```
   */
  withLeadingSlash() {
    if (!this.currentPath) throw new Error('No path set. Call from() first');
    this.currentPath = path.join('/', this.currentPath);
    return this;
  }

  /**
   * Ensures the path ends with a forward slash
   * @returns this for method chaining
   * @throws {Error} If no path is set via from()
   * @example
   * ```ts
   * resolver.from('pages/index').withTrailingSlash()
   * // Results in: 'pages/index/'
   * ```
   */
  withTrailingSlash() {
    if (!this.currentPath) throw new Error('No path set. Call from() first');
    this.currentPath = path.join(this.currentPath, '/');
    return this;
  }

  /**
   * Replaces the filename portion of the current path while preserving the directory and extension.
   *
   * @param name - The new filename (without extension) to use in the path
   * @throws {Error} If no current path has been set via the from() method
   * @returns The current instance for method chaining
   *
   * @example
   * ```typescript
   * const resolver = new EcopagesUrlResolver();
   * resolver.from('/path/to/file.txt')
   *        .replaceFilenameInUrl('newname'); // Results in '/path/to/newname.txt'
   * ```
   */
  replaceFilenameInUrl(name: string) {
    if (!this.currentPath) throw new Error('No path set. Call from() first');

    const directory = path.dirname(this.currentPath);
    const newExt = path.extname(this.currentPath);

    this.currentPath = path.join(directory, `${name}${newExt}`);
    return this;
  }

  /**
   * Replaces the extension of the current file path
   * @param extension Extension with or without leading dot (e.g., '.js' or 'js')
   * @throws {Error} If no path is set or extension is invalid
   * @example
   * ```ts
   * // Both are valid and produce the same result
   * urlResolver.replaceExtensionInUrl('.js')
   * urlResolver.replaceExtensionInUrl('js')
   * ```
   */
  replaceExtensionInUrl(extension: string) {
    if (!this.currentPath) throw new Error('No path set. Call from() first');
    if (!extension) throw new Error('Extension cannot be empty');

    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;

    if (!/^[.][\w]+$/.test(normalizedExt)) {
      throw new Error(`Invalid extension format: ${extension}`);
    }

    const fileName = path.basename(this.currentPath);
    const fileNameWithoutExt = fileName.split('.').slice(0, -1).join('.');

    const directory = path.dirname(this.currentPath);
    this.currentPath = path.join(directory, `${fileNameWithoutExt}${normalizedExt}`);

    return this;
  }

  build() {
    if (!this.currentPath) throw new Error('No path set. Call from() first');
    return this.currentPath;
  }
}
