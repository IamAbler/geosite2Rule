const CATEGORY_NAME = /^[a-z0-9_!][a-z0-9_!.-]{0,99}$/;
const ATTRIBUTE_NAME = /^[a-z0-9_!][a-z0-9_!.-]{0,49}$/;

export function validCategoryName(value) {
  return CATEGORY_NAME.test(value) && /[a-z0-9]/.test(value);
}

export function validAttributeName(value) {
  return ATTRIBUTE_NAME.test(value) && /[a-z0-9]/.test(value);
}

export function checkedUrl(value, blockedHostname) {
  if (typeof value !== "string" || value.length > 2048 || /[\x00-\x1f\x7f\\]/.test(value)) throw new Error("Invalid source URL");
  const url = new URL(value);
  const hostname = url.hostname.replace(/\.+$/, "");
  const blocked = blockedHostname?.toLowerCase().replace(/\.+$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
    url.port || !hostname.includes(".") || hostname === blocked ||
    /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example)$/.test(hostname) ||
    hostname === "home.arpa" || hostname.endsWith(".home.arpa") ||
    /^\d+(?:\.\d+){3}$/.test(hostname) || hostname.startsWith("[")) {
    throw new Error("Source URL must use a public HTTPS hostname without credentials or fragments");
  }
  return url;
}
