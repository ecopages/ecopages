import { eco } from '@ecopages/core';
import type { Error500TemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import './500.css';

export default eco.page<Error500TemplateProps, JsxRenderable>({
	layout: BaseLayout,
	dependencies: {
		scripts: [{ src: './500.script.ts' }],
	},

	render: ({ message, stack }) => {
		const showDiagnostics = process.env.NODE_ENV === 'development' && Boolean(message || stack);
		return (
			<div class="error500">
				<p class="error500__status">ERROR 500</p>
				<h1>Something went wrong</h1>
				<p>Our server hit an unexpected error. Please try again in a moment.</p>
				{showDiagnostics ? (
					<radiant-error-details>
						<pre hidden>
							{[message ? `Message: ${message}` : '', stack ? `Stack:\n${stack}` : '']
								.filter(Boolean)
								.join('\n\n')}
						</pre>
						<div class="error500__diagnostics">
							<div class="error500__diagnostics-header">
								<span>Stack trace</span>
								<button type="button">Copy error</button>
							</div>
							{message ? <p class="error500__error-message">{message}</p> : null}
							{stack ? <pre class="error500__stack">{stack}</pre> : null}
						</div>
					</radiant-error-details>
				) : null}
			</div>
		);
	},
});
