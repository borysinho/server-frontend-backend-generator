import { EmailService } from "./src/services/EmailService";

async function testEmailDelivery() {
  console.log("🧪 Probando entrega de email a quirogaborys@gmail.com...\n");

  try {
    // Crear instancia de EmailService
    const emailService = new EmailService();

    // Esperar a que se inicialice
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("✅ EmailService inicializado\n");

    // Probar envío de email a quirogaborys@gmail.com (la dirección que usaste en la app)
    console.log("📧 Enviando email de prueba a quirogaborys@gmail.com...");

    await emailService.sendInvitationEmail("quirogaborys@gmail.com", {
      creatorName: "Sistema de Prueba",
      diagramName: "Test de Entrega de Email",
      invitationId: "test-entrega-123",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      message:
        "Este es un email de prueba para verificar que la entrega funciona correctamente.",
    });
    console.log("✅ Email enviado exitosamente a quirogaborys@gmail.com!\n");

    console.log("🎯 ¡Test de entrega completado!");
    console.log("📬 Revisa la bandeja de entrada de quirogaborys@gmail.com");
    console.log(
      "📬 También revisa la bandeja de borysquiroga@gmail.com (cuenta del remitente)"
    );
    console.log("📬 Revisa las carpetas de Spam/Junk en ambas cuentas");
  } catch (error) {
    console.error("❌ Error durante las pruebas:", error);
    process.exit(1);
  }
}

// Ejecutar la función de prueba
testEmailDelivery();
