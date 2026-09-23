import { isDevelopmentRuntime } from '../../utils/runtime.ts';

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
	content: 'eco-error-page__content',
	title: 'eco-error-page__title',
	message: 'eco-error-page__message',
	stack: 'eco-error-page__stack',
	copyButton: 'eco-error-page__copy',
	copyButtonCopied: 'eco-error-page__copy--copied',
	copyIcon: 'eco-error-page__copy-icon',
	copyIconClipboard: 'eco-error-page__copy-icon--clipboard',
	copyIconSuccess: 'eco-error-page__copy-icon--success',
	copyLabel: 'eco-error-page__copy-label',
} as const;

const sharedStyles = `
.eco-error-page { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0; padding: 2rem; color: #171717; background: #fafafa; }
.eco-error-page__content { max-width: 40rem; margin: 0 auto; }
.eco-error-page__title { font-size: 1.5rem; font-weight: 600; margin: 0 0 .5rem; }
.eco-error-page__message { margin: 0 0 1rem; color: #404040; }
.eco-error-page__stack { overflow: auto; padding: 1rem; border-radius: .375rem; background: #f0f0f0; font-size: .8125rem; white-space: pre-wrap; word-break: break-word; }
.eco-error-page__copy { font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: .5rem; padding: .375rem .75rem; border: 1px solid #d4d4d4; border-radius: .375rem; background: #fff; }
.eco-error-page__copy--copied { border-color: #16a34a; background: #f0fdf4; color: #166534; }
.eco-error-page__copy-icon { display: inline-flex; flex-shrink: 0; width: 1rem; height: 1rem; }
.eco-error-page__copy-icon svg { display: block; width: 100%; height: 100%; }
.eco-error-page__copy-icon--success { display: none; }
.eco-error-page__copy--copied .eco-error-page__copy-icon--clipboard { display: none; }
.eco-error-page__copy--copied .eco-error-page__copy-icon--success { display: inline-flex; }
.eco-error-page__copy:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
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
<span class="${names.copyLabel}">Copy error</span>
</button>
<script>
(function () {
 var button = document.getElementById('eco-copy-error');
 var payload = document.getElementById('eco-copy-error-payload');
 if (!button || !payload) return;
 var label = button.querySelector('.${names.copyLabel}');
 var text = payload.textContent || '';
 var resetTimer;
 function setCopiedState(active) {
  button.classList.toggle('${names.copyButtonCopied}', active);
  if (label) label.textContent = active ? 'Copied' : 'Copy error';
  button.setAttribute('aria-label', active ? 'Error details copied' : 'Copy error details to clipboard');
 }
 function fallbackCopy(value) {
  var area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'absolute';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } finally { document.body.removeChild(area); }
 }
 function copyToClipboard(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
  return Promise.resolve().then(function () { fallbackCopy(value); });
 }
 button.addEventListener('click', function () {
  copyToClipboard(text).then(function () {
   setCopiedState(true);
   clearTimeout(resetTimer);
   resetTimer = setTimeout(function () { setCopiedState(false); }, 2000);
  }).catch(function () { setCopiedState(false); });
 });
})();
</script>`;
}

/** Self-contained HTML for the framework default not-found response. */
export function buildDefaultNotFoundHtml(): string {
	const names = DEFAULT_ERROR_PAGE_CLASS_NAMES;
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not Found</title><style>${sharedStyles}</style></head>
<body class="${names.root} ${names.notFoundModifier}"><main class="${names.content}"><h1 class="${names.title}">Not Found</h1><p class="${names.message}">The page you requested could not be found.</p></main></body></html>`;
}

export type DefaultServerErrorDetails = { message?: string; stack?: string };

export function getDefaultServerErrorDetails(error: unknown): DefaultServerErrorDetails | undefined {
	if (!isDevelopmentRuntime() || error === undefined) {
		return undefined;
	}
	if (error instanceof Error) {
		return { message: error.message, stack: error.stack };
	}
	return { message: String(error) };
}

/** Self-contained HTML for the framework default server-error response. */
export function buildDefaultServerErrorHtml(details?: DefaultServerErrorDetails): string {
	const names = DEFAULT_ERROR_PAGE_CLASS_NAMES;
	const errorMessage = details?.message?.trim();
	const errorStack = details?.stack?.trim();
	const hasDetails = isDevelopmentRuntime() && Boolean(errorMessage || errorStack);
	const copyPayload = hasDetails
		? [errorMessage ? `Message: ${errorMessage}` : '', errorStack ? `Stack:\n${errorStack}` : '']
				.filter(Boolean)
				.join('\n\n')
		: '';
	const detailsBlock = hasDetails
		? `${errorMessage ? `<p class="${names.message}">${escapeHtml(errorMessage)}</p>` : ''}${errorStack ? `<pre class="${names.stack}">${escapeHtml(errorStack)}</pre>` : ''}`
		: '';
	const copyMarkup = hasDetails ? buildDefaultCopyButtonMarkup(copyPayload) : '';

	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Something went wrong</title><style>${sharedStyles}</style></head>
<body class="${names.root} ${names.serverErrorModifier}"><main class="${names.content}"><h1 class="${names.title}">Something went wrong</h1><p class="${names.message}">An error occurred while handling this request.</p>${detailsBlock}${copyMarkup}</main></body></html>`;
}
