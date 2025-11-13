import { config } from "dotenv";
import { emailService } from "./src/services/EmailService.js";

// Cargar variables de entorno desde .env
config();

async function testEmailService() {
  console.log("Testing Amazon SES configuration...");
  console.log("Variables de entorno cargadas:");
  console.log(
    "AWS_ACCESS_KEY_ID:",
    process.env.AWS_ACCESS_KEY_ID ? "Configurada" : "NO CONFIGURADA"
  );
  console.log(
    "AWS_SECRET_ACCESS_KEY:",
    process.env.AWS_SECRET_ACCESS_KEY ? "Configurada" : "NO CONFIGURADA"
  );
  console.log("AWS_REGION:", process.env.AWS_REGION || "us-east-1");
  console.log("FRONTEND_URL:", process.env.FRONTEND_URL || "NO CONFIGURADA");
  console.log("");

  // Test invitation email
  const success = await emailService.sendInvitationEmail(
    "quirogaborys@gmail.com", // Cambia por un email real para testing
    {
      creatorName: "Test User",
      diagramName: "Diagrama de Prueba",
      invitationId: "test-invitation-id",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
      message: "Este es un email de prueba para verificar Amazon SES",
    }
  );

  if (success) {
    console.log("✅ Email enviado exitosamente con Amazon SES");
  } else {
    console.log("❌ Error enviando email. Revisa la configuración de AWS.");
  }
}

testEmailService().catch(console.error);
