const sharp = require('sharp');

// Instagram's publishing API only takes JPEG images, between 4:5 (portrait) and 1.91:1
// (landscape), up to 8 MB. Anything else is rejected rather than cropped, so images that
// don't fit are converted here: transparent areas become white, and the padding that brings
// the shape into range uses the image's dominant color, so nothing in the graphic is cut off.

const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;
const MAX_WIDTH = 1440;
const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = 'social-media';

async function inspect(bytes) {
  const image = sharp(bytes, { failOn: 'none' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error('That file isn’t an image Instagram can use.');
  // Phone photos often store their rotation separately; width and height here are as displayed.
  const rotated = (meta.orientation || 1) >= 5;
  return { format: meta.format, width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height, size: bytes.length };
}

function needsChange({ format, width, height, size }) {
  const ratio = width / height;
  return format !== 'jpeg' || ratio < MIN_RATIO - 0.005 || ratio > MAX_RATIO + 0.005 || size > MAX_BYTES || width > 4000;
}

async function toInstagramJpeg(bytes) {
  const info = await inspect(bytes);
  // Transparent areas become white (most transparent graphics are made for light backgrounds);
  // padding then uses the dominant color of the filled-in image so it blends in.
  const flat = await sharp(bytes, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).toBuffer();
  const { dominant } = await sharp(flat).stats();
  const background = { r: dominant.r, g: dominant.g, b: dominant.b, alpha: 1 };
  // Scale first so the padded result is at most 1440 pixels wide.
  const ratio = info.width / info.height;
  const targetRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  const fullWidth = ratio < targetRatio ? info.height * targetRatio : info.width;
  const scale = Math.min(MAX_WIDTH, fullWidth) / fullWidth;
  const width = Math.max(1, Math.min(Math.round(fullWidth * scale), Math.round(info.width * scale)));
  const canvasWidth = Math.max(width, Math.round(fullWidth * scale));
  const height = Math.max(1, Math.round(info.height * scale));
  const canvasHeight = Math.max(height, Math.round(canvasWidth / targetRatio));
  const left = Math.max(0, Math.floor((canvasWidth - width) / 2));
  const top = Math.max(0, Math.floor((canvasHeight - height) / 2));
  const resized = await sharp(flat).resize(width, height, { fit: 'fill' }).toBuffer();
  let quality = 90;
  let output;
  do {
    output = await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 3, background } })
      .composite([{ input: resized, left, top }])
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    quality -= 10;
  } while (output.length > MAX_BYTES && quality >= 50);
  return { bytes: output, width: canvasWidth, height: canvasHeight, padded: ratio !== targetRatio, converted: info.format !== 'jpeg' };
}

async function uploadPublic(path, bytes, type) {
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': type, 'x-upsert': 'true', 'cache-control': '3600' },
    body: bytes
  });
  if (!response.ok) throw new Error(`Storage returned HTTP ${response.status} for the converted image.`);
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// Returns a URL Instagram will accept: the original when it already fits, otherwise a converted copy.
async function instagramImageUrl(url, { download, key }) {
  const file = await download(url);
  const info = await inspect(file.bytes);
  if (!needsChange(info)) return { url, changed: false };
  const result = await toInstagramJpeg(file.bytes);
  return { url: await uploadPublic(`system/instagram/${key}.jpg`, result.bytes, 'image/jpeg'), changed: true, padded: result.padded, converted: result.converted };
}

module.exports = { instagramImageUrl, toInstagramJpeg, inspect, needsChange, MIN_RATIO, MAX_RATIO };
