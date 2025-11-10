import { Request, Response } from "express";
import { AzureOpenAI } from "openai";
import { JsonPatchOperation } from "../validation/UMLValidator.js";

export enum AIProvider {
  AZURE = "azure",
}

export interface AIRequest {
  action: "generate_diagram" | "generate_from_image";
  prompt: string;
  context?: {
    existingClasses?: string[];
    diagramElements?: Record<string, unknown>[];
    diagramRelationships?: Record<string, unknown>[];
  };
  clientId: string;
  // Nuevo: soporte para imágenes (base64)
  image?: string; // Base64 encoded image data (formato: data:image/png;base64,...)
}

export interface DiagramDelta {
  // Agregar nuevos elementos y relaciones
  newElements: any[];
  newRelationships: any[];

  // Eliminar elementos y relaciones por ID
  removeElementIds?: string[];
  removeRelationshipIds?: string[];

  // Modificar elementos y relaciones existentes (actualización parcial)
  updateElements?: Array<{
    id: string;
    changes: Partial<{
      className: string;
      attributes: string[];
      methods: string[];
      elementType: string;
      stereotype: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }>;
  updateRelationships?: Array<{
    id: string;
    changes: Partial<{
      source: string;
      target: string;
      relationship: string;
      label: string;
      sourceMultiplicity: string;
      targetMultiplicity: string;
      sourceRole: string;
      targetRole: string;
    }>;
  }>;
}

export interface AIResponse {
  success: boolean;
  // Nuevo formato: delta directo
  delta?: DiagramDelta;
  // Formato antiguo: operaciones JSON-Patch (deprecado)
  operations?: JsonPatchOperation[];
  error?: string;
}

export class AIController {
  private azureClient?: AzureOpenAI;
  private azureApiKey?: string;
  private azureEndpoint?: string;
  private azureDeployment?: string;
  private defaultProvider: AIProvider;

  constructor() {
    // Configurar Azure AI si está disponible
    this.azureApiKey = process.env.AZURE_IA_API_KEY;
    this.azureEndpoint = process.env.AZURE_IA_ENDPOINT;
    this.azureDeployment = process.env.AZURE_IA_DEPLOYMENT || "gpt-4.1-mini";

    // Inicializar cliente Azure OpenAI si está configurado
    if (this.azureApiKey && this.azureEndpoint) {
      const apiVersion = "2025-01-01-preview";
      const options = {
        endpoint: this.azureEndpoint,
        apiKey: this.azureApiKey,
        deployment: this.azureDeployment,
        apiVersion,
      };
      this.azureClient = new AzureOpenAI(options);
    }

    // Determinar el proveedor por defecto
    // Solo Azure está disponible
    const configuredProvider = process.env.AI_PROVIDER?.toLowerCase();
    if (configuredProvider === "azure" && this.azureClient) {
      this.defaultProvider = AIProvider.AZURE;
    } else if (this.azureClient) {
      // Azure es el proveedor por defecto si está disponible
      this.defaultProvider = AIProvider.AZURE;
    } else {
      throw new Error(
        "Azure AI no está configurado. Configure AZURE_IA_API_KEY y AZURE_IA_ENDPOINT"
      );
    }

    console.log(
      `AIController inicializado con proveedor: ${this.defaultProvider}`
    );
  }

  async processAIRequest(req: Request, res: Response): Promise<void> {
    try {
      const request: AIRequest = req.body;

      if (!request.action || !request.prompt || !request.clientId) {
        res.status(400).json({
          success: false,
          error: "Se requiere 'action', 'prompt' y 'clientId' en la solicitud",
        });
        return;
      }

      const response = await this.processRequest(request);
      res.json(response);
    } catch (error) {
      console.error("Error procesando solicitud de IA:", error);
      res.status(500).json({
        success: false,
        error: "Error interno del servidor al procesar solicitud de IA",
      });
    }
  }

  // Método público para Socket.IO
  async processAIRequestSocket(request: AIRequest): Promise<AIResponse> {
    return this.processRequest(request);
  }

  private async processRequest(request: AIRequest): Promise<AIResponse> {
    // Solo usar Azure
    try {
      console.log(`Procesando solicitud con Azure - Acción: ${request.action}`);

      // Determinar qué método usar según la acción
      if (request.action === "generate_from_image") {
        if (!request.image) {
          throw new Error(
            "Se requiere una imagen para la acción 'generate_from_image'"
          );
        }
        return await this.processImageWithAzure(request);
      } else {
        // Acción por defecto: generate_diagram
        return await this.processWithAzure(request);
      }
    } catch (error) {
      console.error(`Error con Azure:`, error);
      return {
        success: false,
        error: `Error con Azure: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`,
      };
    }
  }

  private async processWithAzure(request: AIRequest): Promise<AIResponse> {
    if (!this.azureClient) {
      throw new Error("Azure AI no está configurado correctamente");
    }

    const currentElements = request.context?.diagramElements || [];
    const currentRelationships = request.context?.diagramRelationships || [];

    // Extraer nombres de clases de diagramElements si están disponibles, sino usar existingClasses
    const existingClassesList =
      currentElements.length > 0
        ? currentElements
            .filter((el: any) => el.className)
            .map((el: any) => el.className)
            .join(", ")
        : request.context?.existingClasses?.join(", ") || "Ninguna";

    const systemPrompt = `Eres un experto en modelado UML que genera elementos y relaciones para actualizar diagramas de manera directa y eficiente.

Tu tarea es analizar el prompt del usuario y generar directamente los NUEVOS elementos y relaciones que se deben agregar al diagrama.

## DEFINICIONES DE INTERFACES

### Element (Clase/Interface/etc.)
\`\`\`typescript
interface Element {
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
\`\`\`

### Relationship (Relación)
\`\`\`typescript
interface Relationship {
  id: string;
  source: string;
  target: string;
  relationship: "association" | "aggregation" | "composition" | "generalization" | "dependency" | "realization";
  label?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  sourceRole?: string;
  targetRole?: string;
}
\`\`\`

## ESTADO ACTUAL DEL DIAGRAMA

### Elementos existentes:
${
  currentElements.length > 0
    ? currentElements
        .map((el, i) => `${i + 1}. ${JSON.stringify(el, null, 2)}`)
        .join("\n")
    : "Ninguno"
}

### Relaciones existentes:
${
  currentRelationships.length > 0
    ? currentRelationships
        .map((rel, i) => `${i + 1}. ${JSON.stringify(rel, null, 2)}`)
        .join("\n")
    : "Ninguna"
}

### Clases existentes (solo nombres):
${existingClassesList}

## INSTRUCCIONES

1. **ANALIZA el prompt del usuario** y determina la intencion:
   - **AGREGAR**: Crear nuevos elementos/relaciones - usa newElements y newRelationships
   - **MODIFICAR**: Cambiar propiedades de elementos/relaciones existentes - usa updateElements y updateRelationships
   - **ELIMINAR**: Remover elementos/relaciones - usa removeElementIds y removeRelationshipIds
   - **MOVER/REPOSICIONAR**: Cambiar posicion (x,y) - usa updateElements con solo los campos x,y

2. **PARA AGREGAR ELEMENTOS (clases)**: Incluye todos los campos necesarios en newElements
   - id: genera un ID unico usando el formato "ai-class-{timestamp}-{random}" (ej: "ai-class-123456789-abc123")
   - className: nombre de la clase
   - attributes: array de strings con atributos usando constraints UML estándar
     **IMPORTANTE - CONSTRAINTS UML (entre llaves):**
     - **Llave primaria**: Usa constraint {id}. Prefiere tipos numéricos como Long o int (ej: "id: Long {id}" o "codigo: int {id}")
     - **Campo único**: Usa constraint {unique} (ej: "email: String {unique}")
     - **Campo obligatorio (NOT NULL)**: Usa constraint {required} (ej: "nombre: String {required}")
     - **Combinaciones**: Puedes combinar constraints (ej: "codigo: int {id, unique, required}")
     - **Llave primaria compuesta**: SOLO para tablas intermedias N:M. Marca múltiples atributos con {id}
     - **Ejemplo correcto**: ["id: Long {id}", "titulo: String {required}", "email: String {unique}", "fechaCreacion: Date"]
     - **TIPOS RECOMENDADOS PARA PK**: Long (preferido), int, o UUID para identificadores únicos distribuidos. Evita String salvo que sea estrictamente necesario (ej: códigos alfanuméricos de negocio).
     
     **⚠️ REGLA CRÍTICA - FOREIGN KEYS:**
     - ❌ NUNCA definas atributos como "usuarioId", "clienteId", "ventaId", etc. con {id}
     - ❌ NUNCA uses {id} para campos que referencian otras tablas
     - ✅ Las Foreign Keys se generan AUTOMÁTICAMENTE desde las relaciones/asociaciones UML
     - ✅ Solo define atributos de negocio propios de la clase
     - ✅ Cada clase debe tener UNA sola PK simple (excepto tablas intermedias N:M)
     
     **EJEMPLOS:**
     INCORRECTO ❌:
     DetalleVenta: ["ventaId: Long {id}", "productoId: Long {id}", "cantidad: int"]
     → NO uses {id} en FKs - esto crea PKs múltiples incorrectas
     
     CORRECTO ✅:
     DetalleVenta: ["id: Long {id}", "cantidad: int {required}", "subtotal: Double {required}"]
     + Relación: Venta --1--> 1..* DetalleVenta
     → El sistema generará automáticamente detalle_venta.venta_id como FK
   - methods: array de strings con metodos (ej: ["getId(): int", "getTitulo(): String"])
   - elementType: "class"
   - stereotype: opcional
   - x, y: posiciones (usa coordenadas razonables, evita solapamientos con existentes)
   - width, height: dimensiones calculadas (ej: width: 200, height: 120)

3. **PARA AGREGAR RELACIONES**: Incluye todos los campos necesarios en newRelationships
   - id: genera un ID unico usando el formato "ai-link-{timestamp}-{random}" (ej: "ai-link-123456789-def456")
   - source: ID del elemento origen (DEBE ser un ID existente en currentElements o un nuevo ID de newElements)
   - target: ID del elemento destino (DEBE ser un ID existente en currentElements o un nuevo ID de newElements)
   - relationship: tipo ("association", "aggregation", "composition", "generalization", "dependency", "realization")
   - label: etiqueta corta descriptiva
   - sourceMultiplicity: cardinalidad del lado SOURCE (se muestra cerca del elemento source) (ej: "1", "0..*", "1..*", "0..1")
   - targetMultiplicity: cardinalidad del lado TARGET (se muestra cerca del elemento target) (ej: "1", "0..*", "1..*", "0..1")
   - IMPORTANTE: source y target DEBEN referenciar IDs que existan en los elementos actuales O en los nuevos elementos que estás creando

4. **PARA ELIMINAR**: Usa los arrays de IDs
   - removeElementIds: array de IDs de elementos a eliminar (ej: ["class-123", "class-456"])
   - removeRelationshipIds: array de IDs de relaciones a eliminar (ej: ["link-789"])
   - IMPORTANTE: Al eliminar un elemento, tambien elimina sus relaciones asociadas

5. **PARA MODIFICAR**: Usa actualizacion parcial (solo cambios necesarios)
   - updateElements: array de objetos con {id: string, changes: {...}}
     * Ejemplo renombrar: {id: "class-123", changes: {className: "NuevoNombre"}}
     * Ejemplo mover: {id: "class-123", changes: {x: 400, y: 300}}
     * Ejemplo agregar atributo: {id: "class-123", changes: {attributes: ["id: int", "nuevoAtributo: String"]}}
   - updateRelationships: array de objetos con {id: string, changes: {...}}
     * Ejemplo cambiar tipo: {id: "link-456", changes: {relationship: "composition"}}
     * Ejemplo cambiar multiplicidad: {id: "link-456", changes: {sourceMultiplicity: "1..*"}}

6. **VALIDACION**:
   - Asegurate de que las relaciones referencien IDs validos
   - Para eliminar, verifica que los IDs existan en el diagrama actual
   - Para modificar, incluye solo los campos que cambian (no todo el objeto)
   - Usa posiciones (x,y) que no se solapen con elementos existentes
   - Los nuevos elementos deben complementar el diagrama actual, no duplicarlo
   - **IMPORTANTE PARA LLAVES**: Toda clase DEBE tener al menos un atributo con constraint {id}. NO uses atributos como "usuarioId" o "clienteId" - las foreign keys se generan automáticamente desde las asociaciones UML basándose en las multiplicidades

## FORMATO DE RESPUESTA:

Devuelve un objeto JSON que puede incluir hasta 6 arrays opcionales:

EJEMPLO 1 - Sistema de Ventas (PATRÓN CORRECTO ✅):
{
  "newElements": [
    {
      "id": "ai-class-1-cliente",
      "className": "Cliente",
      "attributes": [
        "id: Long {id}",
        "nombre: String {required}",
        "email: String {unique, required}"
      ],
      "methods": ["getId(): Long", "getNombre(): String"],
      "elementType": "class",
      "x": 100, "y": 100, "width": 200, "height": 120
    },
    {
      "id": "ai-class-2-venta",
      "className": "Venta",
      "attributes": [
        "id: Long {id}",
        "fecha: Date {required}",
        "total: Double {required}"
      ],
      "methods": ["getId(): Long", "getTotal(): Double"],
      "elementType": "class",
      "x": 400, "y": 100, "width": 200, "height": 120
    },
    {
      "id": "ai-class-3-producto",
      "className": "Producto",
      "attributes": [
        "id: Long {id}",
        "nombre: String {required}",
        "precio: Double {required}"
      ],
      "methods": ["getId(): Long", "getPrecio(): Double"],
      "elementType": "class",
      "x": 700, "y": 100, "width": 200, "height": 120
    },
    {
      "id": "ai-class-4-detalle",
      "className": "DetalleVenta",
      "attributes": [
        "id: Long {id}",
        "cantidad: int {required}",
        "subtotal: Double {required}"
      ],
      "methods": ["getCantidad(): int", "calcularSubtotal(): Double"],
      "elementType": "class",
      "x": 400, "y": 300, "width": 200, "height": 120
    }
  ],
  "newRelationships": [
    {
      "id": "ai-link-1-cliente-venta",
      "source": "ai-class-1-cliente",
      "target": "ai-class-2-venta",
      "relationship": "association",
      "label": "realiza",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "0..*"
    },
    {
      "id": "ai-link-2-venta-detalle",
      "source": "ai-class-2-venta",
      "target": "ai-class-4-detalle",
      "relationship": "composition",
      "label": "contiene",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "1..*"
    },
    {
      "id": "ai-link-3-detalle-producto",
      "source": "ai-class-4-detalle",
      "target": "ai-class-3-producto",
      "relationship": "association",
      "label": "incluye",
      "sourceMultiplicity": "*",
      "targetMultiplicity": "1"
    }
  ]
}
RESULTADO SQL GENERADO:
- venta.cliente_id → cliente.id (FK generada automáticamente de la relación 1)
- detalle_venta.venta_id → venta.id (FK generada automáticamente de la relación 2)
- detalle_venta.producto_id → producto.id (FK generada automáticamente de la relación 3)

EJEMPLO 2 - Usuario presta Libros:
{
  "newElements": [
    {
      "id": "ai-class-123456789-abc123",
      "className": "Libro",
      "attributes": ["id: Long {id}", "titulo: String {required}", "autor: String", "isbn: String {unique}"],
      "methods": ["getId(): Long", "getTitulo(): String", "setTitulo(String): void"],
      "elementType": "class",
      "x": 300,
      "y": 200,
      "width": 200,
      "height": 120
    }
  ],
  "newRelationships": [
    {
      "id": "ai-link-123456789-def456",
      "source": "existing-user-id",
      "target": "ai-class-123456789-abc123",
      "relationship": "association",
      "label": "presta",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "0..*"
    }
  ]
}
NOTA: sourceMultiplicity="1" se muestra cerca de Usuario (source), targetMultiplicity="0..*" se muestra cerca de Libro (target)
Significado: Un Usuario (1) puede prestar muchos Libros (0..*)

EJEMPLO 3 - Eliminar elementos:
{
  "removeElementIds": ["class-123", "class-456"],
  "removeRelationshipIds": ["link-789"]
}

EJEMPLO 3 - Modificar elementos (renombrar clase Usuario a User):
{
  "updateElements": [
    {
      "id": "class-usuario-123",
      "changes": {
        "className": "User"
      }
    }
  ]
}

EJEMPLO 4 - Mover elementos (reposicionar clase):
{
  "updateElements": [
    {
      "id": "class-libro-456",
      "changes": {
        "x": 500,
        "y": 300
      }
    }
  ]
}

EJEMPLO 5 - Operación combinada (agregar, modificar y eliminar):
{
  "newElements": [...],
  "newRelationships": [...],
  "updateElements": [...],
  "removeElementIds": [...]
}

## IMPORTANTE:
- Si no hay cambios necesarios, devuelve arrays vacios: {"newElements": [], "newRelationships": []}
- Usa IDs unicos para evitar conflictos
- Las posiciones (x,y) deben ser razonables y no solapadas
- Respeta el formato JSON exacto especificado
- Para modificar, incluye solo los campos que cambian (actualizacion parcial)
- Al eliminar elementos, considera eliminar tambien sus relaciones asociadas
- CARDINALIDADES EN UML: sourceMultiplicity se muestra en el lado del source, targetMultiplicity en el lado del target
  * Ejemplo: Si "Usuario" (source) tiene "0..*" Libros (target), entonces sourceMultiplicity="1" y targetMultiplicity="0..*"
  * La multiplicidad indica cuantas instancias de cada clase participan en la relacion`;

    try {
      // Usar Azure OpenAI SDK según el ejemplo proporcionado
      const response = await this.azureClient.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: request.prompt },
        ],
        max_completion_tokens: 13107,
        temperature: 1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        model: this.azureDeployment!,
      });

      const content = response.choices[0].message.content;

      if (!content) {
        throw new Error("No se recibió contenido válido de Azure AI");
      }

      // Intentar parsear el JSON de la respuesta
      try {
        const delta = JSON.parse(content) as DiagramDelta;

        // Validar que tenga la estructura correcta
        if (!delta || typeof delta !== "object") {
          throw new Error("La respuesta debe ser un objeto JSON válido");
        }

        // Asegurar que los arrays obligatorios existan (aunque estén vacíos)
        if (!Array.isArray(delta.newElements)) {
          delta.newElements = [];
        }
        if (!Array.isArray(delta.newRelationships)) {
          delta.newRelationships = [];
        }

        // Los arrays opcionales pueden no existir o ser undefined
        // Pero si existen, deben ser arrays
        if (delta.removeElementIds && !Array.isArray(delta.removeElementIds)) {
          throw new Error("removeElementIds debe ser un array");
        }
        if (
          delta.removeRelationshipIds &&
          !Array.isArray(delta.removeRelationshipIds)
        ) {
          throw new Error("removeRelationshipIds debe ser un array");
        }
        if (delta.updateElements && !Array.isArray(delta.updateElements)) {
          throw new Error("updateElements debe ser un array");
        }
        if (
          delta.updateRelationships &&
          !Array.isArray(delta.updateRelationships)
        ) {
          throw new Error("updateRelationships debe ser un array");
        }

        // Log de lo que se generó
        const stats = [];
        if (delta.newElements.length > 0)
          stats.push(`${delta.newElements.length} elementos nuevos`);
        if (delta.newRelationships.length > 0)
          stats.push(`${delta.newRelationships.length} relaciones nuevas`);
        if (delta.removeElementIds && delta.removeElementIds.length > 0)
          stats.push(`${delta.removeElementIds.length} elementos a eliminar`);
        if (
          delta.removeRelationshipIds &&
          delta.removeRelationshipIds.length > 0
        )
          stats.push(
            `${delta.removeRelationshipIds.length} relaciones a eliminar`
          );
        if (delta.updateElements && delta.updateElements.length > 0)
          stats.push(`${delta.updateElements.length} elementos a modificar`);
        if (delta.updateRelationships && delta.updateRelationships.length > 0)
          stats.push(
            `${delta.updateRelationships.length} relaciones a modificar`
          );

        console.log(
          `✅ IA generó: ${stats.length > 0 ? stats.join(", ") : "sin cambios"}`
        );

        return {
          success: true,
          delta: delta,
        };
      } catch (parseError) {
        console.error("Error parseando respuesta de Azure AI:", parseError);
        console.error("Contenido recibido:", content);
        throw new Error(
          "La respuesta de Azure AI no tiene un formato JSON válido"
        );
      }
    } catch (error) {
      console.error("Error en processWithAzure:", error);
      throw new Error(
        `Error procesando la solicitud con Azure AI: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`
      );
    }
  }

  /**
   * Procesa una imagen (boceto, diagrama dibujado a mano, etc.) usando Azure OpenAI Vision
   * para generar elementos y relaciones de diagrama UML
   */
  private async processImageWithAzure(request: AIRequest): Promise<AIResponse> {
    if (!this.azureClient) {
      throw new Error("Azure AI no está configurado correctamente");
    }

    if (!request.image) {
      throw new Error("Se requiere una imagen para procesar");
    }

    const currentElements = request.context?.diagramElements || [];
    const currentRelationships = request.context?.diagramRelationships || [];

    // Extraer nombres de clases existentes
    const existingClassesList =
      currentElements.length > 0
        ? currentElements
            .filter((el: any) => el.className)
            .map((el: any) => el.className)
            .join(", ")
        : "Ninguna";

    const elementsJson =
      currentElements.length > 0
        ? currentElements
            .map((el, i) => `${i + 1}. ${JSON.stringify(el, null, 2)}`)
            .join("\n")
        : "Ninguno";

    const relationshipsJson =
      currentRelationships.length > 0
        ? currentRelationships
            .map((rel, i) => `${i + 1}. ${JSON.stringify(rel, null, 2)}`)
            .join("\n")
        : "Ninguna";

    const visionSystemPrompt = `Eres un experto en modelado UML que analiza imágenes de diagramas (bocetos, diagramas dibujados a mano, capturas de pantalla, etc.) y genera elementos y relaciones para diagramas UML digitales.

Tu tarea es:
1. **ANALIZAR la imagen** proporcionada e identificar:
   - Clases/Entidades (rectángulos con nombre)
   - Atributos de cada clase (campos/propiedades)
   - Métodos de cada clase (funciones/operaciones)
   - Relaciones entre clases (flechas, líneas)
   - Tipos de relación (asociación, agregación, composición, generalización, dependencia, realización)
   - Multiplicidades/cardinalidades (1, 0..1, 0..*, 1..*, etc.)

2. **GENERAR** elementos y relaciones en formato JSON siguiendo las mismas reglas que para texto.

## ESTADO ACTUAL DEL DIAGRAMA

### Elementos existentes:
${elementsJson}

### Relaciones existentes:
${relationshipsJson}

### Clases existentes (solo nombres):
${existingClassesList}

## INSTRUCCIONES PARA ANALIZAR IMAGEN:

1. **IDENTIFICA clases en la imagen**:
   - Busca rectángulos/cajas con nombres
   - Cada caja representa una clase
   - El nombre suele estar en la parte superior

2. **EXTRAE atributos**:
   - Busca texto dentro de las cajas (debajo del nombre)
   - Formato típico: "nombre: tipo" o solo "nombre"
   - Identifica constraints UML si están marcados:
     * {id} o subrayado = llave primaria
     * {unique} = campo único
     * {required} o * = campo obligatorio
   - Si no hay constraints visibles, infiere según el nombre:
     * Campos llamados "id", "codigo", "identificador" → {id}
     * Primera línea dentro de la clase → probable PK

3. **EXTRAE métodos**:
   - Busca texto que parece funciones/operaciones
   - Formato típico: "nombreMetodo()" o "nombreMetodo(): tipo"
   - Suelen estar separados de atributos por una línea horizontal

4. **IDENTIFICA relaciones**:
   - Busca líneas/flechas entre clases
   - Tipos de flecha:
     * Línea simple → association
     * Línea con diamante vacío → aggregation
     * Línea con diamante lleno → composition
     * Flecha con triángulo vacío → generalization (herencia)
     * Flecha punteada → dependency
     * Flecha punteada con triángulo → realization
   - Lee multiplicidades cerca de los extremos de las líneas (1, *, 0..1, 1..*, etc.)
   - Lee etiquetas en las líneas (verbos descriptivos)

5. **GENERA IDs únicos**:
   - Para elementos: "ai-class-{timestamp}-{nombre}" (ej: "ai-class-123456789-usuario")
   - Para relaciones: "ai-link-{timestamp}-{source}-{target}"

6. **POSICIONES**:
   - Intenta mantener la disposición espacial aproximada de la imagen
   - Si la imagen muestra clases de izquierda a derecha, usa x creciente
   - Si muestra jerarquía vertical, usa y creciente
   - Valores típicos: x entre 100-900, y entre 100-600

## REGLAS IMPORTANTES:

- **LLAVE PRIMARIA**: Toda clase DEBE tener al menos un atributo con {id}
- **TIPOS PARA PK**: Prefiere tipos numéricos como Long (preferido), int, o UUID. Usa String solo para códigos alfanuméricos de negocio (ej: "codigo: String {id}" si es un código como "PROD-001")
- **FOREIGN KEYS**: NO definas atributos como "usuarioId", "clienteId" - se generan automáticamente
- **CONSTRAINTS**: Usa {id}, {unique}, {required} según corresponda
- Si la imagen está borrosa, haz tu mejor interpretación
- Si no puedes leer un nombre, usa nombres genéricos como "Clase1", "Clase2"
- Si no ves atributos claros, agrega al menos "id: Long {id}"

## FORMATO DE RESPUESTA JSON:

{
  "newElements": [
    {
      "id": "ai-class-123-usuario",
      "className": "Usuario",
      "attributes": ["id: Long {id}", "nombre: String {required}"],
      "methods": ["getId(): Long"],
      "elementType": "class",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 120
    }
  ],
  "newRelationships": [
    {
      "id": "ai-link-456-usuario-pedido",
      "source": "ai-class-123-usuario",
      "target": "ai-class-789-pedido",
      "relationship": "association",
      "label": "realiza",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "0..*"
    }
  ]
}

Combina la información de la imagen con el prompt del usuario si proporciona contexto adicional.`;

    try {
      // Validar formato de imagen
      let imageUrl = request.image;

      // Si la imagen no tiene el prefijo data:image, agregarlo
      if (!imageUrl.startsWith("data:image/")) {
        // Asumir que es base64 puro, agregar header por defecto
        imageUrl = `data:image/png;base64,${imageUrl}`;
      }

      console.log("📷 Procesando imagen con Azure AI Vision...");

      // Llamar a Azure OpenAI con Vision
      const response = await this.azureClient.chat.completions.create({
        model: this.azureDeployment!,
        messages: [
          {
            role: "system",
            content: visionSystemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  request.prompt ||
                  "Analiza esta imagen y genera un diagrama UML con todas las clases, atributos, métodos y relaciones que puedas identificar.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_completion_tokens: 13107,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      const content = response.choices[0].message.content;

      if (!content) {
        throw new Error("No se recibió contenido válido de Azure AI Vision");
      }

      console.log(
        "📷 Respuesta de Azure AI Vision:",
        content.substring(0, 200) + "..."
      );

      // Intentar parsear el JSON de la respuesta
      try {
        const delta = JSON.parse(content) as DiagramDelta;

        // Validar que tenga la estructura correcta
        if (!delta || typeof delta !== "object") {
          throw new Error("La respuesta debe ser un objeto JSON válido");
        }

        // Asegurar que los arrays obligatorios existan
        if (!Array.isArray(delta.newElements)) {
          delta.newElements = [];
        }
        if (!Array.isArray(delta.newRelationships)) {
          delta.newRelationships = [];
        }

        // Validar arrays opcionales
        if (delta.removeElementIds && !Array.isArray(delta.removeElementIds)) {
          throw new Error("removeElementIds debe ser un array");
        }
        if (
          delta.removeRelationshipIds &&
          !Array.isArray(delta.removeRelationshipIds)
        ) {
          throw new Error("removeRelationshipIds debe ser un array");
        }
        if (delta.updateElements && !Array.isArray(delta.updateElements)) {
          throw new Error("updateElements debe ser un array");
        }
        if (
          delta.updateRelationships &&
          !Array.isArray(delta.updateRelationships)
        ) {
          throw new Error("updateRelationships debe ser un array");
        }

        // Log de lo que se generó desde la imagen
        const stats = [];
        if (delta.newElements.length > 0)
          stats.push(`${delta.newElements.length} clases detectadas`);
        if (delta.newRelationships.length > 0)
          stats.push(`${delta.newRelationships.length} relaciones detectadas`);

        console.log(
          `📷 IA Vision analizó imagen: ${
            stats.length > 0 ? stats.join(", ") : "sin elementos detectados"
          }`
        );

        return {
          success: true,
          delta: delta,
        };
      } catch (parseError) {
        console.error(
          "Error parseando respuesta de Azure AI Vision:",
          parseError
        );
        console.error("Contenido recibido:", content);
        throw new Error(
          "La respuesta de Azure AI Vision no tiene un formato JSON válido"
        );
      }
    } catch (error) {
      console.error("Error en processImageWithAzure:", error);
      throw new Error(
        `Error procesando la imagen con Azure AI Vision: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`
      );
    }
  }
}
