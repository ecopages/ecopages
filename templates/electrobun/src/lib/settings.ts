export const hostname = '127.0.0.1';
export const port = Number(process.env.ECOPAGES_PORT ?? 3210);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
	throw new Error('ECOPAGES_PORT must be an integer from 1024 to 65535.');
}

export const origin = `http://${hostname}:${port}`;
export const githubClientId = process.env.GITHUB_CLIENT_ID;
export const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
export const githubEnabled = Boolean(githubClientId && githubClientSecret);
export const desktop = process.env.WORKSPACE_DESKTOP === '1';
export const insetControls = process.env.WORKSPACE_INSET_CONTROLS === '1';
export const dataDirectory = process.env.WORKSPACE_DATA_DIR ?? '.data';

export function isLocalRequest(request: Request) {
	return request.headers.get('host') === `${hostname}:${port}` && new URL(request.url).origin === origin;
}
