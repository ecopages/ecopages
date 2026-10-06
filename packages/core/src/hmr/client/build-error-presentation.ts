import {
	BUILD_ERROR_EVENT,
	BUILD_ERROR_CLEAR_EVENT,
	BUILD_ERROR_REQUEST_EVENT,
	type BuildErrorDetail,
} from '../../dev-toolbar/build-error-contract.ts';
import { clearBuildError, showBuildError } from './build-error-overlay.ts';

/**
 * @remarks
 * Keep active errors independently of fallback dismissal so a client mounting after the
 * HMR socket receives an error can claim it. The next non-error HMR message resets this set.
 */
const messages = new Set<string>();

function present(message: string): void {
	const unhandled = window.dispatchEvent(
		new CustomEvent<BuildErrorDetail>(BUILD_ERROR_EVENT, {
			cancelable: true,
			detail: { message },
		}),
	);
	if (unhandled) showBuildError(message);
}

window.addEventListener(BUILD_ERROR_REQUEST_EVENT, () => {
	clearBuildError();
	for (const message of messages) present(message);
});

export function reportBuildError(message: string): void {
	messages.add(message);
	present(message);
}

export function resetBuildErrors(): void {
	messages.clear();
	clearBuildError();
	window.dispatchEvent(new Event(BUILD_ERROR_CLEAR_EVENT));
}
