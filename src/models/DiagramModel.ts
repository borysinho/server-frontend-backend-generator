import {
  UMLValidator,
  Diagram,
  JsonPatchOperation,
} from "../validation/UMLValidator.js";

export interface DiagramElement {
  id: string;
  className: string;
  attributes: string[];
  methods: string[];
  elementType: "class" | "interface" | "enumeration" | "package" | "note";
  x?: number;
  y?: number;
  containedElements?: string[];
}

export interface DiagramRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationship:
    | "association"
    | "aggregation"
    | "composition"
    | "generalization"
    | "dependency"
    | "realization";
  sourceCardinality?: string;
  targetCardinality?: string;
  label?: string;
}

export interface DiagramState {
  elements: Record<string, DiagramElement>;
  relationships: Record<string, DiagramRelationship>;
  version: number;
  lastModified: number;
}

export interface OperationResult {
  success: boolean;
  data?: unknown;
  errors?: string[];
  newState?: DiagramState;
}

export class DiagramModel {
  private state: DiagramState;
  private observers: Set<(state: DiagramState) => void> = new Set();

  constructor() {
    this.state = {
      elements: {},
      relationships: {},
      version: 0,
      lastModified: Date.now(),
    };
  }

  /**
   * Suscribe un observador para cambios de estado
   */
  subscribe(observer: (state: DiagramState) => void): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  /**
   * Notifica a todos los observadores sobre cambios de estado
   */
  private notifyObservers(): void {
    this.observers.forEach((observer) => observer(this.state));
  }

  /**
   * Obtiene el estado actual del diagrama
   */
  getState(): DiagramState {
    return { ...this.state };
  }

  /**
   * Establece el estado completo del diagrama (usado al cargar desde BD)
   */
  setState(newState: DiagramState): void {
    this.state = { ...newState };
    console.log(
      `📦 Estado establecido: ${
        Object.keys(this.state.elements).length
      } elementos, ${Object.keys(this.state.relationships).length} relaciones`
    );
  }

  /**
   * Aplica una operación al modelo
   */
  async applyOperation(
    operation: JsonPatchOperation
  ): Promise<OperationResult> {
    try {
      // Convertir estado a formato Diagram para validación
      const diagramForValidation: Diagram = this.convertStateToDiagram();

      // Validar la operación con reglas UML
      const validationResult = UMLValidator.validateOperation(
        operation,
        diagramForValidation
      );

      if (!validationResult.valid) {
        return {
          success: false,
          errors: validationResult.errors,
        };
      }

      // Aplicar la operación al estado
      const newState = this.applyOperationToState(operation);

      // Actualizar versión y timestamp
      newState.version++;
      newState.lastModified = Date.now();

      // Actualizar estado
      this.state = newState;

      // Notificar a observadores
      this.notifyObservers();

      return {
        success: true,
        newState: this.state,
      };
    } catch (error) {
      console.error("Error aplicando operación:", error);
      return {
        success: false,
        errors: ["Error interno del servidor"],
      };
    }
  }

  /**
   * Aplica una operación específica al estado
   */
  private applyOperationToState(operation: JsonPatchOperation): DiagramState {
    // 🔧 Hacer copia profunda del estado para evitar mutaciones
    const newState: DiagramState = {
      ...this.state,
      elements: { ...this.state.elements },
      relationships: { ...this.state.relationships },
    };
    const { op, path, value } = operation;
    const pathParts = path.split("/").filter((p: string) => p !== "");

    if (pathParts.length < 1) return newState;

    const collection = pathParts[0];
    let itemId = pathParts[1];
    const attribute = pathParts[2];

    // Si el itemId es "-" (indica agregar al final del array), usar el ID del value
    if (itemId === "-" && value && typeof value === "object" && "id" in value) {
      itemId = (value as { id: string }).id;
    }

    if (collection === "elements") {
      if (op === "add" && value) {
        newState.elements[itemId] = value as DiagramElement;
        console.log(
          `✅ Elemento agregado al estado: ${itemId}`,
          (value as DiagramElement).className
        );
      } else if (op === "remove") {
        delete newState.elements[itemId];
        console.log(`🗑️ Elemento removido del estado: ${itemId}`);
      } else if (op === "replace" && attribute && value !== undefined) {
        if (!newState.elements[itemId])
          newState.elements[itemId] = {} as DiagramElement;

        // 📍 Caso especial: position es un objeto {x, y} que se debe expandir
        if (attribute === "position" && typeof value === "object") {
          const { x, y } = value as { x: number; y: number };
          (newState.elements[itemId] as unknown as Record<string, unknown>)[
            "x"
          ] = x;
          (newState.elements[itemId] as unknown as Record<string, unknown>)[
            "y"
          ] = y;
          console.log(
            `🔄 Posición del elemento actualizada en estado: ${itemId} -> (${x}, ${y})`
          );
        } else {
          (newState.elements[itemId] as unknown as Record<string, unknown>)[
            attribute
          ] = value;
          console.log(
            `🔄 Elemento actualizado en estado: ${itemId}.${attribute}`
          );
        }
      }
    } else if (collection === "relationships") {
      if (op === "add" && value) {
        newState.relationships[itemId] = value as DiagramRelationship;
        console.log(`✅ Relación agregada al estado: ${itemId}`);
      } else if (op === "remove") {
        delete newState.relationships[itemId];
        console.log(`🗑️ Relación removida del estado: ${itemId}`);
      } else if (op === "replace" && attribute && value !== undefined) {
        if (!newState.relationships[itemId])
          newState.relationships[itemId] = {} as DiagramRelationship;
        (newState.relationships[itemId] as unknown as Record<string, unknown>)[
          attribute
        ] = value;
        console.log(
          `🔄 Relación actualizada en estado: ${itemId}.${attribute}`
        );
      }
    }

    return newState;
  }

  /**
   * Convierte el estado interno a formato Diagram para validación
   */
  private convertStateToDiagram(): Diagram {
    const elements = Object.values(this.state.elements).map((element) => ({
      id: element.id,
      className: element.className,
      attributes: element.attributes,
      methods: element.methods,
      elementType: element.elementType,
      x: element.x || 0,
      y: element.y || 0,
      width: 200, // valores por defecto
      height: 120,
      containedElements: element.containedElements,
    }));

    const relationships = Object.values(this.state.relationships).map(
      (rel) => ({
        id: rel.id,
        source: (rel as any).source || (rel as any).sourceId,
        target: (rel as any).target || (rel as any).targetId,
        relationship: rel.relationship,
        label: rel.label,
        sourceMultiplicity:
          (rel as any).sourceMultiplicity || (rel as any).sourceCardinality,
        targetMultiplicity:
          (rel as any).targetMultiplicity || (rel as any).targetCardinality,
      })
    );

    return {
      id: "main-diagram",
      elements,
      relationships,
      lastModified: this.state.lastModified,
      version: this.state.version,
    };
  }

  /**
   * Obtiene estadísticas del diagrama
   */
  getStatistics(): {
    elementsCount: number;
    relationshipsCount: number;
    version: number;
  } {
    return {
      elementsCount: Object.keys(this.state.elements).length,
      relationshipsCount: Object.keys(this.state.relationships).length,
      version: this.state.version,
    };
  }
}
