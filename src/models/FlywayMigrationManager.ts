import {
  PhysicalModel,
  PhysicalTable,
  PhysicalColumn,
} from "./TransformationManager.js";

/**
 * Representa una migración de Flyway con su versión y contenido
 */
export interface FlywayMigration {
  version: number;
  fileName: string;
  description: string;
  sql: string;
  timestamp: string;
}

/**
 * Representa los cambios detectados entre dos modelos físicos
 */
export interface SchemaChanges {
  newTables: string[];
  deletedTables: string[];
  modifiedTables: {
    tableName: string;
    newColumns: string[];
    deletedColumns: string[];
    modifiedColumns: string[];
  }[];
  hasChanges: boolean;
}

/**
 * Gestor de migraciones incrementales de Flyway
 *
 * Esta clase es responsable de:
 * - Detectar cambios entre versiones de esquemas
 * - Generar migraciones incrementales (V2, V3, etc.)
 * - Determinar el próximo número de versión
 * - Crear scripts SQL para cambios específicos
 */
export class FlywayMigrationManager {
  private dbType: string;

  constructor(dbType: string = "postgresql") {
    this.dbType = dbType;
  }

  /**
   * Genera una migración inicial (V1__initial_schema.sql)
   */
  public generateInitialMigration(
    physicalModel: PhysicalModel,
    entities: any[]
  ): FlywayMigration {
    const sql = this.generateInitialSchemaSql(entities);

    return {
      version: 1,
      fileName: "V1__initial_schema.sql",
      description: "Initial schema creation",
      sql,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Genera una migración incremental detectando cambios
   */
  public generateIncrementalMigration(
    previousModel: PhysicalModel,
    currentModel: PhysicalModel,
    entities: any[],
    nextVersion: number
  ): FlywayMigration | null {
    const changes = this.detectSchemaChanges(previousModel, currentModel);

    if (!changes.hasChanges) {
      console.log("No se detectaron cambios en el esquema");
      return null;
    }

    const sql = this.generateIncrementalSql(changes, currentModel, entities);
    const description = this.generateMigrationDescription(changes);

    return {
      version: nextVersion,
      fileName: `V${nextVersion}__${this.sanitizeDescription(description)}.sql`,
      description,
      sql,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detecta cambios entre dos modelos físicos
   */
  private detectSchemaChanges(
    previousModel: PhysicalModel,
    currentModel: PhysicalModel
  ): SchemaChanges {
    const changes: SchemaChanges = {
      newTables: [],
      deletedTables: [],
      modifiedTables: [],
      hasChanges: false,
    };

    // Detectar nuevas tablas
    for (const tableName of Object.keys(currentModel.tables)) {
      if (!previousModel.tables[tableName]) {
        changes.newTables.push(tableName);
        changes.hasChanges = true;
      }
    }

    // Detectar tablas eliminadas
    for (const tableName of Object.keys(previousModel.tables)) {
      if (!currentModel.tables[tableName]) {
        changes.deletedTables.push(tableName);
        changes.hasChanges = true;
      }
    }

    // Detectar tablas modificadas
    for (const tableName of Object.keys(currentModel.tables)) {
      if (previousModel.tables[tableName]) {
        const tableChanges = this.detectTableChanges(
          previousModel.tables[tableName],
          currentModel.tables[tableName]
        );

        if (
          tableChanges.newColumns.length > 0 ||
          tableChanges.deletedColumns.length > 0 ||
          tableChanges.modifiedColumns.length > 0
        ) {
          changes.modifiedTables.push({
            tableName,
            ...tableChanges,
          });
          changes.hasChanges = true;
        }
      }
    }

    return changes;
  }

  /**
   * Detecta cambios en una tabla específica
   */
  private detectTableChanges(
    previousTable: PhysicalTable,
    currentTable: PhysicalTable
  ): {
    newColumns: string[];
    deletedColumns: string[];
    modifiedColumns: string[];
  } {
    const changes = {
      newColumns: [] as string[],
      deletedColumns: [] as string[],
      modifiedColumns: [] as string[],
    };

    // Detectar nuevas columnas
    for (const currCol of currentTable.columns) {
      const prevCol = previousTable.columns.find(
        (c) => c.name === currCol.name
      );
      if (!prevCol) {
        changes.newColumns.push(currCol.name);
      }
    }

    // Detectar columnas eliminadas
    for (const prevCol of previousTable.columns) {
      const currCol = currentTable.columns.find((c) => c.name === prevCol.name);
      if (!currCol) {
        changes.deletedColumns.push(prevCol.name);
      }
    }

    // Detectar columnas modificadas
    for (const currCol of currentTable.columns) {
      const prevCol = previousTable.columns.find(
        (c) => c.name === currCol.name
      );

      if (prevCol) {
        if (
          prevCol.dataType !== currCol.dataType ||
          prevCol.nullable !== currCol.nullable ||
          prevCol.primaryKey !== currCol.primaryKey
        ) {
          changes.modifiedColumns.push(currCol.name);
        }
      }
    }

    return changes;
  }

  /**
   * Genera SQL para migración incremental
   */
  private generateIncrementalSql(
    changes: SchemaChanges,
    currentModel: PhysicalModel,
    entities: any[]
  ): string {
    let sql = `-- Incremental Migration\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n`;
    sql += `-- Database Type: ${this.dbType}\n\n`;

    // Agregar nuevas tablas
    if (changes.newTables.length > 0) {
      sql += "-- ============================================\n";
      sql += "-- Add New Tables\n";
      sql += "-- ============================================\n\n";

      for (const tableName of changes.newTables) {
        const table = currentModel.tables[tableName];
        const entity = entities.find(
          (e) => this.toSnakeCase(e.className) === tableName
        );

        if (entity) {
          sql += this.generateCreateTableSql(entity, table);
        }
      }
    }

    // Modificar tablas existentes
    if (changes.modifiedTables.length > 0) {
      sql += "-- ============================================\n";
      sql += "-- Modify Existing Tables\n";
      sql += "-- ============================================\n\n";

      for (const tableChange of changes.modifiedTables) {
        const table = currentModel.tables[tableChange.tableName];
        const entity = entities.find(
          (e) => this.toSnakeCase(e.className) === tableChange.tableName
        );

        if (entity) {
          sql += this.generateAlterTableSql(tableChange, table, entity);
        }
      }
    }

    // Eliminar tablas
    if (changes.deletedTables.length > 0) {
      sql += "-- ============================================\n";
      sql += "-- Drop Tables\n";
      sql += "-- ============================================\n\n";

      for (const tableName of changes.deletedTables) {
        sql += `-- Dropping table: ${tableName}\n`;
        sql += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n\n`;
      }
    }

    sql += "-- Migration completed successfully\n";
    return sql;
  }

  /**
   * Genera SQL para crear una tabla completa
   */
  private generateCreateTableSql(entity: any, table: PhysicalTable): string {
    console.log(
      `[FlywayMigrationManager] Generando SQL para tabla: ${table.name}, entidad: ${entity.className}`
    );

    let sql = `-- Table: ${table.name}\n`;
    sql += `CREATE TABLE IF NOT EXISTS ${table.name} (\n`;

    const columnDefinitions: string[] = [];
    const primaryKeys: string[] = [];

    for (const field of entity.fields) {
      // Para tablas de relación many-to-many, las PKs compuestas son FKs
      // Procesamos TODAS las columnas que NO son exclusivamente FKs (sin PK)
      const isCompositePKAndFK = field.primaryKey && field.foreignKey;
      if (field.foreignKey && !isCompositePKAndFK) continue; // Skip FKs que no son parte de PK compuesta

      let columnDef = `    ${field.columnName}`;

      // Determinar si es PK simple (no FK)
      // Las PKs simples SIEMPRE deben ser BIGSERIAL/BIGINT auto-incrementables
      const isSimplePK = field.primaryKey && !field.foreignKey;

      // DEBUG: Log para ver qué está pasando
      if (field.primaryKey) {
        console.log(
          `[FlywayMigrationManager] PK ${entity.className}.${field.columnName}: type="${field.type}", isSimplePK=${isSimplePK}, isCompositePKAndFK=${isCompositePKAndFK}`
        );
      }

      // Para PKs simples (no FK), SIEMPRE usar BIGSERIAL/AUTO_INCREMENT
      if (isSimplePK) {
        if (this.dbType === "postgresql") {
          columnDef += " BIGSERIAL";
        } else if (this.dbType === "mysql") {
          columnDef += " BIGINT AUTO_INCREMENT";
        }
        primaryKeys.push(field.columnName);
      } else if (isCompositePKAndFK) {
        // Para PKs compuestas que son FKs (tablas many-to-many), usar BIGINT
        columnDef += " BIGINT";
        if (!field.nullable) {
          columnDef += " NOT NULL";
        }
        primaryKeys.push(field.columnName);
      } else {
        // Para otros campos (FK, campos regulares), usar tipo mapeado
        columnDef += ` ${this.mapJavaTypeToSQLType(field.type)}`;

        if (field.primaryKey) {
          primaryKeys.push(field.columnName);
        }
      }

      // Agregar NOT NULL para campos no nullables (excluyendo PKs compuestas que ya lo tienen)
      if ((!field.nullable || field.primaryKey) && !isCompositePKAndFK) {
        // BIGSERIAL ya incluye NOT NULL implícitamente en PostgreSQL
        if (!isSimplePK || this.dbType !== "postgresql") {
          columnDef += " NOT NULL";
        }
      }

      // Agregar UNIQUE constraint si está definido
      if (field.unique) {
        columnDef += " UNIQUE";
      }

      if (this.isAuditField(field.columnName)) {
        columnDef += " DEFAULT CURRENT_TIMESTAMP";
      }

      columnDefinitions.push(columnDef);
    }

    if (primaryKeys.length > 0) {
      columnDefinitions.push(`    PRIMARY KEY (${primaryKeys.join(", ")})`);
    }

    sql += columnDefinitions.join(",\n");
    sql += "\n);\n\n";

    // Add foreign key columns and constraints
    for (const field of entity.fields) {
      if (field.foreignKey) {
        // Si la FK es parte de una PK compuesta, ya fue creada en el paso anterior
        // Solo necesitamos crear la constraint de FK
        const isCompositePKAndFK = field.primaryKey && field.foreignKey;

        if (!isCompositePKAndFK) {
          // Solo agregar la columna si NO es parte de PK compuesta
          // Las FKs siempre referencian PKs que son BIGINT
          sql += `ALTER TABLE ${table.name} ADD COLUMN IF NOT EXISTS ${
            field.columnName
          } BIGINT${!field.nullable ? " NOT NULL" : ""};\n`;
        }

        const fkName = `fk_${table.name}_${field.columnName}`;
        const refTable = this.toSnakeCase(field.foreignKey.referencedEntity);
        const refColumn = this.toSnakeCase(field.foreignKey.referencedField);

        sql += `ALTER TABLE ${table.name}\n`;
        sql += `    ADD CONSTRAINT ${fkName}\n`;
        sql += `    FOREIGN KEY (${field.columnName})\n`;
        sql += `    REFERENCES ${refTable}(${refColumn})\n`;
        sql += `    ON DELETE CASCADE\n`;
        sql += `    ON UPDATE CASCADE;\n\n`;

        sql += `CREATE INDEX IF NOT EXISTS idx_${table.name}_${field.columnName} ON ${table.name}(${field.columnName});\n\n`;
      }
    }

    return sql;
  }

  /**
   * Genera SQL para modificar una tabla existente
   */
  private generateAlterTableSql(
    tableChange: {
      tableName: string;
      newColumns: string[];
      deletedColumns: string[];
      modifiedColumns: string[];
    },
    table: PhysicalTable,
    entity: any
  ): string {
    let sql = `-- Modify table: ${tableChange.tableName}\n`;

    // Agregar nuevas columnas
    if (tableChange.newColumns.length > 0) {
      sql += `-- Add new columns\n`;
      for (const columnName of tableChange.newColumns) {
        const field = entity.fields.find(
          (f: any) => f.columnName === columnName
        );
        if (field) {
          let columnDef;
          if (field.foreignKey) {
            // Las FKs siempre referencian PKs que son BIGINT
            columnDef = `${field.columnName} BIGINT${
              !field.nullable ? " NOT NULL" : ""
            }`;
          } else {
            columnDef = `${field.columnName} ${this.mapJavaTypeToSQLType(
              field.type
            )}${!field.nullable ? " NOT NULL" : ""}`;
          }
          sql += `ALTER TABLE ${tableChange.tableName} ADD COLUMN IF NOT EXISTS ${columnDef};\n`;
        }
      }
      sql += "\n";

      // Agregar constraints de Foreign Keys para las nuevas columnas
      sql += `-- Add foreign key constraints for new columns\n`;
      for (const columnName of tableChange.newColumns) {
        const field = entity.fields.find(
          (f: any) => f.columnName === columnName
        );
        if (field && field.foreignKey) {
          const fkName = `fk_${tableChange.tableName}_${field.columnName}`;
          const refTable = this.toSnakeCase(field.foreignKey.referencedEntity);
          const refColumn = this.toSnakeCase(field.foreignKey.referencedField);

          sql += `ALTER TABLE ${tableChange.tableName}\n`;
          sql += `    ADD CONSTRAINT ${fkName}\n`;
          sql += `    FOREIGN KEY (${field.columnName})\n`;
          sql += `    REFERENCES ${refTable}(${refColumn})\n`;
          sql += `    ON DELETE CASCADE\n`;
          sql += `    ON UPDATE CASCADE;\n\n`;

          sql += `CREATE INDEX IF NOT EXISTS idx_${tableChange.tableName}_${field.columnName} ON ${tableChange.tableName}(${field.columnName});\n\n`;
        }
      }
    }

    // Eliminar columnas (comentadas por seguridad)
    if (tableChange.deletedColumns.length > 0) {
      sql += `-- Drop columns (USE WITH CAUTION!)\n`;
      for (const columnName of tableChange.deletedColumns) {
        sql += `-- ALTER TABLE ${tableChange.tableName} DROP COLUMN IF EXISTS ${columnName};\n`;
      }
      sql += "\n";
    }

    // Modificar columnas
    if (tableChange.modifiedColumns.length > 0) {
      sql += `-- Modify columns\n`;
      for (const columnName of tableChange.modifiedColumns) {
        const field = entity.fields.find(
          (f: any) => f.columnName === columnName
        );
        if (field) {
          const columnType = this.mapJavaTypeToSQLType(field.type);

          if (this.dbType === "postgresql") {
            sql += `ALTER TABLE ${tableChange.tableName} ALTER COLUMN ${columnName} TYPE ${columnType};\n`;
            sql += `ALTER TABLE ${
              tableChange.tableName
            } ALTER COLUMN ${columnName} ${
              field.nullable ? "DROP" : "SET"
            } NOT NULL;\n`;
          } else if (this.dbType === "mysql") {
            sql += `ALTER TABLE ${
              tableChange.tableName
            } MODIFY COLUMN ${columnName} ${columnType}${
              !field.nullable ? " NOT NULL" : ""
            };\n`;
          }
        }
      }
      sql += "\n";
    }

    return sql;
  }

  /**
   * Genera descripción legible para la migración
   */
  private generateMigrationDescription(changes: SchemaChanges): string {
    const parts: string[] = [];

    if (changes.newTables.length > 0) {
      parts.push(`add_${changes.newTables.length}_tables`);
    }

    if (changes.modifiedTables.length > 0) {
      parts.push(`modify_${changes.modifiedTables.length}_tables`);
    }

    if (changes.deletedTables.length > 0) {
      parts.push(`drop_${changes.deletedTables.length}_tables`);
    }

    return parts.join("_and_") || "schema_changes";
  }

  /**
   * Sanitiza la descripción para nombre de archivo
   */
  private sanitizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Genera SQL inicial completo (para V1)
   */
  private generateInitialSchemaSql(entities: any[]): string {
    const dbType = this.dbType;

    let sql = `-- Flyway Migration V1__initial_schema.sql
-- Auto-generated migration script
-- Database Type: ${dbType}
-- Generated: ${new Date().toISOString()}
-- 
-- This script creates the initial database schema including:
-- - All tables with primary keys and constraints
-- - Foreign key relationships
-- - Indexes for performance optimization
-- - Audit fields (created_at, updated_at) where applicable

`;

    // Paso 1: Crear tablas sin foreign keys
    sql += "-- ============================================\n";
    sql += "-- PASO 1: Crear tablas sin foreign keys\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      sql += `-- Table: ${entity.tableName}\n`;
      sql += `CREATE TABLE IF NOT EXISTS ${entity.tableName} (\n`;

      const columnDefinitions: string[] = [];
      const primaryKeys: string[] = [];

      for (const field of entity.fields) {
        // Para tablas de relación many-to-many, las PKs compuestas son FKs
        // Procesamos TODAS las columnas que NO son exclusivamente FKs (sin PK)
        const isCompositePKAndFK = field.primaryKey && field.foreignKey;
        if (field.foreignKey && !isCompositePKAndFK) continue; // Skip FKs que no son parte de PK compuesta

        let columnDef = `    ${field.columnName}`;

        if (field.primaryKey) {
          primaryKeys.push(field.columnName);

          // Para PKs simples (no FK), SIEMPRE usar BIGSERIAL/AUTO_INCREMENT
          if (!isCompositePKAndFK) {
            // PK simple (auto-incremental)
            if (dbType === "postgresql") {
              columnDef += " BIGSERIAL";
            } else if (dbType === "mysql") {
              columnDef += " BIGINT AUTO_INCREMENT";
            } else if (dbType === "sqlserver") {
              columnDef += " BIGINT IDENTITY(1,1)";
            } else if (dbType === "h2") {
              columnDef += " BIGINT AUTO_INCREMENT";
            }
          } else {
            // PK compuesta que es FK (tabla many-to-many)
            columnDef += " BIGINT NOT NULL";
          }
        } else {
          // Campos normales (no PK)
          columnDef += ` ${this.mapJavaTypeToSQLType(field.type)}`;

          if (!field.nullable) {
            columnDef += " NOT NULL";
          }
        }

        if (this.isAuditField(field.columnName)) {
          if (dbType === "postgresql" || dbType === "h2") {
            columnDef += " DEFAULT CURRENT_TIMESTAMP";
          } else if (dbType === "mysql") {
            columnDef += " DEFAULT CURRENT_TIMESTAMP";
          } else if (dbType === "sqlserver") {
            columnDef += " DEFAULT GETDATE()";
          }
        }

        columnDefinitions.push(columnDef);
      }

      if (primaryKeys.length > 0) {
        columnDefinitions.push(`    PRIMARY KEY (${primaryKeys.join(", ")})`);
      }

      sql += columnDefinitions.join(",\n");
      sql += "\n);\n\n";
    }

    // Paso 2: Agregar columnas de FK
    sql += "-- ============================================\n";
    sql += "-- PASO 2: Agregar columnas de foreign keys\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      for (const field of entity.fields) {
        if (field.foreignKey) {
          // Si la FK es parte de una PK compuesta, ya fue creada en el PASO 1
          const isCompositePKAndFK = field.primaryKey && field.foreignKey;
          if (isCompositePKAndFK) continue;

          // Las FKs siempre referencian PKs, que son BIGINT
          // No usar field.type porque contiene el nombre de la entidad, no el tipo SQL
          const columnDef = `${field.columnName} BIGINT${
            !field.nullable ? " NOT NULL" : ""
          }`;

          sql += `ALTER TABLE ${entity.tableName} ADD COLUMN IF NOT EXISTS ${columnDef};\n`;
        }
      }
    }
    sql += "\n";

    // Paso 3: Agregar foreign key constraints
    sql += "-- ============================================\n";
    sql += "-- PASO 3: Crear foreign key constraints\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      for (const field of entity.fields) {
        if (field.foreignKey) {
          const fkName = `fk_${entity.tableName}_${field.columnName}`;
          const refTable = this.toSnakeCase(field.foreignKey.referencedEntity);
          const refColumn = this.toSnakeCase(field.foreignKey.referencedField);

          sql += `ALTER TABLE ${entity.tableName}\n`;
          sql += `    ADD CONSTRAINT ${fkName}\n`;
          sql += `    FOREIGN KEY (${field.columnName})\n`;
          sql += `    REFERENCES ${refTable}(${refColumn})\n`;
          sql += `    ON DELETE CASCADE\n`;
          sql += `    ON UPDATE CASCADE;\n\n`;
        }
      }
    }

    // Paso 4: Crear índices
    sql += "-- ============================================\n";
    sql += "-- PASO 4: Crear índices para optimización\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      for (const field of entity.fields) {
        if (field.foreignKey) {
          const indexName = `idx_${entity.tableName}_${field.columnName}`;
          sql += `CREATE INDEX IF NOT EXISTS ${indexName} ON ${entity.tableName}(${field.columnName});\n`;
        }
      }

      for (const field of entity.fields) {
        const columnLower = field.columnName.toLowerCase();
        if (
          (columnLower.includes("name") ||
            columnLower.includes("email") ||
            columnLower.includes("code") ||
            columnLower.includes("status")) &&
          !field.primaryKey &&
          !field.foreignKey
        ) {
          const indexName = `idx_${entity.tableName}_${field.columnName}`;
          sql += `CREATE INDEX IF NOT EXISTS ${indexName} ON ${entity.tableName}(${field.columnName});\n`;
        }
      }
    }

    sql += "\n-- Migration completed successfully\n";
    return sql;
  }

  /**
   * Mapea tipos Java a tipos SQL
   */
  private mapJavaTypeToSQLType(javaType: string): string {
    const dbType = this.dbType;

    if (dbType === "postgresql") {
      const typeMap: { [key: string]: string } = {
        Long: "BIGINT",
        Integer: "INTEGER",
        String: "VARCHAR(255)",
        Boolean: "BOOLEAN",
        Double: "DOUBLE PRECISION",
        Float: "REAL",
        BigDecimal: "DECIMAL(19,2)",
        Date: "DATE",
        LocalDate: "DATE",
        LocalDateTime: "TIMESTAMP",
        LocalTime: "TIME",
        Instant: "TIMESTAMP",
        byte: "SMALLINT",
        short: "SMALLINT",
        int: "INTEGER",
        long: "BIGINT",
        float: "REAL",
        double: "DOUBLE PRECISION",
        boolean: "BOOLEAN",
      };
      return typeMap[javaType] || "VARCHAR(255)";
    } else if (dbType === "mysql") {
      const typeMap: { [key: string]: string } = {
        Long: "BIGINT",
        Integer: "INT",
        String: "VARCHAR(255)",
        Boolean: "TINYINT(1)",
        Double: "DOUBLE",
        Float: "FLOAT",
        BigDecimal: "DECIMAL(19,2)",
        Date: "DATE",
        LocalDate: "DATE",
        LocalDateTime: "DATETIME",
        LocalTime: "TIME",
        Instant: "DATETIME",
        byte: "TINYINT",
        short: "SMALLINT",
        int: "INT",
        long: "BIGINT",
        float: "FLOAT",
        double: "DOUBLE",
        boolean: "TINYINT(1)",
      };
      return typeMap[javaType] || "VARCHAR(255)";
    }

    // Default (PostgreSQL-like)
    return "VARCHAR(255)";
  }

  /**
   * Verifica si un campo es de auditoría
   */
  private isAuditField(columnName: string): boolean {
    const auditFields = [
      "created_at",
      "updated_at",
      "created_date",
      "modified_date",
    ];
    return auditFields.includes(columnName.toLowerCase());
  }

  /**
   * Convierte a snake_case
   */
  private toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/^_/, "");
  }

  /**
   * Extrae el número de versión de un nombre de archivo de migración
   */
  public static extractVersionFromFileName(fileName: string): number {
    const match = fileName.match(/^V(\d+)__/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Determina la próxima versión basada en archivos existentes
   */
  public static getNextVersion(existingMigrations: string[]): number {
    let maxVersion = 0;

    for (const migration of existingMigrations) {
      const version = this.extractVersionFromFileName(migration);
      if (version > maxVersion) {
        maxVersion = version;
      }
    }

    return maxVersion + 1;
  }
}
