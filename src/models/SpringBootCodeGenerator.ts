import {
  PhysicalModel,
  PhysicalTable,
  PhysicalColumn,
} from "./TransformationManager.js";
import {
  FlywayMigrationManager,
  FlywayMigration,
  SchemaChanges,
} from "./FlywayMigrationManager.js";

// Interfaces para el código generado
export interface SpringBootEntity {
  className: string;
  packageName: string;
  tableName: string;
  fields: SpringBootField[];
  imports: string[];
  annotations: string[];
}

export interface SpringBootField {
  name: string;
  type: string;
  columnName: string;
  annotations: string[];
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  foreignKey?: {
    referencedEntity: string;
    referencedField: string;
    relationship: "OneToOne" | "OneToMany" | "ManyToOne" | "ManyToMany";
  };
}

export interface SpringBootRepository {
  className: string;
  packageName: string;
  entityClass: string;
  idType?: string; // Tipo de la PK (Long, String, UUID, EntityNameId)
  methods: string[];
}

export interface SpringBootService {
  className: string;
  packageName: string;
  entityClass: string;
  repositoryClass: string;
  idType?: string; // Tipo de la PK (Long, String, UUID, EntityNameId)
  methods: string[];
}

export interface SpringBootController {
  className: string;
  packageName: string;
  entityClass: string;
  serviceClass: string;
  dtoClass: string;
  idType?: string; // Tipo de la PK (Long, String, UUID, EntityNameId)
  endpoints: SpringBootEndpoint[];
}

export interface SpringBootEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  methodName: string;
  parameters: string[];
  returnType: string;
}

export interface SpringBootDTO {
  className: string;
  packageName: string;
  fields: SpringBootField[];
  imports: string[];
}

export interface SpringBootMapper {
  className: string;
  packageName: string;
  entityClass: string;
  dtoClass: string;
  methods: string[];
}

export interface SpringBootGeneratedCode {
  entities: SpringBootEntity[];
  repositories: SpringBootRepository[];
  services: SpringBootService[];
  controllers: SpringBootController[];
  dtos: SpringBootDTO[];
  applicationProperties: string;
  pomXml: string;
  sampleData: string;
  flywayMigration: string; // Script SQL de migración inicial (para compatibilidad)
  flywayMigrations?: FlywayMigration[]; // Lista de migraciones incrementales
  databaseInitScript: string; // Script para crear la base de datos
  databaseSetupGuide: string; // Guía de configuración de la base de datos
}

export class SpringBootCodeGenerator {
  private physicalModel: PhysicalModel;
  private basePackage: string;
  private projectName: string;
  private databaseConfig?: any;
  private previousPhysicalModel?: PhysicalModel; // Para migraciones incrementales
  private existingMigrations?: string[]; // Nombres de migraciones existentes (DEPRECATED)
  private existingMigrationFiles?: Array<{ fileName: string; sql: string }>; // Archivos completos de migración
  private migrationManager: FlywayMigrationManager;

  constructor(
    physicalModel: PhysicalModel,
    basePackage: string = "com.example.demo",
    projectName: string = "demo",
    databaseConfig?: any,
    previousPhysicalModel?: PhysicalModel,
    existingMigrations?: string[],
    existingMigrationFiles?: Array<{ fileName: string; sql: string }>
  ) {
    this.physicalModel = physicalModel;
    this.basePackage = basePackage;
    this.projectName = projectName;
    this.databaseConfig = databaseConfig;
    this.previousPhysicalModel = previousPhysicalModel;
    this.existingMigrations = existingMigrations;
    this.existingMigrationFiles = existingMigrationFiles;
    this.migrationManager = new FlywayMigrationManager(
      databaseConfig?.type || "postgresql"
    );
  }

  public generateCode(): SpringBootGeneratedCode {
    const entities = this.generateEntities();
    const dtos = this.generateDTOs(entities);
    const repositories = this.generateRepositories(entities);
    const services = this.generateServices(entities, repositories);
    const controllers = this.generateControllers(entities, services, dtos);

    // Generar migraciones (inicial o incremental)
    const migrations = this.generateMigrations(entities);

    return {
      entities,
      repositories,
      services,
      controllers,
      dtos,
      applicationProperties: this.generateApplicationProperties(),
      pomXml: this.generatePomXml(),
      sampleData: this.generateSampleData(entities),
      flywayMigration: this.generateFlywayMigration(entities), // Para compatibilidad
      flywayMigrations: migrations, // Nuevo: lista de migraciones
      databaseInitScript: this.generateDatabaseInitScript(),
      databaseSetupGuide: this.generateDatabaseSetupGuide(),
    };
  }

  /**
   * Obtiene las entidades generadas (método público para Postman)
   */
  public getEntities(): SpringBootEntity[] {
    return this.generateEntities();
  }

  /**
   * Genera entidades JPA
   */
  private generateEntities(): SpringBootEntity[] {
    const entities: SpringBootEntity[] = [];

    for (const [tableName, table] of Object.entries(
      this.physicalModel.tables
    )) {
      const entity = this.generateEntity(tableName, table);
      entities.push(entity);
    }

    return entities;
  }

  /**
   * Genera una entidad JPA
   */
  private generateEntity(
    tableName: string,
    table: PhysicalTable
  ): SpringBootEntity {
    // Validaciones básicas
    if (!tableName || tableName.trim().length === 0) {
      throw new Error(`Nombre de tabla inválido: ${tableName}`);
    }

    if (!table.columns || table.columns.length === 0) {
      throw new Error(`La tabla ${tableName} no tiene columnas definidas`);
    }

    const className = this.toPascalCase(tableName);
    if (!className || className.length === 0) {
      throw new Error(
        `No se pudo generar un nombre de clase válido para la tabla: ${tableName}`
      );
    }

    const fields: SpringBootField[] = [];
    const imports = new Set<string>();
    const annotations: string[] = [];

    // Anotaciones de clase
    annotations.push("@Entity");
    annotations.push(`@Table(name = "${tableName}")`);
    annotations.push("@EntityListeners(AuditingEntityListener.class)");
    imports.add("jakarta.persistence.Entity");
    imports.add("jakarta.persistence.Table");
    imports.add("jakarta.persistence.EntityListeners");
    imports.add(
      "org.springframework.data.jpa.domain.support.AuditingEntityListener"
    );
    imports.add("java.time.LocalDateTime");

    // Procesar columnas
    for (const column of table.columns) {
      const field = this.generateField(column, table);
      fields.push(field);

      // Agregar imports necesarios
      field.annotations.forEach((ann) => {
        if (ann.includes("@Id")) imports.add("jakarta.persistence.Id");
        if (ann.includes("@GeneratedValue"))
          imports.add("jakarta.persistence.GeneratedValue");
        if (ann.includes("GenerationType"))
          imports.add("jakarta.persistence.GenerationType");
        if (ann.includes("@Column")) imports.add("jakarta.persistence.Column");
        if (ann.includes("@CreatedDate"))
          imports.add("org.springframework.data.annotation.CreatedDate");
        if (ann.includes("@LastModifiedDate"))
          imports.add("org.springframework.data.annotation.LastModifiedDate");
        if (ann.includes("@OneToOne"))
          imports.add("jakarta.persistence.OneToOne");
        if (ann.includes("@OneToMany"))
          imports.add("jakarta.persistence.OneToMany");
        if (ann.includes("@ManyToOne"))
          imports.add("jakarta.persistence.ManyToOne");
        if (ann.includes("@ManyToMany"))
          imports.add("jakarta.persistence.ManyToMany");
        if (ann.includes("@JoinColumn"))
          imports.add("jakarta.persistence.JoinColumn");
        if (ann.includes("@JoinTable"))
          imports.add("jakarta.persistence.JoinTable");
        if (ann.includes("FetchType"))
          imports.add("jakarta.persistence.FetchType");
      });

      // Agregar imports para tipos de datos
      if (
        field.type === "LocalDateTime" ||
        field.type === "LocalDate" ||
        field.type === "LocalTime"
      ) {
        imports.add("java.time." + field.type);
      }
      if (field.type === "BigDecimal") {
        imports.add("java.math.BigDecimal");
      }
      if (field.type === "UUID") {
        imports.add("java.util.UUID");
      }
    }

    return {
      className,
      packageName: `${this.basePackage}.entity`,
      tableName,
      fields,
      imports: Array.from(imports),
      annotations,
    };
  }

  /**
   * Genera un campo de entidad
   */
  private generateField(
    column: PhysicalColumn,
    table: PhysicalTable
  ): SpringBootField {
    // Validaciones básicas
    if (!column.name || column.name.trim().length === 0) {
      throw new Error(`Nombre de columna inválido en tabla ${table.name}`);
    }

    if (!column.dataType || column.dataType.trim().length === 0) {
      throw new Error(
        `Tipo de dato inválido para columna ${column.name} en tabla ${table.name}`
      );
    }

    const fieldName = this.toCamelCase(column.name);
    if (!fieldName || fieldName.length === 0) {
      throw new Error(
        `No se pudo generar un nombre de campo válido para la columna: ${column.name}`
      );
    }

    const annotations: string[] = [];

    // Anotaciones de clave primaria (deben ir primero)
    let primaryKey = false;
    if (table.primaryKey.includes(column.name)) {
      annotations.push("@Id");
      primaryKey = true;
    }

    // Verificar si es clave foránea (puede ser FK y PK al mismo tiempo en tablas many-to-many)
    let foreignKey: SpringBootField["foreignKey"];
    const fk = table.foreignKeys.find((fk) => fk.columns.includes(column.name));
    const isForeignKey = !!fk; // TRUE si la columna es FK (sin importar si también es PK)
    const isCompositePKAndFK = primaryKey && isForeignKey; // TRUE para PKs compuestas en tablas many-to-many

    // Para PKs que NO son FK (PKs simples), SIEMPRE agregar @GeneratedValue
    // Las PKs compuestas que son FKs NO deben tener @GeneratedValue
    if (primaryKey && !isForeignKey) {
      annotations.push("@GeneratedValue(strategy = GenerationType.IDENTITY)");
    }

    // Determinar el tipo del campo
    let fieldType: string;
    if (isForeignKey && !isCompositePKAndFK) {
      // Si es FK pero NO es parte de PK compuesta, usar el tipo de la entidad referenciada
      // Para relaciones @ManyToOne
      fieldType = this.toPascalCase(fk.referencesTable);
    } else if (primaryKey || isCompositePKAndFK) {
      // Para PKs simples o PKs compuestas (que son FKs en tablas many-to-many), usar Long
      fieldType = "Long";
    } else {
      // Si NO es FK ni PK, mapear el tipo SQL a tipo Java
      fieldType = this.mapSQLTypeToJavaType(column.dataType);
      if (!fieldType || fieldType.length === 0) {
        console.warn(
          `Tipo de dato desconocido '${column.dataType}' para columna ${column.name}, usando String como fallback`
        );
      }
    }

    // Verificar si es un campo de auditoría
    const isAuditField = this.isAuditField(column.name);

    if (isAuditField) {
      // Campos de auditoría con @Column
      if (fieldName.toLowerCase().includes("created")) {
        annotations.push("@CreatedDate");
        annotations.push(
          `@Column(name = "${column.name}", nullable = false, updatable = false)`
        );
      } else if (fieldName.toLowerCase().includes("updated")) {
        annotations.push("@LastModifiedDate");
        annotations.push(`@Column(name = "${column.name}", nullable = false)`);
      }
    } else if (isForeignKey && !isCompositePKAndFK) {
      // Si es una FK pero NO es parte de PK compuesta, agregar anotaciones de relación
      // fieldType ya contiene el nombre de la entidad referenciada (ej: "Producto")
      const referencedField = this.toCamelCase(fk.referencesColumns[0]);

      // Determinar tipo de relación basado en la multiplicidad
      const relationship = this.determineRelationshipType(table, fk, column);

      if (relationship === "ManyToOne") {
        annotations.push(`@ManyToOne(fetch = FetchType.LAZY)`);
        annotations.push(`@JoinColumn(name = "${column.name}")`);
        foreignKey = {
          referencedEntity: this.toPascalCase(fk.referencesTable),
          referencedField,
          relationship: "ManyToOne",
        };
      } else if (relationship === "OneToOne") {
        annotations.push(`@OneToOne(fetch = FetchType.LAZY)`);
        annotations.push(`@JoinColumn(name = "${column.name}")`);
        foreignKey = {
          referencedEntity: this.toPascalCase(fk.referencesTable),
          referencedField,
          relationship: "OneToOne",
        };
      }
    } else if (isCompositePKAndFK) {
      // Para PKs compuestas que son FKs (tablas many-to-many), solo usar @Column
      annotations.push(`@Column(name = "${column.name}", nullable = false)`);
      // Guardar información de FK para usar en migraciones
      foreignKey = {
        referencedEntity: this.toPascalCase(fk.referencesTable),
        referencedField: this.toCamelCase(fk.referencesColumns[0]),
        relationship: "ManyToMany",
      };
    } else {
      // Anotación @Column para campos normales (que NO son FK ni auditoría)
      let columnAnnotation = `@Column(name = "${column.name}"`;

      // Determinar si es nullable basado en la definición de columna
      let isNullable = column.nullable;

      // Si es parte de la primary key, no puede ser nullable
      if (primaryKey) {
        isNullable = false;
      }

      if (!isNullable) {
        columnAnnotation += ", nullable = false";
      }

      // Agregar unique constraint si está definido
      if (column.unique) {
        columnAnnotation += ", unique = true";
      }

      columnAnnotation += ")";
      annotations.push(columnAnnotation);
    }

    return {
      name: fieldName,
      type: fieldType,
      columnName: column.name,
      annotations,
      nullable: column.nullable,
      primaryKey,
      unique: column.unique,
      foreignKey,
    };
  }

  /**
   * Genera DTOs
   */
  private generateDTOs(entities: SpringBootEntity[]): SpringBootDTO[] {
    return entities.map((entity) => {
      // Copiar imports relevantes de la entidad (tipos de datos)
      const dataTypeImports = Array.from(entity.imports).filter(
        (imp) =>
          imp.startsWith("java.time.") ||
          imp.startsWith("java.math.") ||
          imp.startsWith("java.util.") ||
          imp.startsWith("java.sql.")
      );

      return {
        className: `${entity.className}DTO`,
        packageName: `${this.basePackage}.dto`,
        fields: entity.fields
          .filter((field) => !this.isAuditField(field.columnName)) // Excluir campos de auditoría
          .map((field) => {
            // Si es FK, necesitamos obtener el tipo del ID de la entidad referenciada
            if (field.foreignKey) {
              // Buscar la entidad referenciada para obtener el tipo de su PK
              const referencedEntity = entities.find(
                (e) => e.className === field.foreignKey!.referencedEntity
              );

              if (referencedEntity) {
                // Encontrar el campo PK de la entidad referenciada
                const pkField = referencedEntity.fields.find(
                  (f) => f.primaryKey
                );
                if (pkField) {
                  // Usar el tipo del PK (Long, String, UUID, etc.) en lugar del tipo de entidad
                  return {
                    ...field,
                    type: pkField.type, // ej: "Long" en vez de "Venta"
                    annotations: [], // DTOs no tienen anotaciones JPA
                    foreignKey: undefined, // DTOs no tienen información de FK
                  };
                }
              }

              // Fallback: usar Long si no podemos determinar el tipo
              console.warn(
                `No se pudo determinar el tipo de PK para FK ${field.name}, usando Long como fallback`
              );
              return {
                ...field,
                type: "Long",
                annotations: [],
                foreignKey: undefined,
              };
            }

            // Para campos normales, simplemente remover anotaciones
            return {
              ...field,
              annotations: [], // DTOs no tienen anotaciones JPA
            };
          }),
        imports: dataTypeImports, // Solo imports de tipos de datos, sin Lombok
      };
    });
  }

  /**
   * Genera Mappers
   */
  private generateMappers(
    entities: SpringBootEntity[],
    dtos: SpringBootDTO[]
  ): SpringBootMapper[] {
    return entities.map((entity, index) => {
      const dto = dtos[index];
      return {
        className: `${entity.className}Mapper`,
        packageName: `${this.basePackage}.mapper`,
        entityClass: entity.className,
        dtoClass: dto.className,
        methods: [
          `public static ${dto.className} toDTO(${entity.className} entity)`,
          `public static ${entity.className} toEntity(${dto.className} dto)`,
          `public static List<${dto.className}> toDTOList(List<${entity.className}> entities)`,
          `public static List<${entity.className}> toEntityList(List<${dto.className}> dtos)`,
        ],
      };
    });
  }

  /**
   * Genera Repositories
   */
  private generateRepositories(
    entities: SpringBootEntity[]
  ): SpringBootRepository[] {
    return entities.map((entity) => {
      // Determinar el tipo de la PK
      const primaryKeyFields = entity.fields.filter((f) => f.primaryKey);
      let idType: string;

      if (primaryKeyFields.length === 0) {
        // Sin PK definida, usar Long por defecto
        idType = "Long";
      } else if (primaryKeyFields.length === 1) {
        // PK simple: usar el tipo del campo
        idType = primaryKeyFields[0].type;
      } else {
        // PK compuesta: usar EntityNameId
        idType = `${entity.className}Id`;
      }

      return {
        className: `${entity.className}Repository`,
        packageName: `${this.basePackage}.repository`,
        entityClass: entity.className,
        idType: idType, // Guardar el tipo de PK
        methods: [
          `Optional<${entity.className}> findById(${idType} id)`,
          `List<${entity.className}> findAll()`,
          `<S extends ${entity.className}> S save(S entity)`,
          `void deleteById(${idType} id)`,
          `boolean existsById(${idType} id)`,
        ],
      };
    });
  }

  /**
   * Genera Services
   */
  private generateServices(
    entities: SpringBootEntity[],
    repositories: SpringBootRepository[]
  ): SpringBootService[] {
    return entities.map((entity, index) => {
      const repository = repositories[index];
      const idType = repository.idType || "Long";

      return {
        className: `${entity.className}Service`,
        packageName: `${this.basePackage}.service`,
        entityClass: entity.className,
        repositoryClass: repository.className,
        idType: idType,
        methods: [
          `public List<${entity.className}> findAll()`,
          `public Optional<${entity.className}> findById(${idType} id)`,
          `public ${entity.className} save(${entity.className} entity)`,
          `public void deleteById(${idType} id)`,
        ],
      };
    });
  }

  /**
   * Genera Controllers
   */
  private generateControllers(
    entities: SpringBootEntity[],
    services: SpringBootService[],
    dtos: SpringBootDTO[]
  ): SpringBootController[] {
    return entities.map((entity, index) => {
      const service = services[index];
      const dto = dtos[index];

      // Obtener el tipo de ID del servicio
      const idType = service.idType || "Long";

      const endpoints: SpringBootEndpoint[] = [
        {
          method: "GET",
          path: `/${this.toKebabCase(entity.className)}`,
          methodName: "findAll",
          parameters: [],
          returnType: `List<${dto.className}>`,
        },
        {
          method: "GET",
          path: `/${this.toKebabCase(entity.className)}/{id}`,
          methodName: "findById",
          parameters: [`@PathVariable ${idType} id`],
          returnType: `ResponseEntity<${dto.className}>`,
        },
        {
          method: "POST",
          path: `/${this.toKebabCase(entity.className)}`,
          methodName: "create",
          parameters: [`@RequestBody ${dto.className} dto`],
          returnType: `ResponseEntity<${dto.className}>`,
        },
        {
          method: "PUT",
          path: `/${this.toKebabCase(entity.className)}/{id}`,
          methodName: "update",
          parameters: [
            `@PathVariable ${idType} id`,
            `@RequestBody ${dto.className} dto`,
          ],
          returnType: `ResponseEntity<${dto.className}>`,
        },
        {
          method: "DELETE",
          path: `/${this.toKebabCase(entity.className)}/{id}`,
          methodName: "delete",
          parameters: [`@PathVariable ${idType} id`],
          returnType: "ResponseEntity<Void>",
        },
      ];

      return {
        className: `${entity.className}Controller`,
        packageName: `${this.basePackage}.controller`,
        entityClass: entity.className,
        serviceClass: service.className,
        dtoClass: dto.className,
        endpoints,
        idType: idType,
      };
    });
  }

  /**
   * Genera application.properties
   */
  private generateApplicationProperties(): string {
    // Configuración de base de datos con gestión completa de esquema
    let dbConfig = `# Database Configuration
# La base de datos y esquema son gestionados automáticamente por Flyway
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=

# JPA Configuration
# validate: Solo valida que el esquema coincida con las entidades (recomendado en producción)
# Flyway gestiona la creación y evolución del esquema
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.open-in-view=false

# Flyway Configuration - Gestión de migraciones de base de datos
spring.flyway.enabled=true
# Permite ejecutar Flyway en una BD existente sin historial de migraciones
spring.flyway.baseline-on-migrate=true
# Ubicación de los scripts de migración
spring.flyway.locations=classpath:db/migration
# Prefijo de archivos de migración (ej: V1__)
spring.flyway.sql-migration-prefix=V
# Separador entre versión y descripción
spring.flyway.sql-migration-separator=__
# Extensión de archivos de migración
spring.flyway.sql-migration-suffixes=.sql
# Crear el esquema si no existe (útil para bases de datos vacías)
spring.flyway.create-schemas=true

# H2 Console (solo para desarrollo con H2)
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console

# Auditing Configuration - Habilita @CreatedDate y @LastModifiedDate
spring.jpa.properties.hibernate.enable_lazy_load_no_trans=false`;

    if (this.databaseConfig) {
      switch (this.databaseConfig.type) {
        case "postgresql":
          dbConfig = `# Database Configuration - PostgreSQL
spring.datasource.url=jdbc:postgresql://${this.databaseConfig.host}:${this.databaseConfig.port}/${this.databaseConfig.database}
spring.datasource.driver-class-name=org.postgresql.Driver
spring.datasource.username=${this.databaseConfig.username}
spring.datasource.password=${this.databaseConfig.password}

# Connection Pool Configuration
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000

# JPA Configuration
# validate: Solo valida que el esquema coincida con las entidades
# Flyway gestiona la creación y evolución del esquema
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.open-in-view=false
spring.jpa.properties.hibernate.jdbc.lob.non_contextual_creation=true

# Flyway Configuration - Gestión automática de migraciones
spring.flyway.enabled=true
# Permite ejecutar Flyway en una BD existente sin historial
spring.flyway.baseline-on-migrate=true
# CRÍTICO: Deshabilita validación de checksums para permitir edición de diagramas
# Permite regenerar el backend modificando V1__initial_schema.sql sin errores
spring.flyway.validate-on-migrate=false
# Ubicación de los scripts de migración
spring.flyway.locations=classpath:db/migration
# Prefijo y formato de archivos
spring.flyway.sql-migration-prefix=V
spring.flyway.sql-migration-separator=__
spring.flyway.sql-migration-suffixes=.sql
# Crear el esquema si no existe
spring.flyway.create-schemas=true
# Esquema por defecto
spring.flyway.default-schema=public

# Auditing Configuration
spring.jpa.properties.hibernate.enable_lazy_load_no_trans=false`;
          break;
        default:
          // Si no es PostgreSQL, usar H2 como fallback
          dbConfig = `# Database Configuration - H2 (In-Memory Database)
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=

# JPA Configuration
# update: Actualiza el esquema automáticamente (solo para H2)
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.open-in-view=false

# Flyway Configuration - Gestión de migraciones de base de datos
spring.flyway.enabled=true
# Permite ejecutar Flyway en una BD existente sin historial de migraciones
spring.flyway.baseline-on-migrate=true
# CRÍTICO: Deshabilita validación de checksums para permitir edición de diagramas
spring.flyway.validate-on-migrate=false
# Ubicación de los scripts de migración
spring.flyway.locations=classpath:db/migration
# Prefijo de archivos de migración (ej: V1__)
spring.flyway.sql-migration-prefix=V
# Separador entre versión y descripción
spring.flyway.sql-migration-separator=__
# Extensión de archivos de migración
spring.flyway.sql-migration-suffixes=.sql
# Crear el esquema si no existe (útil para bases de datos vacías)
spring.flyway.create-schemas=true

# H2 Console (solo para desarrollo con H2)
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console

# Auditing Configuration - Habilita @CreatedDate y @LastModifiedDate
spring.jpa.properties.hibernate.enable_lazy_load_no_trans=false`;
          break;
      }
    }

    return `${dbConfig}

# Server Configuration
server.port=4000

# Logging
logging.level.com.example=INFO
logging.level.org.springframework.web=INFO
logging.level.org.hibernate=INFO
`;
  }

  /**
   * Genera lombok.config
   */
  private generateLombokConfig(): string {
    return `# Lombok configuration for NetBeans compatibility
# Disable problematic features for NetBeans
lombok.addLombokGeneratedAnnotation = false
lombok.anyConstructor.addConstructorProperties = false
lombok.data.flagUsage = ALLOW
lombok.experimental.flagUsage = ERROR

# NetBeans specific configuration
lombok.addGeneratedAnnotation = false

# Disable advanced features that may cause issues
lombok.accessors.flagUsage = ERROR
lombok.fieldDefaults.flagUsage = ERROR
lombok.utilityClass.flagUsage = ERROR
lombok.val.flagUsage = ERROR
lombok.var.flagUsage = ERROR
lombok.nonNull.flagUsage = ERROR
lombok.cleanup.flagUsage = ERROR
lombok.sneakyThrows.flagUsage = ERROR

# Safe features only
lombok.getter.flagUsage = ALLOW
lombok.setter.flagUsage = ALLOW
lombok.noArgsConstructor.flagUsage = ALLOW
lombok.allArgsConstructor.flagUsage = ALLOW
lombok.equalsAndHashCode.flagUsage = ALLOW
lombok.toString.flagUsage = ALLOW
`;
  }

  /**
   * Genera pom.xml
   */
  private generatePomXml(): string {
    // Determinar dependencia de base de datos
    let dbDependency = `        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>`;

    if (this.databaseConfig) {
      switch (this.databaseConfig.type) {
        case "postgresql":
          dbDependency = `        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>`;
          break;
        case "mysql":
          dbDependency = `        <dependency>
            <groupId>mysql</groupId>
            <artifactId>mysql-connector-java</artifactId>
            <scope>runtime</scope>
        </dependency>`;
          break;
        case "sqlserver":
          dbDependency = `        <dependency>
            <groupId>com.microsoft.sqlserver</groupId>
            <artifactId>mssql-jdbc</artifactId>
            <scope>runtime</scope>
        </dependency>`;
          break;
        case "sqlite":
          dbDependency = `        <dependency>
            <groupId>org.xerial</groupId>
            <artifactId>sqlite-jdbc</artifactId>
            <scope>runtime</scope>
        </dependency>`;
          break;
      }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.5.6</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>${this.projectName}</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>${this.projectName}</name>
    <description>Spring Boot JPA Application</description>
    <properties>
        <java.version>21</java.version>
        <maven.compiler.source>21</maven.compiler.source>
        <maven.compiler.target>21</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
    </properties>

    <repositories>
        <repository>
            <id>central</id>
            <url>https://repo.maven.apache.org/maven2</url>
        </repository>
    </repositories>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <version>1.18.42</version>
            <optional>true</optional>
        </dependency>
${dbDependency}
        <!-- Flyway para migraciones de base de datos -->
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>21</source>
                    <target>21</target>
                    <encoding>UTF-8</encoding>
                    <compilerArgs>
                        <arg>-parameters</arg>
                        <arg>-Xlint:-options</arg>
                    </compilerArgs>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
  }

  /**
   * Genera las migraciones de Flyway (inicial o incremental)
   */
  private generateMigrations(entities: SpringBootEntity[]): FlywayMigration[] {
    const migrations: FlywayMigration[] = [];

    // Si no hay modelo previo, generar migración inicial
    if (
      !this.previousPhysicalModel ||
      !this.existingMigrations ||
      this.existingMigrations.length === 0
    ) {
      const initialMigration = this.migrationManager.generateInitialMigration(
        this.physicalModel,
        entities
      );
      migrations.push(initialMigration);
      return migrations;
    }

    // Si hay modelo previo, generar migración incremental
    const nextVersion = FlywayMigrationManager.getNextVersion(
      this.existingMigrations
    );

    const incrementalMigration =
      this.migrationManager.generateIncrementalMigration(
        this.previousPhysicalModel,
        this.physicalModel,
        entities,
        nextVersion
      );

    if (incrementalMigration) {
      migrations.push(incrementalMigration);
    }

    return migrations;
  }

  /**
   * Genera el script de migración inicial de Flyway (V1__initial_schema.sql)
   * @deprecated Usar generateMigrations() para soporte incremental
   */
  private generateFlywayMigration(entities: SpringBootEntity[]): string {
    const dbType = this.databaseConfig?.type || "postgresql";

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

    // Primero, crear tablas SIN foreign keys (para evitar dependencias circulares)
    sql += "-- ============================================\n";
    sql += "-- PASO 1: Crear tablas sin foreign keys\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      sql += `-- Table: ${entity.tableName}\n`;
      sql += `CREATE TABLE IF NOT EXISTS ${entity.tableName} (\n`;

      const columnDefinitions: string[] = [];
      const primaryKeys: string[] = [];

      for (const field of entity.fields) {
        // Saltar campos de FK en esta fase
        if (field.foreignKey) continue;

        let columnDef = `    ${field.columnName}`;

        // Primary Key simple (no FK) con auto-incremento
        if (field.primaryKey) {
          primaryKeys.push(field.columnName);

          // PKs simples SIEMPRE usan BIGSERIAL/AUTO_INCREMENT
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
          // Campos normales (no PK)
          columnDef += ` ${this.mapJavaTypeToSQLType(field.type, dbType)}`;
        }

        // NOT NULL constraint (los PK son automáticamente NOT NULL)
        if (!field.nullable && !field.primaryKey) {
          columnDef += " NOT NULL";
        }

        // DEFAULT para campos de auditoría
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

      // Agregar Primary Key constraint
      if (primaryKeys.length > 0) {
        columnDefinitions.push(`    PRIMARY KEY (${primaryKeys.join(", ")})`);
      }

      sql += columnDefinitions.join(",\n");
      sql += "\n);\n\n";
    }

    // Segundo, agregar columnas de FK y constraints
    sql += "-- ============================================\n";
    sql += "-- PASO 2: Agregar columnas de foreign keys\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      for (const field of entity.fields) {
        if (field.foreignKey) {
          const columnDef = `${field.columnName} ${this.mapJavaTypeToSQLType(
            field.type,
            dbType
          )}${!field.nullable ? " NOT NULL" : ""}`;

          sql += `ALTER TABLE ${entity.tableName} ADD COLUMN IF NOT EXISTS ${columnDef};\n`;
        }
      }
    }
    sql += "\n";

    // Tercero, agregar foreign key constraints
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

    // Cuarto, crear índices para optimización
    sql += "-- ============================================\n";
    sql += "-- PASO 4: Crear índices para optimización\n";
    sql += "-- ============================================\n\n";

    for (const entity of entities) {
      // Índices para foreign keys
      for (const field of entity.fields) {
        if (field.foreignKey) {
          const indexName = `idx_${entity.tableName}_${field.columnName}`;
          sql += `CREATE INDEX IF NOT EXISTS ${indexName} ON ${entity.tableName}(${field.columnName});\n`;
        }
      }

      // Índices para campos de búsqueda comunes
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
   * Mapea tipos Java a tipos SQL (soporta múltiples bases de datos)
   */
  private mapJavaTypeToSQLType(
    javaType: string,
    dbType: string = "postgresql"
  ): string {
    // Mapeo base para PostgreSQL/H2
    const postgresMapping: Record<string, string> = {
      String: "VARCHAR(255)",
      Long: "BIGINT",
      Integer: "INTEGER",
      Short: "SMALLINT",
      int: "INTEGER",
      Boolean: "BOOLEAN",
      boolean: "BOOLEAN",
      Double: "DOUBLE PRECISION",
      double: "DOUBLE PRECISION",
      Float: "REAL",
      float: "REAL",
      BigDecimal: "DECIMAL(19,2)",
      LocalDate: "DATE",
      LocalDateTime: "TIMESTAMP",
      LocalTime: "TIME",
      Date: "TIMESTAMP",
      Timestamp: "TIMESTAMP",
      "byte[]": "BYTEA",
      UUID: "UUID",
    };

    // Mapeo específico para MySQL
    const mysqlMapping: Record<string, string> = {
      String: "VARCHAR(255)",
      Long: "BIGINT",
      Integer: "INT",
      Short: "SMALLINT",
      int: "INT",
      Boolean: "TINYINT(1)",
      boolean: "TINYINT(1)",
      Double: "DOUBLE",
      double: "DOUBLE",
      Float: "FLOAT",
      float: "FLOAT",
      BigDecimal: "DECIMAL(19,2)",
      LocalDate: "DATE",
      LocalDateTime: "DATETIME",
      LocalTime: "TIME",
      Date: "DATETIME",
      Timestamp: "TIMESTAMP",
      "byte[]": "BLOB",
      UUID: "VARCHAR(36)",
    };

    // Mapeo específico para SQL Server
    const sqlserverMapping: Record<string, string> = {
      String: "NVARCHAR(255)",
      Long: "BIGINT",
      Integer: "INT",
      Short: "SMALLINT",
      int: "INT",
      Boolean: "BIT",
      boolean: "BIT",
      Double: "FLOAT",
      double: "FLOAT",
      Float: "REAL",
      float: "REAL",
      BigDecimal: "DECIMAL(19,2)",
      LocalDate: "DATE",
      LocalDateTime: "DATETIME2",
      LocalTime: "TIME",
      Date: "DATETIME2",
      Timestamp: "DATETIME2",
      "byte[]": "VARBINARY(MAX)",
      UUID: "UNIQUEIDENTIFIER",
    };

    // Seleccionar mapeo según tipo de BD
    let typeMapping: Record<string, string>;
    switch (dbType.toLowerCase()) {
      case "mysql":
        typeMapping = mysqlMapping;
        break;
      case "sqlserver":
        typeMapping = sqlserverMapping;
        break;
      case "postgresql":
      case "h2":
      default:
        typeMapping = postgresMapping;
        break;
    }

    return typeMapping[javaType] || "VARCHAR(255)";
  }

  /**
   * Genera datos de ejemplo
   */
  private generateSampleData(entities: SpringBootEntity[]): string {
    let sql = "-- Sample Data\n\n";

    for (const entity of entities) {
      const tableName = entity.tableName;
      const sampleRecords = this.generateSampleRecords(entity);

      for (const record of sampleRecords) {
        sql += `INSERT INTO ${tableName} (${Object.keys(record).join(
          ", "
        )}) VALUES (${Object.values(record)
          .map((v) => `'${v}'`)
          .join(", ")});\n`;
      }
      sql += "\n";
    }

    return sql;
  }

  /**
   * Genera registros de ejemplo para una entidad
   */
  private generateSampleRecords(
    entity: SpringBootEntity
  ): Array<Record<string, string | number | boolean>> {
    const records: Array<Record<string, string | number | boolean>> = [];
    const recordCount = 3; // Generar 3 registros por tabla

    for (let i = 1; i <= recordCount; i++) {
      const record: Record<string, string | number | boolean> = {};

      for (const field of entity.fields) {
        if (field.primaryKey) {
          record[field.columnName] = i;
        } else if (field.foreignKey) {
          // Asumir que hay registros con IDs 1, 2, 3 en las tablas referenciadas
          record[field.columnName] =
            Math.floor(Math.random() * recordCount) + 1;
        } else {
          record[field.columnName] = this.generateSampleValue(field.type, i);
        }
      }

      records.push(record);
    }

    return records;
  }

  /**
   * Genera un valor de ejemplo basado en el tipo
   */
  private generateSampleValue(
    type: string,
    index: number
  ): string | number | boolean {
    switch (type.toLowerCase()) {
      case "string":
        return `Sample ${type} ${index}`;
      case "long":
      case "integer":
      case "int":
        return index * 10;
      case "boolean":
        return index % 2 === 0;
      case "localdatetime":
        return "2024-01-01T10:00:00";
      case "bigdecimal":
        return (index * 10.5).toFixed(2);
      default:
        return `Sample ${index}`;
    }
  }

  /**
   * Genera el código Java completo
   */
  public generateJavaCode(): Record<string, string> {
    const code: Record<string, string> = {};
    const generated = this.generateCode();

    // Generar entidades
    for (const entity of generated.entities) {
      code[
        `src/main/java/${entity.packageName.replace(/\./g, "/")}/${
          entity.className
        }.java`
      ] = this.generateEntityCode(entity);

      // Generar clase IdClass si tiene PK compuesta
      const primaryKeyFields = entity.fields.filter((f) => f.primaryKey);
      if (primaryKeyFields.length > 1) {
        code[
          `src/main/java/${entity.packageName.replace(/\./g, "/")}/${
            entity.className
          }Id.java`
        ] = this.generateIdClassCode(entity, primaryKeyFields);
      }
    }

    // Generar DTOs
    for (const dto of generated.dtos) {
      code[
        `src/main/java/${dto.packageName.replace(/\./g, "/")}/${
          dto.className
        }.java`
      ] = this.generateDTOCode(dto);
    }

    // Generar Repositories
    for (const repository of generated.repositories) {
      code[
        `src/main/java/${repository.packageName.replace(/\./g, "/")}/${
          repository.className
        }.java`
      ] = this.generateRepositoryCode(repository);
    }

    // Generar Services
    for (const service of generated.services) {
      code[
        `src/main/java/${service.packageName.replace(/\./g, "/")}/${
          service.className
        }.java`
      ] = this.generateServiceCode(service);
    }

    // Generar Controllers
    for (const controller of generated.controllers) {
      code[
        `src/main/java/${controller.packageName.replace(/\./g, "/")}/${
          controller.className
        }.java`
      ] = this.generateControllerCode(controller, generated.entities);
    }

    // Archivos de configuración
    code["src/main/resources/application.properties"] =
      generated.applicationProperties;
    code["pom.xml"] = generated.pomXml;

    // Flyway migration scripts (soporte incremental)
    // 1. Primero, escribir las migraciones EXISTENTES (V1, V2, etc.)
    if (this.existingMigrationFiles && this.existingMigrationFiles.length > 0) {
      console.log(
        `📝 Incluyendo ${this.existingMigrationFiles.length} migraciones históricas en el backend`
      );
      for (const migration of this.existingMigrationFiles) {
        code[`src/main/resources/db/migration/${migration.fileName}`] =
          migration.sql;
        console.log(`   ✅ ${migration.fileName}`);
      }
    }

    // 2. Luego, escribir las migraciones NUEVAS generadas en esta sesión
    if (generated.flywayMigrations && generated.flywayMigrations.length > 0) {
      console.log(
        `📝 Incluyendo ${generated.flywayMigrations.length} migraciones nuevas en el backend`
      );
      for (const migration of generated.flywayMigrations) {
        code[`src/main/resources/db/migration/${migration.fileName}`] =
          migration.sql;
        console.log(`   ✅ ${migration.fileName}`);
      }
    } else if (
      !this.existingMigrationFiles ||
      this.existingMigrationFiles.length === 0
    ) {
      // Fallback: usar el método legacy si no hay migraciones incrementales
      code["src/main/resources/db/migration/V1__initial_schema.sql"] =
        generated.flywayMigration;
    }

    code["lombok.config"] = this.generateLombokConfig();

    // Scripts de inicialización de base de datos - ELIMINADOS por solicitud del usuario
    // code["init-database.sql"] = generated.databaseInitScript;

    // Generar README con instrucciones de base de datos - ELIMINADO por solicitud del usuario
    // code["DATABASE_SETUP.md"] = generated.databaseSetupGuide;

    return code;
  }

  /**
   * Genera código Java para una entidad
   */
  private generateEntityCode(entity: SpringBootEntity): string {
    let code = `package ${entity.packageName};\n\n`;

    // Detectar si tiene clave primaria compuesta
    const primaryKeyFields = entity.fields.filter((f) => f.primaryKey);
    const hasCompositePK = primaryKeyFields.length > 1;

    // Imports
    for (const imp of entity.imports) {
      code += `import ${imp};\n`;
    }
    code += `import lombok.Data;\n`;
    code += `import lombok.NoArgsConstructor;\n`;
    code += `import lombok.AllArgsConstructor;\n`;

    // Si tiene PK compuesta, agregar import de IdClass
    if (hasCompositePK) {
      code += `import jakarta.persistence.IdClass;\n`;
    }
    code += `\n`;

    // Anotaciones de clase
    for (const annotation of entity.annotations) {
      code += `${annotation}\n`;
    }

    // Agregar @IdClass si tiene PK compuesta
    if (hasCompositePK) {
      code += `@IdClass(${entity.className}Id.class)\n`;
    }

    code += `@Data\n`;
    code += `@NoArgsConstructor\n`;
    code += `@AllArgsConstructor\n`;

    code += `public class ${entity.className} {\n\n`;

    // Campos
    for (const field of entity.fields) {
      code += `    ${field.annotations.join("\n    ")}\n`;
      code += `    private ${field.type} ${field.name};\n\n`;
    }

    code += `}\n`;
    return code;
  }

  /**
   * Genera código Java para una clase IdClass (clave primaria compuesta)
   */
  private generateIdClassCode(
    entity: SpringBootEntity,
    primaryKeyFields: SpringBootField[]
  ): string {
    let code = `package ${entity.packageName};\n\n`;

    // Imports necesarios
    code += `import java.io.Serializable;\n`;
    code += `import java.util.Objects;\n`;
    code += `import lombok.Data;\n`;
    code += `import lombok.NoArgsConstructor;\n`;
    code += `import lombok.AllArgsConstructor;\n`;

    // Agregar imports para tipos de datos de los campos PK
    const uniqueTypes = new Set<string>();
    for (const field of primaryKeyFields) {
      if (
        field.type === "LocalDateTime" ||
        field.type === "LocalDate" ||
        field.type === "LocalTime"
      ) {
        uniqueTypes.add(`java.time.${field.type}`);
      } else if (field.type === "BigDecimal") {
        uniqueTypes.add("java.math.BigDecimal");
      } else if (field.type === "UUID") {
        uniqueTypes.add("java.util.UUID");
      }
    }

    for (const imp of uniqueTypes) {
      code += `import ${imp};\n`;
    }
    code += `\n`;

    code += `@Data\n`;
    code += `@NoArgsConstructor\n`;
    code += `@AllArgsConstructor\n`;
    code += `public class ${entity.className}Id implements Serializable {\n\n`;
    code += `    private static final long serialVersionUID = 1L;\n\n`;

    // Campos de la PK (solo los campos marcados como @Id)
    for (const field of primaryKeyFields) {
      code += `    private ${field.type} ${field.name};\n`;
    }

    code += `}\n`;
    return code;
  }

  /**
   * Genera código Java para un DTO
   */
  private generateDTOCode(dto: SpringBootDTO): string {
    let code = `package ${dto.packageName};\n\n`;

    // Imports
    for (const imp of dto.imports) {
      code += `import ${imp};\n`;
    }
    code += `import lombok.Data;\n`;
    code += `import lombok.NoArgsConstructor;\n`;
    code += `import lombok.AllArgsConstructor;\n\n`;

    code += `@Data\n`;
    code += `@NoArgsConstructor\n`;
    code += `@AllArgsConstructor\n`;
    code += `public class ${dto.className} {\n\n`;

    // Campos
    for (const field of dto.fields) {
      code += `    private ${field.type} ${field.name};\n`;
    }

    code += `}\n`;
    return code;
  }

  /**
   * Genera código Java para un Mapper
   */
  private generateMapperCode(mapper: SpringBootMapper): string {
    let code = `package ${mapper.packageName};\n\n`;
    code += `import ${this.basePackage}.entity.${mapper.entityClass};\n`;
    code += `import ${this.basePackage}.dto.${mapper.dtoClass};\n`;
    code += `import java.util.List;\n`;
    code += `import java.util.stream.Collectors;\n\n`;

    code += `public class ${mapper.className} {\n\n`;

    code += `    public static ${mapper.dtoClass} toDTO(${mapper.entityClass} entity) {\n`;
    code += `        if (entity == null) return null;\n`;
    code += `        ${mapper.dtoClass} dto = new ${mapper.dtoClass}();\n`;
    code += `        // TODO: Map entity fields to DTO\n`;
    code += `        return dto;\n`;
    code += `    }\n\n`;

    code += `    public static ${mapper.entityClass} toEntity(${mapper.dtoClass} dto) {\n`;
    code += `        if (dto == null) return null;\n`;
    code += `        ${mapper.entityClass} entity = new ${mapper.entityClass}();\n`;
    code += `        // TODO: Map DTO fields to entity\n`;
    code += `        return entity;\n`;
    code += `    }\n\n`;

    code += `    public static List<${mapper.dtoClass}> toDTOList(List<${mapper.entityClass}> entities) {\n`;
    code += `        return entities.stream()\n`;
    code += `            .map(${mapper.className}::toDTO)\n`;
    code += `            .collect(Collectors.toList());\n`;
    code += `    }\n\n`;

    code += `    public static List<${mapper.entityClass}> toEntityList(List<${mapper.dtoClass}> dtos) {\n`;
    code += `        return dtos.stream()\n`;
    code += `            .map(${mapper.className}::toEntity)\n`;
    code += `            .collect(Collectors.toList());\n`;
    code += `    }\n\n`;

    code += `    public static void updateEntityFromDTO(${mapper.dtoClass} dto, ${mapper.entityClass} entity) {\n`;
    code += `        if (dto == null || entity == null) return;\n`;
    code += `        // TODO: Update entity fields from DTO\n`;
    code += `    }\n\n`;

    code += `}\n`;
    return code;
  }

  /**
   * Genera código Java para un Repository
   */
  private generateRepositoryCode(repository: SpringBootRepository): string {
    let code = `package ${repository.packageName};\n\n`;
    code += `import ${this.basePackage}.entity.${repository.entityClass};\n`;

    // Si el tipo de ID es una clase Id compuesta, importarla
    const idType = repository.idType || "Long";
    if (idType.endsWith("Id") && idType !== "Long") {
      code += `import ${this.basePackage}.entity.${idType};\n`;
    }

    code += `import org.springframework.data.jpa.repository.JpaRepository;\n`;
    code += `import org.springframework.stereotype.Repository;\n`;
    code += `import java.util.Optional;\n`;
    code += `import java.util.List;\n\n`;

    code += `@Repository\n`;
    code += `public interface ${repository.className} extends JpaRepository<${repository.entityClass}, ${idType}> {\n\n`;
    code += `    // Custom query methods can be added here\n\n`;
    code += `}\n`;
    return code;
  }

  /**
   * Genera código Java para un Service
   */
  private generateServiceCode(service: SpringBootService): string {
    const idType = service.idType || "Long";

    let code = `package ${service.packageName};\n\n`;
    code += `import ${this.basePackage}.entity.${service.entityClass};\n`;

    // Si el tipo de ID es una clase Id compuesta, importarla
    if (idType.endsWith("Id") && idType !== "Long") {
      code += `import ${this.basePackage}.entity.${idType};\n`;
    }

    code += `import ${this.basePackage}.repository.${service.repositoryClass};\n`;
    code += `import org.springframework.beans.factory.annotation.Autowired;\n`;
    code += `import org.springframework.stereotype.Service;\n`;
    code += `import java.util.List;\n`;
    code += `import java.util.Optional;\n\n`;

    code += `@Service\n`;
    code += `public class ${service.className} {\n\n`;

    code += `    @Autowired\n`;
    code += `    private ${service.repositoryClass} repository;\n\n`;

    code += `    public List<${service.entityClass}> findAll() {\n`;
    code += `        return repository.findAll();\n`;
    code += `    }\n\n`;

    code += `    public Optional<${service.entityClass}> findById(${idType} id) {\n`;
    code += `        return repository.findById(id);\n`;
    code += `    }\n\n`;

    code += `    public ${service.entityClass} save(${service.entityClass} entity) {\n`;
    code += `        return repository.save(entity);\n`;
    code += `    }\n\n`;

    code += `    public void deleteById(${idType} id) {\n`;
    code += `        repository.deleteById(id);\n`;
    code += `    }\n\n`;

    code += `}\n`;
    return code;
  }

  /**
   * Genera código Java para un Controller
   */
  private generateControllerCode(
    controller: SpringBootController,
    entities: SpringBootEntity[]
  ): string {
    const idType = controller.idType || "Long";

    // Encontrar la entidad correspondiente a este controller
    const entity = entities.find((e) => e.className === controller.entityClass);
    const fkFields = entity
      ? entity.fields.filter(
          (f) => f.foreignKey && f.foreignKey.relationship !== "ManyToMany"
        )
      : [];

    let code = `package ${controller.packageName};\n\n`;
    code += `import ${this.basePackage}.entity.${controller.entityClass};\n`;
    code += `import ${this.basePackage}.dto.${controller.dtoClass};\n`;
    code += `import ${this.basePackage}.service.${controller.serviceClass};\n`;

    // Import entidades referenciadas (para FKs)
    for (const fkField of fkFields) {
      const referencedEntity = fkField.foreignKey!.referencedEntity;
      code += `import ${this.basePackage}.entity.${referencedEntity};\n`;
    }

    // Import repositorios para FKs
    for (const fkField of fkFields) {
      const referencedEntity = fkField.foreignKey!.referencedEntity;
      code += `import ${this.basePackage}.repository.${referencedEntity}Repository;\n`;
    }

    // Import IdClass if composite PK
    if (idType.endsWith("Id") && idType !== "Long") {
      code += `import ${this.basePackage}.entity.${idType};\n`;
    }

    code += `import org.springframework.beans.factory.annotation.Autowired;\n`;
    code += `import org.springframework.http.ResponseEntity;\n`;
    code += `import org.springframework.web.bind.annotation.*;\n`;
    code += `import java.util.List;\n`;
    code += `import java.util.Optional;\n`;
    code += `import java.util.stream.Collectors;\n`;
    code += `import org.springframework.beans.BeanUtils;\n\n`;

    code += `@RestController\n`;
    code += `@RequestMapping("/api")\n`;
    code += `public class ${controller.className} {\n\n`;

    code += `    @Autowired\n`;
    code += `    private ${controller.serviceClass} service;\n\n`;

    // Autowire repositorios para FKs
    for (const fkField of fkFields) {
      const referencedEntity = fkField.foreignKey!.referencedEntity;
      const repoVarName =
        referencedEntity.charAt(0).toLowerCase() + referencedEntity.slice(1);
      code += `    @Autowired\n`;
      code += `    private ${referencedEntity}Repository ${repoVarName}Repository;\n\n`;
    }

    // Endpoints
    for (const endpoint of controller.endpoints) {
      const mappingAnnotation = this.getMappingAnnotation(endpoint.method);
      code += `    @${mappingAnnotation}("${endpoint.path}")\n`;
      code += `    public ${endpoint.returnType} ${
        endpoint.methodName
      }(${endpoint.parameters.join(", ")}) {\n`;

      switch (endpoint.methodName) {
        case "findAll":
          code += `        List<${controller.entityClass}> entities = service.findAll();\n`;
          code += `        List<${controller.dtoClass}> dtos = entities.stream()\n`;
          code += `            .map(this::convertToDTO)\n`;
          code += `            .collect(Collectors.toList());\n`;
          code += `        return dtos;\n`;
          break;
        case "findById":
          code += `        Optional<${controller.entityClass}> entity = service.findById(id);\n`;
          code += `        if (entity.isPresent()) {\n`;
          code += `            ${controller.dtoClass} dto = convertToDTO(entity.get());\n`;
          code += `            return ResponseEntity.ok(dto);\n`;
          code += `        } else {\n`;
          code += `            return ResponseEntity.notFound().build();\n`;
          code += `        }\n`;
          break;
        case "create":
          code += `        ${controller.entityClass} entity = convertToEntity(dto);\n`;
          code += `        ${controller.entityClass} savedEntity = service.save(entity);\n`;
          code += `        ${controller.dtoClass} savedDto = convertToDTO(savedEntity);\n`;
          code += `        return ResponseEntity.ok(savedDto);\n`;
          break;
        case "update":
          code += `        Optional<${controller.entityClass}> existingEntity = service.findById(id);\n`;
          code += `        if (!existingEntity.isPresent()) {\n`;
          code += `            return ResponseEntity.notFound().build();\n`;
          code += `        }\n`;
          code += `        ${controller.entityClass} entity = existingEntity.get();\n`;
          code += `        // Update entity fields from DTO (excluding ID)\n`;
          code += `        updateEntityFromDTO(dto, entity);\n`;
          code += `        ${controller.entityClass} updatedEntity = service.save(entity);\n`;
          code += `        ${controller.dtoClass} updatedDto = convertToDTO(updatedEntity);\n`;
          code += `        return ResponseEntity.ok(updatedDto);\n`;
          break;
        case "delete":
          code += `        if (!service.findById(id).isPresent()) {\n`;
          code += `            return ResponseEntity.notFound().build();\n`;
          code += `        }\n`;
          code += `        service.deleteById(id);\n`;
          code += `        return ResponseEntity.noContent().build();\n`;
          break;
      }

      code += `    }\n\n`;
    }

    // Helper methods for conversion
    code += `    private ${controller.dtoClass} convertToDTO(${controller.entityClass} entity) {\n`;
    code += `        if (entity == null) return null;\n`;
    code += `        ${controller.dtoClass} dto = new ${controller.dtoClass}();\n`;

    // Si hay FKs, ignorarlas en copyProperties
    if (fkFields.length > 0) {
      const ignoreProps = fkFields.map((f) => `"${f.name}"`).join(", ");
      code += `        BeanUtils.copyProperties(entity, dto, ${ignoreProps});\n`;
    } else {
      code += `        BeanUtils.copyProperties(entity, dto);\n`;
    }

    // Manejar FKs manualmente: extraer solo el ID de la entidad referenciada
    for (const fkField of fkFields) {
      const fieldName = fkField.name; // ej: "categoriaId"
      // Capitalizar solo la primera letra, manteniendo el resto igual (camelCase → PascalCase)
      const getterName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1); // "categoriaId" → "CategoriaId"
      const setterName = getterName; // mismo nombre para getter y setter

      code += `        // Manejar FK: ${fieldName}\n`;
      code += `        if (entity.get${getterName}() != null) {\n`;
      code += `            dto.set${setterName}(entity.get${getterName}().getId());\n`;
      code += `        }\n`;
    }

    code += `        return dto;\n`;
    code += `    }\n\n`;

    code += `    private ${controller.entityClass} convertToEntity(${controller.dtoClass} dto) {\n`;
    code += `        if (dto == null) return null;\n`;
    code += `        ${controller.entityClass} entity = new ${controller.entityClass}();\n`;

    // Ignorar FKs en copyProperties para evitar error de tipo
    if (fkFields.length > 0) {
      const ignoreProps = fkFields.map((f) => `"${f.name}"`).join(", ");
      code += `        BeanUtils.copyProperties(dto, entity, ${ignoreProps});\n`;
    } else {
      code += `        BeanUtils.copyProperties(dto, entity);\n`;
    }

    // Manejar FKs manualmente
    for (const fkField of fkFields) {
      const referencedEntity = fkField.foreignKey!.referencedEntity; // ej: "Categoria"
      const repoVarName =
        referencedEntity.charAt(0).toLowerCase() + referencedEntity.slice(1); // ej: "categoria"
      const fieldName = fkField.name; // ej: "categoriaId"
      // Capitalizar solo la primera letra, manteniendo el resto igual (camelCase → PascalCase)
      const getterName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1); // "categoriaId" → "CategoriaId"
      const setterName = getterName; // mismo nombre

      code += `        // Manejar FK: ${fieldName}\n`;
      code += `        if (dto.get${getterName}() != null) {\n`;
      code += `            ${referencedEntity} ${fieldName}Obj = ${repoVarName}Repository.findById(dto.get${getterName}())\n`;
      code += `                .orElseThrow(() -> new RuntimeException("${referencedEntity} not found with id: " + dto.get${getterName}()));\n`;
      code += `            entity.set${setterName}(${fieldName}Obj);\n`;
      code += `        }\n`;
    }

    code += `        return entity;\n`;
    code += `    }\n\n`;

    code += `    private void updateEntityFromDTO(${controller.dtoClass} dto, ${controller.entityClass} entity) {\n`;
    code += `        if (dto == null || entity == null) return;\n`;

    // Ignorar ID y FKs en copyProperties para UPDATE
    // El ID no debe cambiar en un UPDATE, y los FKs se manejan manualmente
    const ignorePropsArray = ["id"]; // Siempre ignorar el ID
    if (fkFields.length > 0) {
      ignorePropsArray.push(...fkFields.map((f) => f.name));
    }
    const ignorePropsStr = ignorePropsArray.map((p) => `"${p}"`).join(", ");
    code += `        BeanUtils.copyProperties(dto, entity, ${ignorePropsStr});\n`;

    // Manejar FKs manualmente para UPDATE también
    for (const fkField of fkFields) {
      const referencedEntity = fkField.foreignKey!.referencedEntity; // ej: "Categoria"
      const repoVarName =
        referencedEntity.charAt(0).toLowerCase() + referencedEntity.slice(1); // ej: "categoria"
      const fieldName = fkField.name; // ej: "categoriaId"
      // Capitalizar solo la primera letra, manteniendo el resto igual (camelCase → PascalCase)
      const getterName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1); // "categoriaId" → "CategoriaId"
      const setterName = getterName; // mismo nombre

      code += `        // Manejar FK: ${fieldName}\n`;
      code += `        if (dto.get${getterName}() != null) {\n`;
      code += `            ${referencedEntity} ${fieldName}Obj = ${repoVarName}Repository.findById(dto.get${getterName}())\n`;
      code += `                .orElseThrow(() -> new RuntimeException("${referencedEntity} not found with id: " + dto.get${getterName}()));\n`;
      code += `            entity.set${setterName}(${fieldName}Obj);\n`;
      code += `        }\n`;
    }

    code += `    }\n\n`;

    code += `}\n`;
    return code;
  }

  // Métodos auxiliares

  private mapSQLTypeToJavaType(sqlType: string): string {
    const upperType = sqlType.toUpperCase().trim();

    // Tipos numéricos enteros
    if (
      upperType.includes("BIGINT") ||
      upperType.includes("INT8") ||
      (upperType.includes("NUMBER") && upperType.includes("(30)")) ||
      (upperType.includes("NUMBER") && upperType.includes("(19)"))
    ) {
      return "Long";
    }

    if (
      upperType.includes("INTEGER") ||
      upperType.includes("INT") ||
      upperType.includes("INT4") ||
      (upperType.includes("NUMBER") && upperType.includes("(10)")) ||
      (upperType.includes("NUMBER") && upperType.includes("(5)"))
    ) {
      return "Integer";
    }

    if (
      upperType.includes("SMALLINT") ||
      upperType.includes("INT2") ||
      (upperType.includes("NUMBER") && upperType.includes("(5)"))
    ) {
      return "Short";
    }

    // Tipos numéricos decimales
    if (
      upperType.includes("DECIMAL") ||
      upperType.includes("NUMERIC") ||
      (upperType.includes("NUMBER") && upperType.includes(",")) ||
      upperType.includes("FLOAT") ||
      upperType.includes("DOUBLE") ||
      upperType.includes("REAL")
    ) {
      return "BigDecimal";
    }

    // Tipos de texto
    if (
      upperType.includes("VARCHAR") ||
      upperType.includes("CHAR") ||
      upperType.includes("TEXT") ||
      upperType.includes("CLOB") ||
      upperType.includes("NVARCHAR")
    ) {
      return "String";
    }

    // Tipos booleanos
    if (
      upperType.includes("BOOLEAN") ||
      upperType.includes("BIT") ||
      upperType.includes("BOOL") ||
      upperType === "CHAR(1)" ||
      upperType === "VARCHAR(1)"
    ) {
      return "Boolean";
    }

    // Tipos de fecha y hora
    if (
      upperType.includes("TIMESTAMP") ||
      upperType.includes("DATETIME") ||
      upperType.includes("TIMESTAMPZ")
    ) {
      return "LocalDateTime";
    }

    if (upperType.includes("DATE")) {
      return "LocalDate";
    }

    if (upperType.includes("TIME")) {
      return "LocalTime";
    }

    // Tipos binarios
    if (
      upperType.includes("BLOB") ||
      upperType.includes("BYTEA") ||
      upperType.includes("BINARY")
    ) {
      return "byte[]";
    }

    // UUID
    if (upperType.includes("UUID")) {
      return "UUID";
    }

    // Default - String para tipos desconocidos
    console.warn(
      `Tipo SQL desconocido: ${sqlType}, usando String como fallback`
    );
    return "String";
  }

  private determineRelationshipType(
    table: PhysicalTable,
    fk: any,
    column: PhysicalColumn
  ): "OneToOne" | "OneToMany" | "ManyToOne" | "ManyToMany" {
    // Implementación completa basada en restricciones de BD y cardinalidad

    // 1. Si la columna FK es parte de la primary key → OneToOne
    if (table.primaryKey.includes(column.name)) {
      return "OneToOne";
    }

    // 2. Si hay una unique constraint que incluye esta columna FK → OneToOne
    const hasUniqueConstraint = table.uniqueConstraints.some((constraint) =>
      constraint.columns.includes(column.name)
    );
    if (hasUniqueConstraint) {
      return "OneToOne";
    }

    // 3. Si la columna FK es nullable → ManyToOne (0..1 -> *)
    // Si no es nullable → ManyToOne (1 -> *)
    // En ambos casos, desde el lado de la entidad propietaria es ManyToOne
    return "ManyToOne";
  }

  private toPascalCase(str: string): string {
    if (!str || str.length === 0) return str;

    // Limpiar caracteres especiales y espacios
    const cleanStr = str.replace(/[^a-zA-Z0-9_]/g, "_");

    // Si ya está en PascalCase (primera letra mayúscula), devolver como está
    if (cleanStr.charAt(0) === cleanStr.charAt(0).toUpperCase()) {
      return cleanStr;
    }

    return cleanStr
      .split(/[_-]/)
      .filter((word) => word.length > 0) // Filtrar palabras vacías
      .map((word) => {
        // Manejar números y letras juntos (ej: user2 -> User2)
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join("");
  }

  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    if (!pascal || pascal.length === 0) return pascal;

    // Si ya está en camelCase (primera letra minúscula), devolver como está
    if (pascal.charAt(0) === pascal.charAt(0).toLowerCase()) {
      return pascal;
    }

    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  private isAuditField(columnName: string): boolean {
    const lowerName = columnName.toLowerCase();

    // Patrones comunes de campos de auditoría
    const auditPatterns = [
      /^created_at$/,
      /^updated_at$/,
      /^createdAt$/,
      /^updatedAt$/,
      /^fecha_creacion$/,
      /^fecha_actualizacion$/,
      /^fechaCreacion$/,
      /^fechaActualizacion$/,
      /^created_date$/,
      /^updated_date$/,
      /^createdDate$/,
      /^updatedDate$/,
      /^created_time$/,
      /^updated_time$/,
      /^createdTime$/,
      /^updatedTime$/,
      /^created_on$/,
      /^updated_on$/,
      /^createdOn$/,
      /^updatedOn$/,
      /^date_created$/,
      /^date_updated$/,
      /^dateCreated$/,
      /^dateUpdated$/,
      /^timestamp_created$/,
      /^timestamp_updated$/,
      /^timestampCreated$/,
      /^timestampUpdated$/,
    ];

    return auditPatterns.some((pattern) => pattern.test(lowerName));
  }

  /**
   * Genera script SQL para crear la base de datos
   * IMPORTANTE: Este script debe ejecutarse ANTES de iniciar la aplicación Spring Boot
   */
  private generateDatabaseInitScript(): string {
    const dbName = this.databaseConfig?.database || this.projectName;
    const dbType = this.databaseConfig?.type || "postgresql";

    let script = `-- ================================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS
-- ================================================================
-- IMPORTANTE: Este script debe ejecutarse ANTES de iniciar la aplicación.
-- La aplicación Spring Boot NO puede crear la base de datos automáticamente.
-- Flyway solo puede crear ESQUEMAS dentro de una base de datos existente.
-- ================================================================

`;

    switch (dbType.toLowerCase()) {
      case "postgresql":
        script += `-- Para PostgreSQL
-- Ejecutar como superusuario (postgres):
-- psql -U postgres -f init-database.sql

-- Crear base de datos si no existe
SELECT 'CREATE DATABASE "${dbName}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbName}')\\gexec

-- Conectar a la base de datos
\\c ${dbName}

-- Crear esquema público si no existe (generalmente ya existe)
CREATE SCHEMA IF NOT EXISTS public;

-- Dar permisos al usuario de la aplicación (ajustar según necesidad)
-- GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO your_app_user;
-- GRANT ALL PRIVILEGES ON SCHEMA public TO your_app_user;

-- Verificación
SELECT current_database() as database_name, 
       version() as postgresql_version;
`;
        break;

      case "mysql":
      case "mariadb":
        script += `-- Para MySQL/MariaDB
-- Ejecutar como root:
-- mysql -u root -p < init-database.sql

-- Crear base de datos si no existe
CREATE DATABASE IF NOT EXISTS \`${dbName}\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Seleccionar base de datos
USE \`${dbName}\`;

-- Crear usuario de aplicación (opcional, ajustar contraseña)
-- CREATE USER IF NOT EXISTS 'app_user'@'localhost' IDENTIFIED BY 'your_password';
-- GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO 'app_user'@'localhost';
-- FLUSH PRIVILEGES;

-- Verificación
SELECT DATABASE() as current_database,
       VERSION() as mysql_version;
`;
        break;

      case "sqlserver":
      case "mssql":
        script += `-- Para SQL Server
-- Ejecutar con SQL Server Management Studio o sqlcmd:
-- sqlcmd -S localhost -U sa -P YourPassword -i init-database.sql

-- Crear base de datos si no existe
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${dbName}')
BEGIN
    CREATE DATABASE [${dbName}];
END
GO

-- Usar la base de datos
USE [${dbName}];
GO

-- Crear esquema si no existe (opcional)
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo')
BEGIN
    EXEC('CREATE SCHEMA dbo');
END
GO

-- Verificación
SELECT DB_NAME() as current_database,
       @@VERSION as sqlserver_version;
GO
`;
        break;

      case "h2":
        script += `-- Para H2 Database
-- H2 crea automáticamente la base de datos en memoria o en archivo
-- No requiere script de inicialización previo

-- La URL de conexión en application.properties determina la creación:
-- jdbc:h2:mem:${dbName} (en memoria, se crea automáticamente)
-- jdbc:h2:file:./data/${dbName} (en archivo, se crea automáticamente)

-- Nota: H2 es ideal para desarrollo y testing, no para producción
`;
        break;

      default:
        script += `-- Base de datos: ${dbType}
-- Ajustar según el motor de base de datos específico

CREATE DATABASE IF NOT EXISTS ${dbName};
`;
    }

    script += `
-- ================================================================
-- DESPUÉS DE EJECUTAR ESTE SCRIPT:
-- ================================================================
-- 1. Verificar que la base de datos fue creada exitosamente
-- 2. Ajustar el archivo application.properties con las credenciales correctas
-- 3. Iniciar la aplicación Spring Boot
-- 4. Flyway ejecutará las migraciones automáticamente
-- ================================================================
`;

    return script;
  }

  /**
   * Genera guía de configuración de base de datos (DATABASE_SETUP.md)
   */
  private generateDatabaseSetupGuide(): string {
    const dbName = this.databaseConfig?.database || this.projectName;
    const dbType = this.databaseConfig?.type || "postgresql";
    const dbHost = this.databaseConfig?.host || "localhost";
    const dbPort = this.databaseConfig?.port || this.getDefaultPort(dbType);
    const dbUser = this.databaseConfig?.username || "postgres";

    return `# Guía de Configuración de Base de Datos

## ⚠️ PASO CRÍTICO: Crear Base de Datos ANTES de Iniciar la Aplicación

### Problema Común

Si ves este error al iniciar la aplicación:

\`\`\`
org.postgresql.util.PSQLException: FATAL: database "${dbName}" does not exist
SQL State: 3D000
\`\`\`

**Causa**: La aplicación Spring Boot NO puede crear la base de datos. Flyway solo puede crear **esquemas** dentro de una base de datos existente, NO la base de datos misma.

**Solución**: Ejecutar el script \`init-database.sql\` ANTES de iniciar la aplicación.

---

## Configuración por Motor de Base de Datos

### PostgreSQL

#### Opción 1: Usando el script SQL

\`\`\`bash
# Ejecutar como superusuario
psql -U postgres -f init-database.sql

# O paso por paso:
psql -U postgres
CREATE DATABASE "${dbName}";
\\q
\`\`\`

#### Opción 2: Usando psql interactivo

\`\`\`bash
# Conectar como superusuario
psql -U postgres

# Crear base de datos
CREATE DATABASE "${dbName}";

# Verificar
\\l

# Salir
\\q
\`\`\`

#### Opción 3: Usando pgAdmin

1. Abrir pgAdmin
2. Conectar al servidor PostgreSQL
3. Click derecho en "Databases" → "Create" → "Database"
4. Nombre: \`${dbName}\`
5. Owner: \`${dbUser}\`
6. Click "Save"

#### Verificar conexión

\`\`\`bash
psql -U ${dbUser} -d ${dbName} -h ${dbHost} -p ${dbPort}
\`\`\`

---

### MySQL/MariaDB

#### Opción 1: Usando el script SQL

\`\`\`bash
# Ejecutar como root
mysql -u root -p < init-database.sql

# O paso por paso:
mysql -u root -p
CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;
\`\`\`

#### Opción 2: Usando MySQL Workbench

1. Abrir MySQL Workbench
2. Conectar al servidor MySQL
3. Click en el icono de "Create Schema"
4. Nombre: \`${dbName}\`
5. Charset: \`utf8mb4\`
6. Collation: \`utf8mb4_unicode_ci\`
7. Click "Apply"

#### Verificar conexión

\`\`\`bash
mysql -u ${dbUser} -p -h ${dbHost} -P ${dbPort} ${dbName}
\`\`\`

---

### SQL Server

#### Opción 1: Usando sqlcmd

\`\`\`bash
# Windows
sqlcmd -S ${dbHost},${dbPort} -U ${dbUser} -P YourPassword -i init-database.sql

# Linux (con mssql-tools)
sqlcmd -S ${dbHost},${dbPort} -U ${dbUser} -P YourPassword -i init-database.sql
\`\`\`

#### Opción 2: Usando SQL Server Management Studio (SSMS)

1. Abrir SSMS
2. Conectar al servidor SQL Server
3. Click derecho en "Databases" → "New Database"
4. Nombre: \`${dbName}\`
5. Click "OK"

#### Verificar conexión

\`\`\`bash
sqlcmd -S ${dbHost},${dbPort} -U ${dbUser} -P YourPassword -Q "SELECT DB_NAME()"
\`\`\`

---

### H2 Database (En Memoria)

**No requiere creación manual**. H2 crea automáticamente la base de datos al iniciar la aplicación.

#### Configuración en application.properties

\`\`\`properties
# H2 en memoria (para desarrollo)
spring.datasource.url=jdbc:h2:mem:${dbName}
spring.datasource.driverClassName=org.h2.Driver
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console

# H2 en archivo (para persistencia)
# spring.datasource.url=jdbc:h2:file:./data/${dbName}
\`\`\`

#### Acceder a la consola H2

1. Iniciar la aplicación
2. Ir a: \`http://localhost:8080/h2-console\`
3. JDBC URL: \`jdbc:h2:mem:${dbName}\`
4. Username: \`sa\`
5. Password: (dejar en blanco)

---

## Configuración de application.properties

Archivo: \`src/main/resources/application.properties\`

\`\`\`properties
# Configuración de base de datos
spring.datasource.url=jdbc:${dbType}://${dbHost}:${dbPort}/${dbName}
spring.datasource.username=${dbUser}
spring.datasource.password=YOUR_PASSWORD_HERE

# IMPORTANTE: Cambiar el password por el valor real

# Pool de conexiones
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=5

# Flyway (migraciones automáticas)
spring.flyway.enabled=true
spring.flyway.baseline-on-migrate=true
spring.flyway.create-schemas=true
\`\`\`

---

## Orden de Ejecución

### ✅ Orden Correcto

1. **Crear base de datos** (usando \`init-database.sql\` o consola)
2. **Configurar application.properties** (credenciales correctas)
3. **Iniciar aplicación Spring Boot**
4. **Flyway ejecuta migraciones automáticamente**

### ❌ Orden Incorrecto

1. ~~Iniciar aplicación sin crear la base de datos~~ → Error: "database does not exist"

---

## Verificación Rápida

### Después de crear la base de datos

\`\`\`bash
# PostgreSQL
psql -U ${dbUser} -d ${dbName} -c "SELECT version();"

# MySQL
mysql -u ${dbUser} -p -e "USE ${dbName}; SELECT VERSION();"

# SQL Server
sqlcmd -S ${dbHost} -U ${dbUser} -Q "SELECT DB_NAME(), @@VERSION"
\`\`\`

### Después de iniciar la aplicación

1. Revisar logs de Spring Boot:
   \`\`\`
   Flyway Community Edition ... by Redgate
   Database: jdbc:${dbType}://${dbHost}:${dbPort}/${dbName}
   Successfully validated 1 migration
   \`\`\`

2. Verificar tablas creadas:
   \`\`\`bash
   # PostgreSQL
   psql -U ${dbUser} -d ${dbName} -c "\\dt"
   
   # MySQL
   mysql -u ${dbUser} -p ${dbName} -e "SHOW TABLES;"
   \`\`\`

---

## Scripts de Inicio Automatizados

### Linux/Mac: start.sh

\`\`\`bash
#!/bin/bash
set -e

echo "=== Inicializando Base de Datos ==="
psql -U postgres -f init-database.sql

echo "=== Iniciando Aplicación Spring Boot ==="
./mvnw spring-boot:run
\`\`\`

### Windows: start.bat

\`\`\`batch
@echo off
echo === Inicializando Base de Datos ===
psql -U postgres -f init-database.sql

echo === Iniciando Aplicación Spring Boot ===
mvnw.cmd spring-boot:run
\`\`\`

### Docker Compose

\`\`\`yaml
version: '3.8'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${dbName}
      POSTGRES_USER: ${dbUser}
      POSTGRES_PASSWORD: password
    ports:
      - "${dbPort}:5432"
    volumes:
      - ./init-database.sql:/docker-entrypoint-initdb.d/init.sql
  
  app:
    build: .
    depends_on:
      - db
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/${dbName}
    ports:
      - "8080:8080"
\`\`\`

---

## Solución de Problemas

### Error: "database does not exist"

**Problema**: No se ejecutó el script de inicialización.

**Solución**:
\`\`\`bash
psql -U postgres -f init-database.sql
\`\`\`

### Error: "password authentication failed"

**Problema**: Credenciales incorrectas en \`application.properties\`.

**Solución**: Verificar y actualizar username/password.

### Error: "connection refused"

**Problema**: Servidor de base de datos no está corriendo.

**Solución**:
\`\`\`bash
# PostgreSQL (Ubuntu/Debian)
sudo systemctl start postgresql
sudo systemctl status postgresql

# MySQL (Ubuntu/Debian)
sudo systemctl start mysql
sudo systemctl status mysql
\`\`\`

### Flyway no crea las tablas

**Problema**: Script de migración en ubicación incorrecta.

**Solución**: Verificar que \`V1__Initial_Schema.sql\` está en:
\`\`\`
src/main/resources/db/migration/V1__Initial_Schema.sql
\`\`\`

---

## Resumen

| Paso | Comando | Descripción |
|------|---------|-------------|
| 1 | \`psql -U postgres -f init-database.sql\` | Crear base de datos |
| 2 | Editar \`application.properties\` | Configurar credenciales |
| 3 | \`./mvnw spring-boot:run\` | Iniciar aplicación |
| 4 | Automático (Flyway) | Crear tablas y esquemas |

---

## Recursos Adicionales

- [Documentación de Flyway](https://flywaydb.org/documentation/)
- [Spring Boot Database Initialization](https://docs.spring.io/spring-boot/docs/current/reference/html/howto.html#howto.data-initialization)
- [PostgreSQL CREATE DATABASE](https://www.postgresql.org/docs/current/sql-createdatabase.html)
- [MySQL CREATE DATABASE](https://dev.mysql.com/doc/refman/8.0/en/create-database.html)

---

**Generado automáticamente por SpringBootCodeGenerator**
`;
  }

  /**
   * Obtiene el puerto por defecto según el tipo de base de datos
   */
  private getDefaultPort(dbType: string): number {
    const portMap: Record<string, number> = {
      postgresql: 5432,
      mysql: 3306,
      mariadb: 3306,
      sqlserver: 1433,
      mssql: 1433,
      h2: 9092,
    };
    return portMap[dbType.toLowerCase()] || 5432;
  }

  private toSnakeCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  }

  private getMappingAnnotation(method: string): string {
    switch (method) {
      case "GET":
        return "GetMapping";
      case "POST":
        return "PostMapping";
      case "PUT":
        return "PutMapping";
      case "DELETE":
        return "DeleteMapping";
      default:
        return "RequestMapping";
    }
  }
}

// Función de utilidad para generar código Spring Boot
export function generateSpringBootCode(
  physicalModel: PhysicalModel,
  basePackage?: string,
  projectName?: string
): SpringBootGeneratedCode {
  const generator = new SpringBootCodeGenerator(
    physicalModel,
    basePackage,
    projectName
  );
  return generator.generateCode();
}
