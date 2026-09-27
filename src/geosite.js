// Wire format: https://github.com/v2fly/v2ray-core/blob/master/app/router/routercommon/common.proto
const decoder = new TextDecoder("utf-8", { fatal: true });

function corrupt() {
  throw new Error("Invalid geosite.dat protobuf data");
}

function varint(bytes, position, end) {
  let value = 0;
  let factor = 1;
  for (let i = 0; i < 10 && position < end; i++) {
    const byte = bytes[position++];
    value += (byte & 0x7f) * factor;
    if (byte < 0x80) {
      if (!Number.isSafeInteger(value)) corrupt();
      return [value, position];
    }
    factor *= 128;
  }
  corrupt();
}

function skipVarint(bytes, position, end) {
  for (let i = 0; i < 10 && position < end; i++) {
    const byte = bytes[position++];
    if (byte < 0x80) {
      if (i === 9 && byte > 1) corrupt();
      return position;
    }
  }
  corrupt();
}

function field(bytes, position, end) {
  const [tag, next] = varint(bytes, position, end);
  const number = Math.floor(tag / 8);
  const wire = tag % 8;
  if (!number) corrupt();
  if (wire === 0) {
    const after = skipVarint(bytes, next, end);
    return { number, wire, start: next, end: after, next: after };
  }
  if (wire === 1 || wire === 5) {
    const after = next + (wire === 1 ? 8 : 4);
    if (after > end) corrupt();
    return { number, wire, start: next, end: after, next: after };
  }
  if (wire === 2) {
    const [length, start] = varint(bytes, next, end);
    const after = start + length;
    if (!Number.isSafeInteger(after) || after > end) corrupt();
    return { number, wire, start, end: after, next: after };
  }
  corrupt();
}

function string(bytes, start, end) {
  return decoder.decode(bytes.subarray(start, end));
}

function visit(bytes, start, end, callback) {
  for (let position = start; position < end;) {
    const item = field(bytes, position, end);
    callback(item);
    position = item.next;
  }
}

function siteCode(bytes, start, end) {
  for (let position = start; position < end;) {
    const item = field(bytes, position, end);
    if (item.number === 1 && item.wire === 2) {
      return string(bytes, item.start, item.end).toLowerCase();
    }
    position = item.next;
  }
  return "";
}

export function listCategories(bytes) {
  const categories = [];
  visit(bytes, 0, bytes.length, item => {
    if (item.number === 1 && item.wire === 2) {
      const code = siteCode(bytes, item.start, item.end);
      if (code) categories.push(code);
    }
  });
  return [...new Set(categories)].sort();
}

function attributes(bytes, start, end) {
  const result = new Set();
  let key = "";
  let enabled = true;
  visit(bytes, start, end, item => {
    if (item.number === 1 && item.wire === 2) key = string(bytes, item.start, item.end).toLowerCase();
    if (item.number === 2 && item.wire === 0) {
      const [value] = varint(bytes, item.start, item.end);
      enabled = value !== 0;
    }
  });
  if (key && enabled) result.add(key);
  return result;
}

function domain(bytes, start, end) {
  let type = 0;
  let value = "";
  const attrs = new Set();
  visit(bytes, start, end, item => {
    if (item.number === 1 && item.wire === 0) [type] = varint(bytes, item.start, item.end);
    if (item.number === 2 && item.wire === 2) value = string(bytes, item.start, item.end);
    if (item.number === 3 && item.wire === 2) {
      for (const attr of attributes(bytes, item.start, item.end)) attrs.add(attr);
    }
  });
  return { type, value, attrs };
}

export function readCategory(bytes, category, include = [], exclude = []) {
  const domains = [];
  let found = false;
  visit(bytes, 0, bytes.length, site => {
    if (site.number !== 1 || site.wire !== 2 || siteCode(bytes, site.start, site.end) !== category) return;
    found = true;
    visit(bytes, site.start, site.end, item => {
      if (item.number !== 2 || item.wire !== 2) return;
      const entry = domain(bytes, item.start, item.end);
      if (include.every(attr => entry.attrs.has(attr)) && exclude.every(attr => !entry.attrs.has(attr))) {
        domains.push(entry);
      }
    });
  });
  return { found, domains };
}
