import { isLocalRequest, origin } from './settings';

export function sameOrigin(request: Request) {
	return isLocalRequest(request) && request.headers.get('origin') === origin;
}

export function redirect(path: string, upstream?: Response) {
	const headers = new Headers({
		Location: new URL(path, origin).href,
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'no-referrer',
	});
	for (const cookie of upstream?.headers.getSetCookie() ?? []) headers.append('Set-Cookie', cookie);
	return new Response(null, { status: 303, headers });
}
