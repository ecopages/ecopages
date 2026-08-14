import { eco } from '@ecopages/core';

export default eco.page({
	cache: 'dynamic',
	render: () => {
		const timestamp = Date.now();
		return `
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
