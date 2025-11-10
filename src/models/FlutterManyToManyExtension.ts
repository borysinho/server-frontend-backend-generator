/**
 * Extensión para soportar relaciones ManyToMany en Flutter
 * Este archivo contiene helpers para generar código de relaciones N:M
 */

import {
  SpringBootEntity,
  SpringBootField,
} from "./SpringBootCodeGenerator.js";

export interface ManyToManyRelation {
  fieldName: string; // Nombre del campo en la entidad (ej: "servicios")
  referencedEntity: string; // Entidad referenciada (ej: "Servicio")
  junctionTable?: string; // Tabla intermedia (ej: "vehiculo_servicio")
}

/**
 * Detecta relaciones ManyToMany en una entidad
 */
export function detectManyToManyRelations(
  entity: SpringBootEntity,
  allEntities: SpringBootEntity[]
): ManyToManyRelation[] {
  const manyToManyRelations: ManyToManyRelation[] = [];

  // Helper: Verifica si una entidad tiene PK simple (no compuesta)
  const hasSimplePK = (e: SpringBootEntity): boolean => {
    const pkFields = e.fields.filter((f) => f.primaryKey);
    return pkFields.length === 1;
  };

  // Buscar campos con foreignKey.relationship === "ManyToMany"
  entity.fields.forEach((field) => {
    if (field.foreignKey?.relationship === "ManyToMany") {
      const referencedEntity = allEntities.find(
        (e) => e.className === field.foreignKey!.referencedEntity
      );

      // Solo agregar si la entidad referenciada existe y tiene PK simple
      if (referencedEntity && hasSimplePK(referencedEntity)) {
        manyToManyRelations.push({
          fieldName: toCamelCase(field.foreignKey.referencedEntity) + "s",
          referencedEntity: field.foreignKey.referencedEntity,
          junctionTable: entity.tableName, // La entidad actual es la tabla intermedia
        });
      }
    }
  });

  // Buscar relaciones inversas: otras entidades que apuntan a esta con ManyToMany
  allEntities.forEach((otherEntity) => {
    // Saltar entidades con PK compuesta
    if (!hasSimplePK(otherEntity)) {
      return;
    }

    otherEntity.fields.forEach((field) => {
      if (
        field.foreignKey?.relationship === "ManyToMany" &&
        field.foreignKey.referencedEntity === entity.className
      ) {
        const relationName = toCamelCase(otherEntity.className) + "s";
        // Evitar duplicados
        if (!manyToManyRelations.some((r) => r.fieldName === relationName)) {
          manyToManyRelations.push({
            fieldName: relationName,
            referencedEntity: otherEntity.className,
            junctionTable: otherEntity.tableName,
          });
        }
      }
    });
  });

  return manyToManyRelations;
}

/**
 * Genera código de modelo con listas ManyToMany
 */
export function generateManyToManyModelFields(
  relations: ManyToManyRelation[]
): string {
  if (relations.length === 0) return "";

  let code = "\n  // Relaciones ManyToMany\n";
  relations.forEach((rel) => {
    code += `  final List<${rel.referencedEntity}>? ${rel.fieldName};\n`;
  });

  return code;
}

/**
 * Genera parámetros del constructor para ManyToMany
 */
export function generateManyToManyConstructorParams(
  relations: ManyToManyRelation[]
): string {
  if (relations.length === 0) return "";

  let code = "";
  relations.forEach((rel) => {
    code += `    this.${rel.fieldName},\n`;
  });

  return code;
}

/**
 * Genera código fromJson para ManyToMany
 */
export function generateManyToManyFromJson(
  relations: ManyToManyRelation[]
): string {
  if (relations.length === 0) return "";

  let code = "";
  relations.forEach((rel) => {
    code += `      ${rel.fieldName}: (json['${rel.fieldName}'] as List?)\n`;
    code += `          ?.map((e) => ${rel.referencedEntity}.fromJson(e as Map<String, dynamic>))\n`;
    code += `          .toList(),\n`;
  });

  return code;
}

/**
 * Genera código toJson para ManyToMany
 */
export function generateManyToManyToJson(
  relations: ManyToManyRelation[]
): string {
  if (relations.length === 0) return "";

  let code = "";
  relations.forEach((rel) => {
    code += `      '${rel.fieldName}': ${rel.fieldName}?.map((e) => e.toJson()).toList(),\n`;
  });

  return code;
}

/**
 * Genera métodos del provider para ManyToMany
 */
export function generateManyToManyProviderMethods(
  className: string,
  relations: ManyToManyRelation[],
  pkFieldName: string
): string {
  if (relations.length === 0) return "";

  let code = "\n  // Métodos para relaciones ManyToMany\n";

  relations.forEach((rel) => {
    const methodName = toCamelCase(rel.referencedEntity);
    const urlPath = toKebabCase(className); // ✅ FIX: Usar kebab-case para endpoints
    const relatedPath = toKebabCase(rel.referencedEntity); // ✅ FIX: Usar kebab-case para endpoints

    code += `
  /// Obtener ${rel.referencedEntity}s relacionados
  Future<List<${rel.referencedEntity}>> get${capitalizeFirst(
      rel.fieldName
    )}(String ${pkFieldName}) async {
    try {
      final response = await _dio.get('/$urlPath/\$${pkFieldName}/${relatedPath}s');
      return (response.data as List)
          .map((e) => ${
            rel.referencedEntity
          }.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Agregar ${rel.referencedEntity} a la relación
  Future<void> add${capitalizeFirst(
    methodName
  )}(String ${pkFieldName}, String ${methodName}Id) async {
    try {
      await _dio.post('/$urlPath/\$${pkFieldName}/${relatedPath}s/\$${methodName}Id');
    } catch (e) {
      rethrow;
    }
  }

  /// Eliminar ${rel.referencedEntity} de la relación
  Future<void> remove${capitalizeFirst(
    methodName
  )}(String ${pkFieldName}, String ${methodName}Id) async {
    try {
      await _dio.delete('/$urlPath/\$${pkFieldName}/${relatedPath}s/\$${methodName}Id');
    } catch (e) {
      rethrow;
    }
  }
`;
  });

  return code;
}

/**
 * Genera estado del controller para ManyToMany
 */
export function generateManyToManyControllerState(
  relations: ManyToManyRelation[]
): string {
  if (relations.length === 0) return "";

  let code = "\n  // Estado para relaciones ManyToMany\n";

  relations.forEach((rel) => {
    code += `  List<${rel.referencedEntity}> available${capitalizeFirst(
      rel.fieldName
    )} = [];\n`;
    code += `  List<${rel.referencedEntity}> selected${capitalizeFirst(
      rel.fieldName
    )} = [];\n`;
  });

  return code;
}

/**
 * Genera métodos del controller para ManyToMany
 */
export function generateManyToManyControllerMethods(
  className: string,
  relations: ManyToManyRelation[],
  pkFieldName: string
): string {
  if (relations.length === 0) return "";

  let code = "\n  // Métodos para relaciones ManyToMany\n";

  relations.forEach((rel) => {
    const methodName = toCamelCase(rel.referencedEntity);

    code += `
  Future<void> loadAvailable${capitalizeFirst(rel.fieldName)}() async {
    try {
      isLoading = true;
      notifyListeners();
      available${capitalizeFirst(
        rel.fieldName
      )} = await ${methodName}Provider.getAll();
      isLoading = false;
      notifyListeners();
    } catch (e) {
      errorMessage = 'Error al cargar ${rel.referencedEntity}s: \$e';
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadSelected${capitalizeFirst(
    rel.fieldName
  )}(String ${pkFieldName}) async {
    try {
      selected${capitalizeFirst(
        rel.fieldName
      )} = await _provider.get${capitalizeFirst(rel.fieldName)}(${pkFieldName});
      notifyListeners();
    } catch (e) {
      errorMessage = 'Error al cargar ${
        rel.referencedEntity
      }s seleccionados: \$e';
      notifyListeners();
    }
  }

  Future<void> updateSelected${capitalizeFirst(
    rel.fieldName
  )}(String ${pkFieldName}, List<${rel.referencedEntity}> newSelection) async {
    try {
      // Encontrar agregados y eliminados
      final currentIds = selected${capitalizeFirst(
        rel.fieldName
      )}.map((e) => e.${pkFieldName}?.toString() ?? '').toSet();
      final newIds = newSelection.map((e) => e.${pkFieldName}?.toString() ?? '').toSet();
      
      final toAdd = newIds.difference(currentIds);
      final toRemove = currentIds.difference(newIds);
      
      // Agregar nuevos
      for (final id in toAdd) {
        await _provider.add${capitalizeFirst(methodName)}(${pkFieldName}, id);
      }
      
      // Eliminar removidos
      for (final id in toRemove) {
        await _provider.remove${capitalizeFirst(
          methodName
        )}(${pkFieldName}, id);
      }
      
      // Actualizar estado
      selected${capitalizeFirst(rel.fieldName)} = newSelection;
      notifyListeners();
    } catch (e) {
      errorMessage = 'Error al actualizar relación: \$e';
      notifyListeners();
      rethrow;
    }
  }
`;
  });

  return code;
}

/**
 * Genera campo de formulario con MultiSelectChip
 */
export function generateManyToManyFormField(
  className: string,
  relation: ManyToManyRelation,
  pkFieldName: string
): string {
  const refEntity = relation.referencedEntity;
  const refEntityVar = toCamelCase(refEntity);
  const fieldName = relation.fieldName;

  return `
                // ManyToMany: ${refEntity}
                Consumer<${className}Controller>(
                  builder: (context, controller, child) {
                    if (controller.isLoading && controller.available${capitalizeFirst(
                      fieldName
                    )}.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(16.0),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }

                    return MultiSelectChip<${refEntity}>(
                      label: '${capitalizeFirst(fieldName)}',
                      options: controller.available${capitalizeFirst(
                        fieldName
                      )},
                      selectedItems: controller.selected${capitalizeFirst(
                        fieldName
                      )},
                      labelBuilder: (item) {
                        // Buscar campo descriptivo
                        return item.nombre ?? item.name ?? item.titulo ?? item.title ?? item.${pkFieldName}?.toString() ?? '';
                      },
                      valueBuilder: (item) => item.${pkFieldName}?.toString() ?? '',
                      onSelectionChanged: (selected) {
                        controller.selected${capitalizeFirst(
                          fieldName
                        )} = selected;
                      },
                    );
                  },
                ),`;
}

// Utilidades
function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convierte PascalCase a kebab-case para endpoints REST
 * Ejemplo: PlanDeFinanciamiento -> plan-de-financiamiento
 * ✅ Compatible con convención Spring Boot de endpoints
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
