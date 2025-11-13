import { emailService } from "./src/services/EmailService.js";

// Script de prueba para verificar el envío de emails con Resend
async function testEmail() {
  console.log("🧪 Probando envío de email con Resend...");

  const testResult = await emailService.sendInvitationEmail(
    "test@example.com", // Cambia esto por un email real para probar
    {
      creatorName: "Usuario de Prueba",
      diagramName: "Diagrama de Prueba",
      invitationId: "test-invitation-123",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas desde ahora
      message:
        "Este es un email de prueba para verificar la configuración de Resend.",
    }
  );

  if (testResult) {
    console.log("✅ Email enviado exitosamente");
  } else {
    console.log("❌ Error al enviar email");
  }
}

testEmail().catch(console.error);
