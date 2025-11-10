import nodemailer from "nodemailer";

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    console.log("Inicializando EmailService...");
    console.log(
      "APP_EMAIL:",
      process.env.APP_EMAIL ? "Configurado" : "NO CONFIGURADO"
    );
    console.log(
      "APP_PASSWORD:",
      process.env.APP_PASSWORD ? "Configurado" : "NO CONFIGURADO"
    );

    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.APP_EMAIL,
        pass: process.env.APP_PASSWORD,
      },
    });

    // Verificar la configuración del transporter
    this.transporter.verify((error: Error | null, success: boolean) => {
      if (error) {
        console.error("Error en la configuración del transporter:", error);
      } else {
        console.log("Transporter configurado correctamente");
      }
    });
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
      console.log(`Intentando enviar correo de invitación a: ${to}`);
      const { creatorName, diagramName, invitationId, expiresAt, message } =
        invitationData;

      const mailOptions = {
        from: process.env.APP_EMAIL,
        to,
        subject: `Invitación para colaborar en el diagrama: ${diagramName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Invitación para colaborar</h2>

            <p>Hola,</p>

            <p><strong>${creatorName}</strong> te ha invitado a colaborar en el diagrama <strong>"${diagramName}"</strong>.</p>

            ${message ? `<p><em>"${message}"</em></p>` : ""}

            <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
              <p><strong>Detalles de la invitación:</strong></p>
              <ul>
                <li>Diagrama: ${diagramName}</li>
                <li>Invitado por: ${creatorName}</li>
                <li>Expira: ${expiresAt.toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5173/invitation/${invitationId}"
                 style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 0 10px;">
                Ver Invitación
              </a>
            </div>

            <p style="color: #666; font-size: 12px;">
              Si no puedes hacer clic en los botones, copia y pega estos enlaces en tu navegador:
              <br>
              Aceptar: http://localhost:5174/invitation/${invitationId}/accept
              <br>
              Rechazar: http://localhost:5174/invitation/${invitationId}/reject
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

            <p style="color: #666; font-size: 12px;">
              Esta invitación expirará el ${expiresAt.toLocaleDateString(
                "es-ES"
              )}.
              Si no deseas recibir más invitaciones, puedes ignorar este correo.
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Correo de invitación enviado exitosamente a: ${to}`);
      return true;
    } catch (error) {
      console.error("Error al enviar correo de invitación:", error);
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
      const { inviteeName, diagramName } = invitationData;

      const mailOptions = {
        from: process.env.APP_EMAIL,
        to,
        subject: `${inviteeName} ha aceptado tu invitación`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Invitación aceptada</h2>

            <p>¡Buenas noticias!</p>

            <p><strong>${inviteeName}</strong> ha aceptado tu invitación para colaborar en el diagrama <strong>"${diagramName}"</strong>.</p>

            <p>Ahora pueden colaborar juntos en tiempo real.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5174/dashboard"
                 style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Ir al Dashboard
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

            <p style="color: #666; font-size: 12px;">
              Este es un correo automático. No respondas a este mensaje.
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Correo de confirmación enviado exitosamente a: ${to}`);
      return true;
    } catch (error) {
      console.error("Error al enviar correo de confirmación:", error);
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
      const { inviteeName, diagramName } = invitationData;

      const mailOptions = {
        from: process.env.APP_EMAIL,
        to,
        subject: `${inviteeName} ha rechazado tu invitación`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Invitación rechazada</h2>

            <p><strong>${inviteeName}</strong> ha rechazado tu invitación para colaborar en el diagrama <strong>"${diagramName}"</strong>.</p>

            <p>Puedes enviar una nueva invitación si lo deseas.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:5174/dashboard"
                 style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Ir al Dashboard
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

            <p style="color: #666; font-size: 12px;">
              Este es un correo automático. No respondas a este mensaje.
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Correo de rechazo enviado exitosamente a: ${to}`);
      return true;
    } catch (error) {
      console.error("Error al enviar correo de rechazo:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();
