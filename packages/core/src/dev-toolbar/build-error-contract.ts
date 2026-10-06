export const BUILD_ERROR_EVENT = 'ecopages:build-error';
export const BUILD_ERROR_CLEAR_EVENT = 'ecopages:build-error-clear';
export const BUILD_ERROR_REQUEST_EVENT = 'ecopages:build-error-request';

/**
 * @remarks
 * Dispatched on window as a cancelable CustomEvent. Clients presenting the message must
 * call preventDefault synchronously to suppress the in-page fallback. Clear events reset
 * all messages; request events replay active messages for clients that mount late.
 */
export interface BuildErrorDetail {
	message: string;
}
