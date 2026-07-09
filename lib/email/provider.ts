/**
 * Transactional email — provider-abstracted. The default ConsoleEmailProvider
 * logs messages (so development and demos work with zero setup); ResendEmailProvider
 * sends real mail when RESEND_API_KEY is configured. Swapping in SES/Postmark is
 * a single new class behind this interface.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly kind: "console" | "resend";
  send(message: EmailMessage): Promise<void>;
}

const FROM = process.env.EMAIL_FROM ?? "OUTSIDE <alerts@outside.example>";

class ConsoleEmailProvider implements EmailProvider {
  readonly kind = "console" as const;
  async send(message: EmailMessage): Promise<void> {
    console.info(`[email:console] to=${message.to} subject=${JSON.stringify(message.subject)} (set RESEND_API_KEY to deliver)`);
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly kind = "resend" as const;
  constructor(private apiKey: string) {}
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: message.to, subject: message.subject, html: message.html, text: message.text }),
    });
    if (!res.ok) throw new Error(`Resend API ${res.status}`);
  }
}

let singleton: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (singleton) return singleton;
  const key = process.env.RESEND_API_KEY;
  singleton = key ? new ResendEmailProvider(key) : new ConsoleEmailProvider();
  return singleton;
}
