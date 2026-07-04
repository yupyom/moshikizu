import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, totpCode, verifyTotp } from '../src/totp';
import { isIpAllowed } from '../src/ipAllow';

describe('base32', () => {
  it('往復一致', () => {
    const buf = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });
});

describe('totp', () => {
  // RFC 6238 Appendix B のテストベクタ（SHA-1、秘密鍵 "12345678901234567890"）
  const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));

  it('RFC 6238 テストベクタと一致（下6桁）', () => {
    expect(totpCode(secret, 59 * 1000)).toBe('287082');
    expect(totpCode(secret, 1111111109 * 1000)).toBe('081804');
    expect(totpCode(secret, 1234567890 * 1000)).toBe('005924');
  });

  it('verifyTotp は ±30秒を許容', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(secret, '081804', now)).toBe(true);
    expect(verifyTotp(secret, '081804', now + 30_000)).toBe(true);
    expect(verifyTotp(secret, '000000', now)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });
});

describe('isIpAllowed', () => {
  const list = ['203.0.113.5', '192.168.1.0/24'];

  it('単一IPとCIDRで許可', () => {
    expect(isIpAllowed('203.0.113.5', list)).toBe(true);
    expect(isIpAllowed('192.168.1.42', list)).toBe(true);
    expect(isIpAllowed('192.168.2.1', list)).toBe(false);
    expect(isIpAllowed('203.0.113.6', list)).toBe(false);
  });

  it('ループバックは常に許可、IPv4-mapped IPv6も解釈', () => {
    expect(isIpAllowed('127.0.0.1', list)).toBe(true);
    expect(isIpAllowed('::1', list)).toBe(true);
    expect(isIpAllowed('::ffff:192.168.1.9', list)).toBe(true);
  });

  it('空リストは全許可', () => {
    expect(isIpAllowed('8.8.8.8', [])).toBe(true);
  });
});
