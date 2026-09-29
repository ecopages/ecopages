import cliJson from '../../../../packages/ecopages/package.json';

/**
 * @remarks
 * The workspace root version is kept in sync by `pnpm run changeset:version`.
 */
export const frameworkVersion: string = cliJson.version;
