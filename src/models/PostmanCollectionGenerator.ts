import { PhysicalModel } from "./TransformationManager.js";
import { SpringBootEntity } from "./SpringBootCodeGenerator.js";

// Interfaces para colección de Postman
interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  event?: PostmanEvent[];
}

interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl;
  description?: string;
}

interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
}

interface PostmanBody {
  mode: string;
  raw?: string;
  options?: {
    raw: {
      language: string;
    };
  };
}

interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  variable?: PostmanVariable[];
}

interface PostmanVariable {
  key: string;
  value: string;
  type: string;
}

interface PostmanEvent {
  listen: string;
  script: {
    type: string;
    exec: string[];
  };
}

/**
 * Generador de colecciones de Postman para backends Spring Boot generados
 */
export class PostmanCollectionGenerator {
  private baseUrl: string = "http://localhost:4000";
  private basePackage: string = "com.example.demo";

  constructor(baseUrl?: string, basePackage?: string) {
    if (baseUrl) this.baseUrl = baseUrl;
    if (basePackage) this.basePackage = basePackage;
  }

  /**
   * Genera una colección de Postman completa
   */
  public generateCollection(
    physicalModel: PhysicalModel,
    projectName: string,
    entities: SpringBootEntity[]
  ): string {
    const collection: PostmanCollection = {
      info: {
        name: `${projectName} API`,
        description: `Colección de Postman para el backend Spring Boot generado desde diagrama UML.\n\nProyecto: ${projectName}\nEntidades: ${
          entities.length
        }\nTablas: ${Object.keys(physicalModel.tables).length}`,
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [],
      variable: [
        {
          key: "baseUrl",
          value: this.baseUrl,
          type: "string",
        },
      ],
    };

    // Crear carpetas por entidad
    for (const entity of entities) {
      const entityFolder = this.createEntityFolder(entity, physicalModel);
      collection.item.push(entityFolder);
    }

    // Agregar carpeta de health check
    // collection.item.push(this.createHealthCheckFolder());

    return JSON.stringify(collection, null, 2);
  }

  /**
   * Crea una carpeta para una entidad con todos sus endpoints
   */
  private createEntityFolder(
    entity: SpringBootEntity,
    physicalModel: PhysicalModel
  ): PostmanItem {
    const entityName = this.toKebabCase(entity.className);
    const table = physicalModel.tables[entity.tableName];

    const folder: PostmanItem = {
      name: `${entity.className} (${entityName})`,
      item: [],
    };

    if (folder.item) {
      // GET /api/{entity} - List all
      folder.item.push(this.createFindAllRequest(entity, table));

      // GET /api/{entity}/{id} - Get by ID
      folder.item.push(this.createFindByIdRequest(entity, table));

      // POST /api/{entity} - Create
      folder.item.push(this.createCreateRequest(entity, table));

      // PUT /api/{entity}/{id} - Update
      folder.item.push(this.createUpdateRequest(entity, table));

      // DELETE /api/{entity}/{id} - Delete
      folder.item.push(this.createDeleteRequest(entity, table));
    }

    return folder;
  }

  /**
   * Crea request para GET /api/{entity} - List all
   */
  private createFindAllRequest(
    entity: SpringBootEntity,
    table: any
  ): PostmanItem {
    const entityName = this.toKebabCase(entity.className);

    return {
      name: `Get All ${entity.className}s`,
      request: {
        method: "GET",
        header: [
          {
            key: "Accept",
            value: "application/json",
            type: "text",
          },
        ],
        url: {
          raw: "{{baseUrl}}/api/" + entityName,
          host: ["{{baseUrl}}"],
          path: ["api", entityName],
        },
        description: `Obtiene todos los registros de ${entity.className}.\n\n**Tabla:** ${table.name}\n**Campos:** ${table.columns.length}`,
      },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "pm.test(`Status code is 200`, function () {",
              "    pm.response.to.have.status(200);",
              "});",
              "",
              "pm.test(`Response has data array`, function () {",
              "    var jsonData = pm.response.json();",
              "    pm.expect(jsonData).to.be.an('array');",
              "});",
              "",
              "pm.test(`Response time is less than 1000ms`, function () {",
              "    pm.expect(pm.response.responseTime).to.be.below(1000);",
              "});",
            ],
          },
        },
      ],
    };
  }

  /**
   * Crea request para GET /api/{entity}/{id} - Get by ID
   */
  private createFindByIdRequest(
    entity: SpringBootEntity,
    table: any
  ): PostmanItem {
    const entityName = this.toKebabCase(entity.className);
    const hasCompositePK = this.hasCompositePK(entity);
    const pkFields = this.getPKFields(entity);

    let url, pathSegments, urlVariables, description;
    let testExec: string[];

    if (hasCompositePK) {
      // Para PKs compuestas, usar todos los campos en la URL
      const pkParams = pkFields.map((pk) => `:${pk.name}`).join("/");
      pathSegments = [
        "api",
        entityName,
        ...pkFields.map((pk) => `:${pk.name}`),
      ];
      urlVariables = pkFields.map((pk) => ({
        key: pk.name,
        value: "1",
        type: "string" as const,
      }));
      url = `{{baseUrl}}/api/${entityName}/${pkParams}`;
      description = `Obtiene un registro específico de ${
        entity.className
      } por su PK compuesta.\n\n**Tabla:** ${
        table.name
      }\n**PK Fields:** ${pkFields.map((pk) => pk.columnName).join(", ")}`;

      // Tests para PK compuesta
      testExec = [
        "pm.test(`Status code is 200 or 404`, function () {",
        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
        "});",
        "",
        "if (pm.response.code === 200) {",
        "    pm.test(`Response has correct structure`, function () {",
        "        var jsonData = pm.response.json();",
        "        pm.expect(jsonData).to.be.an('object');",
        ...pkFields.map(
          (pk) => `        pm.expect(jsonData).to.have.property('${pk.name}');`
        ),
        "    });",
        "}",
      ];
    } else {
      // PK simple
      const idField =
        pkFields[0] || table.columns.find((col: any) => col.primaryKey);
      pathSegments = ["api", entityName, ":id"];
      urlVariables = [
        {
          key: "id",
          value: "1",
          type: "string" as const,
        },
      ];
      url = `{{baseUrl}}/api/${entityName}/:id`;
      description = `Obtiene un registro específico de ${
        entity.className
      } por su ID.\n\n**Tabla:** ${table.name}\n**ID Field:** ${
        idField?.name || idField?.columnName || "id"
      }`;

      // Tests para PK simple
      testExec = [
        "pm.test(`Status code is 200 or 404`, function () {",
        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
        "});",
        "",
        "if (pm.response.code === 200) {",
        "    pm.test(`Response has correct structure`, function () {",
        "        var jsonData = pm.response.json();",
        "        pm.expect(jsonData).to.be.an('object');",
        "        pm.expect(jsonData).to.have.property('id');",
        "    });",
        "}",
      ];
    }

    return {
      name: `Get ${entity.className} by ID`,
      request: {
        method: "GET",
        header: [
          {
            key: "Accept",
            value: "application/json",
            type: "text",
          },
        ],
        url: {
          raw: url,
          host: ["{{baseUrl}}"],
          path: pathSegments,
          variable: urlVariables,
        },
        description: description,
      },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: testExec,
          },
        },
      ],
    };
  }

  /**
   * Crea request para POST /api/{entity} - Create
   */
  private createCreateRequest(
    entity: SpringBootEntity,
    table: any
  ): PostmanItem {
    const entityName = this.toKebabCase(entity.className);
    const sampleData = this.generateSampleData(entity, table, true); // Excluir ID para CREATE
    const hasCompositePK = this.hasCompositePK(entity);
    const pkFields = this.getPKFields(entity);

    // Generar código de tests dinámico según el tipo de PK
    let testExec: string[];
    if (hasCompositePK) {
      // Para PKs compuestas, verificar que existan los campos de la PK
      testExec = [
        "pm.test(`Status code is 200`, function () {",
        "    pm.response.to.have.status(200);",
        "});",
        "",
        "pm.test(`Response has created entity`, function () {",
        "    var jsonData = pm.response.json();",
        "    pm.expect(jsonData).to.be.an('object');",
        ...pkFields.map(
          (pk) => `    pm.expect(jsonData).to.have.property('${pk.name}');`
        ),
        "});",
        "",
        "pm.test(`Response has all required fields`, function () {",
        "    var jsonData = pm.response.json();",
        `    pm.expect(jsonData).to.have.property('${
          entity.fields[0]?.name || pkFields[0]?.name
        }');`,
        "});",
      ];
    } else {
      // Para PK simple, verificar 'id'
      testExec = [
        "pm.test(`Status code is 200`, function () {",
        "    pm.response.to.have.status(200);",
        "});",
        "",
        "pm.test(`Response has created entity`, function () {",
        "    var jsonData = pm.response.json();",
        "    pm.expect(jsonData).to.be.an('object');",
        "    pm.expect(jsonData).to.have.property('id');",
        "});",
        "",
        "pm.test(`Response has all required fields`, function () {",
        "    var jsonData = pm.response.json();",
        `    pm.expect(jsonData).to.have.property('${
          entity.fields[0]?.name || "id"
        }');`,
        "});",
      ];
    }

    return {
      name: `Create ${entity.className}`,
      request: {
        method: "POST",
        header: [
          {
            key: "Content-Type",
            value: "application/json",
            type: "text",
          },
          {
            key: "Accept",
            value: "application/json",
            type: "text",
          },
        ],
        body: {
          mode: "raw",
          raw: JSON.stringify(sampleData, null, 2),
          options: {
            raw: {
              language: "json",
            },
          },
        },
        url: {
          raw: "{{baseUrl}}/api/" + entityName,
          host: ["{{baseUrl}}"],
          path: ["api", entityName],
        },
        description: `Crea un nuevo registro de ${
          entity.className
        }.\n\n**Tabla:** ${table.name}\n**Campos requeridos:** ${
          entity.fields.filter((f) => !f.nullable).length
        }`,
      },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: testExec,
          },
        },
      ],
    };
  }

  /**
   * Crea request para PUT /api/{entity}/{id} - Update
   */
  private createUpdateRequest(
    entity: SpringBootEntity,
    table: any
  ): PostmanItem {
    const entityName = this.toKebabCase(entity.className);
    const sampleData = this.generateSampleData(entity, table, true); // Excluir ID para UPDATE
    const hasCompositePK = this.hasCompositePK(entity);
    const pkFields = this.getPKFields(entity);

    let url, pathSegments, urlVariables, description;
    let testExec: string[];

    if (hasCompositePK) {
      // Para PKs compuestas, usar todos los campos en la URL
      const pkParams = pkFields.map((pk) => `:${pk.name}`).join("/");
      pathSegments = [
        "api",
        entityName,
        ...pkFields.map((pk) => `:${pk.name}`),
      ];
      urlVariables = pkFields.map((pk) => ({
        key: pk.name,
        value: "1",
        type: "string" as const,
      }));
      url = `{{baseUrl}}/api/${entityName}/${pkParams}`;
      description = `Actualiza un registro existente de ${
        entity.className
      }.\n\n**Tabla:** ${
        table.name
      }\n**Nota:** Los valores de la PK compuesta (${pkFields
        .map((pk) => pk.name)
        .join(", ")}) deben estar en la URL y NO en el body`;

      // Tests para PK compuesta
      testExec = [
        "pm.test(`Status code is 200 or 404`, function () {",
        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
        "});",
        "",
        "if (pm.response.code === 200) {",
        "    pm.test(`Response has updated entity`, function () {",
        "        var jsonData = pm.response.json();",
        "        pm.expect(jsonData).to.be.an('object');",
        ...pkFields.map(
          (pk) => `        pm.expect(jsonData).to.have.property('${pk.name}');`
        ),
        "    });",
        "}",
      ];
    } else {
      // PK simple
      pathSegments = ["api", entityName, ":id"];
      urlVariables = [
        {
          key: "id",
          value: "1",
          type: "string" as const,
        },
      ];
      url = `{{baseUrl}}/api/${entityName}/:id`;
      description = `Actualiza un registro existente de ${entity.className}.\n\n**Tabla:** ${table.name}\n**Nota:** El ID en la URL debe existir y NO debe incluirse en el body`;

      // Tests para PK simple
      testExec = [
        "pm.test(`Status code is 200 or 404`, function () {",
        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
        "});",
        "",
        "if (pm.response.code === 200) {",
        "    pm.test(`Response has updated entity`, function () {",
        "        var jsonData = pm.response.json();",
        "        pm.expect(jsonData).to.be.an('object');",
        "        pm.expect(jsonData).to.have.property('id');",
        "    });",
        "}",
      ];
    }

    return {
      name: `Update ${entity.className}`,
      request: {
        method: "PUT",
        header: [
          {
            key: "Content-Type",
            value: "application/json",
            type: "text",
          },
          {
            key: "Accept",
            value: "application/json",
            type: "text",
          },
        ],
        body: {
          mode: "raw",
          raw: JSON.stringify(sampleData, null, 2),
          options: {
            raw: {
              language: "json",
            },
          },
        },
        url: {
          raw: url,
          host: ["{{baseUrl}}"],
          path: pathSegments,
          variable: urlVariables,
        },
        description: description,
      },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: testExec,
          },
        },
      ],
    };
  }

  /**
   * Crea request para DELETE /api/{entity}/{id} - Delete
   */
  private createDeleteRequest(
    entity: SpringBootEntity,
    table: any
  ): PostmanItem {
    const entityName = this.toKebabCase(entity.className);
    const hasCompositePK = this.hasCompositePK(entity);
    const pkFields = this.getPKFields(entity);

    let url, pathSegments, urlVariables, description;

    if (hasCompositePK) {
      // Para PKs compuestas, usar todos los campos en la URL
      const pkParams = pkFields.map((pk) => `:${pk.name}`).join("/");
      pathSegments = [
        "api",
        entityName,
        ...pkFields.map((pk) => `:${pk.name}`),
      ];
      urlVariables = pkFields.map((pk) => ({
        key: pk.name,
        value: "1",
        type: "string" as const,
      }));
      url = `{{baseUrl}}/api/${entityName}/${pkParams}`;
      description = `Elimina un registro de ${
        entity.className
      } por su PK compuesta (${pkFields
        .map((pk) => pk.name)
        .join(", ")}).\n\n**Tabla:** ${
        table.name
      }\n**Nota:** Esta operación no se puede deshacer`;
    } else {
      // PK simple
      pathSegments = ["api", entityName, ":id"];
      urlVariables = [
        {
          key: "id",
          value: "1",
          type: "string" as const,
        },
      ];
      url = `{{baseUrl}}/api/${entityName}/:id`;
      description = `Elimina un registro de ${entity.className} por su ID.\n\n**Tabla:** ${table.name}\n**Nota:** Esta operación no se puede deshacer`;
    }

    return {
      name: `Delete ${entity.className}`,
      request: {
        method: "DELETE",
        header: [
          {
            key: "Accept",
            value: "application/json",
            type: "text",
          },
        ],
        url: {
          raw: url,
          host: ["{{baseUrl}}"],
          path: pathSegments,
          variable: urlVariables,
        },
        description: description,
      },
      event: [
        {
          listen: "test",
          script: {
            type: "text/javascript",
            exec: [
              "pm.test(`Status code is 204 or 404`, function () {",
              "    pm.expect(pm.response.code).to.be.oneOf([204, 404]);",
              "});",
              "",
              "if (pm.response.code === 204) {",
              "    pm.test(`Entity deleted successfully`, function () {",
              "        pm.expect(pm.response.code).to.equal(204);",
              "    });",
              "}",
            ],
          },
        },
      ],
    };
  }

  /**
   * Crea carpeta de health check
   */
  private createHealthCheckFolder(): PostmanItem {
    return {
      name: "Health Check",
      item: [
        {
          name: "Application Health",
          request: {
            method: "GET",
            header: [
              {
                key: "Accept",
                value: "application/json",
                type: "text",
              },
            ],
            url: {
              raw: "{{baseUrl}}/actuator/health",
              host: ["{{baseUrl}}"],
              path: ["actuator", "health"],
            },
            description:
              "Verifica el estado de salud de la aplicación Spring Boot",
          },
          event: [
            {
              listen: "test",
              script: {
                type: "text/javascript",
                exec: [
                  "pm.test(`Application is healthy`, function () {",
                  "    pm.response.to.have.status(200);",
                  "    var jsonData = pm.response.json();",
                  "    pm.expect(jsonData.status).to.equal('UP');",
                  "});",
                ],
              },
            },
          ],
        },
      ],
    };
  }

  /**
   * Genera datos de ejemplo para requests de Postman
   * @param entity - Entidad Spring Boot
   * @param table - Tabla del modelo físico
   * @param excludeId - Si es true, excluye el campo ID del resultado (para CREATE y UPDATE)
   */
  private generateSampleData(
    entity: SpringBootEntity,
    table: any,
    excludeId: boolean = true
  ): any {
    const sampleData: any = {};

    // Generar datos de ejemplo basados en los campos, excluyendo campos de auditoría
    for (const field of entity.fields) {
      // Solo excluir PKs auto-generadas (simples), NO PKs compuestas que son FKs (muchos-a-muchos)
      const isAutoGeneratedPK = field.primaryKey && !field.foreignKey;
      if (excludeId && isAutoGeneratedPK) continue;
      if (this.isAuditField(field.columnName)) continue; // No incluir campos de auditoría

      const column = table.columns.find(
        (col: any) => col.name === field.columnName
      );
      if (!column) continue;

      sampleData[field.name] = this.generateSampleValue(field.type, column);
    }

    return sampleData;
  }

  /**
   * Genera un valor de ejemplo basado en el tipo (manejo general de tipos)
   */
  private generateSampleValue(javaType: string, column: any): any {
    const lowerType = javaType.toLowerCase();
    const columnNameLower = column.name.toLowerCase();

    // PRIORIDAD 1: Detectar FKs (campos que terminan en _id o Id) - deben ser numéricos
    if (columnNameLower.endsWith("_id") || columnNameLower.endsWith("id")) {
      // Verificar si el tipo Java es numérico (Long, Integer, etc.)
      if (
        lowerType.includes("long") ||
        lowerType.includes("integer") ||
        lowerType.includes("int") ||
        lowerType.includes("bigint")
      ) {
        return 1; // FK siempre con valor 1 como ejemplo
      }
    }

    // PRIORIDAD 2: Patrones específicos basados en nombres de columna
    if (
      columnNameLower.includes("email") ||
      columnNameLower.includes("correo")
    ) {
      return "example@email.com";
    }
    if (
      columnNameLower.includes("phone") ||
      columnNameLower.includes("telefono")
    ) {
      return "+1234567890";
    }
    if (
      columnNameLower.includes("name") ||
      columnNameLower.includes("nombre")
    ) {
      return `Sample Name`;
    }
    if (
      columnNameLower.includes("description") ||
      columnNameLower.includes("descripcion")
    ) {
      return `Sample description for ${column.name}`;
    }
    if (columnNameLower.includes("url") || columnNameLower.includes("link")) {
      return "https://example.com";
    }
    if (
      columnNameLower.includes("address") ||
      columnNameLower.includes("direccion")
    ) {
      return "123 Main Street";
    }
    if (
      columnNameLower.includes("code") ||
      columnNameLower.includes("codigo")
    ) {
      return "ABC123";
    }

    // Tipos de datos generales
    switch (lowerType) {
      case "string":
        return `Sample ${column.name}`;
      case "integer":
      case "int":
      case "short":
        return 123;
      case "long":
      case "bigint":
        return 123456789;
      case "boolean":
      case "bool":
        return true;
      case "bigdecimal":
      case "decimal":
      case "numeric":
      case "float":
      case "double":
        return 99.99;
      case "localdate":
      case "date":
        return "2025-01-15";
      case "localdatetime":
      case "datetime":
      case "timestamp":
        return "2025-01-15T10:30:00";
      case "localtime":
      case "time":
        return "10:30:00";
      case "byte[]":
      case "bytea":
        return "base64EncodedData";
      case "uuid":
        return "550e8400-e29b-41d4-a716-446655440000";
      default:
        return `Sample ${column.name}`;
    }
  }

  /**
   * Convierte PascalCase a kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/[A-Z]/g, (letter: string) => `-${letter.toLowerCase()}`)
      .replace(/^-/, "")
      .toLowerCase();
  }

  /**
   * Verifica si un campo es de auditoría (uso de patrones para mayor flexibilidad)
   */
  private isAuditField(columnName: string): boolean {
    const lowerName = columnName.toLowerCase();

    // Patrones comunes de campos de auditoría
    const auditPatterns = [
      /^created_at$/,
      /^updated_at$/,
      /^createdat$/,
      /^updatedat$/,
      /^fecha_creacion$/,
      /^fecha_actualizacion$/,
      /^fechacreacion$/,
      /^fechaactualizacion$/,
      /^created_date$/,
      /^updated_date$/,
      /^createddate$/,
      /^updateddate$/,
      /^created_time$/,
      /^updated_time$/,
      /^createdtime$/,
      /^updatedtime$/,
      /^created_on$/,
      /^updated_on$/,
      /^createdon$/,
      /^updatedon$/,
      /^date_created$/,
      /^date_updated$/,
      /^datecreated$/,
      /^dateupdated$/,
      /^timestamp_created$/,
      /^timestamp_updated$/,
      /^timestampcreated$/,
      /^timestampupdated$/,
    ];

    return auditPatterns.some((pattern) => pattern.test(lowerName));
  }

  /**
   * Verifica si una entidad tiene PK compuesta
   */
  private hasCompositePK(entity: SpringBootEntity): boolean {
    const pkFields = entity.fields.filter((f) => f.primaryKey);
    return pkFields.length > 1;
  }

  /**
   * Obtiene los campos de PK de una entidad
   */
  private getPKFields(entity: SpringBootEntity): any[] {
    return entity.fields.filter((f) => f.primaryKey);
  }
}
