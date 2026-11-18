import { open } from 'fs/promises';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Verifies the file's magic bytes match the MIME type the client claimed. */
export async function hasValidImageSignature(
  path: string,
  mimetype: string,
): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const buf = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buf, 0, 12, 0);
    if (bytesRead < 12) return false;

    switch (mimetype) {
      case 'image/jpeg':
        return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      case 'image/png':
        return buf.subarray(0, 8).equals(PNG_SIGNATURE);
      case 'image/webp':
        return (
          buf.toString('ascii', 0, 4) === 'RIFF' &&
          buf.toString('ascii', 8, 12) === 'WEBP'
        );
      default:
        return false;
    }
  } finally {
    await handle.close();
  }
}
