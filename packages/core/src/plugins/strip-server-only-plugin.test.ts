import { describe, it, expect } from 'bun:test';
import { transformSource } from './strip-server-only-plugin';

describe('stripServerOnlyPlugin transformation', () => {
	it('should strip middleware property from eco.page', () => {
		const source = `import { authMiddleware } from '@/handlers/auth';

export default eco.page({
	middleware: [authMiddleware],
	cache: 'dynamic',
	render: () => <div>Hello</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain('middleware:');
		expect(result).toContain('cache:');
		expect(result).toContain('render:');
	});

	it('should strip requires property from eco.page', () => {
		const source = `export default eco.page({
	requires: ['session'],
	cache: 'dynamic',
	render: ({ locals }) => <div>{locals.session.user.name}</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain('requires:');
		expect(result).toContain('cache:');
		expect(result).toContain('render:');
	});

	it('should strip both middleware and requires', () => {
		const source = `import { authMiddleware } from '@/handlers/auth';

export default eco.page({
	middleware: [authMiddleware],
	requires: ['session'],
	cache: 'dynamic',
	render: ({ locals }) => <div>{locals.session.user.name}</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain('middleware:');
		expect(result).not.toContain('requires:');
		expect(result).toContain('cache:');
		expect(result).toContain('render:');
	});

	it('should return null for files without eco.page or eco.component', () => {
		const source = `export const MyComponent = () => <div>Hello</div>;`;

		const result = transformSource(source, 'component.tsx');

		expect(result).toBeNull();
	});

	it('should return null for files without server-only properties', () => {
		const source = `export default eco.page({
	cache: 'static',
	render: () => <div>Hello</div>
});`;

		const result = transformSource(source, 'static-page.tsx');

		expect(result).toBeNull();
	});

	it('should handle eco.component as well', () => {
		const source = `import { authMiddleware } from '@/handlers/auth';

export const Dashboard = eco.component({
	middleware: [authMiddleware],
	render: () => <div>Dashboard</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain('middleware:');
		expect(result).toContain('render:');
	});

	it('should remove unused imports after stripping middleware', () => {
		const source = `import { authMiddleware } from '@/handlers/auth';

export default eco.page({
	middleware: [authMiddleware],
	cache: 'dynamic',
	render: () => <div>Hello</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain("import { authMiddleware } from '@/handlers/auth'");
		expect(result).not.toContain('middleware:');
	});

	it('should keep imports that are used elsewhere', () => {
		const source = `import { authMiddleware, someHelper } from '@/handlers/auth';

export default eco.page({
	middleware: [authMiddleware],
	cache: 'dynamic',
	render: () => <div>{someHelper()}</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain('middleware:');
		expect(result).toContain("import { authMiddleware, someHelper } from '@/handlers/auth'");
	});

	it('should remove multiple middleware imports', () => {
		const source = `import { authMiddleware } from '@/handlers/auth';
import { rateLimitMiddleware } from '@/handlers/rate-limit';

export default eco.page({
	middleware: [authMiddleware, rateLimitMiddleware],
	cache: 'dynamic',
	render: () => <div>Hello</div>
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain("import { authMiddleware } from '@/handlers/auth'");
		expect(result).not.toContain("import { rateLimitMiddleware } from '@/handlers/rate-limit'");
		expect(result).not.toContain('middleware:');
	});

	it('should preserve code structure after stripping', () => {
		const source = `import { eco } from '@ecopages/core';
import { authMiddleware } from '@/handlers/auth';
import { DashboardContent } from '@/components/dashboard-content';

export default eco.page({
	layout: AuthedLayout,
	cache: 'dynamic',
	middleware: [authMiddleware],
	metadata: () => ({
		title: 'Dashboard',
	}),
	render: ({ locals }) => {
		return <DashboardContent user={locals?.session?.user} />;
	},
});`;

		const result = transformSource(source, 'dashboard.tsx');

		expect(result).not.toBeNull();
		expect(result).not.toContain('middleware:');
		expect(result).not.toContain("import { authMiddleware } from '@/handlers/auth'");
		expect(result).toContain("import { eco } from '@ecopages/core'");
		expect(result).toContain("import { DashboardContent } from '@/components/dashboard-content'");
		expect(result).toContain('layout: AuthedLayout');
		expect(result).toContain("cache: 'dynamic'");
		expect(result).toContain('metadata:');
		expect(result).toContain('render:');
	});
});
