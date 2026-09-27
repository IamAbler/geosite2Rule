// Mihomo MRS v1: zstd frame containing a header and a domain set or IP range set.
// Format references: mihomo/rules/provider/mrs_converter.go,
// component/trie/domain_set_bin.go, component/cidr/ipcidr_set_bin.go.
function u64(value) {
  let number = BigInt(value);
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(number & 255n);
    number >>= 8n;
  }
  return bytes;
}

function join(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// Zstandard raw blocks are valid frames. This keeps conversion dependency free,
// though the resulting .mrs is larger than one produced by mihomo's compressor.
function zstdRaw(data) {
  const parts = [Uint8Array.of(0x28, 0xb5, 0x2f, 0xfd, 0xa0)];
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, data.length, true);
  parts.push(size);
  const blockSize = 128 * 1024;
  for (let offset = 0; offset < data.length; offset += blockSize) {
    const length = Math.min(blockSize, data.length - offset);
    const header = length * 8 + (offset + length === data.length ? 1 : 0);
    parts.push(Uint8Array.of(header & 255, (header >> 8) & 255, (header >> 16) & 255));
    parts.push(data.subarray(offset, offset + length));
  }
  return join(parts);
}

function wrap(behavior, count, body) {
  const raw = join([
    Uint8Array.of(0x4d, 0x52, 0x53, 1, behavior),
    u64(count), u64(0), body
  ]);
  return zstdRaw(raw);
}

function setBit(bitmap, bit) {
  const index = bit >> 3;
  while (bitmap.length <= index) bitmap.push(0);
  bitmap[index] |= 1 << (bit & 7);
}

function bitmapBytes(bitmap) {
  const words = Math.ceil(bitmap.length / 8);
  const result = new Uint8Array(words * 8);
  for (let word = 0; word < words; word++) {
    for (let byte = 0; byte < 8; byte++) result[word * 8 + byte] = bitmap[word * 8 + 7 - byte] || 0;
  }
  return result;
}

function domainSet(keys) {
  const sorted = [...new Set(keys)].sort();
  if (!sorted.length) throw new Error("MRS requires at least one domain rule");
  const leaves = [];
  const labelsBitmap = [];
  const labels = [];
  let queue = [{ start: 0, end: sorted.length }];
  let nodeId = 0;
  let labelIndex = 0;
  for (let column = 0; queue.length; column++) {
    const next = [];
    for (const range of queue) {
      let first = range.start;
      if (column === sorted[first].length) {
        setBit(leaves, nodeId);
        first++;
      } else {
        // Keep the word containing this node, even when its terminal bit is zero.
        while (leaves.length <= (nodeId >> 3)) leaves.push(0);
      }
      for (let i = first; i < range.end;) {
        let end = i + 1;
        const label = sorted[i].charCodeAt(column);
        while (end < range.end && sorted[end].charCodeAt(column) === label) end++;
        next.push({ start: i, end });
        labels.push(label);
        while (labelsBitmap.length <= (labelIndex >> 3)) labelsBitmap.push(0);
        labelIndex++;
        i = end;
      }
      setBit(labelsBitmap, labelIndex++);
      nodeId++;
    }
    queue = next;
  }
  const leafBytes = bitmapBytes(leaves);
  const bitmap = bitmapBytes(labelsBitmap);
  const labelBytes = Uint8Array.from(labels);
  return join([
    Uint8Array.of(1), u64(leafBytes.length / 8), leafBytes,
    u64(bitmap.length / 8), bitmap,
    u64(labelBytes.length), labelBytes
  ]);
}

export function domainMrs(domains) {
  const keys = [];
  let skipped = 0;
  let count = 0;
  for (const { type, value } of domains) {
    const name = value.toLowerCase();
    if ((type !== 2 && type !== 3) || !/^[a-z0-9_.!*-]+$/.test(name) ||
      name.startsWith(".") || name.endsWith(".") || name.includes("..") || !/[a-z0-9]/.test(name)) {
      skipped++;
      continue;
    }
    count++;
    keys.push([...name].reverse().join(""));
    if (type === 2) keys.push([...`+.${name}`].reverse().join(""));
  }
  return { body: wrap(0, count, domainSet(keys)), count, skipped };
}

function compareIpBytes(left, leftOffset, right, rightOffset) {
  for (let i = 0; i < 16; i++) {
    const difference = left[leftOffset + i] - right[rightOffset + i];
    if (difference) return difference;
  }
  return 0;
}

function adjacentIpBytes(from, fromOffset, to, toOffset) {
  let borrow = 1;
  for (let i = 15; i >= 0; i--) {
    const value = from[fromOffset + i] - borrow;
    borrow = value < 0 ? 1 : 0;
    if ((value & 255) !== to[toOffset + i]) return false;
  }
  return true;
}

function sortedIpRanges(networks) {
  const count = networks.length;
  const from = new Uint8Array(count * 16);
  const to = new Uint8Array(count * 16);
  for (let index = 0; index < count; index++) {
    const { ip, prefix } = networks[index];
    const offset = index * 16;
    const start = ip.length === 4 ? 12 : 0;
    if (start) {
      from[offset + 10] = to[offset + 10] = 255;
      from[offset + 11] = to[offset + 11] = 255;
    }
    for (let byte = 0; byte < ip.length; byte++) {
      const remaining = prefix - byte * 8;
      const mask = remaining >= 8 ? 255 : remaining <= 0 ? 0 : (255 << (8 - remaining)) & 255;
      const value = ip[byte] & mask;
      from[offset + start + byte] = value;
      to[offset + start + byte] = value | (~mask & 255);
    }
  }

  let order = new Uint32Array(count);
  let scratch = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  const positions = new Uint32Array(256);
  for (let column = 15; column >= 0; column--) {
    positions.fill(0);
    for (let i = 0; i < count; i++) positions[from[order[i] * 16 + column]]++;
    let total = 0;
    for (let byte = 0; byte < 256; byte++) {
      const size = positions[byte];
      positions[byte] = total;
      total += size;
    }
    for (let i = 0; i < count; i++) {
      const index = order[i];
      scratch[positions[from[index * 16 + column]]++] = index;
    }
    [order, scratch] = [scratch, order];
  }

  const pairs = new Uint8Array(count * 32);
  let mergedCount = 0;
  for (const index of order) {
    const offset = index * 16;
    const lastTo = (mergedCount - 1) * 32 + 16;
    if (mergedCount && (compareIpBytes(from, offset, pairs, lastTo) <= 0 ||
      adjacentIpBytes(from, offset, pairs, lastTo))) {
      if (compareIpBytes(to, offset, pairs, lastTo) > 0) pairs.set(to.subarray(offset, offset + 16), lastTo);
    } else {
      pairs.set(from.subarray(offset, offset + 16), mergedCount * 32);
      pairs.set(to.subarray(offset, offset + 16), mergedCount * 32 + 16);
      mergedCount++;
    }
  }
  return { pairs: pairs.subarray(0, mergedCount * 32), mergedCount };
}

export function ipMrs(networks) {
  if (!networks.length) throw new Error("MRS requires at least one IP rule");
  const { pairs, mergedCount } = sortedIpRanges(networks);
  const body = join([Uint8Array.of(1), u64(mergedCount), pairs]);
  return { body: wrap(1, networks.length, body), count: networks.length, skipped: 0 };
}
