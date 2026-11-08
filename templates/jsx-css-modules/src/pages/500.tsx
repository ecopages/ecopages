import { eco, isDevelopmentRuntime } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { BaseLayout } from '@/layouts/base-layout';
import styles from './500.module.css';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: BaseLayout,
	dependencies: {
		scripts: [{ src: './500.script.ts' }],
	},

	render: ({ message, stack }) => {
		const showDiagnostics = isDevelopmentRuntime() && Boolean(message || stack);
		return (
			<div class={styles.root}>
				<p class={styles.status}>ERROR 500</p>
				<h1>Something went wrong</h1>
				<p>Our server hit an unexpected error. Please try again in a moment.</p>
				{showDiagnostics ? (
					<radiant-error-details>
						<pre hidden>
							{[message ? `Message: ${message}` : '', stack ? `Stack:\n${stack}` : '']
								.filter(Boolean)
								.join('\n\n')}
						</pre>
						<div class={styles.diagnostics}>
							<div class={styles['diagnostics-header']}>
								<span>Stack trace</span>
								<button type="button">Copy error</button>
							</div>
							{message ? <p class={styles['error-message']}>{message}</p> : null}
							{stack ? <pre class={styles.stack}>{stack}</pre> : null}
						</div>
					</radiant-error-details>
				) : null}
			</div>
		);
	},
});
