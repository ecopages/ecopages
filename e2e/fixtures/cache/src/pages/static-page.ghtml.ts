import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export default eco.page({
	cache: 'static',
	render: () => {
		const timestamp = Date.now();
		return html`
			<html>
				<body>
					<h1>Static Page</h1>
					<div id="timestamp">${timestamp}</div>
					<p>This page is cached indefinitely.</p>
				</body>
			</html>
		`;
	},
});
