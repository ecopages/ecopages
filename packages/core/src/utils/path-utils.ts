import path from 'node:path';

function getNameDescriptor(filePath: string) {
  const { name } = path.parse(filePath);
  const nameParts = name.split('.');
  const descriptor = nameParts.length > 1 ? nameParts.pop() : undefined;

  return descriptor;
}

export const PathUtils = {
  getNameDescriptor,
};
