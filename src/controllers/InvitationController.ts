import { Request, Response } from "express";
import { InvitationModel } from "../models/InvitationModel.js";
import { emailService } from "../services/EmailService.js";
import { databaseService } from "../services/DatabaseService.js";

const invitationModel = new InvitationModel();

export class InvitationController {
  // Endpoint de prueba para verificar envío de emails
  async testEmail(req: Request, res: Response) {
    try {
      const { email, type = "simple" } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email requerido" });
      }

      console.log(`🧪 Probando envío de email tipo '${type}' a:`, email);

      let success = false;

      if (type === "invitation") {
        // Email similar a una invitación real
        success = await emailService.sendInvitationEmail(email, {
          creatorName: "Borys",
          diagramName: "Colegio",
          invitationId: "test-invitation-real",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          message: "Prueba de invitación similar a la real",
        });
      } else if (type === "acceptance") {
        // Email de aceptación de invitación
        success = await emailService.sendInvitationAcceptedEmail(email, {
          inviteeName: "Usuario de Prueba",
          diagramName: "Colegio",
        });
      } else {
        // Email simple de prueba
        success = await emailService.sendInvitationEmail(email, {
          creatorName: "Sistema de Prueba",
          diagramName: "Test de Email",
          invitationId: "test-123",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
          message: "Este es un email de prueba simple",
        });
      }

      if (success) {
        res.json({
          message: `Email tipo '${type}' enviado exitosamente`,
          email,
          type,
        });
      } else {
        res.status(500).json({ error: "Error al enviar email" });
      }
    } catch (error) {
      console.error("Error en testEmail:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Crear una nueva invitación
  async createInvitation(req: Request, res: Response) {
    try {
      const { diagramId, creatorId, inviteeEmail, message, expiresAt } =
        req.body;

      if (!diagramId || !creatorId || !inviteeEmail || !expiresAt) {
        return res.status(400).json({
          error:
            "Faltan campos requeridos: diagramId, creatorId, inviteeEmail, expiresAt",
        });
      }

      const invitation = await invitationModel.create({
        diagramId,
        creatorId,
        inviteeEmail,
        message,
        expiresAt: new Date(expiresAt),
      });

      // Obtener información del creador y diagrama para el correo
      const creator = await databaseService.findUserById(creatorId);
      const diagram = await databaseService.findDiagramSnapshotByDiagramId(
        diagramId
      );

      console.log("Creator encontrado:", creator ? creator.name : "null");
      console.log("Diagram encontrado:", diagram ? diagram.name : "null");
      console.log("DiagramId buscado:", diagramId);

      if (creator && diagram) {
        console.log("Enviando email de invitación...");
        console.log("Detalles del envío:");
        console.log("- Para:", invitation.inviteeEmail);
        console.log("- De:", process.env.EMAIL_USER);
        console.log("- Creador:", creator.name);
        console.log("- Diagrama:", diagram.name);
        console.log("- Invitación ID:", invitation.id);

        // Enviar correo de invitación de forma asíncrona
        emailService
          .sendInvitationEmail(invitation.inviteeEmail, {
            creatorName: creator.name,
            diagramName: diagram.name,
            invitationId: invitation.id,
            expiresAt: invitation.expiresAt,
            message: invitation.message,
          })
          .then((success) => {
            console.log(
              "Resultado del envío de email:",
              success ? "EXITOSO" : "FALLIDO"
            );
          })
          .catch((error) => {
            console.error("Error al enviar correo de invitación:", error);
          });
      } else {
        console.log(
          "No se puede enviar email: faltan datos del creador o diagrama"
        );
        if (!creator) console.log("- Creator no encontrado");
        if (!diagram) console.log("- Diagram no encontrado");
      }

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Obtener invitaciones por usuario
  async getInvitationsByUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: "userId es requerido" });
      }

      // Obtener información del usuario para su email
      const user = await databaseService.findUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      // Obtener invitaciones enviadas y recibidas
      const sentInvitations = await invitationModel.findByCreatorId(userId);
      const receivedInvitations = await invitationModel.findByInviteeEmail(
        user.email
      );

      // Combinar y eliminar duplicados
      const allInvitations = [...sentInvitations, ...receivedInvitations];
      const uniqueInvitations = allInvitations.filter(
        (invitation, index, self) =>
          index === self.findIndex((i) => i.id === invitation.id)
      );

      // Enriquecer cada invitación con datos del diagrama y creador
      const enrichedInvitations = await Promise.all(
        uniqueInvitations.map(async (invitation) => {
          const diagram = await databaseService.findDiagramSnapshotByDiagramId(
            invitation.diagramId
          );
          const creator = await databaseService.findUserById(
            invitation.creatorId
          );

          return {
            ...invitation,
            diagram: diagram
              ? {
                  diagramId: diagram.diagramId,
                  name: diagram.name,
                  description: diagram.description || undefined,
                }
              : undefined,
            creator: creator
              ? {
                  id: creator.id,
                  name: creator.name,
                  email: creator.email,
                }
              : undefined,
          };
        })
      );

      // Ordenar por fecha de creación descendente (más nuevas primero)
      const sortedInvitations = enrichedInvitations.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.json(sortedInvitations);
    } catch (error) {
      console.error("Error getting invitations by user:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Obtener invitación por ID
  async getInvitationById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const invitation = await invitationModel.findById(id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitación no encontrada" });
      }

      // Obtener información del diagrama y creador
      const diagram = await databaseService.findDiagramSnapshotByDiagramId(
        invitation.diagramId
      );
      const creator = await databaseService.findUserById(invitation.creatorId);

      // Construir respuesta con datos relacionados
      const invitationWithDetails = {
        ...invitation,
        diagram: diagram
          ? {
              diagramId: diagram.diagramId,
              name: diagram.name,
              description: diagram.description || undefined,
            }
          : undefined,
        creator: creator
          ? {
              id: creator.id,
              name: creator.name,
              email: creator.email,
            }
          : undefined,
      };

      res.json(invitationWithDetails);
    } catch (error) {
      console.error("Error getting invitation by id:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Aceptar invitación
  async acceptInvitation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      console.log("=== ACCEPT INVITATION DEBUG ===");
      console.log("Invitation ID:", id);
      console.log("User ID recibido:", userId);

      if (!userId) {
        return res.status(400).json({ error: "userId es requerido" });
      }

      // Verificar que el usuario existe y obtener su información
      const user = await databaseService.findUserById(userId);
      console.log(
        "Usuario encontrado:",
        user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
            }
          : "null"
      );

      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      // Verificar que el usuario sea el destinatario de la invitación
      const invitation = await invitationModel.findById(id);
      console.log(
        "Invitación encontrada:",
        invitation
          ? {
              id: invitation.id,
              status: invitation.status,
              inviteeEmail: invitation.inviteeEmail,
              creatorId: invitation.creatorId,
            }
          : "null"
      );

      if (!invitation) {
        return res.status(404).json({ error: "Invitación no encontrada" });
      }

      // Verificar que el email del usuario coincida con el email de la invitación
      if (user.email !== invitation.inviteeEmail) {
        console.log(
          "❌ Email no coincide - Usuario email:",
          user.email,
          "- Invitación email:",
          invitation.inviteeEmail
        );
        return res
          .status(403)
          .json({ error: "No tienes permiso para aceptar esta invitación" });
      }

      if (invitation.status !== "pending") {
        console.log("Invitation status is not pending:", invitation.status);
        return res
          .status(400)
          .json({ error: `La invitación ya está ${invitation.status}` });
      }

      console.log(
        `✅ Aceptando invitación ${id} para usuario ${userId} (${user.email})`
      );

      const updatedInvitation = await invitationModel.accept(id, userId);
      if (!updatedInvitation) {
        return res
          .status(404)
          .json({ error: "Invitación no encontrada o no se puede aceptar" });
      }

      console.log("✅ Invitation accepted successfully");

      // Enviar correo de confirmación al creador
      const creator = await databaseService.findUserById(invitation.creatorId);
      const diagram = await databaseService.findDiagramSnapshotByDiagramId(
        invitation.diagramId
      );

      console.log(
        "Enviando email de aceptación - Creator:",
        creator ? creator.name : "null"
      );
      console.log("Enviando email de aceptación - Invitee:", user.name);
      console.log(
        "Enviando email de aceptación - Diagram:",
        diagram ? diagram.name : "null"
      );

      if (creator && diagram) {
        console.log("Enviando email de confirmación de aceptación...");
        emailService
          .sendInvitationAcceptedEmail(creator.email, {
            inviteeName: user.name,
            diagramName: diagram.name,
          })
          .catch((error) => {
            console.error("Error al enviar correo de aceptación:", error);
          });
      }

      res.json(updatedInvitation);
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Rechazar invitación
  async rejectInvitation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId es requerido" });
      }

      // Verificar que el usuario sea el destinatario de la invitación
      const invitation = await invitationModel.findById(id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitación no encontrada" });
      }

      const user = await databaseService.findUserById(userId);
      if (!user || user.email !== invitation.inviteeEmail) {
        return res
          .status(403)
          .json({ error: "No tienes permiso para rechazar esta invitación" });
      }

      const updatedInvitation = await invitationModel.reject(id);
      if (!updatedInvitation) {
        return res
          .status(404)
          .json({ error: "Invitación no encontrada o no se puede rechazar" });
      }

      // Enviar correo de confirmación al creador
      const creator = await databaseService.findUserById(invitation.creatorId);
      const diagram = await databaseService.findDiagramSnapshotByDiagramId(
        invitation.diagramId
      );

      console.log(
        "Enviando email de rechazo - Creator:",
        creator ? creator.name : "null"
      );
      console.log(
        "Enviando email de rechazo - Diagram:",
        diagram ? diagram.name : "null"
      );

      if (creator && diagram) {
        console.log("Enviando email de notificación de rechazo...");
        emailService
          .sendInvitationRejectedEmail(creator.email, {
            inviteeName: user.name,
            diagramName: diagram.name,
          })
          .catch((error) => {
            console.error("Error al enviar correo de rechazo:", error);
          });
      }

      res.json(updatedInvitation);
    } catch (error) {
      console.error("Error rejecting invitation:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Eliminar invitación
  async deleteInvitation(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const success = await invitationModel.delete(id);
      if (!success) {
        return res.status(404).json({ error: "Invitación no encontrada" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }

  // Obtener todas las invitaciones (para admin/debugging)
  async getAllInvitations(req: Request, res: Response) {
    try {
      // Por simplicidad, devolver invitaciones vacías
      // En un sistema real, implementar lógica de permisos
      res.json([]);
    } catch (error) {
      console.error("Error obteniendo todas las invitaciones:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
}
