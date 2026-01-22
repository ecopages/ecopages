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

	constructor(status: number, message: string, details?: HttpErrorDetails) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.details = details;
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

	static InternalServerError(message = 'Internal Server Error'): HttpError {
		return new HttpError(500, message);
	}
}
