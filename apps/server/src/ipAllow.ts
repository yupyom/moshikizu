/**
 * IPv4 ホワイトリスト（ホワイトリスト方式のアクセス制限）。
 * エントリは単一IP（"203.0.113.5"）または CIDR（"192.168.1.0/24"）。
 * リストが空の場合は全許可（セットアップ用。設定を推奨）。
 * ループバック（127.0.0.0/8）は常に許可。
 */

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** "::ffff:1.2.3.4" 形式（IPv4-mapped IPv6）も受け付ける */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isIpAllowed(remoteIp: string, allowlist: string[]): boolean {
  const ip = normalizeIp(remoteIp);
  if (ip === '::1') return true; // IPv6ループバック
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false; // IPv4以外は（ループバックを除き）拒否
  if ((ipInt >>> 24) === 127) return true; // ループバック常時許可
  if (allowlist.length === 0) return true;

  for (const entry of allowlist) {
    const [base, bitsStr] = entry.trim().split('/');
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const bits = bitsStr === undefined ? 32 : Number(bitsStr);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((ipInt & mask) === (baseInt & mask)) return true;
  }
  return false;
}
