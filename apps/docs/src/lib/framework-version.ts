import cliJson from '../../../../packages/ecopages/package.json';

/**
 * Version shown in docs chrome.
 *
 * @remarks
 * The workspace root `package.json` is private and not in the Changesets group, so it can lag the published CLI.
 */
export const frameworkVersion: string = cliJson.version;
