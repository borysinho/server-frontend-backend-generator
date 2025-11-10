// server/validation/UMLValidator.ts

// Interfaces del servidor (equivalentes a las del frontend)
export interface Diagram {
  id: string;
  elements: Element[];
  relationships: Relationship[];
  lastModified?: number;
  version?: number;
}

export interface Element {
  id: string;
  className: string;
  attributes: string[];
  methods: string[];
  elementType: "class" | "interface" | "enumeration" | "package" | "note";
  stereotype?: string;
  parentPackageId?: string;
  containedElements?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  relationship:
    | "association"
    | "aggregation"
    | "composition"
    | "generalization"
    | "dependency"
    | "realization";
  label?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  sourceRole?: string;
  targetRole?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
  clientId: string;
  timestamp: number;
  sequenceNumber: number;
  description: string;
}

export class UMLValidator {
  static validateOperation(
    operation: JsonPatchOperation,
    currentDiagram: Diagram
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validar campos requeridos
      if (!operation.clientId || operation.clientId.trim() === "") {
        errors.push("clientId es requerido");
      }

      // Validar path
      if (!operation.path || !operation.path.startsWith("/")) {
        errors.push("Path debe comenzar con /");
      } else if (
        !operation.path.startsWith("/elements/") &&
        !operation.path.startsWith("/relationships/")
      ) {
        errors.push(`Path no válido: ${operation.path}`);
      }

      switch (operation.op) {
        case "add":
          this.validateAddOperation(
            operation,
            currentDiagram,
            errors,
            warnings
          );
          break;
        case "replace":
          this.validateReplaceOperation(
            operation,
            currentDiagram,
            errors,
            warnings
          );
          break;
        case "remove":
          this.validateRemoveOperation(
            operation,
            currentDiagram,
            errors,
            warnings
          );
          break;
      }

      // Validaciones adicionales
      this.validateDiagramIntegrity(currentDiagram, errors, warnings);
    } catch (error) {
      errors.push(
        `Error de validación: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private static validateAddOperation(
    operation: JsonPatchOperation,
    diagram: Diagram,
    errors: string[],
    warnings: string[]
  ) {
    // Extraer ID del path
    const pathParts = operation.path.split("/");
    const itemId = pathParts[pathParts.length - 1];

    // Validar que el ID no esté duplicado
    if (operation.path.startsWith("/elements/")) {
      if (diagram.elements.some((e) => e.id === itemId)) {
        errors.push(`ID de elemento duplicado: ${itemId}`);
        return;
      }
    } else if (operation.path.startsWith("/relationships/")) {
      if (diagram.relationships.some((r) => r.id === itemId)) {
        errors.push(`ID de relación duplicado: ${itemId}`);
        return;
      }
    }

    if (operation.path.startsWith("/elements/")) {
      const element = operation.value as Element;
      this.validateElement(
        element,
        diagram,
        errors,
        warnings,
        element.id // 🔧 Excluir el elemento que se está agregando de la validación de nombre duplicado
      );
    } else if (operation.path.startsWith("/relationships/")) {
      this.validateRelationship(
        operation.value as Relationship,
        diagram,
        errors,
        warnings
      );
    }
  }

  private static validateReplaceOperation(
    operation: JsonPatchOperation,
    diagram: Diagram,
    errors: string[],
    warnings: string[]
  ) {
    // Para operaciones de reemplazo, validar el nuevo valor
    if (operation.path.includes("/elements/")) {
      const pathParts = operation.path.split("/");
      const elementId = pathParts[2];

      // Verificar si el elemento existe
      const existingElement = diagram.elements.find((e) => e.id === elementId);
      if (!existingElement) {
        errors.push(`Elemento no encontrado: ${elementId}`);
        return;
      }

      const updatedElement = { ...existingElement };

      // Aplicar el cambio al elemento
      const propertyPath = pathParts.slice(3).join("/");
      this.setNestedProperty(updatedElement, propertyPath, operation.value);

      this.validateElement(
        updatedElement,
        diagram,
        errors,
        warnings,
        elementId
      );
    } else if (operation.path.includes("/relationships/")) {
      const pathParts = operation.path.split("/");
      const relationshipId = pathParts[2];

      // Verificar si la relación existe
      const existingRelationship = diagram.relationships.find(
        (r) => r.id === relationshipId
      );
      if (!existingRelationship) {
        errors.push(`Relación no encontrada: ${relationshipId}`);
        return;
      }

      const updatedRelationship = { ...existingRelationship };

      // Aplicar el cambio a la relación
      const propertyPath = pathParts.slice(3).join("/");
      this.setNestedProperty(
        updatedRelationship,
        propertyPath,
        operation.value
      );

      this.validateRelationship(updatedRelationship, diagram, errors, warnings);
    }
  }

  private static validateRemoveOperation(
    operation: JsonPatchOperation,
    diagram: Diagram,
    errors: string[],
    warnings: string[]
  ) {
    // Validar que no se rompan dependencias al eliminar
    if (operation.path.startsWith("/elements/")) {
      const elementId = operation.path.split("/")[2];
      const dependentRelationships = diagram.relationships.filter(
        (rel) => rel.source === elementId || rel.target === elementId
      );

      if (dependentRelationships.length > 0) {
        warnings.push(
          `Eliminar elemento afectará ${dependentRelationships.length} relación(es)`
        );
      }
    }
  }

  private static validateElement(
    element: Element,
    diagram: Diagram,
    errors: string[],
    warnings: string[],
    excludeElementId?: string
  ) {
    // Validar tipo de elemento válido
    const validElementTypes = [
      "class",
      "interface",
      "enumeration",
      "package",
      "note",
    ];
    if (!validElementTypes.includes(element.elementType)) {
      errors.push(`Tipo de elemento no válido: ${element.elementType}`);
      return;
    }

    // Validar nombre único en el diagrama
    if (
      this.isNameTaken(
        element.className,
        element.parentPackageId,
        diagram,
        excludeElementId
      )
    ) {
      errors.push(`Nombre '${element.className}' ya existe en el paquete`);
    }

    // Validar formato de estereotipo
    if (element.stereotype && !/^<<.*>>$/.test(element.stereotype)) {
      errors.push(
        `Estereotipo '${element.stereotype}' debe tener formato <<texto>>`
      );
    }

    // Validaciones específicas por tipo
    switch (element.elementType) {
      case "class":
        this.validateClass(element, errors, warnings);
        break;
      case "interface":
        this.validateInterface(element, errors, warnings);
        break;
      case "enumeration":
        this.validateEnumeration(element, errors, warnings);
        break;
      case "package":
        this.validatePackage(element, errors, warnings);
        break;
    }
  }

  private static validateRelationship(
    relationship: Relationship,
    diagram: Diagram,
    errors: string[],
    warnings: string[]
  ) {
    // Manejar tanto el formato con source/target como sourceId/targetId
    const sourceId = (relationship as any).sourceId || relationship.source;
    const targetId = (relationship as any).targetId || relationship.target;

    console.log(
      `🔍 Validando relación: source=${sourceId}, target=${targetId}`
    );
    console.log(
      `🔍 Elementos en diagrama:`,
      diagram.elements.map((e) => ({ id: e.id, className: e.className }))
    );

    // Validar que elementos existen
    const sourceExists = diagram.elements.some((e) => e.id === sourceId);
    const targetExists = diagram.elements.some((e) => e.id === targetId);

    console.log(`🔍 Source ${sourceId} existe: ${sourceExists}`);
    console.log(`🔍 Target ${targetId} existe: ${targetExists}`);

    if (!sourceExists) {
      errors.push(`Elemento source no encontrado: ${sourceId}`);
    }
    if (!targetExists) {
      errors.push(`Elemento target no encontrado: ${targetId}`);
    }

    // Validar auto-referencia
    if (sourceId === targetId) {
      errors.push("Una relación no puede referenciar al mismo elemento");
    }

    // Validar cardinalidad
    if (
      relationship.sourceMultiplicity &&
      !this.isValidCardinality(relationship.sourceMultiplicity)
    ) {
      errors.push(
        `Cardinalidad source '${relationship.sourceMultiplicity}' no es válida`
      );
    }
    if (
      relationship.targetMultiplicity &&
      !this.isValidCardinality(relationship.targetMultiplicity)
    ) {
      errors.push(
        `Cardinalidad target '${relationship.targetMultiplicity}' no es válida`
      );
    }

    // Validar tipos de relación permitidos
    if (sourceExists && targetExists) {
      const source = diagram.elements.find((e) => e.id === sourceId);
      const target = diagram.elements.find((e) => e.id === targetId);
      if (
        source &&
        target &&
        !this.isValidRelationship(relationship.relationship, source, target)
      ) {
        errors.push(
          `Relación '${relationship.relationship}' no permitida entre ${source.elementType} y ${target.elementType}`
        );
      }
    }
  }

  private static validateClass(
    element: Element,
    errors: string[],
    warnings: string[]
  ) {
    // Validar atributos con sintaxis correcta
    if (element.attributes) {
      element.attributes.forEach((attr: string, index: number) => {
        if (!this.isValidAttributeSyntax(attr)) {
          errors.push(`Atributo ${index + 1} tiene sintaxis inválida: ${attr}`);
        }
      });
    }

    // Validar métodos con sintaxis correcta
    if (element.methods) {
      element.methods.forEach((method: string, index: number) => {
        if (!this.isValidMethodSyntax(method)) {
          errors.push(`Método ${index + 1} tiene sintaxis inválida: ${method}`);
        }
      });

      // Validar que métodos abstractos solo estén en clases abstractas
      const hasAbstractMethods = element.methods.some(
        (m) => m.includes("abstract ") || m.includes("{abstract}")
      );
      if (hasAbstractMethods && !element.stereotype?.includes("abstract")) {
        errors.push("Clase con métodos abstractos debe ser abstracta");
      }
    }

    // Validar que no haya atributos finales con métodos setters
    if (element.attributes && element.methods) {
      const finalAttributes = element.attributes.filter(
        (attr) => attr.includes("final ") || attr.includes("{final}")
      );
      const setters = element.methods.filter(
        (method) => method.includes("set") && method.includes("(")
      );

      finalAttributes.forEach((finalAttr) => {
        const attrName = this.extractAttributeName(finalAttr);
        const hasSetter = setters.some((setter) =>
          setter.toLowerCase().includes(`set${attrName.toLowerCase()}`)
        );
        if (hasSetter) {
          errors.push(`Atributo final '${attrName}' no puede tener setter`);
        }
      });
    }
  }

  private static validateInterface(
    element: Element,
    errors: string[],
    warnings: string[]
  ) {
    // Interfaces solo pueden tener métodos abstractos
    if (element.methods) {
      element.methods.forEach((method: string, index: number) => {
        if (!method.includes("()") || method.includes("{}")) {
          errors.push(`Interface método ${index + 1} debe ser abstracto`);
        }
      });
    }

    // Interfaces no pueden tener atributos (excepto constantes)
    if (element.attributes && element.attributes.length > 0) {
      warnings.push("Interfaces generalmente no tienen atributos de instancia");
    }
  }

  private static validateEnumeration(
    element: Element,
    errors: string[],
    _warnings: string[]
  ) {
    // Validar valores únicos
    if (element.attributes) {
      const values = element.attributes;
      const uniqueValues = new Set(values);
      if (uniqueValues.size !== values.length) {
        errors.push("Enumeración contiene valores duplicados");
      }
    } else {
      errors.push("Enumeración debe tener al menos un valor");
    }
  }

  private static validatePackage(
    _element: Element,
    _errors: string[],
    _warnings: string[]
  ) {
    // Validar que no contenga elementos que ya están en otros paquetes
    // Esta validación se hace en validateDiagramIntegrity
  }

  private static isNameTaken(
    name: string,
    packageId: string | undefined,
    diagram: Diagram,
    excludeElementId?: string
  ): boolean {
    return diagram.elements.some(
      (e) =>
        e.className === name &&
        e.parentPackageId === packageId &&
        e.elementType !== "note" && // Notas pueden tener nombres duplicados
        e.id !== excludeElementId // Excluir el elemento que se está editando
    );
  }

  private static isValidCardinality(cardinality: string): boolean {
    const patterns = [
      /^\d+$/, // Número exacto: "1"
      /^\d+\.\.\d+$/, // Rango: "1..5"
      /^\d+\.\.\*$/, // Desde: "1..*"
      /^0\.\.\d+$/, // Hasta: "0..1"
      /^\*$/, // Muchos: "*"
    ];
    return patterns.some((pattern) => pattern.test(cardinality));
  }

  private static isValidRelationship(
    type: string,
    source: Element,
    target: Element
  ): boolean {
    switch (type) {
      case "generalization":
        return (
          (source.elementType === "class" && target.elementType === "class") ||
          (source.elementType === "interface" &&
            target.elementType === "interface")
        );
      case "realization":
        return (
          source.elementType === "class" && target.elementType === "interface"
        );
      case "association":
      case "aggregation":
      case "composition":
        return (
          source.elementType !== "enumeration" &&
          target.elementType !== "enumeration"
        );
      case "dependency":
        return true; // Dependencias permitidas entre cualquier elemento
      default:
        return false;
    }
  }

  private static validateDiagramIntegrity(
    diagram: Diagram,
    errors: string[],
    warnings: string[]
  ) {
    // Validar referencias de relaciones
    diagram.relationships?.forEach((rel, index) => {
      const sourceExists = diagram.elements.some((e) => e.id === rel.source);
      const targetExists = diagram.elements.some((e) => e.id === rel.target);

      if (!sourceExists || !targetExists) {
        errors.push(`Relación ${index + 1} referencia elementos inexistentes`);
      }
    });

    // Validar integridad de paquetes
    diagram.elements?.forEach((element) => {
      if (element.elementType === "package" && element.containedElements) {
        element.containedElements.forEach((containedId) => {
          const containedElement = diagram.elements.find(
            (e) => e.id === containedId
          );
          if (!containedElement) {
            errors.push(
              `Paquete '${element.className}' referencia elemento inexistente`
            );
          } else if (containedElement.parentPackageId !== element.id) {
            warnings.push(
              `Elemento '${containedElement.className}' no está correctamente asignado al paquete`
            );
          }
        });
      }
    });

    // Validar herencia múltiple (no permitida en clases)
    this.validateMultipleInheritance(diagram, errors);

    // Validar que interfaces no hereden de clases
    this.validateInterfaceInheritance(diagram, errors);

    // Validar composición (elementos contenidos no pueden existir fuera)
    this.validateCompositionIntegrity(diagram, errors);

    // Validar alcance de elementos
    this.validateElementScope(diagram, errors, warnings);

    // Validar dependencias circulares
    const hasCircularDeps = UMLValidator.detectCircularDependencies(diagram);
    if (hasCircularDeps) {
      warnings.push("Posible dependencia circular detectada");
    }
  }

  private static validateMultipleInheritance(
    diagram: Diagram,
    errors: string[]
  ) {
    // Encontrar todas las clases
    const classes = diagram.elements.filter((e) => e.elementType === "class");

    classes.forEach((classElement) => {
      // Contar relaciones de generalización donde esta clase es el source
      const generalizations = diagram.relationships.filter(
        (rel) =>
          rel.relationship === "generalization" &&
          rel.source === classElement.id
      );

      if (generalizations.length > 1) {
        errors.push(
          `Clase '${classElement.className}' tiene herencia múltiple (no permitida)`
        );
      }
    });
  }

  private static validateInterfaceInheritance(
    diagram: Diagram,
    errors: string[]
  ) {
    // Interfaces no pueden heredar de clases
    diagram.relationships.forEach((rel) => {
      if (
        rel.relationship === "generalization" ||
        rel.relationship === "realization"
      ) {
        const source = diagram.elements.find((e) => e.id === rel.source);
        const target = diagram.elements.find((e) => e.id === rel.target);

        if (
          source?.elementType === "interface" &&
          target?.elementType === "class"
        ) {
          errors.push(
            `Interface '${source.className}' no puede heredar de clase '${target.className}'`
          );
        }
      }
    });
  }

  private static validateCompositionIntegrity(
    diagram: Diagram,
    errors: string[]
  ) {
    // En composición, el elemento contenido debe tener parentPackageId
    diagram.relationships.forEach((rel) => {
      if (rel.relationship === "composition") {
        const source = diagram.elements.find((e) => e.id === rel.source);
        const target = diagram.elements.find((e) => e.id === rel.target);

        if (source && target) {
          // El elemento target debe estar contenido en el source
          // Nota: Esta validación se relaja para permitir eliminación de composiciones
          if (!target.parentPackageId || target.parentPackageId !== source.id) {
            // Cambiar a warning en lugar de error para permitir eliminación
            console.warn(
              `Composición: '${target.className}' debería estar contenido en '${source.className}'`
            );
            // errors.push(
            //   `Composición: '${target.className}' debe estar contenido en '${source.className}'`
            // );
          }
        }
      }
    });
  }

  private static validateElementScope(
    diagram: Diagram,
    errors: string[],
    warnings: string[]
  ) {
    // Validar que elementos sin paquete padre estén en el paquete raíz
    diagram.elements.forEach((element) => {
      if (!element.parentPackageId && element.elementType !== "package") {
        // Verificar si hay algún paquete en el diagrama
        const hasPackages = diagram.elements.some(
          (e) => e.elementType === "package"
        );
        if (hasPackages) {
          warnings.push(
            `Elemento '${element.className}' no tiene paquete padre asignado`
          );
        }
      }
    });

    // Validar que paquetes no se contengan a sí mismos
    diagram.elements.forEach((element) => {
      if (
        element.elementType === "package" &&
        element.containedElements?.includes(element.id)
      ) {
        errors.push(
          `Paquete '${element.className}' no puede contenerse a sí mismo`
        );
      }
    });
  }

  private static detectCircularDependencies(diagram: Diagram): boolean {
    // Implementación simplificada de detección de ciclos
    // En producción, usar algoritmo de Kahn o DFS
    const inheritanceRelationships =
      diagram.relationships?.filter(
        (rel) => rel.relationship === "generalization"
      ) || [];

    // Crear grafo de herencia
    const graph: { [key: string]: string[] } = {};
    inheritanceRelationships.forEach((rel) => {
      if (!graph[rel.source]) graph[rel.source] = [];
      graph[rel.source].push(rel.target);
    });

    // Detección simple de ciclos (no completa pero funcional)
    for (const node in graph) {
      if (this.hasCycle(node, graph, new Set())) {
        return true;
      }
    }

    return false;
  }

  private static hasCycle(
    node: string,
    graph: { [key: string]: string[] },
    visited: Set<string>
  ): boolean {
    if (visited.has(node)) {
      return true; // Ciclo detectado
    }

    visited.add(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (this.hasCycle(neighbor, graph, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  private static isValidAttributeSyntax(attribute: string): boolean {
    // Sintaxis básica simplificada: nombre:Tipo
    const trimmed = attribute.trim();
    return trimmed.includes(":") && trimmed.split(":").length === 2;
  }

  private static isValidMethodSyntax(method: string): boolean {
    // Sintaxis básica simplificada: nombre()
    const trimmed = method.trim();
    return (
      trimmed.includes("(") &&
      trimmed.includes(")") &&
      trimmed.indexOf("(") < trimmed.indexOf(")")
    );
  }

  private static extractAttributeName(attribute: string): string {
    // Extraer nombre del atributo antes de ':'
    let name = attribute.trim().split(":")[0].trim();
    // Remover visibilidad
    name = name.replace(/^[+\-#~]\s*/, "");
    // Remover modificadores
    name = name.replace(/^(static|final|abstract)\s+/, "");
    return name;
  }

  private static setNestedProperty(
    obj: Record<string, unknown>,
    path: string,
    value: unknown
  ) {
    const keys = path.split("/");
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }
}
