import { DiagramState } from "./DiagramModel.js";
import { databaseService } from "../services/DatabaseService.js";

export interface PhysicalModel {
  tables: Record<string, unknown>;
  relationships: unknown[];
  appliedNormalizations?: string[];
}

export interface DiagramSnapshot {
  id: string;
  diagramId: string; // ID único del diagrama
  name: string; // Nombre del diagrama
  description?: string; // Descripción opcional
  creatorId: string; // ID del usuario creador
  collaborators: string[]; // IDs de usuarios colaboradores
  state: DiagramState; // Estado completo del diagrama en JSON
  physicalModel?: PhysicalModel; // Modelo físico generado (opcional)
  migrations?: string[]; // Lista de nombres de migraciones (V1, V2, etc.) - DEPRECATED
  migrationFiles?: Array<{ fileName: string; sql: string }>; // Historial completo de migraciones con SQL
  version: number; // Versión del snapshot
  isPublic: boolean; // Si el diagrama es público
  tags: string[]; // Tags para categorización
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date; // Última actividad en el diagrama
  thumbnail?: string; // URL o data de miniatura (opcional)
}

export class DiagramSnapshotModel {
  // NOTA: Esta es una versión simplificada que usa base de datos.
  // Solo los métodos esenciales están completamente implementados.
  // Los demás métodos devuelven valores por defecto para compatibilidad.

  constructor() {
    // El servicio de base de datos maneja la persistencia
  }

  // Crear un nuevo snapshot
  async create(
    snapshotData: Omit<
      DiagramSnapshot,
      "id" | "version" | "createdAt" | "updatedAt" | "lastActivityAt"
    >
  ): Promise<DiagramSnapshot> {
    return await databaseService.createDiagramSnapshot({
      diagramId: snapshotData.diagramId,
      name: snapshotData.name,
      description: snapshotData.description,
      creatorId: snapshotData.creatorId,
      collaborators: snapshotData.collaborators || [],
      state: snapshotData.state,
      physicalModel: snapshotData.physicalModel,
      migrations: snapshotData.migrations,
      migrationFiles: snapshotData.migrationFiles,
      isPublic: snapshotData.isPublic || false,
      tags: snapshotData.tags || [],
      thumbnail: snapshotData.thumbnail,
    });
  }

  // Buscar snapshot por ID
  async findById(id: string): Promise<DiagramSnapshot | null> {
    return await databaseService.findDiagramSnapshotById(id);
  }

  // Obtener el snapshot más reciente de un diagrama
  async getLatestByDiagramId(
    diagramId: string
  ): Promise<DiagramSnapshot | null> {
    return await databaseService.findDiagramSnapshotByDiagramId(diagramId);
  }

  // ===== MÉTODOS SIMPLIFICADOS (STUBS) =====

  // Crear nueva versión de un diagrama existente
  async createVersion(
    diagramId: string,
    state: DiagramState
  ): Promise<DiagramSnapshot | null> {
    const latestSnapshot = await this.getLatestByDiagramId(diagramId);
    if (!latestSnapshot) return null;

    return await this.create({
      diagramId,
      name: latestSnapshot.name,
      description: latestSnapshot.description,
      creatorId: latestSnapshot.creatorId,
      collaborators: latestSnapshot.collaborators,
      state,
      isPublic: latestSnapshot.isPublic,
      tags: latestSnapshot.tags,
      thumbnail: latestSnapshot.thumbnail,
    });
  }

  // Obtener todos los snapshots de un diagrama
  async getAllByDiagramId(diagramId: string): Promise<DiagramSnapshot[]> {
    const latest = await this.getLatestByDiagramId(diagramId);
    return latest ? [latest] : [];
  }

  // Buscar diagramas por creador
  async findByCreatorId(creatorId: string): Promise<DiagramSnapshot[]> {
    return await databaseService.findDiagramSnapshotsByUser(creatorId);
  }

  // Buscar diagramas donde el usuario es colaborador
  async findByCollaboratorId(
    collaboratorId: string
  ): Promise<DiagramSnapshot[]> {
    return await databaseService.findDiagramSnapshotsByUser(collaboratorId);
  }

  // Verificar si un nombre de diagrama ya existe para un usuario
  async checkNameExistsForUser(
    name: string,
    creatorId: string,
    excludeDiagramId?: string
  ): Promise<boolean> {
    return await databaseService.checkDiagramNameExists(
      name,
      creatorId,
      excludeDiagramId
    );
  }

  // Actualizar un diagrama
  async update(
    diagramId: string,
    updates: Partial<Omit<DiagramSnapshot, "id" | "diagramId" | "createdAt">>
  ): Promise<DiagramSnapshot | null> {
    return await databaseService.updateDiagramSnapshot(diagramId, updates);
  }

  // Buscar diagramas públicos
  async findPublic(): Promise<DiagramSnapshot[]> {
    return [];
  }

  // Buscar por tags
  async findByTag(_tag: string): Promise<DiagramSnapshot[]> {
    return [];
  }

  // Buscar por nombre (búsqueda parcial)
  async searchByName(_name: string): Promise<DiagramSnapshot[]> {
    return [];
  }

  // Actualizar metadatos del diagrama
  async updateMetadata(
    id: string,
    updates: Partial<
      Omit<
        DiagramSnapshot,
        "id" | "diagramId" | "state" | "version" | "createdAt" | "updatedAt"
      >
    >
  ): Promise<DiagramSnapshot | null> {
    return await databaseService.updateDiagramSnapshot(id, updates);
  }

  // Agregar colaborador
  async addCollaborator(
    diagramId: string,
    collaboratorId: string
  ): Promise<boolean> {
    const latestSnapshot = await this.getLatestByDiagramId(diagramId);
    if (!latestSnapshot) return false;

    if (!latestSnapshot.collaborators.includes(collaboratorId)) {
      const newCollaborators = [
        ...latestSnapshot.collaborators,
        collaboratorId,
      ];
      const result = await this.updateMetadata(latestSnapshot.id, {
        collaborators: newCollaborators,
        lastActivityAt: new Date(),
      });
      return result !== null;
    }

    return false;
  }

  // Remover colaborador
  async removeCollaborator(
    diagramId: string,
    collaboratorId: string
  ): Promise<boolean> {
    const latestSnapshot = await this.getLatestByDiagramId(diagramId);
    if (!latestSnapshot) return false;

    const index = latestSnapshot.collaborators.indexOf(collaboratorId);
    if (index !== -1) {
      const newCollaborators = latestSnapshot.collaborators.filter(
        (id) => id !== collaboratorId
      );
      const result = await this.updateMetadata(latestSnapshot.id, {
        collaborators: newCollaborators,
        lastActivityAt: new Date(),
      });
      return result !== null;
    }

    return false;
  }

  // Actualizar última actividad
  async updateLastActivity(diagramId: string): Promise<boolean> {
    const latestSnapshot = await this.getLatestByDiagramId(diagramId);
    if (!latestSnapshot) return false;

    const result = await this.updateMetadata(latestSnapshot.id, {
      lastActivityAt: new Date(),
    });
    return result !== null;
  }

  // Eliminar diagrama
  async delete(diagramId: string): Promise<boolean> {
    // Eliminar todos los snapshots del diagrama
    const result = await databaseService.deleteDiagramSnapshotsByDiagramId(
      diagramId
    );
    return result;
  }

  // Obtener estadísticas
  async getStats() {
    return {
      totalDiagrams: 0,
      totalSnapshots: 0,
      publicDiagrams: 0,
      averageVersionsPerDiagram: 0,
    };
  }

  // Obtener todos los snapshots
  async getAll(): Promise<DiagramSnapshot[]> {
    return [];
  }
}
