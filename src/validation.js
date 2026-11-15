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

const MOSDNS_UPSTREAM_SCHEMES = new Set(["udp:", "tcp:", "tls:", "https:"]);

export function checkedMosdnsUpstream(value) {
  if (typeof value !== "string" || value.length > 512 || value !== value.trim() ||
    /[\x00-\x20\x7f\\#]/.test(value)) {
    throw new Error("Invalid MosDNS upstream address");
  }

  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
  if (scheme) {
    let url;
    try { url = new URL(value); }
    catch { throw new Error("Invalid MosDNS upstream address"); }
    if (!MOSDNS_UPSTREAM_SCHEMES.has(url.protocol) || !url.hostname || url.username || url.password || url.hash) {
      throw new Error("Invalid MosDNS upstream address");
    }
    return value;
  }

  const ipv6 = /^\[([\da-f:.]+)\](?::(\d{1,5}))?$/i.exec(value);
  let port = "";
  if (ipv6) {
    try { new URL(`http://[${ipv6[1]}]/`); }
    catch { throw new Error("Invalid MosDNS upstream address"); }
    port = ipv6[2] || "";
  } else {
    const match = /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?$/i.exec(value);
    if (!match || match[1].length > 253 || match[1].split(".").some(label =>
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
      (/^\d+(?:\.\d+){3}$/.test(match[1]) && match[1].split(".").some(part => Number(part) > 255))) {
      throw new Error("Invalid MosDNS upstream address");
    }
    port = match[2] || "";
  }
  if (port && (Number(port) < 1 || Number(port) > 65535)) {
    throw new Error("Invalid MosDNS upstream address");
  }
  return value;
}
