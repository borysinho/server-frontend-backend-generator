import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export class EmailService {
  private oauth2Client: OAuth2Client;
  private gmail: any;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    console.log("Inicializando EmailService con Gmail API...");

    const credentials = {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: "http://localhost:3000/oauth2callback",
    };

    console.log(
      "GOOGLE_CLIENT_ID:",
      process.env.GOOGLE_CLIENT_ID ? "Configurado" : "NO CONFIGURADO"
    );
    console.log(
      "GOOGLE_CLIENT_SECRET:",
      process.env.GOOGLE_CLIENT_SECRET ? "Configurado" : "NO CONFIGURADO"
    );
    console.log(
      "GOOGLE_REFRESH_TOKEN:",
      process.env.GOOGLE_REFRESH_TOKEN ? "Configurado" : "NO CONFIGURADO"
    );
    console.log(
      "EMAIL_USER:",
      process.env.EMAIL_USER ? process.env.EMAIL_USER : "NO CONFIGURADO"
    );
    console.log(
      "FRONTEND_URL:",
      process.env.FRONTEND_URL ? process.env.FRONTEND_URL : "NO CONFIGURADO"
    );

    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.GOOGLE_REFRESH_TOKEN
    ) {
      console.error(
        "Credenciales de Google OAuth2 incompletas - los emails no funcionarán"
      );
      return;
    }

    this.oauth2Client = new OAuth2Client(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uri
    );

    this.oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });

    console.log("EmailService configurado correctamente con Gmail API");
  }

  private async ensureValidToken(): Promise<boolean> {
    try {
      await this.oauth2Client.getAccessToken();
      return true;
    } catch (error) {
      console.error("Error obteniendo token de acceso:", error);
      return false;
    }
  }

  private encodeSubject(subject: string): string {
    // Codificar el subject usando UTF-8 quoted-printable para caracteres especiales
    return `=?UTF-8?Q?${subject.replace(/[^\x20-\x7E]/g, (char) => {
      return (
        "=" + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
      );
    })}?=`;
  }

  private createEmailMessage(
    to: string,
    subject: string,
    htmlContent: string
  ): string {
    const fromEmail = process.env.EMAIL_USER || "noreply@example.com";
    const encodedSubject = this.encodeSubject(subject);

    // Crear versión de texto plano del contenido HTML
    const textContent = htmlContent
      .replace(/<[^>]*>/g, "") // Remover tags HTML
      .replace(/\s+/g, " ") // Normalizar espacios
      .trim();

    const emailLines = [
      `From: Generador Frontend/Backend <${fromEmail}>`,
      `To: ${to}`,
      `Reply-To: ${fromEmail}`,
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="boundary123"',
      "",
      "--boundary123",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      textContent,
      "",
      "--boundary123",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      htmlContent,
      "",
      "--boundary123--",
    ];

    const email = emailLines.join("\r\n");
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return encodedEmail;
  }

  async sendInvitationEmail(
    to: string,
    invitationData: {
      creatorName: string;
      diagramName: string;
      invitationId: string;
      expiresAt: Date;
      message?: string;
    }
  ): Promise<boolean> {
    try {
      console.log(`Enviando invitación a: ${to}`);

      if (!this.gmail) {
        console.error("Gmail API no inicializada");
        return false;
      }

      if (!(await this.ensureValidToken())) {
        return false;
      }

      const { creatorName, diagramName, invitationId, expiresAt, message } =
        invitationData;

      const frontendUrl =
        (process.env.FRONTEND_URL || "http://localhost:5173").replace(
          /\/$/,
          ""
        ) + "/";

      const manualUrl =
        (process.env.MANUAL_URL || "http://localhost:5174").replace(/\/$/, "") +
        "/";

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invitación para colaborar</title>
          <style>
            body { margin: 0; padding: 0; background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; }
            .dashboard { min-height: 100vh; }
            .dashboard-header { background: white; border-bottom: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
            .header-content { max-width: 1200px; margin: 0 auto; padding: 0 20px; display: flex; justify-content: space-between; align-items: center; width: 100%; }
            .header-content.invitation-header { justify-content: flex-start; }
            .header-title-section { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; flex-shrink: 0; }
            .dashboard-link-button { background: none; border: none; color: rgba(59, 130, 246, 0.9); text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px; padding: 0; }
            .dashboard-link-button:hover { color: #3b82f6; }
            .dashboard-header h1 { color: #1e293b; font-size: 28px; font-weight: 700; margin: 0; }
            .dashboard-main { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
            .invitation-detail-container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
            .invitation-detail-card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); border: 1px solid #e2e8f0; }
            .invitation-detail-section { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e2e8f0; }
            .invitation-detail-section:last-of-type { border-bottom: none; margin-bottom: 0; }
            .section-title { color: #1e293b; font-size: 18px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
            .detail-item { display: flex; margin-bottom: 12px; align-items: flex-start; }
            .detail-item.message-item { flex-direction: column; }
            .detail-label { font-weight: 600; color: #475569; min-width: 180px; font-size: 14px; }
            .detail-value { color: #1e293b; font-size: 14px; flex: 1; }
            .detail-message { margin: 8px 0 0 0; padding: 12px; background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px; color: #475569; font-size: 14px; line-height: 1.6; }
            .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; }
            .status-badge.status-pending { background: #fef3c7; color: #92400e; }
            .status-badge.status-accepted { background: #d1fae5; color: #065f46; }
            .status-badge.status-rejected { background: #fee2e2; color: #991b1b; }
            .status-badge.status-expired { background: #f3f4f6; color: #6b7280; }
            .expired-badge { color: #dc2626; font-weight: 600; }
            .invitation-actions-container { margin-top: 32px; padding: 24px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
            .action-prompt { margin: 0 0 20px 0; color: #475569; font-size: 15px; text-align: center; font-weight: 500; }
            .action-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
            .accept-button, .decline-button { padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s ease; border: none; text-decoration: none; display: inline-block; text-align: center; }
            .accept-button { background: #10b981; color: white; }
            .accept-button:hover { background: #059669; }
            .decline-button { background: #ef4444; color: white; }
            .decline-button:hover { background: #dc2626; }
            .status-message-container { margin-top: 24px; padding: 20px; border-radius: 8px; }
            .status-message { margin: 0; font-size: 15px; font-weight: 500; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .status-message.warning { background: #fef3c7; color: #92400e; border: 1px solid #fbbf24; padding: 16px; border-radius: 8px; }
            .status-message.success { background: #d1fae5; color: #065f46; border: 1px solid #10b981; padding: 16px; border-radius: 8px; }
            .status-message.error { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; padding: 16px; border-radius: 8px; }
            .footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; margin-top: 40px; }
            .footer a { color: #667eea; text-decoration: none; }
            .footer-links { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="dashboard">
            <header class="dashboard-header">
              <div class="header-content invitation-header">
                <div class="header-title-section">
                  <h1>Invitación para Colaborar</h1>
                </div>
              </div>
            </header>

            <main class="dashboard-main">
              <div class="invitation-detail-container">
                <div class="invitation-detail-card">

                  <!-- Información del diagrama -->
                  <div class="invitation-detail-section">
                    <h2 class="section-title">📐 Diagrama</h2>
                    <div class="detail-item">
                      <span class="detail-label">Nombre:</span>
                      <span class="detail-value">${diagramName}</span>
                    </div>
                  </div>

                  <!-- Información del creador -->
                  <div class="invitation-detail-section">
                    <h2 class="section-title">👤 Creador</h2>
                    <div class="detail-item">
                      <span class="detail-label">Nombre:</span>
                      <span class="detail-value">${creatorName}</span>
                    </div>
                  </div>

                  <!-- Información de la invitación -->
                  <div class="invitation-detail-section">
                    <h2 class="section-title">📧 Detalles de la Invitación</h2>
                    ${
                      message
                        ? `<div class="detail-item message-item">
                            <span class="detail-label">Mensaje del creador:</span>
                            <p class="detail-message">${message}</p>
                          </div>`
                        : ""
                    }
                    <div class="detail-item">
                      <span class="detail-label">Estado:</span>
                      <span class="status-badge status-pending">⏳ Pendiente</span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">Fecha de creación:</span>
                      <span class="detail-value">${new Date().toLocaleDateString(
                        "es-ES",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}</span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">Expira:</span>
                      <span class="detail-value">${expiresAt.toLocaleDateString(
                        "es-ES",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )}</span>
                    </div>
                  </div>

                  <!-- Acciones -->
                  <div class="invitation-actions-container">
                    <p class="action-prompt">
                      ¿Deseas aceptar o rechazar esta invitación para colaborar en el diagrama?
                    </p>
                    <div class="action-buttons" style="display: flex; justify-content: center; align-items: center; text-align: center; gap: 12px; flex-wrap: wrap;">
                      <a href="${frontendUrl}invitation/${invitationId}?action=accept" class="accept-button" style="background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; text-decoration: none; display: inline-block; text-align: center; border: none;">
                        ✓ Aceptar Invitación
                      </a>
                      <a href="${frontendUrl}invitation/${invitationId}?action=reject" class="decline-button" style="background: #ef4444; color: white; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; text-decoration: none; display: inline-block; text-align: center; border: none;">
                        ✗ Rechazar Invitación
                      </a>
                    </div>
                  </div>

                  <!-- Expiration Warning -->
                  <div class="status-message-container">
                    <p class="status-message warning">
                      ⏰ Esta invitación expira el ${expiresAt.toLocaleDateString(
                        "es-ES",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </main>

            <!-- Footer -->
            <div class="footer">
              <div class="footer-links">
                <a href="${frontendUrl}">🌐 Visitar la plataforma</a>
                <a href="${manualUrl}">📚 Manual de usuario</a>
              </div>
              <p style="margin: 10px 0 0 0; font-size: 12px;">
                📧 Este es un correo automático enviado por el Generador Frontend/Backend
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      const subject = `Invitación para colaborar en el diagrama: ${diagramName}`;
      const emailMessage = this.createEmailMessage(to, subject, htmlContent);

      const result = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: emailMessage,
        },
      });

      console.log(
        `Correo de invitación enviado exitosamente a: ${to}`,
        result.data
      );
      return true;
    } catch (error) {
      console.error("Error enviando email con Gmail API:", error);
      return false;
    }
  }

  async sendInvitationAcceptedEmail(
    to: string,
    invitationData: {
      inviteeName: string;
      diagramName: string;
    }
  ): Promise<boolean> {
    try {
      if (!this.gmail) {
        console.error("Gmail API no inicializada");
        return false;
      }

      if (!(await this.ensureValidToken())) {
        return false;
      }

      const { inviteeName, diagramName } = invitationData;
      const frontendUrl =
        (process.env.FRONTEND_URL || "http://localhost:5173").replace(
          /\/$/,
          ""
        ) + "/";

      const manualUrl =
        (process.env.MANUAL_URL || "http://localhost:5174").replace(/\/$/, "") +
        "/";

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invitación aceptada</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 300;">🎉 ¡Colaborador unido!</h1>
              <p style="color: #e8f5e8; margin: 10px 0 0 0; font-size: 16px;">Generador Frontend/Backend</p>
            </div>

            <!-- Main Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                  <span style="font-size: 32px;">✅</span>
                </div>
                <h2 style="color: #333333; margin: 0; font-size: 24px; font-weight: 600;">¡Buenas noticias!</h2>
              </div>

              <div style="background-color: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 30px;">
                <p style="font-size: 18px; color: #333333; margin: 0 0 20px 0; text-align: center;">
                  <strong style="color: #4CAF50; font-size: 20px;">${inviteeName}</strong> ha aceptado tu invitación
                </p>

                <div style="background-color: #ffffff; border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                  <h3 style="color: #333333; margin: 0; font-size: 22px; font-weight: 600;">📊 ${diagramName}</h3>
                  <p style="color: #666666; margin: 5px 0 0 0; font-size: 14px;">Proyecto de colaboración activa</p>
                </div>

                <div style="background-color: #e8f5e8; border: 1px solid #c8e6c9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                  <p style="color: #2e7d32; margin: 0; font-size: 16px; font-weight: 500;">
                    🎯 Ahora pueden colaborar juntos en tiempo real
                  </p>
                </div>
              </div>

              <!-- Call to Action -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="${frontendUrl}dashboard"
                   style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 50px; font-size: 18px; font-weight: 600; display: inline-block; box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4); transition: all 0.3s ease;">
                  🚀 Ir al Dashboard
                </a>
              </div>

              <!-- Features -->
              <div style="margin: 40px 0;">
                <h3 style="color: #333333; text-align: center; font-size: 20px; margin-bottom: 20px;">🤝 Funciones de colaboración</h3>
                <div style="display: flex; justify-content: space-around; flex-wrap: wrap;">
                  <div style="text-align: center; margin: 10px; flex: 1; min-width: 120px;">
                    <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
                    <p style="margin: 0; color: #666666; font-size: 14px;">Chat en tiempo real</p>
                  </div>
                  <div style="text-align: center; margin: 10px; flex: 1; min-width: 120px;">
                    <div style="font-size: 32px; margin-bottom: 10px;">🔄</div>
                    <p style="margin: 0; color: #666666; font-size: 14px;">Edición simultánea</p>
                  </div>
                  <div style="text-align: center; margin: 10px; flex: 1; min-width: 120px;">
                    <div style="font-size: 32px; margin-bottom: 10px;">📋</div>
                    <p style="margin: 0; color: #666666; font-size: 14px;">Historial de cambios</p>
                  </div>
                </div>
              </div>

              <!-- Success Message -->
              <div style="background: linear-gradient(135deg, #e8f5e8 0%, #f1f8e9 100%); border: 1px solid #c8e6c9; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
                <h3 style="color: #2e7d32; margin: 0 0 15px 0; font-size: 18px;">🎊 ¡El equipo está creciendo!</h3>
                <p style="color: #388e3c; margin: 0; font-size: 16px;">
                  Cada colaborador aporta nuevas ideas y perspectivas al proyecto
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #6c757d; margin: 0 0 10px 0; font-size: 14px;">
                📧 Este es un correo automático enviado por el Generador Frontend/Backend
              </p>
              <p style="color: #6c757d; margin: 0; font-size: 12px;">
                Si tienes preguntas, contacta al administrador del proyecto
              </p>
              <div style="margin-top: 20px; display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
                <a href="${frontendUrl}" style="color: #4CAF50; text-decoration: none; font-size: 14px;">🌐 Visitar la plataforma</a>
                <a href="${manualUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">📚 Manual de usuario</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const subject = `${inviteeName} ha aceptado tu invitación`;
      const emailMessage = this.createEmailMessage(to, subject, htmlContent);

      const result = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: emailMessage,
        },
      });

      console.log(
        `Correo de confirmación enviado exitosamente a: ${to}`,
        result.data
      );
      return true;
    } catch (error) {
      console.error("Error enviando email de aceptación con Gmail API:", error);
      return false;
    }
  }

  async sendInvitationRejectedEmail(
    to: string,
    invitationData: {
      inviteeName: string;
      diagramName: string;
    }
  ): Promise<boolean> {
    try {
      if (!this.gmail) {
        console.error("Gmail API no inicializada");
        return false;
      }

      if (!(await this.ensureValidToken())) {
        return false;
      }

      const { inviteeName, diagramName } = invitationData;
      const frontendUrl =
        (process.env.FRONTEND_URL || "http://localhost:5173").replace(
          /\/$/,
          ""
        ) + "/";

      const manualUrl =
        (process.env.MANUAL_URL || "http://localhost:5174").replace(/\/$/, "") +
        "/";

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Invitación rechazada</h2>

          <p><strong>${inviteeName}</strong> ha rechazado tu invitación para colaborar en el diagrama <strong>"${diagramName}"</strong>.</p>

          <p>Puedes enviar una nueva invitación si lo deseas.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}dashboard"
               style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Ir al Dashboard
            </a>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

          <p style="color: #666; font-size: 12px;">
            Este es un correo automático. No respondas a este mensaje.
          </p>

          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 10px;">
              <a href="${frontendUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">🌐 Visitar la plataforma</a>
              <a href="${manualUrl}" style="color: #667eea; text-decoration: none; font-size: 14px;">📚 Manual de usuario</a>
            </div>
            <p style="color: #999; font-size: 11px; margin: 0;">
              📧 Correo enviado por el Generador Frontend/Backend
            </p>
          </div>
        </div>
      `;

      const subject = `${inviteeName} ha rechazado tu invitación`;
      const emailMessage = this.createEmailMessage(to, subject, htmlContent);

      const result = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: emailMessage,
        },
      });

      console.log(
        `Correo de rechazo enviado exitosamente a: ${to}`,
        result.data
      );
      return true;
    } catch (error) {
      console.error("Error enviando email de rechazo con Gmail API:", error);
      return false;
    }
  }
}

// Exportar instancia singleton para compatibilidad con el controlador existente
export const emailService = new EmailService();
