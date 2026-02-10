import sharp from 'sharp';
import jsQR from 'jsqr';

export async function decodeQRCodeFromBase64(base64Image: string): Promise<string | null> {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    return code?.data ?? null;
  } catch {
    return null;
  }
}
