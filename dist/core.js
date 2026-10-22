// PH1: deterministic Fisher–Yates permutation. Visual obfuscation, not encryption.
export const MAX_PIXELS = 12_000_000;
export const MAX_BYTES = 50 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const keyword = 'PixelHideaway';

export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function deriveKey(password, nonce) {
  return digest(encoder.encode(`PixelHideaway/PH1/${nonce}/${password}`));
}
export function makePermutation(length, key) {
  let a = parseInt(key.slice(0, 8), 16) | 0, b = parseInt(key.slice(8, 16), 16) | 0;
  let c = parseInt(key.slice(16, 24), 16) | 0, d = parseInt(key.slice(24, 32), 16) | 0;
  function next() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = ((a + b | 0) + d | 0); d = d + 1 | 0;
    a = b ^ b >>> 9; b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11); c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
  for (let i = 0; i < 16; i++) next();
  const order = new Uint32Array(length);
  for (let i = 0; i < length; i++) order[i] = i;
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  return order;
}
export function transform(data, width, height, key, reverse = false) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS || data.length !== width * height * 4) throw new Error('图片尺寸无效，最多支持 1200 万像素。');
  const order = makePermutation(width * height, key);
  const output = new Uint8Array(data.length);
  for (let i = 0; i < order.length; i++) {
    const from = (reverse ? order[i] : i) * 4;
    const to = (reverse ? i : order[i]) * 4;
    output[to] = data[from]; output[to + 1] = data[from + 1];
    output[to + 2] = data[from + 2]; output[to + 3] = data[from + 3];
  }
  return output;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}
function chunk(type, data) {
  const name = encoder.encode(type), out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length); out.set(name, 4); out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}
export function parsePNG(bytes, verify = false) {
  if (bytes.length < 8 || !signature.every((v, i) => bytes[i] === v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, header = null, metadata = null, ended = false;
  const idats = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error('PNG 文件不完整，请重新上传原始文件。');
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (verify && view.getUint32(offset + 8 + length) !== crc32(bytes.subarray(offset + 4, offset + 8 + length))) throw new Error('PNG 文件校验失败，文件可能已经损坏。');
    if (type === 'IHDR') {
      if (length !== 13 || header) throw new Error('PNG 图片头无效。');
      header = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12), bitDepth: data[8], colorType: data[9], compression: data[10], filter: data[11], interlace: data[12] };
    }
    if (type === 'IDAT') idats.push(data);
    if (type === 'tEXt' && data.length < 8192) {
      const zero = data.indexOf(0);
      if (decoder.decode(data.subarray(0, zero)) === keyword) {
        if (metadata) throw new Error('图片包含重复的还原参数。');
        try { metadata = JSON.parse(decoder.decode(data.subarray(zero + 1))); }
        catch { throw new Error('图片中的还原参数损坏。'); }
      }
    }
    offset += length + 12;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!header || !ended) throw new Error('PNG 文件不完整。');
  return { header, metadata, idats };
}
export function validateMetadata(meta, header) {
  if (!meta || meta.version !== 'PH1' || !/^[a-f0-9]{32}$/.test(meta.nonce) || !/^[a-f0-9]{64}$/.test(meta.checksum) || !/^[a-f0-9]{64}$/.test(meta.keyCheck)) throw new Error('无法识别还原参数，请使用本站生成的原始 PNG。');
  if (header.width !== meta.width || header.height !== meta.height || !Number.isInteger(meta.width) || !Number.isInteger(meta.height) || meta.width < 1 || meta.height < 1 || meta.width * meta.height > MAX_PIXELS) throw new Error('图片尺寸与还原参数不符，请勿缩放或裁剪混淆图。');
}
export async function encodePNG(data, width, height, metadata = null) {
  const header = new Uint8Array(13), hv = new DataView(header.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height); header[8] = 8; header[9] = 6;
  const stride = width * 4, raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const parts = [signature, chunk('IHDR', header)];
  if (metadata) parts.push(chunk('tEXt', encoder.encode(keyword + '\0' + JSON.stringify(metadata))));
  parts.push(chunk('IDAT', compressed), chunk('IEND', new Uint8Array()));
  return concat(parts);
}
export async function decodeOwnPNG(parsed) {
  const { header: h } = parsed;
  if (h.bitDepth !== 8 || h.colorType !== 6 || h.compression !== 0 || h.filter !== 0 || h.interlace !== 0) throw new Error('图片格式已改变，请上传本站下载的原始 PNG。');
  const expected = (h.width * 4 + 1) * h.height;
  const reader = new Blob(parsed.idats).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const raw = new Uint8Array(expected);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error('PNG 像素数据长度异常。');
      raw.set(value, offset); offset += value.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (offset !== expected) throw new Error('PNG 像素数据不完整。');
  const stride = h.width * 4, pixels = new Uint8Array(stride * h.height);
  for (let y = 0; y < h.height; y++) {
    if (raw[y * (stride + 1)] !== 0) throw new Error('PNG 已被其他软件重新编码，请使用原始文件。');
    pixels.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return pixels;
}
