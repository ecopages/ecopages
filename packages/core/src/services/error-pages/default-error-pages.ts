import { isDevelopmentRuntime } from '../../utils/runtime.ts';
import { ERROR_PAGE_COPY, isHttpErrorPageStatus, isHttpErrorStatus } from '../../errors/http-error-page-contract.ts';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/** Stable class hooks exposed by the framework-owned error documents. */
export const DEFAULT_ERROR_PAGE_CLASS_NAMES = {
	root: 'eco-error-page',
	notFoundModifier: 'eco-error-page--not-found',
	serverErrorModifier: 'eco-error-page--server-error',
	badRequestModifier: 'eco-error-page--bad-request',
	unauthorizedModifier: 'eco-error-page--unauthorized',
	forbiddenModifier: 'eco-error-page--forbidden',
	conflictModifier: 'eco-error-page--conflict',
	content: 'eco-error-page__content',
	status: 'eco-error-page__status',
	title: 'eco-error-page__title',
	message: 'eco-error-page__message',
	diagnostics: 'eco-error-page__diagnostics',
	diagnosticsHeader: 'eco-error-page__diagnostics-header',
	diagnosticsLabel: 'eco-error-page__diagnostics-label',
	stack: 'eco-error-page__stack',
	copyButton: 'eco-error-page__copy',
	copyButtonCopied: 'eco-error-page__copy--copied',
	copyButtonFailed: 'eco-error-page__copy--failed',
	copyIcon: 'eco-error-page__copy-icon',
	copyIconClipboard: 'eco-error-page__copy-icon--clipboard',
	copyIconSuccess: 'eco-error-page__copy-icon--success',
	copyLabel: 'eco-error-page__copy-label',
} as const;

const sharedStyles = `
.eco-error-page { box-sizing: border-box; display: grid; place-items: center; margin: 0; padding: 2rem; color: #18181b; background: radial-gradient(circle at top, #f4f4f5, #fff 42rem); font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5; }
.eco-error-page__content { width: min(100%, 42rem); padding: clamp(2rem, 8vw, 4.5rem); border: 1px solid #e4e4e7; border-radius: 1rem; background: #fff; }
.eco-error-page__status { margin: 0 0 1rem; color: #71717a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .75rem; font-weight: 700; letter-spacing: .12em; }
.eco-error-page__title { margin: 0; font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 650; letter-spacing: -.05em; line-height: 1.05; }
.eco-error-page__message { max-width: 36rem; margin: 1rem 0 0; color: #52525b; font-size: 1rem; }
.eco-error-page__diagnostics { margin-top: 2rem; border: 1px solid #e4e4e7; border-radius: .75rem; overflow: hidden; background: #fafafa; }
.eco-error-page__diagnostics-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3rem; padding: 0 .75rem 0 1rem; border-bottom: 1px solid #e4e4e7; background: #fff; }
.eco-error-page__diagnostics-label { color: #52525b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .75rem; font-weight: 650; }
.eco-error-page__stack { max-height: 22rem; overflow: auto; box-sizing: border-box; margin: 0; padding: 1rem; color: #3f3f46; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .8125rem; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.eco-error-page__copy { font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: .5rem; min-height: 2rem; padding: .375rem .625rem; border: 1px solid #d4d4d8; border-radius: .4375rem; color: #3f3f46; background: #fff; font-size: .8125rem; font-weight: 600; transition: border-color .15s ease, background-color .15s ease, color .15s ease; }
.eco-error-page__copy:hover { border-color: #a1a1aa; background: #fafafa; }
.eco-error-page__copy--copied { border-color: #86efac; background: #f0fdf4; color: #166534; }
.eco-error-page__copy--failed { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.eco-error-page__copy-icon { display: inline-flex; flex-shrink: 0; width: 1rem; height: 1rem; }
.eco-error-page__copy-icon svg { display: block; width: 100%; height: 100%; }
.eco-error-page__copy-icon--success { display: none; }
.eco-error-page__copy--copied .eco-error-page__copy-icon--clipboard { display: none; }
.eco-error-page__copy--copied .eco-error-page__copy-icon--success { display: inline-flex; }
.eco-error-page__copy:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
@media (max-width: 40rem) { .eco-error-page { padding: 1rem; } .eco-error-page__content { padding: 2rem 1.5rem; border-radius: .75rem; } }
@media (prefers-color-scheme: dark) { .eco-error-page { color: #f4f4f5; background: radial-gradient(circle at top, #27272a, #09090b 42rem); } .eco-error-page__content { border-color: #3f3f46; background: #18181b; } .eco-error-page__status, .eco-error-page__message { color: #a1a1aa; } .eco-error-page__diagnostics { border-color: #3f3f46; background: #18181b; } .eco-error-page__diagnostics-header { border-color: #3f3f46; background: #27272a; } .eco-error-page__diagnostics-label, .eco-error-page__stack { color: #d4d4d8; } .eco-error-page__copy { border-color: #52525b; color: #e4e4e7; background: #27272a; } .eco-error-page__copy:hover { border-color: #a1a1aa; background: #3f3f46; } .eco-error-page__copy--copied { border-color: #166534; background: #052e16; color: #bbf7d0; } .eco-error-page__copy--failed { border-color: #991b1b; background: #450a0a; color: #fecaca; } }
`.trim();

const clipboardIconSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';

const checkIconSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function buildDefaultCopyButtonMarkup(copyPayload: string): string {
	const names = DEFAULT_ERROR_PAGE_CLASS_NAMES;
	return `<pre id="eco-copy-error-payload" hidden>${escapeHtml(copyPayload)}</pre>
<button type="button" class="${names.copyButton}" id="eco-copy-error" aria-label="Copy error details to clipboard">
<span class="${names.copyIcon} ${names.copyIconClipboard}" aria-hidden="true">${clipboardIconSvg}</span>
<span class="${names.copyIcon} ${names.copyIconSuccess}" aria-hidden="true">${checkIconSvg}</span>
<span class="${names.copyLabel}" aria-live="polite">Copy error</span>
</button>
<script>
(function () {
 var button = document.getElementById('eco-copy-error');
 var payload = document.getElementById('eco-copy-error-payload');
 if (!button || !payload) return;
 var label = button.querySelector('.${names.copyLabel}');
 var text = payload.textContent || '';
 var resetTimer;
 function setState(state) {
  button.classList.toggle('${names.copyButtonCopied}', state === 'copied');
  button.classList.toggle('${names.copyButtonFailed}', state === 'failed');
  if (label) label.textContent = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy error';
  button.setAttribute('aria-label', state === 'copied' ? 'Error details copied' : state === 'failed' ? 'Could not copy error details' : 'Copy error details to clipboard');
 }
 function fallbackCopy(value) {
  var area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'absolute';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  try {
   if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
  } finally { document.body.removeChild(area); }
 }
 function copyToClipboard(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
  return Promise.resolve().then(function () { fallbackCopy(value); });
 }
 button.addEventListener('click', function () {
  copyToClipboard(text).then(function () {
   setState('copied');
   clearTimeout(resetTimer);
   resetTimer = setTimeout(function () { setState('idle'); }, 2000);
  }).catch(function () {
   setState('failed');
   clearTimeout(resetTimer);
   resetTimer = setTimeout(function () { setState('idle'); }, 3000);
  });
 });
})();
</script>`;
}

export type DefaultErrorPageDetails = { message?: string; stack?: string };

type DefaultErrorPageCopy = { title: string; message: string; modifier: string };

type DefaultErrorPageDiagnostics = {
	message?: string;
	stack?: string;
	copyPayload: string;
};

type DefaultErrorPageViewModel = {
	status: number;
	title: string;
	bodyMessage: string;
	modifierClass: string;
	diagnostics?: DefaultErrorPageDiagnostics;
};

function copyForStatus(status: number): DefaultErrorPageCopy {
	if (isHttpErrorPageStatus(status)) {
		return ERROR_PAGE_COPY[status];
	}
	if (isHttpErrorStatus(status) && status >= 500) {
		return ERROR_PAGE_COPY[500];
	}
	return {
		title: `Error ${status}`,
		message: 'An error occurred while handling this request.',
		modifier: `status-${status}`,
	};
}

function normalizeDetail(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function formatDiagnosticsCopyPayload(message: string | undefined, stack: string | undefined): string {
	const parts: string[] = [];
	if (message) parts.push(`Message: ${message}`);
	if (stack) parts.push(`Stack:\n${stack}`);
	return parts.join('\n\n');
}

function createDefaultErrorPageViewModel(status: number, details?: DefaultErrorPageDetails): DefaultErrorPageViewModel {
	const copy = copyForStatus(status);
	const isServerError = status >= 500;
	const stack = isServerError ? normalizeDetail(details?.stack) : undefined;
	const showDiagnostics = isServerError && isDevelopmentRuntime() && Boolean(details?.message || stack);
	const diagnosticMessage = showDiagnostics ? normalizeDetail(details?.message) : undefined;

	return {
		status,
		title: copy.title,
		modifierClass: `eco-error-page--${copy.modifier}`,
		bodyMessage: isServerError ? copy.message : normalizeDetail(details?.message) || copy.message,
		diagnostics: showDiagnostics
			? {
					message: diagnosticMessage,
					stack,
					copyPayload: formatDiagnosticsCopyPayload(diagnosticMessage, stack),
				}
			: undefined,
	};
}

function renderDiagnosticsMarkup(diagnostics: DefaultErrorPageDiagnostics): string {
	const names = DEFAULT_ERROR_PAGE_CLASS_NAMES;
	const copyMarkup = buildDefaultCopyButtonMarkup(diagnostics.copyPayload);
	const messageMarkup = diagnostics.message
		? `<p class="${names.message}" role="alert">${escapeHtml(diagnostics.message)}</p>`
		: '';
	if (!diagnostics.stack) {
		return `${messageMarkup}${copyMarkup}`;
	}

	return `${messageMarkup}<section class="${names.diagnostics}" aria-label="Error stack trace"><div class="${names.diagnosticsHeader}"><span class="${names.diagnosticsLabel}">Stack trace</span>${copyMarkup}</div><pre class="${names.stack}">${escapeHtml(diagnostics.stack)}</pre></section>`;
}

/**
 * Self-contained HTML for a framework default error response.
 *
 * @remarks
 * Development 5xx pages may include escaped `message` / `stack` and a copy
 * button. 4xx pages never serialize a stack.
 */
export function buildDefaultErrorHtml(status: number, details?: DefaultErrorPageDetails): string {
	const names = DEFAULT_ERROR_PAGE_CLASS_NAMES;
	const view = createDefaultErrorPageViewModel(status, details);
	const detailsBlock = view.diagnostics ? renderDiagnosticsMarkup(view.diagnostics) : '';

	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(view.title)}</title><style>${sharedStyles}</style></head>
<body class="${names.root} ${view.modifierClass}"><main class="${names.content}"><p class="${names.status}" aria-hidden="true">ERROR ${view.status}</p><h1 class="${names.title}">${escapeHtml(view.title)}</h1><p class="${names.message}">${escapeHtml(view.bodyMessage)}</p>${detailsBlock}</main></body></html>`;
}

export function getDefaultServerErrorDetails(error: unknown): DefaultErrorPageDetails | undefined {
	if (!isDevelopmentRuntime() || error === undefined) {
		return undefined;
	}
	if (error instanceof Error) {
		return { message: error.message, stack: error.stack };
	}
	return { message: String(error) };
}

export function getPublicErrorMessage(error: unknown): string | undefined {
	if (error instanceof Error) {
		const message = error.message.trim();
		return message.length > 0 ? message : undefined;
	}
	return undefined;
}
