export type RequestInfo = {
	method: string;
	pathname: string;
	receivedAt: string;
	requestId: string;
};

export type RequestLayoutProps = {
	requestInfo?: RequestInfo;
	viewerRole?: string;
};

/**
 * Props factory for the layout entries of pages that run `requestInfoMiddleware`.
 *
 * @remarks
 * It annotates the locals it reads, so a Page that does not list `requestInfoMiddleware` does not compile. The
 * result is also sent to the browser for hydration, so it picks the two fields the shell renders instead of
 * returning `locals`.
 */
export function requestLayoutProps({ locals }: { locals: Required<RequestLayoutProps> }): RequestLayoutProps {
	return {
		requestInfo: locals.requestInfo,
		viewerRole: locals.viewerRole,
	};
}
