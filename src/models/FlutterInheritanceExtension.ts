/**
 * Extensión para soportar Herencia (Generalization) en Flutter
 * Este archivo contiene helpers para generar código con herencia OOP
 */

import { SpringBootEntity } from "./SpringBootCodeGenerator.js";
import { DiagramState } from "./DiagramModel.js";

export interface InheritanceInfo {
  childClass: string;
  parentClass: string;
  discriminatorValue?: string;
}

/**
 * Detecta relaciones de herencia (generalization) del diagrama
 */
export function detectInheritance(
  entities: SpringBootEntity[],
  diagramState?: DiagramState
): Map<string, InheritanceInfo> {
  const inheritanceMap = new Map<string, InheritanceInfo>();

  if (!diagramState) return inheritanceMap;

  // Buscar relaciones de tipo "generalization"
  for (const [relId, relationship] of Object.entries(
    diagramState.relationships
  )) {
    if (relationship.relationship === "generalization") {
      const childElement = diagramState.elements[relationship.sourceId];
      const parentElement = diagramState.elements[relationship.targetId];

      if (childElement && parentElement) {
        inheritanceMap.set(childElement.className, {
          childClass: childElement.className,
          parentClass: parentElement.className,
          discriminatorValue: childElement.className.toUpperCase(),
        });
      }
    }
  }

  return inheritanceMap;
}

/**
 * Obtiene los campos del padre que deben excluirse del hijo
 */
export function getParentFields(
  parentClassName: string,
  allEntities: SpringBootEntity[]
): string[] {
  const parentEntity = allEntities.find((e) => e.className === parentClassName);
  if (!parentEntity) return [];

  return parentEntity.fields.map((f) => toCamelCase(f.name));
}

/**
 * Genera firma de clase con extends
 */
export function generateInheritedClassSignature(
  className: string,
  parentClass: string
): string {
  return `class ${className} extends ${parentClass}`;
}

/**
 * Genera parámetros del constructor con super
 */
export function generateInheritedConstructorParams(
  parentFields: string[],
  childFields: string[]
): { superParams: string; ownParams: string } {
  const superParams = parentFields.map((f) => `    super.${f},`).join("\n");
  const ownParams = childFields.map((f) => `    this.${f},`).join("\n");

  return { superParams, ownParams };
}

/**
 * Genera fromJson con campos del padre
 */
export function generateInheritedFromJson(
  className: string,
  parentFields: Array<{ name: string; type: string }>,
  childFields: Array<{ name: string; type: string }>
): string {
  let code = `  factory ${className}.fromJson(Map<String, dynamic> json) {\n`;
  code += `    return ${className}(\n`;

  // Campos del padre
  parentFields.forEach((field) => {
    code += `      ${field.name}: `;
    if (field.type === "DateTime") {
      code += `json['${field.name}'] != null ? DateTime.parse(json['${field.name}']) : null,\n`;
    } else if (field.type === "int" || field.type === "double") {
      code += `json['${field.name}'],\n`;
    } else {
      code += `json['${field.name}'],\n`;
    }
  });

  // Campos propios
  childFields.forEach((field) => {
    code += `      ${field.name}: `;
    if (field.type === "DateTime") {
      code += `json['${field.name}'] != null ? DateTime.parse(json['${field.name}']) : null,\n`;
    } else if (field.type === "int" || field.type === "double") {
      code += `json['${field.name}'],\n`;
    } else {
      code += `json['${field.name}'],\n`;
    }
  });

  code += `    );\n`;
  code += `  }\n`;

  return code;
}

/**
 * Genera toJson con super.toJson()
 */
export function generateInheritedToJson(
  childFields: Array<{ name: string; type: string }>
): string {
  let code = `  @override\n`;
  code += `  Map<String, dynamic> toJson() {\n`;
  code += `    return {\n`;
  code += `      ...super.toJson(),\n`;

  childFields.forEach((field) => {
    if (field.type === "DateTime") {
      code += `      '${field.name}': ${field.name}?.toIso8601String(),\n`;
    } else {
      code += `      '${field.name}': ${field.name},\n`;
    }
  });

  code += `    };\n`;
  code += `  }\n`;

  return code;
}

/**
 * Genera campos del formulario agrupados por herencia
 */
export function generateInheritedFormFields(
  parentClass: string,
  parentFields: Array<{ name: string; label: string; widget: string }>,
  childFields: Array<{ name: string; label: string; widget: string }>
): string {
  let code = "";

  // Sección del padre
  if (parentFields.length > 0) {
    code += `                // Campos heredados de ${parentClass}\n`;
    code += `                ExpansionTile(\n`;
    code += `                  title: Text('Campos de ${parentClass}', style: const TextStyle(fontWeight: FontWeight.w500)),\n`;
    code += `                  initiallyExpanded: true,\n`;
    code += `                  children: [\n`;
    code += `                    Padding(\n`;
    code += `                      padding: const EdgeInsets.all(16.0),\n`;
    code += `                      child: Column(\n`;
    code += `                        children: [\n`;

    parentFields.forEach((field, index) => {
      code += `                          ${field.widget}`;
      if (index < parentFields.length - 1) {
        code += `,\n                          const SizedBox(height: 16),\n`;
      } else {
        code += `,\n`;
      }
    });

    code += `                        ],\n`;
    code += `                      ),\n`;
    code += `                    ),\n`;
    code += `                  ],\n`;
    code += `                ),\n`;
    code += `                const SizedBox(height: 16),\n`;
  }

  // Sección propia
  if (childFields.length > 0) {
    code += `                // Campos propios\n`;
    code += `                const Text(\n`;
    code += `                  'Campos Específicos',\n`;
    code += `                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),\n`;
    code += `                ),\n`;
    code += `                const SizedBox(height: 16),\n`;

    childFields.forEach((field, index) => {
      code += `                ${field.widget}`;
      if (index < childFields.length - 1) {
        code += `,\n                const SizedBox(height: 16),\n`;
      }
    });
  }

  return code;
}

/**
 * Genera sección de DetailScreen con campos heredados
 */
export function generateInheritedDetailSection(
  parentClass: string,
  parentFields: Array<{ name: string; label: string; value: string }>,
  childFields: Array<{ name: string; label: string; value: string }>
): string {
  let code = "";

  // Sección del padre
  if (parentFields.length > 0) {
    code += `          const Padding(\n`;
    code += `            padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),\n`;
    code += `            child: Text(\n`;
    code += `              'Información de ${parentClass}',\n`;
    code += `              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.blue),\n`;
    code += `            ),\n`;
    code += `          ),\n`;

    parentFields.forEach((field) => {
      code += `          ListTile(\n`;
      code += `            title: const Text('${field.label}'),\n`;
      code += `            subtitle: Text(${field.value}),\n`;
      code += `          ),\n`;
    });

    code += `          const Divider(thickness: 2),\n`;
  }

  // Sección propia
  if (childFields.length > 0) {
    code += `          const Padding(\n`;
    code += `            padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),\n`;
    code += `            child: Text(\n`;
    code += `              'Información Específica',\n`;
    code += `              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),\n`;
    code += `            ),\n`;
    code += `          ),\n`;

    childFields.forEach((field) => {
      code += `          ListTile(\n`;
      code += `            title: const Text('${field.label}'),\n`;
      code += `            subtitle: Text(${field.value}),\n`;
      code += `          ),\n`;
    });
  }

  return code;
}

/**
 * Genera endpoints del backend para entidades con herencia
 */
export function generateInheritedBackendEndpoints(
  className: string,
  parentClass: string
): string {
  const lowerClass = className.toLowerCase();
  const lowerParent = parentClass.toLowerCase();

  return `
    // Endpoints para ${className} (hereda de ${parentClass})
    @GetMapping("/${lowerClass}")
    public List<${className}DTO> findAll${className}() {
        // Filtrar por discriminator
        return service.findAll().stream()
            .filter(e -> "${className}".equals(e.getDiscriminator()))
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }

    @GetMapping("/${lowerClass}/{id}")
    public ResponseEntity<${className}DTO> findOne${className}(@PathVariable Long id) {
        Optional<${parentClass}> entity = service.findById(id);
        if (entity.isPresent() && "${className}".equals(entity.get().getDiscriminator())) {
            return ResponseEntity.ok(convertToDTO(entity.get()));
        }
        return ResponseEntity.notFound().build();
    }
`;
}

// Utilidades
function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
