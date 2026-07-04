/**
 * メール送信（任意機能）。config.json の smtp 設定がある場合のみ有効。
 * 用途: ユーザー招待通知・コメント通知・共有リンク送付。
 * 未設定時は isMailEnabled() が false になり、呼び出し側は静かにスキップする。
 */
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

let transporter: Mail | null = null;
let fromAddr = '';

export function initMail(smtp: SmtpConfig | undefined): void {
  if (!smtp?.host || !smtp?.from) return;
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass ?? '' } } : {}),
  });
  fromAddr = smtp.from;
}

export function isMailEnabled(): boolean {
  return transporter !== null;
}

/** 送信（fire-and-forget前提。失敗はログのみで処理を止めない） */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) return;
  try {
    await transporter.sendMail({ from: fromAddr, to, subject, text });
  } catch (err) {
    console.error('メール送信失敗:', err instanceof Error ? err.message : err);
  }
}
