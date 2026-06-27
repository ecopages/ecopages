import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

export default eco.page({
	cache: 'dynamic',
	render: () => {
		const timestamp = Date.now();
		return html`
			<html>
				<body>
					<h1>Dynamic Page (No Cache)</h1>
					<div id="timestamp">${timestamp}</div>
					<p>This page is never cached.</p>
				</body>
			</html>
		`;
	},
});
