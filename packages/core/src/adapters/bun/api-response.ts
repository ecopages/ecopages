/**
 * A builder class for creating Response objects fluently.
 */
export class ApiResponseBuilder {
  private _status: Response['status'] = 200;
  private _headers: Headers = new Headers();

  /**
   * Sets the HTTP status code for the response.
   * @param code - The HTTP status code.
   * @returns The builder instance for chaining.
   */
  status(code: Response['status']): this {
    this._status = code;
    return this;
  }

  /**
   * Adds or merges headers for the response.
   * @param headersInit - Headers to add or merge.
   * @returns The builder instance for chaining.
   */
  headers(headersInit: HeadersInit): this {
    const inputHeaders = new Headers(headersInit);
    inputHeaders.forEach((value, key) => {
      this._headers.set(key, value);
    });
    return this;
  }

  /**
   * Creates a JSON response using the configured status and headers.
   * @param data - The data to serialize.
   * @returns A Response object.
   */
  json(data: any): Response {
    // Ensure Content-Type is set, but allow override via headers()
    if (!this._headers.has('Content-Type')) {
      this._headers.set('Content-Type', 'application/json; charset=utf-8');
    }
    return new Response(JSON.stringify(data), { status: this._status, headers: this._headers });
  }

  /**
   * Creates a plain text response using the configured status and headers.
   * @param data - The text content.
   * @returns A Response object.
   */
  text(data: string): Response {
    if (!this._headers.has('Content-Type')) {
      this._headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
    return new Response(data, { status: this._status, headers: this._headers });
  }

  /**
   * Creates an HTML response using the configured status and headers.
   * @param data - The HTML content.
   * @returns A Response object.
   */
  html(data: string): Response {
    if (!this._headers.has('Content-Type')) {
      this._headers.set('Content-Type', 'text/html; charset=utf-8');
    }
    return new Response(data, { status: this._status, headers: this._headers });
  }

  /**
   * Creates a redirect response.
   * @param url - The URL to redirect to.
   * @param explicitStatus - Optional explicit status code (overrides status() if provided). Defaults to 302 if not set via status().
   * @returns A Response object.
   */
  redirect(url: string, explicitStatus?: Response['status']): Response {
    const redirectStatus = explicitStatus ?? (this._status === 200 ? 302 : this._status); // Default to 302 if status wasn't explicitly set
    this._headers.set('Location', url);
    return new Response(null, { status: redirectStatus, headers: this._headers });
  }

  /**
   * Creates an error response using the configured status and headers.
   * If data is an object, it's treated as JSON, otherwise as text.
   * @param data - The error data (string or object).
   * @param explicitStatus - Optional explicit status code (overrides status() if provided). Defaults to 500 if not set via status().
   * @returns A Response object.
   */
  error(data: string | object, explicitStatus?: Response['status']): Response {
    const errorStatus = explicitStatus ?? (this._status === 200 ? 500 : this._status); // Default to 500 if status wasn't explicitly set
    this.status(errorStatus); // Update internal status for content type logic

    if (typeof data === 'object' && data !== null) {
      // Use json() logic but ensure status is errorStatus
      if (!this._headers.has('Content-Type')) {
        this._headers.set('Content-Type', 'application/json; charset=utf-8');
      }
      return new Response(JSON.stringify({ error: data }), { status: this._status, headers: this._headers });
    }
    // Use text() logic but ensure status is errorStatus
    if (!this._headers.has('Content-Type')) {
      this._headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
    return new Response(String(data), { status: this._status, headers: this._headers });
  }
}
