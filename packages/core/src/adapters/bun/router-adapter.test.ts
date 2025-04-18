import { describe, expect, it, mock } from 'bun:test';
import type { Route, Routes } from '../../internal-types';
import { BunRouterAdapter } from './router-adapter';
import type { BunServerAdapter } from './server-adapter';

describe('BunRouterAdapter', () => {
  const mockServerAdapter: BunServerAdapter = {
    handleRequest: mock(() => Promise.resolve(new Response())),
  } as any;

  const adapter = new BunRouterAdapter(mockServerAdapter);

  describe('convertPath', () => {
    it('should convert dynamic route parameters', () => {
      expect((adapter as any).convertPath('/users/[id]')).toBe('/users/:id');
      expect((adapter as any).convertPath('/posts/[postId]/comments/[commentId]')).toBe(
        '/posts/:postId/comments/:commentId',
      );
    });

    it('should convert catch-all routes', () => {
      expect((adapter as any).convertPath('/docs/[...slug]')).toBe('/docs/*');
    });

    it('should handle empty paths', () => {
      expect((adapter as any).convertPath('')).toBe('/');
    });
  });

  describe('adaptRoutes', () => {
    const testRoutes: Routes = {
      exact: {
        filePath: '/about.ts',
        kind: 'exact',
        pathname: '/about',
      },
      dynamic: {
        filePath: '/users/[id].ts',
        kind: 'dynamic',
        pathname: '/users/[id]',
      },
      'catch-all': {
        filePath: '/docs/[...slug].ts',
        kind: 'catch-all',
        pathname: '/docs/[...slug]',
      },
    };

    it('should adapt routes in correct order', () => {
      const adapted = adapter.adaptRoutes(testRoutes);

      expect(Object.keys(adapted)).toEqual(['/about', '/users/:id', '/docs/*']);
    });

    it('should create route handlers', async () => {
      const adapted = adapter.adaptRoutes(testRoutes);
      const request = new Request('http://localhost/about');

      await (adapted['/about'] as any)(request);
      expect(mockServerAdapter.handleRequest).toHaveBeenCalledWith(request);
    });

    it('should handle errors in route handlers', async () => {
      mockServerAdapter.handleRequest = mock(() => Promise.reject(new Error('Test error')));

      const adapted = adapter.adaptRoutes(testRoutes);
      const request = new Request('http://localhost/about');
      const response = await (adapted['/about'] as any)(request);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
    });
  });
});
