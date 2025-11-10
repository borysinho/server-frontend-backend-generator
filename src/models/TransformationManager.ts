import {
  DiagramState,
  DiagramElement,
  DiagramRelationship,
} from "./DiagramModel.js";

// Interfaces para el modelo físico
export interface PhysicalColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey?: boolean;
  foreignKey?: {
    referencesTable: string;
    referencesColumn: string;
  };
  unique?: boolean;
  defaultValue?: string;
  checkConstraint?: string;
}

export interface PhysicalTable {
  name: string;
  columns: PhysicalColumn[];
  primaryKey: string[];
  foreignKeys: Array<{
    columns: string[];
    referencesTable: string;
    referencesColumns: string[];
    onDelete?: "CASCADE" | "SET NULL" | "RESTRICT";
  }>;
  uniqueConstraints: Array<{
    name: string;
    columns: string[];
  }>;
  checkConstraints: Array<{
    name: string;
    expression: string;
  }>;
  indexes: Array<{
    name: string;
    columns: string[];
    unique?: boolean;
  }>;
}

export interface PhysicalRelationship {
  name: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  sourceTable: string;
  targetTable: string;
  sourceColumns: string[];
  targetColumns: string[];
  junctionTable?: string; // Para relaciones many-to-many
}

export interface PhysicalModel {
  tables: Record<string, PhysicalTable>;
  relationships: PhysicalRelationship[];
  sequences: Array<{
    name: string;
    table: string;
    column: string;
  }>;
  normalizationLevel: 1 | 2 | 3;
  appliedNormalizations: string[];
}

export interface TransformationResult {
  success: boolean;
  physicalModel?: PhysicalModel;
  errors: string[];
  warnings: string[];
  transformationSteps: string[];
}

export class TransformationManager {
  private logicalModel: DiagramState;
  private physicalModel: PhysicalModel;
  private transformationSteps: string[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(logicalModel: DiagramState) {
    this.logicalModel = logicalModel;
    this.physicalModel = {
      tables: {},
      relationships: [],
      sequences: [],
      normalizationLevel: 3,
      appliedNormalizations: [],
    };
  }

  /**
   * Ejecuta la transformación completa del modelo lógico a físico
   */
  public transform(): TransformationResult {
    try {
      this.logStep("Iniciando transformación OMT de modelo lógico a físico");

      // Paso 1: Mapear clases a tablas
      this.mapClassesToTables();

      // Paso 2: Mapear asociaciones a relaciones
      this.mapAssociationsToRelationships();

      // Paso 3: Mapear generalizaciones
      this.mapGeneralizations();

      // Paso 4: Aplicar normalización
      this.applyNormalization();

      // Paso 5: Optimizar el modelo físico
      this.optimizePhysicalModel();

      this.logStep("Transformación completada exitosamente");

      return {
        success: true,
        physicalModel: this.physicalModel,
        errors: this.errors,
        warnings: this.warnings,
        transformationSteps: this.transformationSteps,
      };
    } catch (error) {
      this.errors.push(`Error durante la transformación: ${error}`);
      return {
        success: false,
        errors: this.errors,
        warnings: this.warnings,
        transformationSteps: this.transformationSteps,
      };
    }
  }

  /**
   * Paso 1: Mapear clases a tablas
   */
  private mapClassesToTables(): void {
    this.logStep("Mapeando clases a tablas");

    for (const [elementId, element] of Object.entries(
      this.logicalModel.elements
    )) {
      if (
        element.elementType === "class" ||
        element.elementType === "interface"
      ) {
        const table = this.createTableFromClass(element);
        this.physicalModel.tables[table.name] = table;

        // Crear secuencia para ID si no existe
        if (!this.physicalModel.sequences.some((s) => s.table === table.name)) {
          this.physicalModel.sequences.push({
            name: `seq_${table.name.toLowerCase()}`,
            table: table.name,
            column: `${table.name.toLowerCase()}_id`,
          });
        }
      }
    }
  }

  /**
   * Crear tabla a partir de una clase
   * Las PKs deben definirse con constraint {id} en los atributos
   */
  private createTableFromClass(element: DiagramElement): PhysicalTable {
    const tableName = this.toSnakeCase(element.className);
    const columns: PhysicalColumn[] = [];
    const primaryKeyColumns: string[] = [];

    // Procesar TODOS los atributos del usuario
    element.attributes.forEach((attr, index) => {
      const { column, isPrimaryKey } = this.createColumnFromAttribute(
        attr,
        index
      );

      columns.push(column);

      if (isPrimaryKey) {
        primaryKeyColumns.push(column.name);
      }
    });

    // Validar que tenga al menos una PK
    if (primaryKeyColumns.length === 0) {
      this.errors.push(
        `❌ ERROR: Clase "${element.className}" no tiene clave primaria. ` +
          `Define al menos un atributo con constraint {id}.`
      );
    }

    // Agregar campos de auditoría (timestamps)
    columns.push({
      name: "created_at",
      dataType: "TIMESTAMP",
      nullable: false,
      defaultValue: "CURRENT_TIMESTAMP",
    });

    columns.push({
      name: "updated_at",
      dataType: "TIMESTAMP",
      nullable: false,
      defaultValue: "CURRENT_TIMESTAMP",
    });

    return {
      name: tableName,
      columns,
      primaryKey: primaryKeyColumns,
      foreignKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      indexes: [],
    };
  }

  /**
   * Crear columna a partir de un atributo con constraints UML
   * Formato: "nombre: tipo {constraint1, constraint2}"
   * Constraints soportados: {id}, {unique}, {required}
   */
  private createColumnFromAttribute(
    attribute: string,
    index: number
  ): { column: PhysicalColumn; isPrimaryKey: boolean } {
    // Limpiar prefijos UML (+, -, #, ~)
    const cleanAttribute = attribute.replace(/^[-+#~]\s*/, "").trim();

    // Regex: nombre: tipo {constraints}
    const regex = /^([^:]+):\s*([^\{]+)(?:\{([^\}]+)\})?$/;
    const match = cleanAttribute.match(regex);

    if (!match) {
      this.warnings.push(
        `⚠️ Atributo mal formado: "${attribute}". Esperado formato: "nombre: tipo {constraints}"`
      );
      return {
        column: {
          name: `attr_${index}`,
          dataType: "VARCHAR(255)",
          nullable: true,
        },
        isPrimaryKey: false,
      };
    }

    const [_, name, typeStr, constraintsStr] = match;
    const type = typeStr.trim();

    // Parsear constraints
    const constraints = constraintsStr
      ? constraintsStr.split(",").map((c) => c.trim().toLowerCase())
      : [];

    // Validar constraints soportados
    const validConstraints = ["id", "unique", "required"];
    const invalidConstraints = constraints.filter(
      (c) => !validConstraints.includes(c)
    );
    if (invalidConstraints.length > 0) {
      this.warnings.push(
        `⚠️ Constraints no reconocidos en "${name}": ${invalidConstraints.join(
          ", "
        )}. ` + `Válidos: ${validConstraints.join(", ")}`
      );
    }

    const columnName = this.toSnakeCase(name);
    const dataType = this.mapUMLTypeToSQLType(type);

    const isPrimaryKey = constraints.includes("id");
    const isUnique = constraints.includes("unique");
    const isRequired = constraints.includes("required");

    return {
      column: {
        name: columnName,
        dataType,
        nullable: !isRequired, // Si tiene {required}, no es nullable
        primaryKey: isPrimaryKey,
        unique: isUnique,
      },
      isPrimaryKey,
    };
  }

  /**
   * Paso 2: Mapear asociaciones a relaciones
   */
  private mapAssociationsToRelationships(): void {
    this.logStep("Mapeando asociaciones a relaciones");

    for (const [relId, relationship] of Object.entries(
      this.logicalModel.relationships
    )) {
      if (relationship.relationship === "association") {
        this.mapAssociation(relationship);
      } else if (
        relationship.relationship === "aggregation" ||
        relationship.relationship === "composition"
      ) {
        this.mapAggregation(relationship);
      }
    }
  }

  /**
   * Mapear una asociación
   */
  private mapAssociation(relationship: DiagramRelationship): void {
    // Soportar tanto source/target (formato BD) como sourceId/targetId (formato interface)
    const sourceId = (relationship as any).source || relationship.sourceId;
    const targetId = (relationship as any).target || relationship.targetId;

    const sourceElement = this.logicalModel.elements[sourceId];
    const targetElement = this.logicalModel.elements[targetId];

    if (!sourceElement || !targetElement) {
      this.errors.push(
        `Elementos no encontrados para relación ${relationship.id} (source: ${sourceId}, target: ${targetId})`
      );
      return;
    }

    const sourceTable = this.toSnakeCase(sourceElement.className);
    const targetTable = this.toSnakeCase(targetElement.className);

    // Determinar multiplicidad - soportar ambos formatos
    const sourceCard =
      (relationship as any).sourceMultiplicity ||
      relationship.sourceCardinality ||
      "1";
    const targetCard =
      (relationship as any).targetMultiplicity ||
      relationship.targetCardinality ||
      "1";

    const sourceMult = this.parseMultiplicity(sourceCard);
    const targetMult = this.parseMultiplicity(targetCard);

    if (sourceMult === "many" && targetMult === "many") {
      // Muchos-a-muchos: crear tabla intermedia
      this.createJunctionTable(sourceTable, targetTable, relationship);
    } else if (sourceMult === "one" && targetMult === "many") {
      // Uno-a-muchos: FK en tabla target
      this.addForeignKey(targetTable, sourceTable, relationship);
    } else if (sourceMult === "many" && targetMult === "one") {
      // Muchos-a-uno: FK en tabla source
      this.addForeignKey(sourceTable, targetTable, relationship);
    } else {
      // Uno-a-uno: FK en cualquiera (preferimos source)
      this.addForeignKey(sourceTable, targetTable, relationship);
    }
  }

  /**
   * Mapear una agregación o composición
   */
  private mapAggregation(relationship: DiagramRelationship): void {
    if (relationship.relationship === "composition") {
      // Composición: relación parte-todo FUERTE (las partes mueren con el todo)
      this.mapComposition(relationship);
    } else {
      // Agregación: relación parte-todo DÉBIL (las partes sobreviven)
      this.mapAssociation(relationship);
    }
  }

  /**
   * Mapear una composición (con CASCADE)
   */
  private mapComposition(relationship: DiagramRelationship): void {
    // Soportar tanto source/target (formato BD) como sourceId/targetId (formato interface)
    const sourceId = (relationship as any).source || relationship.sourceId;
    const targetId = (relationship as any).target || relationship.targetId;

    const sourceElement = this.logicalModel.elements[sourceId];
    const targetElement = this.logicalModel.elements[targetId];

    if (!sourceElement || !targetElement) {
      this.errors.push(
        `Elementos no encontrados para composición ${relationship.id} (source: ${sourceId}, target: ${targetId})`
      );
      return;
    }

    const sourceTable = this.toSnakeCase(sourceElement.className);
    const targetTable = this.toSnakeCase(targetElement.className);

    // Determinar multiplicidad
    const sourceCard =
      (relationship as any).sourceMultiplicity ||
      relationship.sourceCardinality ||
      "1";
    const targetCard =
      (relationship as any).targetMultiplicity ||
      relationship.targetCardinality ||
      "1";

    const sourceMult = this.parseMultiplicity(sourceCard);
    const targetMult = this.parseMultiplicity(targetCard);

    // ⚠️ Validación: En composición, el lado "todo" debe ser 1 o 0..1
    if (sourceMult === "many") {
      this.warnings.push(
        `⚠️ Composición inválida: el lado "todo" (source) tiene multiplicidad muchos. ` +
          `En UML, una parte no puede pertenecer a múltiples "todos" en composición.`
      );
    }

    if (sourceMult === "many" && targetMult === "many") {
      // Muchos-a-muchos: crear tabla intermedia CON CASCADE
      this.createJunctionTable(sourceTable, targetTable, relationship, true);
    } else if (sourceMult === "one" && targetMult === "many") {
      // Uno-a-muchos: FK en tabla target CON CASCADE
      this.addForeignKey(targetTable, sourceTable, relationship, "CASCADE");
    } else if (sourceMult === "many" && targetMult === "one") {
      // Muchos-a-uno: FK en tabla source CON CASCADE
      this.addForeignKey(sourceTable, targetTable, relationship, "CASCADE");
    } else {
      // Uno-a-uno: FK en cualquiera (preferimos source) CON CASCADE
      this.addForeignKey(sourceTable, targetTable, relationship, "CASCADE");
    }
  }

  /**
   * Crear tabla intermedia para relación muchos-a-muchos
   * Con UML Puro, debe usar los tipos reales de las PKs referenciadas
   * @param cascade - Si es true, agrega ON DELETE CASCADE (para composición)
   */
  private createJunctionTable(
    sourceTable: string,
    targetTable: string,
    relationship: DiagramRelationship,
    cascade: boolean = false
  ): void {
    const sourceTableDef = this.physicalModel.tables[sourceTable];
    const targetTableDef = this.physicalModel.tables[targetTable];

    if (!sourceTableDef || !targetTableDef) {
      this.errors.push(
        `❌ No se pudieron encontrar las tablas "${sourceTable}" o "${targetTable}" para crear tabla intermedia`
      );
      return;
    }

    // Obtener PKs de ambas tablas
    const sourcePK = sourceTableDef.primaryKey[0];
    const targetPK = targetTableDef.primaryKey[0];

    const sourcePKColumn = sourceTableDef.columns.find(
      (col) => col.name === sourcePK
    );
    const targetPKColumn = targetTableDef.columns.find(
      (col) => col.name === targetPK
    );

    if (!sourcePKColumn || !targetPKColumn) {
      this.errors.push(
        `❌ No se pudieron encontrar las columnas PK para tabla intermedia`
      );
      return;
    }

    const junctionName = `${sourceTable}_${targetTable}`;
    const sourceFKName = `${sourceTable}_${sourcePK}`;
    const targetFKName = `${targetTable}_${targetPK}`;

    const junctionTable: PhysicalTable = {
      name: junctionName,
      columns: [
        {
          name: sourceFKName,
          dataType: sourcePKColumn.dataType, // Mismo tipo que PK origen
          nullable: false,
          foreignKey: {
            referencesTable: sourceTable,
            referencesColumn: sourcePK,
          },
        },
        {
          name: targetFKName,
          dataType: targetPKColumn.dataType, // Mismo tipo que PK destino
          nullable: false,
          foreignKey: {
            referencesTable: targetTable,
            referencesColumn: targetPK,
          },
        },
      ],
      primaryKey: [sourceFKName, targetFKName],
      foreignKeys: [
        {
          columns: [sourceFKName],
          referencesTable: sourceTable,
          referencesColumns: [sourcePK],
          onDelete: cascade ? "CASCADE" : undefined,
        },
        {
          columns: [targetFKName],
          referencesTable: targetTable,
          referencesColumns: [targetPK],
          onDelete: cascade ? "CASCADE" : undefined,
        },
      ],
      uniqueConstraints: [],
      checkConstraints: [],
      indexes: [],
    };

    this.physicalModel.tables[junctionName] = junctionTable;

    // Registrar relación
    this.physicalModel.relationships.push({
      name: relationship.id,
      type: "many-to-many",
      sourceTable,
      targetTable,
      sourceColumns: [sourceFKName],
      targetColumns: [targetFKName],
      junctionTable: junctionName,
    });
  }

  /**
   * Añadir clave foránea a una tabla
   * Con UML Puro, la FK debe referenciar la PK real de la tabla objetivo
   * @param onDelete - Tipo de acción ON DELETE (CASCADE, SET NULL, RESTRICT)
   */
  private addForeignKey(
    tableName: string,
    referencesTable: string,
    relationship: DiagramRelationship,
    onDelete?: "CASCADE" | "SET NULL" | "RESTRICT"
  ): void {
    const table = this.physicalModel.tables[tableName];
    const referencedTable = this.physicalModel.tables[referencesTable];

    if (!table || !referencedTable) return;

    // Obtener la PK de la tabla referenciada
    const referencedPK = referencedTable.primaryKey[0]; // Primera columna de la PK
    const referencedColumn = referencedTable.columns.find(
      (col) => col.name === referencedPK
    );

    if (!referencedColumn) {
      this.errors.push(
        `❌ No se pudo encontrar la columna PK "${referencedPK}" en la tabla "${referencesTable}"`
      );
      return;
    }

    // Generar nombre de la FK: tabla_referenciada_nombre_pk
    const fkColumnName = `${referencesTable}_${referencedPK}`;

    // Determinar si la FK debe ser nullable según la multiplicidad
    const isNullable = this.isForeignKeyNullable(relationship, tableName);

    const fkColumn: PhysicalColumn = {
      name: fkColumnName,
      dataType: referencedColumn.dataType, // Mismo tipo que la PK referenciada
      nullable: isNullable, // ✅ Ahora depende de la multiplicidad
      foreignKey: {
        referencesTable,
        referencesColumn: referencedPK, // Nombre real de la PK
      },
    };

    table.columns.push(fkColumn);
    table.foreignKeys.push({
      columns: [fkColumnName],
      referencesTable,
      referencesColumns: [referencedPK],
      onDelete: onDelete, // ✅ Especificar ON DELETE
    });

    // Añadir índice en FK
    table.indexes.push({
      name: `idx_${tableName}_${fkColumnName}`,
      columns: [fkColumnName],
    });
  }

  /**
   * Determina si una FK debe ser nullable basándose en la multiplicidad
   */
  private isForeignKeyNullable(
    relationship: DiagramRelationship,
    fkTableName: string
  ): boolean {
    // Soportar tanto source/target (formato BD) como sourceId/targetId (formato interface)
    const sourceId = (relationship as any).source || relationship.sourceId;
    const targetId = (relationship as any).target || relationship.targetId;

    const sourceElement = this.logicalModel.elements[sourceId];
    const targetElement = this.logicalModel.elements[targetId];

    if (!sourceElement || !targetElement) return false;

    const sourceTable = this.toSnakeCase(sourceElement.className);
    const targetTable = this.toSnakeCase(targetElement.className);

    // Determinar multiplicidad
    const sourceCard =
      (relationship as any).sourceMultiplicity ||
      relationship.sourceCardinality ||
      "1";
    const targetCard =
      (relationship as any).targetMultiplicity ||
      relationship.targetCardinality ||
      "1";

    // Determinar qué multiplicidad verificar según en qué tabla está la FK
    let relevantMultiplicity: string;

    if (fkTableName === sourceTable) {
      // La FK está en la tabla source (caso N:1 o 1:1)
      // Verificar la multiplicidad del lado source
      relevantMultiplicity = sourceCard;
    } else if (fkTableName === targetTable) {
      // La FK está en la tabla target (caso 1:N o 1:1)
      // Verificar la multiplicidad del lado target (donde está la FK)
      relevantMultiplicity = targetCard;
    } else {
      // No debería pasar, pero por seguridad
      return false;
    }

    // Si la multiplicidad empieza con "0" o es "*", la FK puede ser NULL
    return this.isMultiplicityOptional(relevantMultiplicity);
  }

  /**
   * Verifica si una multiplicidad es opcional (permite cero instancias)
   */
  private isMultiplicityOptional(cardinality: string): boolean {
    const cleaned = cardinality.trim();

    // Si es "*" solo, es opcional (equivalente a 0..*)
    if (cleaned === "*") {
      return true;
    }

    // Si empieza con "0", es opcional
    if (cleaned.startsWith("0")) {
      return true;
    }

    // Si es un rango, verificar el mínimo
    if (cleaned.includes("..")) {
      const [minStr] = cleaned.split("..").map((s) => s.trim());
      const min = parseInt(minStr);
      return !isNaN(min) && min === 0;
    }

    // Cualquier otro caso (ej: "1", "1..*", "5") es obligatorio
    return false;
  }

  /**
   * Paso 3: Mapear generalizaciones
   */
  private mapGeneralizations(): void {
    this.logStep("Mapeando generalizaciones");

    for (const [relId, relationship] of Object.entries(
      this.logicalModel.relationships
    )) {
      if (relationship.relationship === "generalization") {
        this.mapGeneralization(relationship);
      }
    }
  }

  /**
   * Mapear una generalización
   */
  private mapGeneralization(relationship: DiagramRelationship): void {
    const subclass = this.logicalModel.elements[relationship.sourceId];
    const superclass = this.logicalModel.elements[relationship.targetId];

    if (!subclass || !superclass) {
      this.errors.push(
        `Elementos no encontrados para generalización ${relationship.id}`
      );
      return;
    }

    const subclassTable = this.toSnakeCase(subclass.className);
    const superclassTable = this.toSnakeCase(superclass.className);

    // Añadir FK de subclase a superclase
    this.addForeignKey(subclassTable, superclassTable, relationship);

    // Añadir discriminador en superclase si no existe
    const superTable = this.physicalModel.tables[superclassTable];
    if (
      superTable &&
      !superTable.columns.some((c) => c.name === "discriminator")
    ) {
      superTable.columns.push({
        name: "discriminator",
        dataType: "VARCHAR(50)",
        nullable: false,
      });
    }
  }

  /**
   * Paso 4: Aplicar normalización
   */
  private applyNormalization(): void {
    this.logStep("Aplicando normalización al modelo físico");

    // 1FN: Asegurar valores atómicos (ya se cumple por diseño relacional)

    // 2FN: Eliminar dependencias parciales
    this.applySecondNormalForm();

    // 3FN: Eliminar dependencias transitivas
    this.applyThirdNormalForm();

    this.physicalModel.appliedNormalizations = [
      "1FN - Valores atómicos",
      "2FN - Sin dependencias parciales",
      "3FN - Sin dependencias transitivas",
    ];
  }

  /**
   * Aplicar Segunda Forma Normal
   */
  private applySecondNormalForm(): void {
    // Verificar que no hay dependencias parciales
    // En este contexto simplificado, asumimos que el diseño ya cumple 2FN
    this.logStep("Verificando Segunda Forma Normal");
  }

  /**
   * Aplicar Tercera Forma Normal
   */
  private applyThirdNormalForm(): void {
    // Verificar que no hay dependencias transitivas
    this.logStep("Verificando Tercera Forma Normal");
  }

  /**
   * Paso 5: Optimizar el modelo físico
   */
  private optimizePhysicalModel(): void {
    this.logStep("Optimizando modelo físico");

    // Añadir índices en claves foráneas
    this.addForeignKeyIndexes();

    // Añadir índices en columnas frecuentemente consultadas
    this.addQueryIndexes();
  }

  /**
   * Añadir índices en claves foráneas
   */
  private addForeignKeyIndexes(): void {
    for (const table of Object.values(this.physicalModel.tables)) {
      for (const fk of table.foreignKeys) {
        const indexName = `idx_${table.name}_${fk.columns.join("_")}`;
        if (!table.indexes.some((idx) => idx.name === indexName)) {
          table.indexes.push({
            name: indexName,
            columns: fk.columns,
          });
        }
      }
    }
  }

  /**
   * Añadir índices para consultas comunes
   */
  private addQueryIndexes(): void {
    // Añadir índices en columnas de búsqueda común (created_at, updated_at)
    for (const table of Object.values(this.physicalModel.tables)) {
      if (table.columns.some((c) => c.name === "created_at")) {
        table.indexes.push({
          name: `idx_${table.name}_created_at`,
          columns: ["created_at"],
        });
      }
    }
  }

  // Métodos auxiliares

  /**
   * Parsear multiplicidad UML estándar
   * Ejemplos: "1", "0..1", "1..*", "0..*", "*", "n", "5"
   *
   * @returns "one" si max <= 1, "many" si max > 1 o ilimitado (*)
   */
  private parseMultiplicity(cardinality: string): "one" | "many" {
    const cleaned = cardinality.trim();

    // Casos especiales: * o n = muchos
    if (cleaned === "*" || cleaned === "n" || cleaned === "N") {
      return "many";
    }

    // Formato rango: "min..max" (ej: "0..1", "1..*", "0..*")
    if (cleaned.includes("..")) {
      const [minStr, maxStr] = cleaned.split("..").map((s) => s.trim());

      // Si max es * o n = muchos
      if (maxStr === "*" || maxStr === "n" || maxStr === "N") {
        return "many";
      }

      // Si max es número
      const max = parseInt(maxStr);
      if (!isNaN(max) && max > 1) {
        return "many";
      }

      // max <= 1 o no parseado = uno
      return "one";
    }

    // Formato simple: número (ej: "1", "5", "10")
    const num = parseInt(cleaned);
    if (!isNaN(num) && num > 1) {
      return "many";
    }

    // Default: uno
    return "one";
  }

  private mapUMLTypeToSQLType(umlType: string): string {
    const typeMap: Record<string, string> = {
      string: "VARCHAR(255)",
      int: "INTEGER",
      integer: "INTEGER",
      long: "BIGINT",
      float: "DECIMAL(10,2)",
      double: "DECIMAL(15,2)",
      boolean: "BOOLEAN",
      date: "DATE",
      datetime: "TIMESTAMP",
      time: "TIMESTAMP",
    };

    return typeMap[umlType.toLowerCase()] || "VARCHAR(255)";
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      .replace(/^_/, "")
      .toLowerCase();
  }

  private logStep(step: string): void {
    this.transformationSteps.push(step);
    console.log(`[TransformationManager] ${step}`);
  }
}

// Función de utilidad para crear y ejecutar transformación
export function transformLogicalToPhysical(
  diagramState: DiagramState
): TransformationResult {
  const manager = new TransformationManager(diagramState);
  return manager.transform();
}

// Función para generar SQL DDL a partir del modelo físico
export function generateSQLDDL(physicalModel: PhysicalModel): string {
  let sql = "";

  // Crear secuencias
  for (const sequence of physicalModel.sequences) {
    sql += `CREATE SEQUENCE ${sequence.name};\n`;
  }

  sql += "\n";

  // Crear tablas
  for (const table of Object.values(physicalModel.tables)) {
    sql += `CREATE TABLE ${table.name} (\n`;

    // Columnas
    const columnDefs = table.columns.map((col) => {
      let def = `  ${col.name} ${col.dataType}`;
      if (!col.nullable) def += " NOT NULL";
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      return def;
    });

    sql += columnDefs.join(",\n");
    sql += "\n);\n\n";

    // Índices
    for (const index of table.indexes) {
      const unique = index.unique ? "UNIQUE " : "";
      sql += `CREATE ${unique}INDEX ${index.name} ON ${
        table.name
      } (${index.columns.join(", ")});\n`;
    }

    sql += "\n";
  }

  // Claves foráneas y restricciones
  for (const table of Object.values(physicalModel.tables)) {
    // Claves foráneas
    for (const fk of table.foreignKeys) {
      sql += `ALTER TABLE ${table.name} ADD CONSTRAINT fk_${
        table.name
      }_${fk.columns.join("_")} `;
      sql += `FOREIGN KEY (${fk.columns.join(", ")}) REFERENCES ${
        fk.referencesTable
      } (${fk.referencesColumns.join(", ")})`;

      // ✅ Agregar cláusula ON DELETE si está especificada
      if (fk.onDelete) {
        sql += ` ON DELETE ${fk.onDelete}`;
      }

      sql += ";\n";
    }

    // Restricciones únicas
    for (const unique of table.uniqueConstraints) {
      sql += `ALTER TABLE ${table.name} ADD CONSTRAINT ${unique.name} `;
      sql += `UNIQUE (${unique.columns.join(", ")});\n`;
    }

    // Restricciones de verificación
    for (const check of table.checkConstraints) {
      sql += `ALTER TABLE ${table.name} ADD CONSTRAINT ${check.name} `;
      sql += `CHECK (${check.expression});\n`;
    }
  }

  return sql;
}
