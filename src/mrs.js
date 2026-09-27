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
    if ((type !== 2 && type !== 3) || !/^[a-z0-9_.!*-]+$/.test(name) || name.includes("..")) {
      skipped++;
      continue;
    }
    count++;
    keys.push([...name].reverse().join(""));
    if (type === 2) keys.push([...`+.${name}`].reverse().join(""));
  }
  return { body: wrap(0, count, domainSet(keys)), count, skipped };
}

function asBigInt(ip) {
  const bytes = ip.length === 4
    ? Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, ...ip)
    : ip;
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function ipRange({ ip, prefix }) {
  const bits = BigInt(ip.length * 8);
  const hostBits = bits - BigInt(prefix);
  const base = asBigInt(ip);
  const mask = ((1n << bits) - 1n) ^ ((1n << hostBits) - 1n);
  const offset = ip.length === 4 ? 0xffffn << 32n : 0n;
  const from = (base & mask) | offset;
  return { from, to: from | ((1n << hostBits) - 1n) };
}

export function ipMrs(networks) {
  if (!networks.length) throw new Error("MRS requires at least one IP rule");
  const ranges = networks.map(ipRange).sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.from <= last.to + 1n) {
      if (range.to > last.to) last.to = range.to;
    } else merged.push({ ...range });
  }
  const pairs = new Uint8Array(merged.length * 32);
  merged.forEach((range, index) => {
    const from = join([u64(range.from >> 64n), u64(range.from & ((1n << 64n) - 1n))]);
    const to = join([u64(range.to >> 64n), u64(range.to & ((1n << 64n) - 1n))]);
    pairs.set(from, index * 32);
    pairs.set(to, index * 32 + 16);
  });
  const body = join([Uint8Array.of(1), u64(merged.length), pairs]);
  return { body: wrap(1, networks.length, body), count: networks.length, skipped: 0 };
}
