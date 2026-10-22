// SPDX-License-Identifier: BSD-2-Clause
// Adapted from gilbert2d, Copyright (c) 2018 Jakub Červený.
// https://github.com/jakubcerveny/gilbert — see gilbert-LICENSE.txt.
import { MAX_PIXELS } from './core.js';

export function gilbertOrder(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new Error('图片尺寸无效，最多支持 1200 万像素。');
  const order = new Uint32Array(width * height);
  let cursor = 0;
  function visit(x, y, ax, ay, bx, by) {
    const w = Math.abs(ax + ay), h = Math.abs(bx + by);
    const dx = Math.sign(ax), dy = Math.sign(ay), ex = Math.sign(bx), ey = Math.sign(by);
    if (h === 1) {
      for (let i = 0; i < w; i++, x += dx, y += dy) order[cursor++] = x + y * width;
      return;
    }
    if (w === 1) {
      for (let i = 0; i < h; i++, x += ex, y += ey) order[cursor++] = x + y * width;
      return;
    }
    // Floor (including negative components) is required for compatibility.
    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2);
    let bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
    if (2 * w > 3 * h) {
      if (Math.abs(ax2 + ay2) % 2 && w > 2) { ax2 += dx; ay2 += dy; }
      visit(x, y, ax2, ay2, bx, by);
      visit(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by);
    } else {
      if (Math.abs(bx2 + by2) % 2 && h > 2) { bx2 += ex; by2 += ey; }
      visit(x, y, bx2, by2, ax2, ay2);
      visit(x + bx2, y + by2, ax, ay, bx - bx2, by - by2);
      visit(x + ax - dx + bx2 - ex, y + ay - dy + by2 - ey, -bx2, -by2, -(ax - ax2), -(ay - ay2));
    }
  }
  if (width >= height) visit(0, 0, width, 0, 0, height);
  else visit(0, 0, 0, height, width, 0);
  return order;
}

// Public fixed-parameter mapping used by the verified Pixel sample.
// No password, nonce or PNG metadata is required. Dimensions must stay intact.
export function transformGilbert(data, width, height, reverse = false) {
  const order = gilbertOrder(width, height), length = order.length;
  if (data.length !== length * 4) throw new Error('图片像素数据与尺寸不符。');
  const shift = Math.round((Math.sqrt(5) - 1) / 2 * length);
  const result = new Uint8Array(data.length);
  for (let i = 0; i < length; i++) {
    const first = order[i] * 4, second = order[(i + shift) % length] * 4;
    const from = reverse ? second : first, to = reverse ? first : second;
    result[to] = data[from]; result[to + 1] = data[from + 1];
    result[to + 2] = data[from + 2]; result[to + 3] = data[from + 3];
  }
  return result;
}
