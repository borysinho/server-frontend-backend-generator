import { EmailService } from "./src/services/EmailService";

async function testGmailAPI() {
  console.log("🧪 Probando Gmail API con OAuth2...\n");

  try {
    // Crear instancia de EmailService
    const emailService = new EmailService();

    // Esperar a que se inicialice
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("✅ EmailService inicializado\n");

    // Probar envío de email de invitación
    console.log("📧 Enviando email de prueba de invitación...");

    await emailService.sendInvitationEmail("borysquiroga@gmail.com", {
      creatorName: "Sistema de Prueba",
      diagramName: "Proyecto de Prueba - Generador Frontend/Backend",
      invitationId: "test-invitation-123",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      message:
        "Esta es una invitación de prueba para verificar el funcionamiento de Gmail API.",
    });
    console.log("✅ Email de invitación enviado exitosamente!\n");

    // Probar envío de email de aceptación
    console.log("📧 Enviando email de prueba de aceptación...");

    await emailService.sendInvitationAcceptedEmail("borysquiroga@gmail.com", {
      inviteeName: "Usuario de Prueba",
      diagramName: "Proyecto de Prueba - Generador Frontend/Backend",
    });
    console.log("✅ Email de aceptación enviado exitosamente!\n");

    console.log("🎯 ¡Todos los tests de Gmail API pasaron exitosamente!");
    console.log(
      "📬 Revisa tu bandeja de entrada de Gmail para ver los emails de prueba."
    );
  } catch (error) {
    console.error("❌ Error durante las pruebas:", error);
    process.exit(1);
  }
}

// Ejecutar la función de prueba
testGmailAPI();
