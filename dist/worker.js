import { deriveKey, digest, transform, parsePNG, validateMetadata, decodeOwnPNG, encodePNG, MAX_PIXELS, MAX_BYTES } from './core.js';
import { transformGilbert } from './gilbert.js';

self.onmessage = async ({ data: { file, password, mode, algorithm = 'ph1' } }) => {
  try {
    if (file.size > MAX_BYTES) throw new Error('图片超过 50 MB，请选择更小的图片。');
    if (!['gilbert', 'ph1'].includes(algorithm)) throw new Error('无法识别图片处理方式。');
    if (algorithm === 'ph1' && (!password || password.length > 256)) throw new Error('请填写 1–256 个字符的口令。');
    const buffer = new Uint8Array(await file.arrayBuffer());
    const parsed = parsePNG(buffer, true);
    let width, height, pixels, metadata;
    self.postMessage({ progress: 15, message: '正在读取图片…' });
    if (algorithm === 'gilbert') {
      if (parsed?.metadata?.version === 'PH1') throw new Error('这是旧版 PH1 口令图，请切换到口令模式并输入原口令。');
      if (parsed && parsed.header.width * parsed.header.height > MAX_PIXELS) throw new Error('图片超过 1200 万像素，请先缩小尺寸。');
      const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
      ({ width, height } = image);
      if (width * height > MAX_PIXELS) { image.close(); throw new Error('图片超过 1200 万像素，请先缩小尺寸。'); }
      // Read our own RGBA PNG directly when possible to preserve alpha exactly.
      if (parsed && parsed.header.colorType === 6 && parsed.header.bitDepth === 8 && !parsed.header.interlace) {
        try { pixels = await decodeOwnPNG(parsed); } catch { /* Other PNG filters use the browser decoder below. */ }
      }
      if (!pixels) {
        const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        pixels = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
      }
      image.close();
      self.postMessage({ progress: 35, message: mode === 'restore' ? '正在按分享模式还原…' : '正在生成免口令混淆图…' });
      const output = transformGilbert(pixels, width, height, mode === 'restore');
      self.postMessage({ progress: 75, message: '正在生成 PNG…' });
      const png = await encodePNG(output, width, height);
      self.postMessage({ done: true, blob: new Blob([png], { type: 'image/png' }), width, height, verified: false, algorithm });
      return;
    }
    if (mode === 'restore') {
      if (!parsed?.metadata) throw new Error('未找到还原参数。请上传本站生成的原始混淆 PNG，截图或其他工具生成的图片无法还原。');
      metadata = parsed.metadata;
      validateMetadata(metadata, parsed.header);
      ({ width, height } = parsed.header);
      const key = await deriveKey(password, metadata.nonce);
      if (await digest(new TextEncoder().encode('verify/' + key)) !== metadata.keyCheck) throw new Error('口令不正确，请检查大小写、空格后重试。');
      pixels = await decodeOwnPNG(parsed);
    } else {
      // Enforce image limits before decoding where PNG headers are available.
      if (parsed && (!parsed.header.width || !parsed.header.height || parsed.header.width * parsed.header.height > MAX_PIXELS)) throw new Error('图片超过 1200 万像素，请先缩小尺寸。');
      if (parsed?.metadata) {
        validateMetadata(parsed.metadata, parsed.header);
        ({ width, height } = parsed.header);
        pixels = await decodeOwnPNG(parsed);
      } else {
        const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
        ({ width, height } = image);
        if (width * height > MAX_PIXELS) { image.close(); throw new Error('图片超过 1200 万像素，请先缩小尺寸。'); }
        const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0); image.close();
        pixels = new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer);
      }
      const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
      const key = await deriveKey(password, nonce);
      metadata = { version: 'PH1', width, height, nonce, checksum: await digest(pixels), keyCheck: await digest(new TextEncoder().encode('verify/' + key)) };
    }
    self.postMessage({ progress: 35, message: mode === 'restore' ? '正在还原像素…' : '正在打乱像素…' });
    const key = await deriveKey(password, metadata.nonce);
    const output = transform(pixels, width, height, key, mode === 'restore');
    self.postMessage({ progress: 70, message: '正在生成无损 PNG…' });
    if (mode === 'restore' && await digest(output) !== metadata.checksum) throw new Error('图片完整性校验失败。文件可能经过压缩、修改或损坏，请使用原始 PNG。');
    const png = await encodePNG(output, width, height, mode === 'restore' ? null : metadata);
    self.postMessage({ done: true, blob: new Blob([png], { type: 'image/png' }), width, height, verified: mode === 'restore' });
  } catch (error) {
    const known = /图片|PNG|口令|像素|还原|文件/.test(error.message);
    self.postMessage({ error: known ? error.message : '无法处理这张图片，请检查文件格式，或更换一张较小的图片。' });
  }
};
