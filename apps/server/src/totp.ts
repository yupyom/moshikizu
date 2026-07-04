import { createHmac, randomBytes } from 'node:crypto';

/**
 * TOTP（RFC 6238, SHA-1/30秒/6桁）。認証アプリ（Google Authenticator等）互換。
 * 依存を増やさないため自前実装（テスト付き）。
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of clean) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secretB32: string, timeMs = Date.now()): string {
  const key = Buffer.from(base32Decode(secretB32));
  const counter = Math.floor(timeMs / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** 前後1ステップ（±30秒）の時計ズレを許容して照合する */
export function verifyTotp(secretB32: string, code: string, timeMs = Date.now()): boolean {
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) return false;
  return [-30_000, 0, 30_000].some((dt) => totpCode(secretB32, timeMs + dt) === c);
}

export function otpauthUrl(secretB32: string, account: string, issuer = 'Moshikizu'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}`;
}
