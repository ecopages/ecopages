import { describe, expect, it } from 'bun:test';
import { fileSystem } from '@ecopages/file-system';

describe('fileSystem', () => {
	it('should be defined', () => {
		expect(fileSystem).toBeDefined();
	});

	describe('glob', () => {
		it('should be defined', () => {
			expect(fileSystem.glob).toBeDefined();
		});
	});

	describe('Should return a list of files', () => {
		it('should return a list of files', async () => {
			const files = await fileSystem.glob(['.'], {
				cwd: __dirname,
			});
			expect(files).toBeDefined();
			expect(files).toBeInstanceOf(Array);
		});
	});
});
