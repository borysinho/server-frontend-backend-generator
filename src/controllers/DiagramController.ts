import {
  DiagramModel,
  OperationResult,
  DiagramState,
} from "../models/DiagramModel.js";
import { JsonPatchOperation } from "../validation/UMLValidator.js";

export interface ViewObserver {
  id: string;
  notify: (operation: JsonPatchOperation, newState: any) => void;
}

export class DiagramController {
  private model: DiagramModel;
  private views: Map<string, ViewObserver> = new Map();
  private diagramId: string;

  constructor(diagramId: string) {
    this.diagramId = diagramId;
    this.model = new DiagramModel();

    // Suscribirse a cambios del modelo
    this.model.subscribe((newState: DiagramState) => {
      this.notifyAllViews(
        {
          op: "replace",
          path: "/diagram",
          value: newState,
          clientId: "server",
          timestamp: Date.now(),
          sequenceNumber: newState.version,
          description: "Estado actualizado del diagrama",
        },
        newState
      );
    });
  }

  /**
   * Inicializa el estado del modelo con datos de la base de datos
   */
  initializeState(state: DiagramState): void {
    this.model.setState(state);
    console.log(`✅ Estado inicializado para diagrama ${this.diagramId}`);
  }

  /**
   * Registra una vista (cliente) para recibir notificaciones
   */
  registerView(viewId: string, observer: ViewObserver): () => void {
    this.views.set(viewId, observer);
    console.log(`Vista registrada: ${viewId}`);

    // Enviar estado inicial a la nueva vista
    const currentState = this.model.getState();
    observer.notify(
      {
        op: "replace",
        path: "/diagram",
        value: currentState,
        clientId: "server",
        timestamp: Date.now(),
        sequenceNumber: currentState.version,
        description: "Estado inicial del diagrama",
      },
      currentState
    );

    return () => {
      this.views.delete(viewId);
      console.log(`Vista removida: ${viewId}`);
    };
  }

  /**
   * Procesa una operación enviada por una vista
   */
  async processOperation(
    viewId: string,
    operation: JsonPatchOperation
  ): Promise<OperationResult> {
    console.log(`Procesando operación de vista ${viewId}:`, operation);

    try {
      // Aplicar la operación al modelo
      const result = await this.model.applyOperation(operation);

      if (result.success) {
        console.log(`Operación aplicada exitosamente por vista ${viewId}`);
      } else {
        console.log(`Operación rechazada para vista ${viewId}:`, result.errors);
      }

      return result;
    } catch (error) {
      console.error(`Error procesando operación de vista ${viewId}:`, error);
      return {
        success: false,
        errors: ["Error interno del controlador"],
      };
    }
  }

  /**
   * Notifica a todas las vistas sobre un cambio
   */
  private notifyAllViews(operation: JsonPatchOperation, newState: any): void {
    this.views.forEach((view, viewId) => {
      try {
        view.notify(operation, newState);
      } catch (error) {
        console.error(`Error notificando a vista ${viewId}:`, error);
        // Podríamos remover vistas que fallen, pero por ahora solo logueamos
      }
    });
  }

  /**
   * Obtiene estadísticas del diagrama
   */
  getStatistics(): {
    // Nuevos nombres
    totalElements: number;
    totalRelationships: number;
    currentVersion: number;
    activeViews: number;
    lastModified: number;
    // Nombres antiguos para compatibilidad
    elementsCount: number;
    relationshipsCount: number;
    version: number;
    viewsCount: number;
  } {
    const modelStats = this.model.getStatistics();
    const state = this.model.getState();
    return {
      // Nuevos nombres
      totalElements: modelStats.elementsCount,
      totalRelationships: modelStats.relationshipsCount,
      currentVersion: modelStats.version,
      activeViews: this.views.size,
      lastModified: state.lastModified,
      // Nombres antiguos para compatibilidad
      elementsCount: modelStats.elementsCount,
      relationshipsCount: modelStats.relationshipsCount,
      version: modelStats.version,
      viewsCount: this.views.size,
    };
  }

  /**
   * Obtiene el estado actual del diagrama
   */
  getCurrentState(): any {
    return this.model.getState();
  }

  /**
   * Remueve una vista específica
   */
  removeView(viewId: string): void {
    this.views.delete(viewId);
    console.log(`Vista removida: ${viewId}`);
  }

  /**
   * Lista todas las vistas conectadas
   */
  getConnectedViews(): string[] {
    return Array.from(this.views.keys());
  }
}
