import { JsonPatchOperation } from "../validation/UMLValidator.js";
import type { DiagramState } from "./DiagramModel.js";

export interface DiagramOperation {
  id: string;
  diagramId: string;
  operation: JsonPatchOperation;
  userId: string;
  timestamp: Date;
  sequenceNumber: number; // Número de secuencia dentro del diagrama
  diagramVersion: number; // Versión del diagrama después de aplicar esta operación
  clientId: string; // ID del cliente que originó la operación
  operationHash?: string; // Hash para integridad (opcional)
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
    [key: string]: unknown;
  };
}

export interface DiagramOperationInput {
  diagramId: string;
  operation: JsonPatchOperation;
  userId: string;
  timestamp: Date;
  sequenceNumber: number;
  clientId: string;
  operationHash?: string;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
    [key: string]: unknown;
  };
  diagramVersion?: number; // Optional for auto-increment
}

export interface OperationBatch {
  id: string;
  diagramId: string;
  operations: DiagramOperation[];
  batchTimestamp: Date;
  userId: string;
  reason?: string; // Motivo del batch (ej: "bulk_import", "undo_operation", etc.)
}

export interface OperationBatchInput
  extends Omit<OperationBatch, "id" | "operations"> {
  operations: DiagramOperationInput[];
}

export interface DiagramOperationSummary {
  diagramId: string;
  totalOperations: number;
  lastOperationAt: Date;
  lastUserId: string;
  currentVersion: number;
  operationCountByUser: Record<string, number>;
  operationCountByType: Record<string, number>; // add, remove, replace, etc.
}

export class DiagramOperationLogModel {
  private operations: Map<string, DiagramOperation> = new Map();
  private operationsByDiagram: Map<string, DiagramOperation[]> = new Map();
  private operationBatches: Map<string, OperationBatch> = new Map();
  private diagramVersions: Map<string, number> = new Map(); // Contador de versiones por diagrama

  constructor() {
    // Inicializar con operaciones de ejemplo si es necesario
  }

  // Obtener la versión actual de un diagrama
  getCurrentVersion(diagramId: string): number {
    return this.diagramVersions.get(diagramId) || 0;
  }

  // Incrementar la versión de un diagrama
  incrementVersion(diagramId: string): number {
    const currentVersion = this.getCurrentVersion(diagramId);
    const newVersion = currentVersion + 1;
    this.diagramVersions.set(diagramId, newVersion);
    return newVersion;
  }

  // Establecer versión específica para un diagrama
  setVersion(diagramId: string, version: number): void {
    this.diagramVersions.set(diagramId, version);
  }

  // Reiniciar versión de un diagrama
  resetVersion(diagramId: string): void {
    this.diagramVersions.set(diagramId, 0);
  }

  // Obtener historial de versiones de un diagrama
  getVersionHistory(
    diagramId: string
  ): { version: number; timestamp: Date; operationId: string }[] {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.map((op) => ({
      version: op.diagramVersion,
      timestamp: op.timestamp,
      operationId: op.id,
    }));
  }

  // Obtener operaciones hasta una versión específica
  getOperationsUpToVersion(
    diagramId: string,
    version: number
  ): DiagramOperation[] {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.filter((op) => op.diagramVersion <= version);
  }

  // Verificar si una versión existe para un diagrama
  hasVersion(diagramId: string, version: number): boolean {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.some((op) => op.diagramVersion === version);
  }

  // Obtener la operación que creó una versión específica
  getOperationForVersion(
    diagramId: string,
    version: number
  ): DiagramOperation | undefined {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.find((op) => op.diagramVersion === version);
  }

  // Agregar una operación al log
  addOperation(operationData: DiagramOperationInput): DiagramOperation {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Si no se proporciona diagramVersion, incrementarla automáticamente
    const diagramVersion =
      operationData.diagramVersion ??
      this.incrementVersion(operationData.diagramId);

    // Si se proporcionó una versión específica, actualizar el contador interno
    if (operationData.diagramVersion !== undefined) {
      this.setVersion(
        operationData.diagramId,
        Math.max(
          this.getCurrentVersion(operationData.diagramId),
          operationData.diagramVersion
        )
      );
    }

    const operation: DiagramOperation = {
      id,
      ...operationData,
      diagramVersion,
    };

    this.operations.set(id, operation);

    // Indexar por diagramId
    if (!this.operationsByDiagram.has(operationData.diagramId)) {
      this.operationsByDiagram.set(operationData.diagramId, []);
    }
    this.operationsByDiagram.get(operationData.diagramId)!.push(operation);

    // Mantener ordenado por sequenceNumber
    this.operationsByDiagram
      .get(operationData.diagramId)!
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    return operation;
  }

  // Agregar múltiples operaciones como un batch
  addOperationBatch(batchData: OperationBatchInput): OperationBatch {
    const id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Para batches, necesitamos manejar las versiones de manera especial
    // Todas las operaciones en un batch deben tener versiones consistentes
    const addedOperations: DiagramOperation[] = [];

    // Calcular la versión base antes de agregar operaciones
    const baseVersion = this.getCurrentVersion(batchData.diagramId);

    // Agregar cada operación con versiones calculadas
    batchData.operations.forEach((opData, index) => {
      // Si no se proporciona diagramVersion, usar la versión base + índice + 1
      const diagramVersion = opData.diagramVersion ?? baseVersion + index + 1;

      const operationData: DiagramOperationInput = {
        ...opData,
        diagramVersion,
      };

      const addedOperation = this.addOperation(operationData);
      addedOperations.push(addedOperation);
    });

    // Actualizar la versión final del diagrama
    const lastOperation = addedOperations[addedOperations.length - 1];
    if (lastOperation) {
      this.setVersion(lastOperation.diagramId, lastOperation.diagramVersion);
    }

    const batch: OperationBatch = {
      id,
      ...batchData,
      operations: addedOperations,
    };

    this.operationBatches.set(id, batch);

    return batch;
  }

  // Obtener todas las operaciones de un diagrama
  getOperationsByDiagram(diagramId: string): DiagramOperation[] {
    return this.operationsByDiagram.get(diagramId) || [];
  }

  // Obtener operaciones de un diagrama en un rango de secuencia
  getOperationsInRange(
    diagramId: string,
    fromSequence: number,
    toSequence?: number
  ): DiagramOperation[] {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.filter((op) => {
      const inRange = op.sequenceNumber >= fromSequence;
      const toRange = toSequence ? op.sequenceNumber <= toSequence : true;
      return inRange && toRange;
    });
  }

  // Obtener operaciones desde una versión específica
  getOperationsSinceVersion(
    diagramId: string,
    sinceVersion: number
  ): DiagramOperation[] {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.filter((op) => op.diagramVersion > sinceVersion);
  }

  // Obtener la última operación de un diagrama
  getLastOperation(diagramId: string): DiagramOperation | undefined {
    const operations = this.getOperationsByDiagram(diagramId);
    return operations.length > 0
      ? operations[operations.length - 1]
      : undefined;
  }

  // Obtener operaciones por usuario
  getOperationsByUser(userId: string): DiagramOperation[] {
    return Array.from(this.operations.values()).filter(
      (op) => op.userId === userId
    );
  }

  // Obtener operaciones por usuario en un diagrama específico
  getOperationsByUserInDiagram(
    userId: string,
    diagramId: string
  ): DiagramOperation[] {
    return this.getOperationsByDiagram(diagramId).filter(
      (op) => op.userId === userId
    );
  }

  // Obtener resumen de operaciones de un diagrama
  getDiagramSummary(diagramId: string): DiagramOperationSummary | undefined {
    const operations = this.getOperationsByDiagram(diagramId);
    if (operations.length === 0) return undefined;

    const lastOperation = operations[operations.length - 1];
    const operationCountByUser: Record<string, number> = {};
    const operationCountByType: Record<string, number> = {};

    operations.forEach((op) => {
      // Contar por usuario
      operationCountByUser[op.userId] =
        (operationCountByUser[op.userId] || 0) + 1;

      // Contar por tipo de operación
      const opType = op.operation.op;
      operationCountByType[opType] = (operationCountByType[opType] || 0) + 1;
    });

    return {
      diagramId,
      totalOperations: operations.length,
      lastOperationAt: lastOperation.timestamp,
      lastUserId: lastOperation.userId,
      currentVersion: lastOperation.diagramVersion,
      operationCountByUser,
      operationCountByType,
    };
  }

  // Revertir operaciones (obtener operaciones para rollback)
  getRollbackOperations(
    diagramId: string,
    fromVersion: number,
    toVersion: number
  ): JsonPatchOperation[] {
    const operations = this.getOperationsInRange(
      diagramId,
      fromVersion + 1,
      toVersion
    );

    // Crear operaciones inversas en orden inverso
    const reverseOperations: JsonPatchOperation[] = [];

    for (let i = operations.length - 1; i >= 0; i--) {
      const op = operations[i];
      const reverseOp = this.createReverseOperation(op.operation);
      if (reverseOp) {
        reverseOperations.push(reverseOp);
      }
    }

    return reverseOperations;
  }

  // Crear operación inversa para rollback
  private createReverseOperation(
    operation: JsonPatchOperation
  ): JsonPatchOperation | null {
    switch (operation.op) {
      case "add":
        return {
          ...operation,
          op: "remove",
          // Para remove, solo necesitamos path, no value
          value: undefined,
        };

      case "remove":
        return {
          ...operation,
          op: "add",
          // Para rollback de remove, necesitaríamos el valor original
          // Esto requeriría almacenar el valor removido
          // Por ahora, retornamos null
        };

      case "replace":
        return {
          ...operation,
          op: "replace",
          // Para rollback de replace, necesitaríamos el valor anterior
          // Esto requeriría almacenar el valor anterior
          // Por ahora, retornamos null
        };

      default:
        return null;
    }
  }

  // Limpiar operaciones antiguas (para liberar memoria)
  cleanupOldOperations(diagramId: string, keepCount: number = 100): number {
    const operations = this.operationsByDiagram.get(diagramId);
    if (!operations || operations.length <= keepCount) return 0;

    // Mantener solo las últimas N operaciones por cantidad
    const operationsToRemove = operations.slice(
      0,
      operations.length - keepCount
    );
    const removedCount = operationsToRemove.length;

    // Remover del mapa principal
    operationsToRemove.forEach((op) => {
      this.operations.delete(op.id);
    });

    // Actualizar el array del diagrama
    this.operationsByDiagram.set(diagramId, operations.slice(-keepCount));

    return removedCount;
  }

  // Limpiar operaciones antiguas por versiones (mantiene las últimas N versiones)
  cleanupOldOperationsByVersion(
    diagramId: string,
    keepVersions: number = 100
  ): number {
    const operations = this.operationsByDiagram.get(diagramId);
    if (!operations || operations.length <= keepVersions) return 0;

    // Obtener la versión actual
    const currentVersion = this.getCurrentVersion(diagramId);
    const minVersionToKeep = Math.max(0, currentVersion - keepVersions + 1);

    // Mantener operaciones desde la versión mínima hasta la actual
    const operationsToKeep = operations.filter(
      (op) => op.diagramVersion >= minVersionToKeep
    );
    const operationsToRemove = operations.filter(
      (op) => op.diagramVersion < minVersionToKeep
    );

    const removedCount = operationsToRemove.length;

    // Remover del mapa principal
    operationsToRemove.forEach((op) => {
      this.operations.delete(op.id);
    });

    // Actualizar el array del diagrama
    this.operationsByDiagram.set(diagramId, operationsToKeep);

    return removedCount;
  }

  // Buscar operaciones por criterios
  searchOperations(criteria: {
    diagramId?: string;
    userId?: string;
    operationType?: string;
    fromDate?: Date;
    toDate?: Date;
    path?: string;
  }): DiagramOperation[] {
    let results = Array.from(this.operations.values());

    if (criteria.diagramId) {
      results = results.filter((op) => op.diagramId === criteria.diagramId);
    }

    if (criteria.userId) {
      results = results.filter((op) => op.userId === criteria.userId);
    }

    if (criteria.operationType) {
      results = results.filter(
        (op) => op.operation.op === criteria.operationType
      );
    }

    if (criteria.fromDate) {
      results = results.filter((op) => op.timestamp >= criteria.fromDate!);
    }

    if (criteria.toDate) {
      results = results.filter((op) => op.timestamp <= criteria.toDate!);
    }

    if (criteria.path) {
      results = results.filter((op) =>
        op.operation.path.includes(criteria.path!)
      );
    }

    return results;
  }

  // Obtener estadísticas globales
  getGlobalStats() {
    const totalOperations = this.operations.size;
    const totalDiagrams = this.operationsByDiagram.size;
    const totalBatches = this.operationBatches.size;

    const operationsByType: Record<string, number> = {};
    const operationsByUser: Record<string, number> = {};
    const versionsByDiagram: Record<string, number> = {};

    for (const operation of this.operations.values()) {
      // Contar por tipo
      const opType = operation.operation.op;
      operationsByType[opType] = (operationsByType[opType] || 0) + 1;

      // Contar por usuario
      operationsByUser[operation.userId] =
        (operationsByUser[operation.userId] || 0) + 1;
    }

    // Contar versiones por diagrama
    for (const [diagramId, version] of this.diagramVersions.entries()) {
      versionsByDiagram[diagramId] = version;
    }

    return {
      totalOperations,
      totalDiagrams: this.operationsByDiagram.size,
      totalBatches,
      operationsByType,
      operationsByUser,
      versionsByDiagram,
      averageOperationsPerDiagram:
        totalDiagrams > 0 ? totalOperations / totalDiagrams : 0,
      averageVersionsPerDiagram:
        Object.keys(versionsByDiagram).length > 0
          ? Object.values(versionsByDiagram).reduce((sum, v) => sum + v, 0) /
            Object.keys(versionsByDiagram).length
          : 0,
    };
  }

  // Obtener todas las operaciones
  getAll(): DiagramOperation[] {
    return Array.from(this.operations.values());
  }

  // Obtener todos los batches
  getAllBatches(): OperationBatch[] {
    return Array.from(this.operationBatches.values());
  }

  /**
   * Genera código Spring Boot para una versión específica del diagrama
   */
  async generateSpringBootCodeForVersion(
    diagramId: string,
    version: number,
    basePackage?: string,
    projectName?: string
  ): Promise<Record<string, string> | null> {
    try {
      // Reconstruir el estado del diagrama en la versión especificada
      const operations = this.getOperationsUpToVersion(diagramId, version);
      if (operations.length === 0) {
        return null;
      }

      // Crear un estado de diagrama básico (esto es simplificado)
      // En una implementación completa, necesitaríamos aplicar las operaciones
      // para reconstruir el estado completo del diagrama
      const diagramState = this.reconstructDiagramState(diagramId, version);
      if (!diagramState) {
        return null;
      }

      // Importar dinámicamente para evitar dependencias circulares
      const { transformLogicalToPhysical } = await import(
        "./TransformationManager.js"
      );
      const { generateSpringBootProject } = await import(
        "./CodeGenerationUtils.js"
      );

      // Transformar a modelo físico
      const transformationResult = transformLogicalToPhysical(diagramState);
      if (
        !transformationResult.success ||
        !transformationResult.physicalModel
      ) {
        throw new Error(
          `Transformation failed: ${transformationResult.errors.join(", ")}`
        );
      }

      // Generar código Spring Boot
      return generateSpringBootProject(
        transformationResult.physicalModel,
        basePackage,
        projectName
      );
    } catch (error) {
      console.error(
        `Error generating Spring Boot code for version ${version}:`,
        error
      );
      return null;
    }
  }

  /**
   * Genera código Spring Boot incremental entre dos versiones
   */
  async generateIncrementalSpringBootCode(
    diagramId: string,
    fromVersion: number,
    toVersion: number,
    basePackage?: string,
    projectName?: string
  ): Promise<Record<string, string> | null> {
    try {
      // Obtener el estado base (fromVersion)
      const baseState = this.reconstructDiagramState(diagramId, fromVersion);
      const targetState = this.reconstructDiagramState(diagramId, toVersion);

      if (!baseState || !targetState) {
        return null;
      }

      // Importar dinámicamente
      const { transformLogicalToPhysical } = await import(
        "./TransformationManager.js"
      );
      const { generateIncrementalSpringBootCode } = await import(
        "./CodeGenerationUtils.js"
      );

      // Transformar ambos estados
      const baseResult = transformLogicalToPhysical(baseState);
      const targetResult = transformLogicalToPhysical(targetState);

      if (
        !baseResult.success ||
        !targetResult.success ||
        !baseResult.physicalModel ||
        !targetResult.physicalModel
      ) {
        throw new Error("Transformation failed for one or both versions");
      }

      // Generar código incremental
      return generateIncrementalSpringBootCode(
        baseResult.physicalModel,
        targetResult.physicalModel,
        basePackage,
        projectName
      );
    } catch (error) {
      console.error(
        `Error generating incremental Spring Boot code from ${fromVersion} to ${toVersion}:`,
        error
      );
      return null;
    }
  }

  /**
   * Reconstruye el estado del diagrama en una versión específica
   * Esta es una implementación simplificada que necesitaría ser completada
   * según la lógica específica de reconstrucción de estados del diagrama
   */
  private reconstructDiagramState(
    diagramId: string,
    version: number
  ): DiagramState | null {
    // Esta es una implementación de placeholder
    // En la práctica, necesitaríamos aplicar todas las operaciones hasta la versión
    // para reconstruir el estado completo del diagrama

    const operations = this.getOperationsUpToVersion(diagramId, version);
    if (operations.length === 0) {
      return null;
    }

    // Placeholder: retornar un estado básico
    // Esto debería ser implementado según la lógica real de reconstrucción
    return {
      elements: {},
      relationships: {},
      version: version,
      lastModified:
        operations[operations.length - 1]?.timestamp.getTime() || Date.now(),
    };
  }
}
