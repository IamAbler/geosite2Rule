const decoder = new TextDecoder("utf-8", { fatal: true });

function corrupt() {
  throw new Error("Invalid geo data protobuf");
}

export function varint(bytes, position, end) {
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

export function string(bytes, start, end) {
  return decoder.decode(bytes.subarray(start, end));
}

export function visit(bytes, start, end, callback) {
  for (let position = start; position < end;) {
    const item = field(bytes, position, end);
    callback(item);
    position = item.next;
  }
}

export function firstString(bytes, start, end, number) {
  for (let position = start; position < end;) {
    const item = field(bytes, position, end);
    if (item.number === number && item.wire === 2) return string(bytes, item.start, item.end);
    position = item.next;
  }
  return "";
}
