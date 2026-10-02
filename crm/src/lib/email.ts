/**
 * Transactional e-mail via Resend. In development (no RESEND_API_KEY) the
 * message is logged to the server console instead, so flows remain testable.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Ezo <no-reply@localhost>", to, subject, html }),
  });
  if (!res.ok) {
    console.error(`[email] Resend error ${res.status}: ${await res.text()}`);
  }
}

export function emailLayout(title: string, bodyHtml: string): string {
  const appUrl = process.env.APP_URL ?? "";
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#0A0A0A">
    <div style="margin:0 0 24px">
      <img src="${appUrl}/brand/ezo-simbolo.svg" alt="" height="22" style="vertical-align:middle;margin-right:8px" />
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;vertical-align:middle">Ezo</span>
    </div>
    <h2 style="margin:0 0 16px;font-weight:800">${title}</h2>
    ${bodyHtml}
    <p style="color:#6B7280;font-size:12px;margin-top:32px">Se você não esperava este e-mail, pode ignorá-lo.</p>
    <p style="color:#6B7280;font-size:12px;margin-top:16px;border-top:1px solid #E5E7EB;padding-top:12px">
      <strong style="color:#2563EB">Ezo</strong> · Chegou lead, virou venda
    </p>
  </div>`;
}
