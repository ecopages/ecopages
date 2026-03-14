import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

const commands = [
	{
		body: null,
		curl: 'curl http://localhost:3000/api/v1/ping',
		description: 'Checks the request middleware path and returns the request locals attached on the server.',
		headers: {},
		label: 'Ping with locals',
		method: 'GET',
		path: '/api/v1/ping',
	},
	{
		body: { message: 'hello kitchen sink', source: 'api-lab' },
		curl: 'curl -X POST http://localhost:3000/api/v1/echo -H \'content-type: application/json\' -d \'{"message":"hello kitchen sink"}\'',
		description: 'Posts JSON to the echo endpoint and confirms request parsing plus response serialization.',
		headers: {
			'content-type': 'application/json',
		},
		label: 'Echo payload',
		method: 'POST',
		path: '/api/v1/echo',
	},
	{
		body: null,
		curl: 'curl http://localhost:3000/api/v1/catalog/semantic-html',
		description:
			'Fetches the same semantic-shell catalog record that powers the static route under /catalog/[slug].',
		headers: {},
		label: 'Catalog lookup',
		method: 'GET',
		path: '/api/v1/catalog/semantic-html',
	},
	{
		body: null,
		curl: "curl http://localhost:3000/api/v1/admin/announcements -H 'x-kitchen-role: admin'",
		description: 'Exercises the grouped admin route with the role header needed by the admin middleware.',
		headers: {
			'x-kitchen-role': 'admin',
		},
		label: 'Admin list',
		method: 'GET',
		path: '/api/v1/admin/announcements',
	},
	{
		body: {
			message: 'Grouped handler mutation path exercised',
			title: 'Fresh deploy',
		},
		curl: 'curl -X POST http://localhost:3000/api/v1/admin/announcements -H \'x-kitchen-role: admin\' -H \'content-type: application/json\' -d \'{"title":"Fresh deploy","message":"Grouped handler mutation path exercised"}\'',
		description: 'Creates a new announcement through the grouped admin handler so you can see mutable JSON output.',
		headers: {
			'content-type': 'application/json',
			'x-kitchen-role': 'admin',
		},
		label: 'Admin create',
		method: 'POST',
		path: '/api/v1/admin/announcements',
	},
] as const;

export default eco.page({
	dependencies: {
		components: [BaseLayout],
		scripts: ['./api-lab.script.ts'],
		stylesheets: ['./api-lab.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'API lab',
		description: 'Manual entry points for the explicit API handlers and grouped admin routes.',
	}),
	render: () => {
		return (
			<div class="api-lab">
				<section class="api-lab__intro">
					<p class="api-lab__eyebrow">Explicit APIs</p>
					<h1 class="api-lab__title">Handlers registered directly from app.ts</h1>
					<p class="api-lab__summary">
						The kitchen sink keeps JSON handlers next to pages so route registration, middleware, locals,
						and error handling all live in one place.
					</p>
					<ul class="api-lab__route-list">
						<li>
							<span class="api-lab__route-path">/api/v1/ping</span> returns request locals injected by
							middleware.
						</li>
						<li>
							<span class="api-lab__route-path">/api/v1/echo</span> reflects JSON bodies and confirms POST
							handling.
						</li>
						<li>
							<span class="api-lab__route-path">/api/v1/catalog/:slug</span> exposes the same data used by
							the static catalog page.
						</li>
						<li>
							<span class="api-lab__route-path">/api/v1/admin/*</span> is protected by grouped middleware
							and shared error handling.
						</li>
					</ul>
				</section>
				<section class="api-lab__workspace">
					<div class="api-lab__workspace-grid">
						<div class="api-lab__commands-panel">
							<p class="api-lab__panel-label">Click a command</p>
							<div class="api-lab__commands" data-api-command-list>
								{commands.map((command, index) => (
									<button
										type="button"
										class="api-lab__command"
										data-api-command="true"
										data-body={command.body ? JSON.stringify(command.body) : ''}
										data-curl={command.curl}
										data-headers={JSON.stringify(command.headers)}
										data-label={command.label}
										data-method={command.method}
										data-path={command.path}
										data-selected={index === 0 ? 'true' : 'false'}
										aria-pressed={index === 0 ? 'true' : 'false'}
									>
										<div class="api-lab__command-header">
											<div class="api-lab__command-copy">
												<p class="api-lab__command-method">{command.method}</p>
												<h2 class="api-lab__command-title">{command.label}</h2>
											</div>
											<span class="api-lab__command-cta">Run</span>
										</div>
										<p class="api-lab__command-description">{command.description}</p>
										<pre class="api-lab__command-code">
											<code>{command.curl}</code>
										</pre>
									</button>
								))}
							</div>
						</div>
						<div class="api-lab__viewer" data-api-response-viewer>
							<div class="api-lab__viewer-header">
								<div>
									<p class="api-lab__panel-label">Response viewer</p>
									<h2 class="api-lab__viewer-title" data-response-label>
										Select a command
									</h2>
								</div>
								<div class="api-lab__viewer-badges">
									<span class="api-lab__viewer-badge" data-response-status>
										Idle
									</span>
									<span class="api-lab__viewer-badge" data-response-time>
										0 ms
									</span>
								</div>
							</div>
							<div class="api-lab__viewer-sections">
								<div class="api-lab__viewer-section">
									<p class="api-lab__panel-label">Request</p>
									<pre class="api-lab__viewer-code">
										<code data-response-request>
											Click a command to send a request from the browser.
										</code>
									</pre>
								</div>
								<div class="api-lab__viewer-section">
									<p class="api-lab__panel-label">Response body</p>
									<pre class="api-lab__viewer-code api-lab__viewer-code--body">
										<code data-response-body>Waiting for input.</code>
									</pre>
								</div>
								<div class="api-lab__viewer-section">
									<p class="api-lab__panel-label">Headers</p>
									<pre class="api-lab__viewer-code">
										<code data-response-headers>No response headers yet.</code>
									</pre>
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>
		);
	},
});
