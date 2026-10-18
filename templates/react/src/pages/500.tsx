import { eco, isDevelopmentRuntime } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import { useState, type ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';
import './500.css';

export default eco.page<ErrorPageTemplateProps, ReactNode>({
	layout: BaseLayout,

	render: ({ message, stack }) => {
		return (
			<div className="error500">
				<p className="error500__status">ERROR 500</p>
				<h1>Something went wrong</h1>
				<p>Our server hit an unexpected error. Please try again in a moment.</p>
				{isDevelopmentRuntime() && (message || stack) ? (
					<ErrorDiagnostics message={message} stack={stack} />
				) : null}
			</div>
		);
	},
});

function ErrorDiagnostics({ message, stack }: Pick<ErrorPageTemplateProps, 'message' | 'stack'>) {
	const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
	const details = [message ? `Message: ${message}` : '', stack ? `Stack:\n${stack}` : '']
		.filter(Boolean)
		.join('\n\n');

	const copyDetails = async () => {
		try {
			await navigator.clipboard.writeText(details);
			setCopyState('copied');
		} catch {
			setCopyState('failed');
		}
		window.setTimeout(() => setCopyState('idle'), 2000);
	};

	return (
		<section className="error500__diagnostics" aria-label="Error diagnostics">
			<div className="error500__diagnostics-header">
				<span>Stack trace</span>
				<button type="button" onClick={copyDetails} aria-live="polite">
					{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy error'}
				</button>
			</div>
			{message ? <p className="error500__error-message">{message}</p> : null}
			{stack ? <pre className="error500__stack">{stack}</pre> : null}
		</section>
	);
}
