export interface ApiResponseBuilder {
	status(code: Response['status']): this;
	headers(headersInit: HeadersInit): this;
	json(data: unknown): Response;
	text(data: string): Response;
	html(data: string): Response;
	redirect(url: string, explicitStatus?: Response['status']): Response;
	error(data: string | object, explicitStatus?: Response['status']): Response;
}
