import { DiagramSnapshotModel } from "../models/DiagramSnapshotModel.js";
import { transformLogicalToPhysical } from "../models/TransformationManager.js";
import { SpringBootCodeGenerator } from "../models/SpringBootCodeGenerator.js";
import { FlywayMigrationManager } from "../models/FlywayMigrationManager.js";
import type { FlywayMigration } from "../models/FlywayMigrationManager.js";

/**
 * Servicio para gestionar migraciones incrementales de base de datos
 */
export class MigrationService {
  /**
   * Genera una migración incremental usando los snapshots disponibles
   * Este método está preparado para futura integración con el sistema de snapshots
   */
  static async generateIncrementalMigration(
    previousState: any,
    currentState: any,
    existingMigrations: string[] = []
  ): Promise<FlywayMigration | null> {
    try {
      // Transformar ambos modelos a físico
      const previousResult = transformLogicalToPhysical(previousState);
      const currentResult = transformLogicalToPhysical(currentState);

      if (!previousResult.success || !currentResult.success) {
        throw new Error("Error en transformación lógico → físico");
      }

      const previousModel = previousResult.physicalModel!;
      const currentModel = currentResult.physicalModel!;

      // Generar entidades del modelo actual
      const codeGenerator = new SpringBootCodeGenerator(
        currentModel,
        "com.example.demo",
        "temp-project"
      );
      const entities = codeGenerator.getEntities();

      // Usar FlywayMigrationManager para generar migración incremental
      const migrationManager = new FlywayMigrationManager("postgresql");
      const nextVersion =
        FlywayMigrationManager.getNextVersion(existingMigrations);

      const migration = migrationManager.generateIncrementalMigration(
        previousModel,
        currentModel,
        entities,
        nextVersion
      );

      return migration;
    } catch (error) {
      console.error("Error generando migración incremental:", error);
      return null;
    }
  }

  /**
   * Genera la migración inicial para un diagrama
   */
  static async generateInitialMigration(
    diagramState: any
  ): Promise<FlywayMigration | null> {
    try {
      const transformResult = transformLogicalToPhysical(diagramState);

      if (!transformResult.success) {
        throw new Error("Error en transformación lógico → físico");
      }

      const physicalModel = transformResult.physicalModel!;

      const codeGenerator = new SpringBootCodeGenerator(
        physicalModel,
        "com.example.demo",
        "temp-project"
      );
      const entities = codeGenerator.getEntities();

      const migrationManager = new FlywayMigrationManager("postgresql");
      const migration = migrationManager.generateInitialMigration(
        physicalModel,
        entities
      );

      return migration;
    } catch (error) {
      console.error("Error generando migración inicial:", error);
      return null;
    }
  }

  /**
   * Obtiene el historial de migraciones de un proyecto
   */
  static parseExistingMigrations(
    migrationFiles: Record<string, string>
  ): string[] {
    const migrationFileNames: string[] = [];
    const migrationPattern = /^V\d+__.*\.sql$/;

    for (const filePath of Object.keys(migrationFiles)) {
      const fileName = filePath.split("/").pop();
      if (fileName?.match(migrationPattern)) {
        migrationFileNames.push(fileName);
      }
    }

    return migrationFileNames.sort((a, b) => a.localeCompare(b));
  }
}
