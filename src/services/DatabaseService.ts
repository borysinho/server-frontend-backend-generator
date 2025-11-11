import pkg from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
const { PrismaClient: PrismaClientImpl } = pkg;
import { User } from "../models/UserModel.js";
import { DiagramSnapshot } from "../models/DiagramSnapshotModel.js";
import { Invitation, InvitationStatus } from "../models/InvitationModel.js";
import { DiagramState } from "../models/DiagramModel.js";

interface CreateDiagramSnapshotData {
  diagramId: string;
  name: string;
  description?: string;
  creatorId: string;
  collaborators?: string[];
  state: DiagramState;
  physicalModel?: unknown;
  migrations?: string[];
  migrationFiles?: Array<{ fileName: string; sql: string }>;
  isPublic?: boolean;
  tags?: string[];
  thumbnail?: string;
}

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClientImpl({
      log: ["query", "info", "warn", "error"],
    });
  }

  async checkDiagramNameExists(
    name: string,
    creatorId: string,
    excludeDiagramId?: string
  ): Promise<boolean> {
    const whereCondition: any = { name, creatorId };
    if (excludeDiagramId) whereCondition.diagramId = { not: excludeDiagramId };

    const existing = await this.prisma.diagramSnapshot.findFirst({
      where: whereCondition,
    });
    return existing !== null;
  }

  async createInvitation(data: any): Promise<any> {
    return await this.prisma.invitation.create({ data });
  }

  async findInvitationsByUser(userId: string): Promise<any[]> {
    return await this.prisma.invitation.findMany({
      where: { OR: [{ creatorId: userId }, { inviteeId: userId }] },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateInvitationStatus(
    id: string,
    status: string,
    userId?: string
  ): Promise<any> {
    const updateData: any = { status, updatedAt: new Date() };
    if (status === "accepted" && userId) {
      updateData.acceptedAt = new Date();
      updateData.inviteeId = userId;
    } else if (status === "rejected") {
      updateData.rejectedAt = new Date();
    }
    return await this.prisma.invitation.update({
      where: { id },
      data: updateData,
    });
  }

  async findInvitationById(id: string): Promise<any | null> {
    return await this.prisma.invitation.findUnique({ where: { id } });
  }

  async findInvitationsByDiagram(diagramId: string): Promise<any[]> {
    return await this.prisma.invitation.findMany({
      where: { diagramId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findInvitationsByEmail(email: string): Promise<any[]> {
    return await this.prisma.invitation.findMany({
      where: { inviteeEmail: email },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateInvitation(id: string, updates: any): Promise<any> {
    return await this.prisma.invitation.update({
      where: { id },
      data: updates,
    });
  }

  async getAllInvitations(): Promise<any[]> {
    return await this.prisma.invitation.findMany();
  }

  async updateDiagramSnapshot(diagramId: string, updates: any): Promise<any> {
    return await this.prisma.diagramSnapshot.update({
      where: { diagramId },
      data: { ...updates, updatedAt: new Date() },
    });
  }

  async deleteDiagramSnapshotsByDiagramId(diagramId: string): Promise<boolean> {
    try {
      await this.prisma.diagramSnapshot.deleteMany({
        where: { diagramId },
      });
      return true;
    } catch (error) {
      console.error("Error deleting diagram snapshots:", error);
      return false;
    }
  }

  async createDiagramSnapshot(data: CreateDiagramSnapshotData): Promise<any> {
    return await this.prisma.diagramSnapshot.create({
      data: {
        diagramId: data.diagramId,
        name: data.name,
        description: data.description || null,
        creatorId: data.creatorId,
        collaborators: data.collaborators || [],
        state: data.state as any,
        physicalModel: data.physicalModel as any,
        migrations: data.migrations || [],
        migrationFiles: data.migrationFiles as any,
        version: 1,
        isPublic: data.isPublic || false,
        tags: data.tags || [],
        thumbnail: data.thumbnail || null,
        lastActivityAt: new Date(),
      },
    });
  }

  async findDiagramSnapshotById(id: string): Promise<any | null> {
    return await this.prisma.diagramSnapshot.findUnique({ where: { id } });
  }

  async findDiagramSnapshotByDiagramId(diagramId: string): Promise<any | null> {
    return await this.prisma.diagramSnapshot.findFirst({
      where: { diagramId },
      orderBy: { version: "desc" },
    });
  }

  async findDiagramSnapshotsByUser(userId: string): Promise<any[]> {
    console.log(`🔍 Buscando diagramas para userId: ${userId}`);

    // Primero, verificar cuántos diagramas hay en total
    const totalDiagrams = await this.prisma.diagramSnapshot.count();
    console.log(`📊 Total de diagramas en BD: ${totalDiagrams}`);

    // Si hay diagramas, mostrar información de los primeros 5
    if (totalDiagrams > 0) {
      const allDiagrams = await this.prisma.diagramSnapshot.findMany({
        take: 5,
      });
      console.log(`📋 Primeros diagramas en BD:`);
      allDiagrams.forEach((d: any) => {
        console.log(
          `   - ${d.name} (ID: ${d.diagramId}, Creador: ${
            d.creatorId
          }, Colaboradores: [${d.collaborators.join(", ")}])`
        );
      });
    }

    // Buscar diagramas creados por el usuario
    const createdDiagrams = await this.prisma.diagramSnapshot.findMany({
      where: { creatorId: userId },
    });
    console.log(
      `📝 Diagramas creados por ${userId}: ${createdDiagrams.length}`
    );

    // Buscar diagramas donde es colaborador
    const collaboratorDiagrams = await this.prisma.diagramSnapshot.findMany({
      where: { collaborators: { has: userId } },
    });
    console.log(
      `🤝 Diagramas como colaborador de ${userId}: ${collaboratorDiagrams.length}`
    );

    // Consulta combinada original
    const result = await this.prisma.diagramSnapshot.findMany({
      where: {
        OR: [{ creatorId: userId }, { collaborators: { has: userId } }],
      },
      orderBy: { updatedAt: "desc" },
    });

    console.log(`✅ Diagramas totales devueltos: ${result.length}`);

    return result;
  }

  async deleteInvitation(id: string): Promise<boolean> {
    try {
      await this.prisma.invitation.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async createUser(data: any): Promise<any> {
    return await this.prisma.user.create({ data });
  }

  async findUserById(id: string): Promise<any | null> {
    return await this.prisma.user.findUnique({ where: { id } });
  }

  async findUserByEmail(email: string): Promise<any | null> {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  async updateUser(id: string, updates: any): Promise<any> {
    return await this.prisma.user.update({ where: { id }, data: updates });
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async updateDiagramCollaborators(
    diagramId: string,
    collaborators: string[]
  ): Promise<void> {
    await this.prisma.diagramSnapshot.updateMany({
      where: { diagramId },
      data: { collaborators },
    });
  }
}

export const databaseService = new DatabaseService();
