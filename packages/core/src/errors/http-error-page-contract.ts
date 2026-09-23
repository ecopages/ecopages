import { HttpError } from './http-error.ts';

/**
 * HTTP statuses that own a semantic HTML error page (`pages/{status}.*` and
 * matching `app.*()` loaders).
 */
export const HTTP_ERROR_PAGE_STATUSES = [400, 401, 403, 404, 409, 500] as const;

export type HttpErrorPageStatus = (typeof HTTP_ERROR_PAGE_STATUSES)[number];

export type ErrorPageKind = 'badRequest' | 'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'serverError';

export const ERROR_PAGE_KIND_BY_STATUS = {
	400: 'badRequest',
	401: 'unauthorized',
	403: 'forbidden',
	404: 'notFound',
	409: 'conflict',
	500: 'serverError',
} as const satisfies Record<HttpErrorPageStatus, ErrorPageKind>;

export const ERROR_PAGE_STATUS_BY_KIND = {
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
	serverError: 500,
} as const satisfies Record<ErrorPageKind, HttpErrorPageStatus>;

export const SEMANTIC_ERROR_PAGE_PATHNAMES = HTTP_ERROR_PAGE_STATUSES.map(
	(status) => `/${status}`,
) as readonly `/${HttpErrorPageStatus}`[];

/**
 * Built-in copy and CSS modifier suffix for each semantic HTML error page.
 */
export const ERROR_PAGE_COPY = {
	400: {
		title: 'Bad Request',
		message: 'The request could not be understood.',
		modifier: 'bad-request',
	},
	401: {
		title: 'Unauthorized',
		message: 'Authentication is required to access this page.',
		modifier: 'unauthorized',
	},
	403: {
		title: 'Forbidden',
		message: 'You do not have permission to access this page.',
		modifier: 'forbidden',
	},
	404: {
		title: 'Not Found',
		message: 'The page you requested could not be found.',
		modifier: 'not-found',
	},
	409: {
		title: 'Conflict',
		message: 'The request could not be completed due to a conflict.',
		modifier: 'conflict',
	},
	500: {
		title: 'Something went wrong',
		message: 'An error occurred while handling this request.',
		modifier: 'server-error',
	},
} as const satisfies Record<HttpErrorPageStatus, { title: string; message: string; modifier: string }>;

export type PageFailureClassification = {
	status: number;
	kind: ErrorPageKind | undefined;
	logAsServerError: boolean;
};

export function isHttpErrorPageStatus(status: number): status is HttpErrorPageStatus {
	return (HTTP_ERROR_PAGE_STATUSES as readonly number[]).includes(status);
}

export function isHttpErrorStatus(status: number): boolean {
	return Number.isInteger(status) && status >= 400 && status <= 599;
}

/**
 * Resolves the semantic page kind for an HTTP status.
 *
 * @remarks
 * Factory statuses map 1:1. Other 5xx statuses reuse the server-error page
 * with the original status. Other 4xx statuses have no custom page and use a
 * built-in document.
 */
export function kindForStatus(status: number): ErrorPageKind | undefined {
	if (isHttpErrorPageStatus(status)) {
		return ERROR_PAGE_KIND_BY_STATUS[status];
	}
	if (status >= 500 && status <= 599) {
		return 'serverError';
	}
	return undefined;
}

export function classifyPageFailure(error: unknown): PageFailureClassification {
	if (error instanceof Response) {
		return {
			status: error.status,
			kind: kindForStatus(error.status),
			logAsServerError: error.status >= 500,
		};
	}
	if (HttpError.isHttpError(error)) {
		const status = isHttpErrorStatus(error.status) ? error.status : 500;
		return {
			status,
			kind: kindForStatus(status),
			logAsServerError: status >= 500,
		};
	}
	return {
		status: 500,
		kind: 'serverError',
		logAsServerError: true,
	};
}

export function shouldLogPageFailure(error: unknown): boolean {
	return classifyPageFailure(error).logAsServerError;
}
