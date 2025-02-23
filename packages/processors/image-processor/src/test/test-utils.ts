import type { Sharp } from 'sharp';
import sharp from 'sharp';

export async function createTestImage(path: string, width: number, height: number, color = '#ffffff'): Promise<Sharp> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  });

  await image.toFile(path);
  return image;
}
