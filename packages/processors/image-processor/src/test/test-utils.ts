import sharp from 'sharp';

export async function createTestImage(path: string, width: number, height: number): Promise<void> {
  // Create a solid color test image
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .jpeg() // Using JPEG since our tests expect JPEG files
    .toFile(path);
}
