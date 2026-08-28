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
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "CRM <no-reply@localhost>", to, subject, html }),
  });
  if (!res.ok) {
    console.error(`[email] Resend error ${res.status}: ${await res.text()}`);
  }
}

export function emailLayout(title: string, bodyHtml: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#0A0A0A">
    <h2 style="margin:0 0 16px">${title}</h2>
    ${bodyHtml}
    <p style="color:#6B7280;font-size:12px;margin-top:32px">Se você não esperava este e-mail, pode ignorá-lo.</p>
  </div>`;
}
