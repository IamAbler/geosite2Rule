// Wire format: https://github.com/v2fly/v2ray-core/blob/master/app/router/routercommon/common.proto
import { firstString, varint, visit } from "./protobuf.js";

function countryCode(bytes, start, end) {
  return firstString(bytes, start, end, 1).toLowerCase();
}

export function listIpCategories(bytes) {
  const categories = new Set();
  visit(bytes, 0, bytes.length, item => {
    if (item.number === 1 && item.wire === 2) {
      const code = countryCode(bytes, item.start, item.end);
      if (code) categories.add(code);
    }
  });
  return [...categories].sort();
}

function ipv6(bytes) {
  const parts = [];
  for (let i = 0; i < 16; i += 2) parts.push((bytes[i] * 256 + bytes[i + 1]).toString(16));
  let bestStart = -1;
  let bestLength = 1;
  for (let i = 0; i < 8;) {
    if (parts[i] !== "0") { i++; continue; }
    let end = i + 1;
    while (end < 8 && parts[end] === "0") end++;
    if (end - i > bestLength) { bestStart = i; bestLength = end - i; }
    i = end;
  }
  if (bestStart < 0) return parts.join(":");
  const left = parts.slice(0, bestStart).join(":");
  const right = parts.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}

function cidr(bytes, start, end) {
  let ip;
  let prefix = 0;
  visit(bytes, start, end, item => {
    if (item.number === 1 && item.wire === 2) ip = bytes.subarray(item.start, item.end);
    if (item.number === 2 && item.wire === 0) [prefix] = varint(bytes, item.start, item.end);
  });
  if (!ip || (ip.length !== 4 && ip.length !== 16) || prefix > ip.length * 8) {
    throw new Error("Invalid GeoIP CIDR entry");
  }
  return { value: `${ip.length === 4 ? [...ip].join(".") : ipv6(ip)}/${prefix}`, ip: Uint8Array.from(ip), prefix };
}

export function readIpCategory(bytes, category) {
  const networks = [];
  let found = false;
  let inverse = false;
  visit(bytes, 0, bytes.length, entry => {
    if (entry.number !== 1 || entry.wire !== 2 || countryCode(bytes, entry.start, entry.end) !== category) return;
    found = true;
    visit(bytes, entry.start, entry.end, item => {
      if (item.number === 2 && item.wire === 2) networks.push(cidr(bytes, item.start, item.end));
      if (item.number === 3 && item.wire === 0) {
        const [value] = varint(bytes, item.start, item.end);
        inverse ||= value !== 0;
      }
    });
  });
  return { found, inverse, cidrs: networks.map(network => network.value), networks };
}
