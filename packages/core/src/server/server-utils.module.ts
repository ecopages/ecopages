const ContentTypeMap = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
  ['svg', 'image/svg+xml'],
  ['tiff', 'image/tiff'],
  ['webp', 'image/webp'],
  ['ico', 'image/x-icon'],
  ['mp3', 'audio/mpeg'],
  ['ogg', 'audio/ogg'],
  ['wav', 'audio/wav'],
  ['mp4', 'video/mp4'],
  ['webm', 'video/webm'],
  ['ogv', 'video/ogg'],
  ['mov', 'video/quicktime'],
  ['txt', 'text/plain'],
  ['html', 'text/html'],
  ['css', 'text/css'],
  ['js', 'text/javascript'],
  ['json', 'application/json'],
  ['ttf', 'font/ttf'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['otf', 'font/otf'],
  ['gz', 'application/x-gzip'],
  ['zip', 'application/zip'],
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
]);

export const getContentType = (file: string): string => {
  const extension = file.split('.').pop() || 'txt';
  return ContentTypeMap.get(extension) || 'text/plain';
};

export const ServerUtils = {
  getContentType,
};
