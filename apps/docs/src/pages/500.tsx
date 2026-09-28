import { eco } from '@ecopages/core';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiHeading, RuiHeadingDescription, RuiHeadingEyebrow, RuiHeadingTitle } from '@ecopages/radiant-ui/heading';
import { ErrorDiagnostics } from '@/components/error-diagnostics';
import { DocsLayout } from '@/layouts/docs-layout';
import type { Error500TemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export default eco.page<Error500TemplateProps, JsxRenderable>({
	layout: DocsLayout,
	dependencies: {
		stylesheets: ['./500.css'],
	},

	render: ({ message, stack }) => {
		const showDiagnostics = process.env.NODE_ENV === 'development' && Boolean(message || stack);

		return (
			<div class="error500 unstyled">
				<div class="error500__content">
					<RuiHeading align="center" class="error500__heading">
						<RuiHeadingEyebrow>ERROR 500</RuiHeadingEyebrow>
						<RuiHeadingTitle as="h1">Something went wrong</RuiHeadingTitle>
						<RuiHeadingDescription>
							The documentation site hit an unexpected error. Try again, or return to a stable starting
							point.
						</RuiHeadingDescription>
					</RuiHeading>
					{showDiagnostics ? <ErrorDiagnostics message={message} stack={stack} /> : null}
					<div class="error500__actions">
						<RuiButton href="/" variant="outline">
							Return Home
						</RuiButton>
						<RuiButton href="/docs/getting-started/introduction" variant="ghost">
							Open docs
						</RuiButton>
					</div>
					<p class="error500__hint">Error details are available only while developing locally.</p>
				</div>
			</div>
		);
	},
});
