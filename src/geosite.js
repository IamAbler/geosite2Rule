// Wire format: https://github.com/v2fly/v2ray-core/blob/master/app/router/routercommon/common.proto
import { firstString, string, varint, visit } from "./protobuf.js";
import { validAttributeName, validCategoryName } from "./validation.js";

function siteCode(bytes, start, end) {
  return firstString(bytes, start, end, 1).toLowerCase();
}

export function indexSiteCategories(bytes) {
  const index = new Map();
  visit(bytes, 0, bytes.length, item => {
    if (item.number === 1 && item.wire === 2) {
      const code = siteCode(bytes, item.start, item.end);
      if (validCategoryName(code)) {
        if (!index.has(code)) index.set(code, []);
        index.get(code).push([item.start, item.end]);
      }
    }
  });
  return index;
}

export function listCategories(bytes, index = indexSiteCategories(bytes)) {
  return [...index.keys()].sort();
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
  if (validAttributeName(key) && enabled) result.add(key);
  return result;
}

function domain(bytes, start, end, include, exclude) {
  let type = 0;
  let valueStart = -1;
  let valueEnd = 0;
  const attrs = include.length || exclude.length ? new Set() : null;
  visit(bytes, start, end, item => {
    if (item.number === 1 && item.wire === 0) [type] = varint(bytes, item.start, item.end);
    if (item.number === 2 && item.wire === 2) {
      valueStart = item.start;
      valueEnd = item.end;
    }
    if (attrs && item.number === 3 && item.wire === 2) {
      for (const attr of attributes(bytes, item.start, item.end)) attrs.add(attr);
    }
  });
  if (attrs && (!include.every(attr => attrs.has(attr)) || !exclude.every(attr => !attrs.has(attr)))) return null;
  return { type, value: valueStart < 0 ? "" : string(bytes, valueStart, valueEnd) };
}

function visitSiteCategory(bytes, category, index, callback) {
  if (index) {
    for (const [start, end] of index.get(category) || []) callback(start, end);
    return;
  }
  visit(bytes, 0, bytes.length, site => {
    if (site.number === 1 && site.wire === 2 && siteCode(bytes, site.start, site.end) === category) {
      callback(site.start, site.end);
    }
  });
}

export function readCategory(bytes, category, include = [], exclude = [], index = null) {
  const domains = [];
  let found = false;
  visitSiteCategory(bytes, category, index, (start, end) => {
    found = true;
    visit(bytes, start, end, item => {
      if (item.number !== 2 || item.wire !== 2) return;
      const entry = domain(bytes, item.start, item.end, include, exclude);
      if (entry) domains.push(entry);
    });
  });
  return { found, domains };
}

export function listAttributes(bytes, category, index = null) {
  const names = new Set();
  let found = false;
  visitSiteCategory(bytes, category, index, (start, end) => {
    found = true;
    visit(bytes, start, end, item => {
      if (item.number !== 2 || item.wire !== 2) return;
      visit(bytes, item.start, item.end, part => {
        if (part.number !== 3 || part.wire !== 2) return;
        for (const name of attributes(bytes, part.start, part.end)) names.add(name);
      });
    });
  });
  return { found, attributes: [...names].sort() };
}
