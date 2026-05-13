/**
 * Brevo (Sendinblue) email küldő utility
 * Használható bármely edge function-ből.
 *
 * Szükséges Supabase secrets:
 *   BREVO_API_KEY         – xkeysib-... (REST API kulcs)
 *   BREVO_SENDER_EMAIL    – noreply@molaire.hu
 *   BREVO_SENDER_NAME     – TreatNote (opcionális, default: TreatNote)
 */

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface SendBrevoEmailOptions {
  to: BrevoRecipient | BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  replyTo?: BrevoRecipient;
}

export interface BrevoSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendBrevoEmail(options: SendBrevoEmailOptions): Promise<BrevoSendResult> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) {
    console.error("[brevo] BREVO_API_KEY nincs beállítva");
    return { success: false, error: "BREVO_API_KEY nincs konfigurálva" };
  }

  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@molaire.hu";
  const senderName = Deno.env.get("BREVO_SENDER_NAME") || "TreatNote";

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: recipients,
    subject: options.subject,
    htmlContent: options.htmlContent,
    ...(options.textContent && { textContent: options.textContent }),
    ...(options.replyTo && { replyTo: options.replyTo }),
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[brevo] Email küldési hiba (${response.status}):`, errorBody);
      return { success: false, error: `Brevo API hiba: ${response.status} – ${errorBody}` };
    }

    const result = await response.json();
    console.log(`[brevo] Email sikeresen elküldve → ${recipients.map(r => r.email).join(", ")} | messageId: ${result.messageId}`);
    return { success: true, messageId: result.messageId };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brevo] Fetch hiba:", msg);
    return { success: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Közös stílusok – light mode lavender/szürke paletta
// ─────────────────────────────────────────────────────────────────────────────

// Header gradient: szürkés levendula (light mode téma alapján)
const HEADER_BG   = "background:linear-gradient(135deg,hsl(268,30%,72%) 0%,hsl(255,20%,82%) 100%)";
const HEADER_TEXT = "color:#2d1f4e";          // sötét lila szöveg a fejlécen
const HEADER_SUB  = "color:rgba(45,31,78,0.65)";

// Gomb: levendula/lila árnyalat
const BTN_BG      = "background:linear-gradient(135deg,hsl(268,40%,62%) 0%,hsl(255,25%,72%) 100%)";
const BTN_TEXT    = "color:#ffffff";

// Info box: halvány levendula
const INFO_BG     = "background:#f5f0fb;border:1px solid #d8c8f0";
const INFO_TEXT   = "color:#4a2d8a";

// ─────────────────────────────────────────────────────────────────────────────
// Email sablonok
// ─────────────────────────────────────────────────────────────────────────────

/** Regisztráció megerősítő email – solo regisztrációhoz */
export function buildConfirmationEmail(params: {
  confirmUrl: string;
  displayName: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const { confirmUrl, displayName } = params;

  const subject = "Erősítse meg email címét – TreatNote";

  const htmlContent = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email megerősítés</title>
</head>
<body style="margin:0;padding:0;background-color:#f0edf7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0edf7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(80,50,120,0.10);">
          <!-- Header -->
          <tr>
            <td style="${HEADER_BG};padding:36px 40px;text-align:center;">
              <h1 style="margin:0;${HEADER_TEXT};font-size:26px;font-weight:700;letter-spacing:-0.5px;">TreatNote</h1>
              <p style="margin:8px 0 0;${HEADER_SUB};font-size:14px;">Fogászati dokumentáció rendszer</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#1e1035;font-size:22px;font-weight:600;">Köszöntjük, ${escapeHtml(displayName)}!</h2>
              <p style="margin:0 0 24px;color:#4a4060;font-size:15px;line-height:1.6;">
                Köszönjük a regisztrációt a TreatNote platformon. Kattintson az alábbi gombra az email cím megerősítéséhez és a fiók aktiválásához.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${confirmUrl}"
                   style="display:inline-block;${BTN_BG};${BTN_TEXT};text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.2px;">
                  Email cím megerősítése
                </a>
              </div>
            </td>
          </tr>
          <!-- Info box -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="${INFO_BG};border-radius:8px;padding:16px 20px;">
                <p style="margin:0;${INFO_TEXT};font-size:13px;line-height:1.5;">
                  ℹ️ Ez a link <strong>24 óráig</strong> érvényes. Ha nem Ön regisztrált, hagyja figyelmen kívül ezt az emailt.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f0fb;padding:24px 40px;border-top:1px solid #ddd0f0;text-align:center;">
              <p style="margin:0;color:#8878a8;font-size:12px;">
                &copy; ${new Date().getFullYear()} TreatNote &bull; Fogászati dokumentáció rendszer<br>
                Ez egy automatikus értesítő email, kérjük ne válaszoljon rá.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `Köszöntjük, ${displayName}!\n\nKöszönjük a regisztrációt a TreatNote platformon.\n\nEmail cím megerősítéséhez kattintson az alábbi linkre:\n${confirmUrl}\n\nEz a link 24 óráig érvényes.\n\n© ${new Date().getFullYear()} TreatNote`;

  return { subject, htmlContent, textContent };
}

/** Üdvözlő email – azonnali regisztráció után (nincs email megerősítés) */
export function buildWelcomeEmail(params: {
  displayName: string;
  loginUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const { displayName, loginUrl } = params;

  const subject = "Üdvözöljük a TreatNote-ban!";

  const htmlContent = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Üdvözöljük a TreatNote-ban</title>
</head>
<body style="margin:0;padding:0;background-color:#f0edf7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0edf7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(80,50,120,0.10);">
          <!-- Header -->
          <tr>
            <td style="${HEADER_BG};padding:36px 40px;text-align:center;">
              <h1 style="margin:0;${HEADER_TEXT};font-size:26px;font-weight:700;letter-spacing:-0.5px;">TreatNote</h1>
              <p style="margin:8px 0 0;${HEADER_SUB};font-size:14px;">Fogászati dokumentáció rendszer</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#1e1035;font-size:22px;font-weight:600;">Üdvözöljük, ${escapeHtml(displayName)}! 🎉</h2>
              <p style="margin:0 0 24px;color:#4a4060;font-size:15px;line-height:1.6;">
                Regisztrációja sikeresen elkészült. Fiókja azonnal aktív és készen áll a használatra.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${loginUrl}"
                   style="display:inline-block;${BTN_BG};${BTN_TEXT};text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.2px;">
                  Bejelentkezés a TreatNote-ba
                </a>
              </div>
              <!-- Features -->
              <div style="background:#f8f5ff;border:1px solid #e0d0f8;border-radius:8px;padding:20px 24px;margin-top:8px;">
                <p style="margin:0 0 12px;color:#1e1035;font-size:14px;font-weight:600;">Mit tud a TreatNote?</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:4px 0;color:#4a4060;font-size:14px;">🎤&nbsp; Hangalapú fogászati státuszfelvétel (Voxis AI)</td></tr>
                  <tr><td style="padding:4px 0;color:#4a4060;font-size:14px;">📋&nbsp; Automatikus kezelési terv generálás</td></tr>
                  <tr><td style="padding:4px 0;color:#4a4060;font-size:14px;">🦷&nbsp; Fogászati térkép vizualizáció</td></tr>
                  <tr><td style="padding:4px 0;color:#4a4060;font-size:14px;">🔗&nbsp; Flexi-Dent integráció</td></tr>
                </table>
              </div>
            </td>
          </tr>
          <!-- Info box -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;">
                <p style="margin:0;color:#166534;font-size:13px;line-height:1.5;">
                  ✅ <strong>14 napos ingyenes próbaidőszak</strong> aktiválva. Nincs szükség bankkártyára.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f0fb;padding:24px 40px;border-top:1px solid #ddd0f0;text-align:center;">
              <p style="margin:0;color:#8878a8;font-size:12px;">
                &copy; ${new Date().getFullYear()} TreatNote &bull; Fogászati dokumentáció rendszer<br>
                Ez egy automatikus értesítő email, kérjük ne válaszoljon rá.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `Üdvözöljük, ${displayName}!\n\nRegisztrációja sikeresen elkészült. Fiókja azonnal aktív.\n\nBejelentkezés: ${loginUrl}\n\n14 napos ingyenes próbaidőszak aktiválva.\n\n© ${new Date().getFullYear()} TreatNote`;

  return { subject, htmlContent, textContent };
}

/** Meghívó email – meglévő felhasználónak (bejelentkezve fogadja el) */
export function buildInvitationEmailExistingUser(params: {
  invitationUrl: string;
  invitedByName: string;
  companyName: string;
  telephelyName: string;
  role: string;
  recipientName?: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const { invitationUrl, invitedByName, companyName, telephelyName, role, recipientName } = params;
  const roleLabel = role === "klinika_admin" ? "Klinika Adminisztrátor" : "Felhasználó";
  const greeting = recipientName ? `Kedves ${escapeHtml(recipientName)}!` : "Kedves Felhasználó!";

  const subject = `Meghívó – ${companyName} / ${telephelyName} – TreatNote`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meghívó</title>
</head>
<body style="margin:0;padding:0;background-color:#f0edf7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0edf7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(80,50,120,0.10);">
          <!-- Header -->
          <tr>
            <td style="${HEADER_BG};padding:36px 40px;text-align:center;">
              <h1 style="margin:0;${HEADER_TEXT};font-size:26px;font-weight:700;letter-spacing:-0.5px;">TreatNote</h1>
              <p style="margin:8px 0 0;${HEADER_SUB};font-size:14px;">Fogászati dokumentáció rendszer</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#1e1035;font-size:22px;font-weight:600;">${greeting}</h2>
              <p style="margin:0 0 24px;color:#4a4060;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(invitedByName)}</strong> meghívta Önt a TreatNote rendszerbe az alábbi klinikai egységhez:
              </p>
              <!-- Info card -->
              <div style="background:#f8f5ff;border:1px solid #e0d0f8;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 0;">
                      <span style="color:#8878a8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Klinika</span><br>
                      <span style="color:#1e1035;font-size:15px;font-weight:600;">${escapeHtml(companyName)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0 4px;">
                      <span style="color:#8878a8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Telephely</span><br>
                      <span style="color:#1e1035;font-size:15px;font-weight:600;">${escapeHtml(telephelyName)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0 4px;">
                      <span style="color:#8878a8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Szerepkör</span><br>
                      <span style="color:#1e1035;font-size:15px;font-weight:600;">${escapeHtml(roleLabel)}</span>
                    </td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:8px 0 28px;">
                <a href="${invitationUrl}"
                   style="display:inline-block;${BTN_BG};${BTN_TEXT};text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;">
                  Meghívó elfogadása
                </a>
              </div>
            </td>
          </tr>
          <!-- Info box -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="${INFO_BG};border-radius:8px;padding:16px 20px;">
                <p style="margin:0;${INFO_TEXT};font-size:13px;line-height:1.5;">
                  ℹ️ Ez a meghívó <strong>7 napig</strong> érvényes. Ha nem ismeri ${escapeHtml(invitedByName)}-t, hagyja figyelmen kívül ezt az emailt.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f0fb;padding:24px 40px;border-top:1px solid #ddd0f0;text-align:center;">
              <p style="margin:0;color:#8878a8;font-size:12px;">
                &copy; ${new Date().getFullYear()} TreatNote &bull; Fogászati dokumentáció rendszer<br>
                Ez egy automatikus értesítő email, kérjük ne válaszoljon rá.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `${greeting}\n\n${invitedByName} meghívta Önt a TreatNote rendszerbe.\n\nKlinika: ${companyName}\nTelephely: ${telephelyName}\nSzerepkör: ${roleLabel}\n\nMeghívó elfogadásához kattintson:\n${invitationUrl}\n\nEz a meghívó 7 napig érvényes.\n\n© ${new Date().getFullYear()} TreatNote`;

  return { subject, htmlContent, textContent };
}

/** Meghívó email – új felhasználónak (regisztrálnia kell) */
export function buildInvitationEmailNewUser(params: {
  invitationUrl: string;
  invitedByName: string;
  companyName: string;
  telephelyName: string;
  role: string;
  recipientName?: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const { invitationUrl, invitedByName, companyName, telephelyName, role, recipientName } = params;
  const roleLabel = role === "klinika_admin" ? "Klinika Adminisztrátor" : "Felhasználó";
  const greeting = recipientName ? `Kedves ${escapeHtml(recipientName)}!` : "Kedves Felhasználó!";

  const subject = `Meghívó a TreatNote-ba – ${companyName}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meghívó – TreatNote regisztráció</title>
</head>
<body style="margin:0;padding:0;background-color:#f0edf7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0edf7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(80,50,120,0.10);">
          <!-- Header -->
          <tr>
            <td style="${HEADER_BG};padding:36px 40px;text-align:center;">
              <h1 style="margin:0;${HEADER_TEXT};font-size:26px;font-weight:700;letter-spacing:-0.5px;">TreatNote</h1>
              <p style="margin:8px 0 0;${HEADER_SUB};font-size:14px;">Fogászati dokumentáció rendszer</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#1e1035;font-size:22px;font-weight:600;">${greeting}</h2>
              <p style="margin:0 0 24px;color:#4a4060;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(invitedByName)}</strong> meghívta Önt a <strong>TreatNote</strong> fogászati dokumentáció rendszerbe.
                Az alábbi gombra kattintva regisztrálhat és csatlakozhat a klinikai csapathoz.
              </p>
              <!-- Info card -->
              <div style="background:#f8f5ff;border:1px solid #e0d0f8;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 0;">
                      <span style="color:#8878a8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Klinika</span><br>
                      <span style="color:#1e1035;font-size:15px;font-weight:600;">${escapeHtml(companyName)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0 4px;">
                      <span style="color:#8878a8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Telephely</span><br>
                      <span style="color:#1e1035;font-size:15px;font-weight:600;">${escapeHtml(telephelyName)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0 4px;">
                      <span style="color:#8878a8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Szerepkör</span><br>
                      <span style="color:#1e1035;font-size:15px;font-weight:600;">${escapeHtml(roleLabel)}</span>
                    </td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:8px 0 28px;">
                <a href="${invitationUrl}"
                   style="display:inline-block;${BTN_BG};${BTN_TEXT};text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;">
                  Regisztráció &amp; Csatlakozás
                </a>
              </div>
            </td>
          </tr>
          <!-- Info box -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="${INFO_BG};border-radius:8px;padding:16px 20px;">
                <p style="margin:0;${INFO_TEXT};font-size:13px;line-height:1.5;">
                  ℹ️ Ez a meghívó <strong>7 napig</strong> érvényes. Ha nem ismeri ${escapeHtml(invitedByName)}-t, hagyja figyelmen kívül ezt az emailt.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f0fb;padding:24px 40px;border-top:1px solid #ddd0f0;text-align:center;">
              <p style="margin:0;color:#8878a8;font-size:12px;">
                &copy; ${new Date().getFullYear()} TreatNote &bull; Fogászati dokumentáció rendszer<br>
                Ez egy automatikus értesítő email, kérjük ne válaszoljon rá.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `${greeting}\n\n${invitedByName} meghívta Önt a TreatNote fogászati dokumentáció rendszerbe.\n\nKlinika: ${companyName}\nTelephely: ${telephelyName}\nSzerepkör: ${roleLabel}\n\nRegisztrációhoz kattintson:\n${invitationUrl}\n\nEz a meghívó 7 napig érvényes.\n\n© ${new Date().getFullYear()} TreatNote`;

  return { subject, htmlContent, textContent };
}

/** Jelszó visszaállítás (Forgot Password) email */
export function buildPasswordResetEmail(params: {
  resetUrl: string;
  displayName?: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const { resetUrl, displayName } = params;
  const greeting = displayName ? `Kedves ${escapeHtml(displayName)}!` : "Kedves Felhasználó!";

  const subject = "Jelszó visszaállítása – TreatNote";

  const htmlContent = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jelszó visszaállítása</title>
</head>
<body style="margin:0;padding:0;background-color:#f0edf7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0edf7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(80,50,120,0.10);">
          <!-- Header -->
          <tr>
            <td style="${HEADER_BG};padding:36px 40px;text-align:center;">
              <h1 style="margin:0;${HEADER_TEXT};font-size:26px;font-weight:700;letter-spacing:-0.5px;">TreatNote</h1>
              <p style="margin:8px 0 0;${HEADER_SUB};font-size:14px;">Fogászati dokumentáció rendszer</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 16px;color:#1e1035;font-size:22px;font-weight:600;">${greeting}</h2>
              <p style="margin:0 0 24px;color:#4a4060;font-size:15px;line-height:1.6;">
                Kérést kaptunk a TreatNote fiókjához tartozó jelszó visszaállítására. 
                Ha Ön indította el a folyamatot, kérjük, kattintson az alábbi gombra az új jelszó megadásához.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block;${BTN_BG};${BTN_TEXT};text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.2px;">
                  Új jelszó beállítása
                </a>
              </div>
            </td>
          </tr>
          <!-- Info box -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="${INFO_BG};border-radius:8px;padding:16px 20px;">
                <p style="margin:0;${INFO_TEXT};font-size:13px;line-height:1.5;">
                  ℹ️ Ez a link <strong>24 óráig</strong> érvényes. Ha nem Ön kérte a jelszó visszaállítását, hagyja figyelmen kívül ezt az emailt, a jelszava változatlan marad.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f5f0fb;padding:24px 40px;border-top:1px solid #ddd0f0;text-align:center;">
              <p style="margin:0;color:#8878a8;font-size:12px;">
                &copy; ${new Date().getFullYear()} TreatNote &bull; Fogászati dokumentáció rendszer<br>
                Ez egy automatikus értesítő email, kérjük ne válaszoljon rá.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `${greeting}\n\nKérést kaptunk a TreatNote fiókjához tartozó jelszó visszaállítására.\n\nÚj jelszó beállításához kattintson az alábbi linkre:\n${resetUrl}\n\nEz a link 24 óráig érvényes. Ha nem Ön kérte a visszaállítást, hagyja figyelmen kívül ezt az üzenetet.\n\n© ${new Date().getFullYear()} TreatNote`;

  return { subject, htmlContent, textContent };
}

// ─── segéd ────────────────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
