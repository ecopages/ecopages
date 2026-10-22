export interface HttpErrorDetails {
	[key: string]: unknown;
}

export interface HttpErrorJson {
	error: string;
	status: number;
	details?: HttpErrorDetails;
}

/**
 * HTTP error class for structured error handling in route handlers.
 * Provides static factory methods for common HTTP error responses.
 */
export class HttpError extends Error {
	readonly status: number;
	readonly details?: HttpErrorDetails;

	constructor(status: number, message: string, details?: HttpErrorDetails, options?: ErrorOptions) {
		super(message, options);
		this.name = 'HttpError';
		this.status = status;
		this.details = details;
	}

	/**
	 * Detects HttpError across bundle boundaries where `instanceof` can fail.
	 *
	 * @remarks
	 * Page modules may load a different class identity than core runtime code.
	 * Prefer this over `instanceof` when catching errors from app page bundles.
	 */
	static isHttpError(error: unknown): error is HttpError {
		if (error instanceof HttpError) {
			return true;
		}

		return (
			typeof error === 'object' &&
			error !== null &&
			(error as { name?: unknown }).name === 'HttpError' &&
			typeof (error as { status?: unknown }).status === 'number'
		);
	}

	/**
	 * Answers with an error's status and JSON body, whichever `HttpError` class threw it.
	 *
	 * @remarks
	 * An error that passed {@link HttpError.isHttpError} may come from an app bundle's own copy of
	 * this class, or be a duck-typed object without `toResponse()`, so the response is rebuilt from
	 * its fields.
	 */
	static responseFor(error: HttpError): Response {
		return new HttpError(error.status, error.message, error.details).toResponse();
	}

	/**
	 * Serialize error to JSON for API responses.
	 */
	toJSON(): HttpErrorJson {
		const json: HttpErrorJson = {
			error: this.message,
			status: this.status,
		};

		if (this.details) {
			json.details = this.details;
		}

		return json;
	}

	/**
	 * Create a Response object from this error.
	 */
	toResponse(): Response {
		return Response.json(this.toJSON(), { status: this.status });
	}

	static BadRequest(message = 'Bad Request', details?: HttpErrorDetails): HttpError {
		return new HttpError(400, message, details);
	}

	static Unauthorized(message = 'Unauthorized'): HttpError {
		return new HttpError(401, message);
	}

	static Forbidden(message = 'Forbidden'): HttpError {
		return new HttpError(403, message);
	}

	static NotFound(message = 'Not Found'): HttpError {
		return new HttpError(404, message);
	}

	static Conflict(message = 'Conflict', details?: HttpErrorDetails): HttpError {
		return new HttpError(409, message, details);
	}

	static InternalServerError(message = 'Internal Server Error', options?: ErrorOptions): HttpError {
		return new HttpError(500, message, undefined, options);
	}
}
