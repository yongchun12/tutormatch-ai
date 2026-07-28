/**
 * Guards for outbound requests to URLs that came from outside the system
 * (a centre's `website` field, a crawled directory link).
 *
 * Without this, anything that can set a centre's website can make the server
 * fetch an address only the server can reach — the cloud metadata endpoint
 * (169.254.169.254), the MongoDB port on localhost, or a machine on the private
 * network. That is server-side request forgery (SSRF).
 *
 * Pure functions only: string and URL parsing, no network, no database, no
 * framework imports. Callers in `services/` do the actual fetching.
 */

/** Reasons a URL is refused, so callers can log something meaningful. */
export type UrlRejection =
  | "malformed"
  | "bad-protocol"
  | "no-hostname"
  | "private-address"
  | "blocked-port";

export type UrlCheck =
  | { safe: true; url: URL }
  | { safe: false; reason: UrlRejection; detail: string };

/** Only real web traffic. Blocks file:, ftp:, gopher:, data:, javascript: … */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Ports that are never a public website but are common internal services.
 * A public site on a non-standard port is rare; a database on one is not.
 */
const BLOCKED_PORTS = new Set([
  22, 23, 25, 465, 587, // ssh, telnet, smtp
  445, 139, // smb
  3306, 5432, 1433, 1521, // sql
  6379, 11211, // redis, memcached
  27017, 27018, 27019, // mongodb
  9200, 9300, // elasticsearch
  2375, 2376, // docker
]);

/** Hostname suffixes that only resolve inside a private network. */
const PRIVATE_SUFFIXES = [".local", ".internal", ".localdomain", ".home.arpa"];

/** Parse a dotted-quad IPv4 string into its four octets, or null. */
function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
  return octets;
}

/**
 * True when an IPv4 address is not routable on the public internet.
 * Covers loopback, the RFC1918 private ranges, link-local (which includes the
 * cloud metadata address), carrier-grade NAT, and the reserved blocks.
 */
export function isPrivateIPv4(hostname: string): boolean {
  const o = parseIPv4(hostname);
  if (!o) return false;
  const [a, b] = o;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 reserved
  if (a >= 224) return true; // multicast + reserved + broadcast

  return false;
}

/**
 * Extract the IPv4 address hidden inside an IPv4-mapped IPv6 address, or null.
 *
 * Both spellings have to be handled. `::ffff:127.0.0.1` is what a person types,
 * but the URL parser normalises it to the hex form `::ffff:7f00:1`, so checking
 * only the dotted spelling lets loopback straight through.
 */
function unwrapIPv4Mapped(h: string): string | null {
  const mapped = h.match(/^::ffff:(.+)$/);
  if (!mapped) return null;

  const rest = mapped[1];

  // Dotted form: ::ffff:127.0.0.1
  if (rest.includes(".")) {
    return parseIPv4(rest) ? rest : null;
  }

  // Hex form: ::ffff:7f00:1  ->  two groups holding the 32-bit IPv4 value.
  const groups = rest.split(":");
  if (groups.length > 2 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) {
    return null;
  }
  // A single group means the leading group was compressed to zero.
  const [high, low] =
    groups.length === 2 ? groups : ["0", groups[0]];
  const value = (parseInt(high, 16) << 16) | parseInt(low, 16);

  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join(".");
}

/** True when an IPv6 address is loopback, unique-local, or link-local. */
export function isPrivateIPv6(hostname: string): boolean {
  // URL parsing keeps IPv6 literals in brackets; strip them and any zone id.
  const h = hostname.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!h.includes(":")) return false;

  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (/^f[cd]/.test(h)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link local

  // An IPv4 address wearing an IPv6 costume.
  const ipv4 = unwrapIPv4Mapped(h);
  if (ipv4) return isPrivateIPv4(ipv4);

  return false;
}

/**
 * True when a hostname clearly points somewhere only this server can reach.
 *
 * Note the limit: this checks the hostname as written. A public domain whose DNS
 * record points at a private address ("DNS rebinding") still passes. Closing
 * that needs DNS resolution at fetch time, which is I/O and so does not belong
 * in this file. For a directory of real tuition-centre websites, the hostname
 * check is the proportionate protection.
 */
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (!h) return true;
  if (h === "localhost") return true;
  if (PRIVATE_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true;
  if (isPrivateIPv4(h)) return true;
  if (isPrivateIPv6(h)) return true;
  return false;
}

/**
 * Validate a URL that came from outside the system before fetching it.
 * Returns the parsed URL when safe, or a reason when not.
 */
export function checkPublicUrl(raw: string | undefined | null): UrlCheck {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { safe: false, reason: "malformed", detail: "empty URL" };
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { safe: false, reason: "malformed", detail: raw.slice(0, 120) };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { safe: false, reason: "bad-protocol", detail: url.protocol };
  }

  if (!url.hostname) {
    return { safe: false, reason: "no-hostname", detail: raw.slice(0, 120) };
  }

  if (isPrivateHostname(url.hostname)) {
    return { safe: false, reason: "private-address", detail: url.hostname };
  }

  if (url.port && BLOCKED_PORTS.has(Number(url.port))) {
    return { safe: false, reason: "blocked-port", detail: url.port };
  }

  return { safe: true, url };
}

/** Human-readable explanation for logs and error messages. */
export function describeRejection(reason: UrlRejection, detail: string): string {
  switch (reason) {
    case "malformed":
      return `Not a valid URL: ${detail}`;
    case "bad-protocol":
      return `Only http and https are allowed, got ${detail}`;
    case "no-hostname":
      return `URL has no hostname: ${detail}`;
    case "private-address":
      return `Refusing to fetch a private or internal address: ${detail}`;
    case "blocked-port":
      return `Refusing to fetch an internal service port: ${detail}`;
  }
}
