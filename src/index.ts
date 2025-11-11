import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

// Configurar variables de entorno
dotenv.config();
import {
  DiagramController,
  ViewObserver,
} from "./controllers/DiagramController.js";
import { InvitationController } from "./controllers/InvitationController.js";
import { DiagramSnapshotController } from "./controllers/DiagramSnapshotController.js";
import { AIController } from "./controllers/AIController.js";
import { JsonPatchOperation } from "./validation/UMLValidator.js";
import { databaseService } from "./services/DatabaseService.js";
import { InvitationModel } from "./models/InvitationModel.js";
import { UserModel } from "./models/UserModel.js";
import { DiagramSnapshotModel } from "./models/DiagramSnapshotModel.js";
import { transformLogicalToPhysical } from "./models/TransformationManager.js";
import { SpringBootCodeGenerator } from "./models/SpringBootCodeGenerator.js";
import { PostmanCollectionGenerator } from "./models/PostmanCollectionGenerator.js";
import archiver from "archiver";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";

const execAsync = promisify(exec);

// Obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para generar URL de base de datos
function generateDatabaseUrl(config: any): string {
  console.log("Generando URL de BD con config:", config);

  // Solo soportamos PostgreSQL
  let url = `postgresql://${config.username}:${config.password}@${
    config.host
  }:${config.port}/${config.database}?schema=${config.schema || "public"}`;

  if (config.ssl === false) {
    url += "&sslmode=disable";
  } else if (config.ssl === true) {
    url += "&sslmode=require";
  }

  console.log("URL de BD generada:", url);
  return url;
}

// Función helper para crear estructura de archivos desde el código generado
export function createFileStructure(
  codeGenerator: any,
  projectName: string,
  databaseConfig?: any,
  warnings?: string[],
  physicalModel?: any
) {
  // Usar el método generateJavaCode del generador que ya crea la estructura correcta
  const javaFiles = codeGenerator.generateJavaCode();

  // Crear archivos adicionales (configuración, etc.)
  const files: { [path: string]: string | Buffer } = { ...javaFiles };

  const basePackage = "com.example.demo";

  // NO sobrescribir application.properties ni pom.xml aquí
  // SpringBootCodeGenerator ya los genera correctamente con la configuración de BD

  // Archivo principal de Spring Boot
  const mainClassName = `${
    projectName.charAt(0).toUpperCase() + projectName.slice(1)
  }Application`;
  const packagePath = basePackage.replace(/\./g, "/");
  files[
    `src/main/java/${packagePath}/${mainClassName}.java`
  ] = `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class ${mainClassName} {

    public static void main(String[] args) {
        SpringApplication.run(${mainClassName}.class, args);
    }
}`;

  // Archivo de prueba
  files[
    `src/test/java/${packagePath}/${mainClassName}Tests.java`
  ] = `package ${basePackage};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ${mainClassName}Tests {

    @Test
    void contextLoads() {
    }
}`;

  // README.md - ELIMINADO por solicitud del usuario
  // Ya no se genera archivo README.md en el backend exportado

  // Generar colección de Postman si tenemos el modelo físico
  if (physicalModel) {
    try {
      const postmanGenerator = new PostmanCollectionGenerator();
      const entities = codeGenerator.getEntities
        ? codeGenerator.getEntities()
        : [];
      const postmanCollection = postmanGenerator.generateCollection(
        physicalModel,
        projectName,
        entities
      );
      files["postman_collection.json"] = postmanCollection;
    } catch (error) {
      console.warn(
        "Advertencia: No se pudo generar la colección de Postman:",
        error
      );
      if (warnings) {
        warnings.push(`No se pudo generar la colección de Postman: ${error}`);
      }
    }
  }

  return files;
}

class DiagramManager {
  private controllers: Map<string, DiagramController> = new Map();

  async getController(diagramId: string): Promise<DiagramController> {
    console.log(`🔍 getController llamado para diagrama: ${diagramId}`);

    if (!this.controllers.has(diagramId)) {
      console.log(`📝 Controller no existe, creando nuevo para ${diagramId}`);
      const controller = new DiagramController(diagramId);

      // 🔥 SOLUCIÓN: Cargar estado del diagrama desde la base de datos
      try {
        console.log(`🔍 Buscando diagrama en BD: ${diagramId}`);
        const diagramSnapshot =
          await databaseService.findDiagramSnapshotByDiagramId(diagramId);
        if (diagramSnapshot && diagramSnapshot.state) {
          console.log(`📥 Cargando estado del diagrama ${diagramId} desde BD`);
          console.log(
            `   Elementos: ${
              Object.keys(diagramSnapshot.state.elements || {}).length
            }`
          );
          console.log(
            `   Relaciones: ${
              Object.keys(diagramSnapshot.state.relationships || {}).length
            }`
          );
          console.log(
            `   IDs de elementos:`,
            Object.keys(diagramSnapshot.state.elements || {})
          );

          // Inicializar el modelo con el estado de la BD
          controller.initializeState(diagramSnapshot.state);
        } else {
          console.log(
            `⚠️ Diagrama ${diagramId} no encontrado en BD, usando estado vacío`
          );
        }
      } catch (error) {
        console.error(
          `❌ Error cargando estado del diagrama ${diagramId}:`,
          error
        );
        // Continuar con estado vacío si hay error
      }

      this.controllers.set(diagramId, controller);
    } else {
      console.log(`✅ Controller ya existe para ${diagramId}, reutilizando`);
    }
    return this.controllers.get(diagramId)!;
  }

  removeController(diagramId: string) {
    this.controllers.delete(diagramId);
  }

  // 🔥 NUEVO: Recargar estado del controller desde BD
  async reloadControllerState(diagramId: string): Promise<void> {
    console.log(
      `🔄 Recargando estado del controller para diagrama: ${diagramId}`
    );

    const controller = this.controllers.get(diagramId);
    if (!controller) {
      console.log(
        `⚠️ Controller no existe para ${diagramId}, no se puede recargar`
      );
      return;
    }

    try {
      const diagramSnapshot =
        await databaseService.findDiagramSnapshotByDiagramId(diagramId);

      if (diagramSnapshot && diagramSnapshot.state) {
        console.log(`✅ Estado recargado desde BD para ${diagramId}`);
        console.log(
          `   Elementos: ${
            Object.keys(diagramSnapshot.state.elements || {}).length
          }`
        );
        console.log(
          `   Relaciones: ${
            Object.keys(diagramSnapshot.state.relationships || {}).length
          }`
        );

        // Re-inicializar el modelo con el nuevo estado
        controller.initializeState(diagramSnapshot.state);
      } else {
        console.log(`⚠️ No se encontró estado en BD para ${diagramId}`);
      }
    } catch (error) {
      console.error(
        `❌ Error recargando estado del diagrama ${diagramId}:`,
        error
      );
    }
  }
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5174", // Vite dev server
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Instancia del controlador (única para toda la aplicación)
const diagramManager = new DiagramManager();
const invitationController = new InvitationController();
const diagramSnapshotController = new DiagramSnapshotController();
const aiController = new AIController();

// 🔄 UNDO/REDO: Historial de operaciones por diagrama (últimas 100 por diagrama)
const operationHistory = new Map<string, JsonPatchOperation[]>();
const redoHistory = new Map<string, JsonPatchOperation[]>();

// Conexiones activas - mapea socket.id a diagramId
const activeConnections = new Map<string, string>();

/**
 * 🔄 UNDO/REDO: Función para crear operación inversa con acceso al estado del servidor
 */
function createInverseOperation(
  operation: JsonPatchOperation & { previousValue?: any; removedValue?: any },
  currentState: any
): JsonPatchOperation {
  const newOp = {
    ...operation,
    timestamp: Date.now(),
    sequenceNumber: operation.sequenceNumber + 1,
  };

  switch (operation.op) {
    case "add":
      // Inverso de add es remove
      // Cambiar el path de /elements/- a /elements/{id}
      let removePath = operation.path;
      if (
        operation.path.endsWith("/-") &&
        operation.value &&
        (operation.value as any).id
      ) {
        const id = (operation.value as any).id;
        removePath = operation.path.replace("/-", `/${id}`);
      }

      return {
        ...newOp,
        op: "remove",
        path: removePath,
        value: undefined,
        description: `Deshacer: ${operation.description}`,
      };

    case "remove":
      // Inverso de remove es add (recuperar el valor eliminado que guardamos)
      // Cambiar el path de /elements/{id} a /elements/-
      let addPath = operation.path;
      if (operation.path.match(/\/(elements|relationships)\/[^/]+$/)) {
        addPath = operation.path.replace(/\/[^/]+$/, "/-");
      }

      return {
        ...newOp,
        op: "add",
        path: addPath,
        value: operation.removedValue, // Usar el valor que guardamos antes de eliminar
        description: `Deshacer: ${operation.description}`,
      };

    case "replace":
      // Para replace, usar el previousValue guardado en la operación
      const previousValue = operation.previousValue;

      return {
        ...newOp,
        op: "replace",
        value: previousValue, // Restaurar el valor anterior guardado
        description: `Deshacer: ${operation.description}`,
      };

    default:
      return newOp;
  }
}

io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  let currentController: DiagramController | null = null;
  let unregisterView: (() => void) | null = null;
  let userName: string = "Usuario Anónimo"; // Nombre por defecto

  // Crear observador para esta vista (socket)
  const viewObserver: ViewObserver = {
    id: socket.id,
    notify: (operation: JsonPatchOperation, newState: any) => {
      // Enviar notificación a la vista específica
      socket.emit("diagram:update", { operation, newState });
    },
  };

  // Manejar registro de usuario
  socket.on("user:register", (data: { name: string; userId?: string }) => {
    userName = data.name || "Usuario Anónimo";
    (socket as any).userName = userName; // Guardar en el socket para acceso global
    console.log(`Usuario registrado: ${userName} (Socket: ${socket.id})`);
  });

  // Manejar unión a sala de diagrama
  socket.on("diagram:join", async (diagramId: string) => {
    // Si ya estaba en un diagrama, desregistrar
    if (unregisterView) {
      unregisterView();
    }

    // Obtener controlador para este diagrama
    currentController = await diagramManager.getController(diagramId);

    // Registrar la vista en el controlador
    unregisterView = currentController.registerView(socket.id, viewObserver);

    socket.join(`diagram-${diagramId}`);
    activeConnections.set(socket.id, diagramId);
    console.log(`Cliente ${socket.id} se unió al diagrama ${diagramId}`);

    // Obtener lista de usuarios conectados a este diagrama
    const roomSockets = await io.in(`diagram-${diagramId}`).fetchSockets();
    const connectedUsers = await Promise.all(
      roomSockets.map(async (s) => {
        // Obtener el nombre del usuario desde el handshake data o usar el nombre registrado
        const socketUserName =
          (s as any).userName || `Usuario ${s.id.substring(0, 6)}`;
        return {
          id: s.id,
          name: socketUserName,
          connectedAt: new Date(),
        };
      })
    );

    // Enviar lista actualizada de usuarios a todos los clientes de la sala
    io.to(`diagram-${diagramId}`).emit("users:update", {
      connectedUsers,
      totalUsers: connectedUsers.length,
    });

    // Notificar a otros clientes en la sala
    socket.to(`diagram-${diagramId}`).emit("user:joined", {
      userId: socket.id,
      timestamp: Date.now(),
    });
  });

  // Manejar operaciones del diagrama - MVC Pattern
  socket.on("diagram:operation", async (operation: JsonPatchOperation) => {
    if (!currentController) {
      socket.emit("operation:error", {
        operation,
        error: "No se ha unido a ningún diagrama",
        timestamp: Date.now(),
      });
      return;
    }

    try {
      console.log(`Operación recibida de vista ${socket.id}:`, operation);

      // 🔄 UNDO/REDO: Guardar información necesaria para crear operación inversa
      let operationWithPreviousValue: any = operation;

      if (operation.op === "add") {
        // Para add, guardar el valor agregado (necesario para remove en undo)
        operationWithPreviousValue = {
          ...operation,
          // El valor ya está en operation.value
        };
        console.log(`📝 Operación add guardada para undo:`, operation.value);
      } else if (operation.op === "remove") {
        // Para remove, guardar el valor que se va a eliminar (necesario para add en undo)
        const currentState = currentController.getCurrentState();
        const pathParts = operation.path.split("/").filter((p) => p);

        // Obtener el elemento que se va a eliminar
        let elementToRemove: any = currentState;
        for (const part of pathParts) {
          elementToRemove = elementToRemove?.[part];
        }

        operationWithPreviousValue = {
          ...operation,
          removedValue: elementToRemove, // Guardar el valor eliminado
        };

        console.log(`📝 Valor a eliminar guardado para undo:`, elementToRemove);
      } else if (operation.op === "replace") {
        // Para replace, guardar el valor anterior
        const currentState = currentController.getCurrentState();
        const pathParts = operation.path.split("/").filter((p) => p);
        let previousValue: any = currentState;

        // Navegar por el path para obtener el valor actual (que será el "anterior" después de aplicar)
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];

          // 📍 Caso especial: si el campo es "position", obtener {x, y} del elemento
          if (part === "position" && i === pathParts.length - 1) {
            // previousValue es el elemento en este punto
            previousValue = {
              x: previousValue?.x,
              y: previousValue?.y,
            };
            break;
          }

          previousValue = previousValue?.[part];
        }

        // Guardar el valor anterior en la operación para usarlo en undo
        operationWithPreviousValue = {
          ...operation,
          previousValue, // Guardamos el valor antes de la operación
        };

        console.log(`📝 Valor anterior guardado para undo:`, previousValue);
      }

      // El controlador procesa la operación a través del modelo
      const result = await currentController.processOperation(
        socket.id,
        operation
      );

      if (result.success) {
        // 🔄 UNDO/REDO: Guardar operación exitosa en el historial (con previousValue si es replace)
        const diagramId = activeConnections.get(socket.id);
        if (diagramId) {
          const history = operationHistory.get(diagramId) || [];
          history.push(operationWithPreviousValue);
          // Mantener solo las últimas 100 operaciones
          if (history.length > 100) {
            history.shift();
          }
          operationHistory.set(diagramId, history);

          // Limpiar redo cuando se hace una nueva operación
          redoHistory.set(diagramId, []);
        }

        // Confirmar operación a la vista que la envió
        socket.emit("operation:confirmed", {
          operation,
          timestamp: Date.now(),
        });

        console.log(`Operación confirmada para vista ${socket.id}`);

        // 🔄 COLABORACIÓN: Broadcast de la operación a otros clientes en la sala
        // Reutilizar diagramId del bloque anterior
        if (diagramId) {
          socket.to(`diagram-${diagramId}`).emit("diagram:operation", {
            operation,
            timestamp: Date.now(),
          });
          console.log(
            `📡 Operación broadcast a otros usuarios en diagrama ${diagramId}`
          );
        }
      } else {
        // Rechazar operación con errores
        socket.emit("operation:rejected", {
          operation,
          reason: result.errors?.join(", ") || "Error desconocido",
          timestamp: Date.now(),
        });

        console.log(
          `Operación rechazada para vista ${socket.id}:`,
          result.errors
        );
      }
    } catch (error) {
      console.error(`Error procesando operación de vista ${socket.id}:`, error);
      socket.emit("operation:error", {
        operation,
        error: "Error interno del servidor",
        timestamp: Date.now(),
      });
    }
  });

  // 🔄 UNDO/REDO: Handler para deshacer última operación
  socket.on("diagram:undo", async () => {
    if (!currentController) {
      socket.emit("undo:error", {
        error: "No se ha unido a ningún diagrama",
        timestamp: Date.now(),
      });
      return;
    }

    const diagramId = activeConnections.get(socket.id);
    if (!diagramId) {
      socket.emit("undo:error", {
        error: "Diagrama no encontrado",
        timestamp: Date.now(),
      });
      return;
    }

    try {
      // Validar que solo haya 1 usuario activo (single-user mode)
      const room = io.sockets.adapter.rooms.get(`diagram-${diagramId}`);
      const userCount = room ? room.size : 0;

      if (userCount > 1) {
        socket.emit("undo:blocked", {
          reason: "Undo/Redo solo está disponible cuando trabajas solo",
          userCount,
          timestamp: Date.now(),
        });
        console.log(
          `🚫 Undo bloqueado: ${userCount} usuarios activos en ${diagramId}`
        );
        return;
      }

      // Obtener historial de operaciones
      const history = operationHistory.get(diagramId) || [];

      if (history.length === 0) {
        socket.emit("undo:error", {
          error: "No hay operaciones para deshacer",
          timestamp: Date.now(),
        });
        return;
      }

      // Obtener última operación
      const lastOperation = history.pop()!;
      operationHistory.set(diagramId, history);

      console.log(`🔄 Deshaciendo operación:`, lastOperation);

      // 🔄 UNDO/REDO: Para operaciones replace, obtener el valor actual ANTES de aplicar la inversa
      const currentState = currentController.getCurrentState();

      // Crear operación inversa con acceso al estado actual
      const inverseOperation = createInverseOperation(
        lastOperation,
        currentState
      );

      console.log(`📝 Operación inversa creada:`, inverseOperation);

      // Aplicar la operación inversa al modelo
      const result = await currentController.processOperation(
        socket.id,
        inverseOperation
      );

      if (result.success) {
        // Guardar operación original en redo stack
        const redoStack = redoHistory.get(diagramId) || [];
        redoStack.push(lastOperation);
        if (redoStack.length > 100) {
          redoStack.shift();
        }
        redoHistory.set(diagramId, redoStack);

        // Confirmar undo exitoso con información de estados
        const canUndoMore = history.length > 0;
        const canRedoMore = redoStack.length > 0;

        socket.emit("undo:success", {
          undoneOperation: lastOperation,
          inverseOperation,
          canUndo: canUndoMore,
          canRedo: canRedoMore,
          timestamp: Date.now(),
        });

        // 🔄 COLABORACIÓN: Broadcast de la operación inversa a otros clientes
        // Nota: Solo en single-user mode, pero por si acaso
        socket.to(`diagram-${diagramId}`).emit("diagram:operation", {
          operation: inverseOperation,
          timestamp: Date.now(),
        });

        console.log(
          `✅ Undo exitoso para ${socket.id} (canUndo: ${canUndoMore}, canRedo: ${canRedoMore})`
        );
      } else {
        // Si falla, restaurar la operación en el historial
        history.push(lastOperation);
        operationHistory.set(diagramId, history);

        socket.emit("undo:error", {
          error: `Error aplicando undo: ${result.errors?.join(", ")}`,
          timestamp: Date.now(),
        });

        console.log(`❌ Error en undo:`, result.errors);
      }
    } catch (error) {
      console.error(`❌ Error en undo:`, error);
      socket.emit("undo:error", {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
        timestamp: Date.now(),
      });
    }
  });

  // 🔄 UNDO/REDO: Handler para rehacer última operación deshecha
  socket.on("diagram:redo", async () => {
    if (!currentController) {
      socket.emit("redo:error", {
        error: "No se ha unido a ningún diagrama",
        timestamp: Date.now(),
      });
      return;
    }

    const diagramId = activeConnections.get(socket.id);
    if (!diagramId) {
      socket.emit("redo:error", {
        error: "Diagrama no encontrado",
        timestamp: Date.now(),
      });
      return;
    }

    try {
      // Validar que solo haya 1 usuario activo (single-user mode)
      const room = io.sockets.adapter.rooms.get(`diagram-${diagramId}`);
      const userCount = room ? room.size : 0;

      if (userCount > 1) {
        socket.emit("redo:blocked", {
          reason: "Undo/Redo solo está disponible cuando trabajas solo",
          userCount,
          timestamp: Date.now(),
        });
        console.log(
          `🚫 Redo bloqueado: ${userCount} usuarios activos en ${diagramId}`
        );
        return;
      }

      // Obtener redo stack
      const redoStack = redoHistory.get(diagramId) || [];

      if (redoStack.length === 0) {
        socket.emit("redo:error", {
          error: "No hay operaciones para rehacer",
          timestamp: Date.now(),
        });
        return;
      }

      // Obtener última operación deshecha
      const operationToRedo = redoStack.pop()!;
      redoHistory.set(diagramId, redoStack);

      console.log(`🔁 Rehaciendo operación:`, operationToRedo);

      // Aplicar la operación original nuevamente
      const result = await currentController.processOperation(
        socket.id,
        operationToRedo
      );

      if (result.success) {
        // Guardar en historial normal
        const history = operationHistory.get(diagramId) || [];
        history.push(operationToRedo);
        if (history.length > 100) {
          history.shift();
        }
        operationHistory.set(diagramId, history);

        // Confirmar redo exitoso con información de estados
        const canUndoMore = history.length > 0;
        const canRedoMore = redoStack.length > 0;

        socket.emit("redo:success", {
          redoneOperation: operationToRedo,
          canUndo: canUndoMore,
          canRedo: canRedoMore,
          timestamp: Date.now(),
        });

        // 🔄 COLABORACIÓN: Broadcast de la operación rehecha a otros clientes
        // Nota: Solo en single-user mode, pero por si acaso
        socket.to(`diagram-${diagramId}`).emit("diagram:operation", {
          operation: operationToRedo,
          timestamp: Date.now(),
        });

        console.log(
          `✅ Redo exitoso para ${socket.id} (canUndo: ${canUndoMore}, canRedo: ${canRedoMore})`
        );
      } else {
        // Si falla, restaurar la operación en redo stack
        redoStack.push(operationToRedo);
        redoHistory.set(diagramId, redoStack);

        socket.emit("redo:error", {
          error: `Error aplicando redo: ${result.errors?.join(", ")}`,
          timestamp: Date.now(),
        });

        console.log(`❌ Error en redo:`, result.errors);
      }
    } catch (error) {
      console.error(`❌ Error en redo:`, error);
      socket.emit("redo:error", {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
        timestamp: Date.now(),
      });
    }
  });

  // 🤖 IA: Handler para procesar solicitudes de IA en modo colaborativo
  socket.on(
    "ai:request",
    async (data: {
      request: any;
      userName?: string;
      userId?: string;
      diagramId?: string;
    }) => {
      console.log(`🤖 Solicitud de IA recibida de ${socket.id}`);

      const diagramId = activeConnections.get(socket.id) || data.diagramId;
      if (!diagramId) {
        socket.emit("ai:error", {
          error: "No estás conectado a ningún diagrama",
          timestamp: Date.now(),
        });
        return;
      }

      try {
        // Notificar a todos los usuarios que se está procesando una solicitud de IA
        io.to(`diagram-${diagramId}`).emit("ai:processing", {
          userId: socket.id,
          userName: data.userName || userName,
          prompt: data.request.prompt,
          timestamp: Date.now(),
        });

        console.log(`🤖 Procesando solicitud de IA para diagrama ${diagramId}`);

        // Procesar la solicitud usando el AIController
        const response = await aiController.processAIRequestSocket(
          data.request
        );

        if (response.success && response.delta) {
          console.log(`✅ IA generó respuesta exitosa, broadcasting a todos`);

          // Broadcast de la respuesta de IA a TODOS los usuarios del diagrama
          io.to(`diagram-${diagramId}`).emit("ai:response", {
            delta: response.delta,
            prompt: data.request.prompt,
            userId: socket.id,
            userName: data.userName || userName,
            timestamp: Date.now(),
          });
        } else {
          // Notificar error a todos los usuarios
          io.to(`diagram-${diagramId}`).emit("ai:error", {
            error: response.error || "Error desconocido",
            userId: socket.id,
            userName: data.userName || userName,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error(`❌ Error procesando solicitud de IA:`, error);
        io.to(`diagram-${diagramId}`).emit("ai:error", {
          error:
            error instanceof Error
              ? error.message
              : "Error interno del servidor",
          userId: socket.id,
          userName: data.userName || userName,
          timestamp: Date.now(),
        });
      }
    }
  );

  // Manejar desconexión
  socket.on("disconnect", async () => {
    const diagramId = activeConnections.get(socket.id);
    if (diagramId) {
      // Notificar a otros clientes en la sala
      socket.to(`diagram-${diagramId}`).emit("user:left", {
        userId: socket.id,
        timestamp: Date.now(),
      });
      activeConnections.delete(socket.id);

      // Actualizar lista de usuarios conectados después de la desconexión
      const roomSockets = await io.in(`diagram-${diagramId}`).fetchSockets();
      const connectedUsers = await Promise.all(
        roomSockets.map(async (s) => {
          // Obtener el nombre del usuario desde el socket
          const socketUserName =
            (s as any).userName || `Usuario ${s.id.substring(0, 6)}`;
          return {
            id: s.id,
            name: socketUserName,
            connectedAt: new Date(),
          };
        })
      );

      // Enviar lista actualizada a los usuarios restantes
      io.to(`diagram-${diagramId}`).emit("users:update", {
        connectedUsers,
        totalUsers: connectedUsers.length,
      });
    }

    // Remover la vista del controlador
    if (unregisterView) {
      unregisterView();
    }

    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

// Rutas HTTP para estadísticas y estado
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Endpoint de prueba para validación de credenciales
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`Intento de login - Email: ${email}`);

    const userModel = new UserModel();
    const user = await userModel.validateCredentials(email, password);

    console.log(`Resultado validación - Usuario encontrado: ${!!user}`);
    if (user) {
      console.log(`Login exitoso para: ${user.email}`);
      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email },
      });
    } else {
      console.log(`Login fallido para: ${email}`);
      res.status(401).json({ success: false, error: "Credenciales inválidas" });
    }
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Endpoint de prueba para registro de usuarios
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Faltan campos requeridos: name, email, password" });
    }

    const userModel = new UserModel();
    const newUser = await userModel.create({ name, email, password });

    res.status(201).json({
      success: true,
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
    });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.get("/diagram/:diagramId/stats", async (req, res) => {
  const { diagramId } = req.params;
  const controller = await diagramManager.getController(diagramId);
  const stats = controller.getStatistics();
  res.json(stats);
});

app.get("/diagram/:diagramId/state", async (req, res) => {
  const { diagramId } = req.params;
  const controller = await diagramManager.getController(diagramId);
  const state = controller.getCurrentState();
  res.json(state);
});

// Rutas API para invitaciones
app.post("/api/invitations", (req, res) =>
  invitationController.createInvitation(req, res)
);
app.get("/api/invitations/user/:userId", (req, res) =>
  invitationController.getInvitationsByUser(req, res)
);
app.get("/api/invitations/:id", (req, res) =>
  invitationController.getInvitationById(req, res)
);
app.post("/api/invitations/:id/accept", (req, res) =>
  invitationController.acceptInvitation(req, res)
);
app.post("/api/invitations/:id/reject", (req, res) =>
  invitationController.rejectInvitation(req, res)
);
app.delete("/api/invitations/:id", (req, res) =>
  invitationController.deleteInvitation(req, res)
);
app.get("/api/invitations", (req, res) =>
  invitationController.getAllInvitations(req, res)
);

// Endpoint de prueba
app.get("/api/test", (req, res) => {
  res.json({
    message: "API funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

// Rutas API para diagramas
app.get("/api/diagrams/check-name", (req, res) =>
  diagramSnapshotController.checkDiagramNameExists(req, res)
);
app.get("/api/diagrams/user/:userId", (req, res) =>
  diagramSnapshotController.getDiagramsByUser(req, res)
);
app.get("/api/diagrams/:diagramId", (req, res) =>
  diagramSnapshotController.getDiagramById(req, res)
);
app.post("/api/diagrams", (req, res) =>
  diagramSnapshotController.createDiagram(req, res)
);
app.put("/api/diagrams/:diagramId", async (req, res) => {
  await diagramSnapshotController.updateDiagram(req, res);
  // Recargar el estado del controlador después de actualizar la DB
  await diagramManager.reloadControllerState(req.params.diagramId);
});
app.delete("/api/diagrams/:diagramId", (req, res) =>
  diagramSnapshotController.deleteDiagram(req, res)
);

// Endpoint de IA
app.post("/api/ai/process", (req, res) =>
  aiController.processAIRequest(req, res)
);

// Endpoints de exportación
app.get("/api/diagrams/:diagramId/export/json", (req, res) =>
  diagramSnapshotController.exportDiagramAsJSON(req, res)
);
app.get("/api/diagrams/:diagramId/export/svg", (req, res) =>
  diagramSnapshotController.exportDiagramAsSVG(req, res)
);

// Endpoint para generar backend
app.post("/api/diagrams/generate-backend", async (req, res) => {
  try {
    const { diagramState, diagramName, databaseConfig, diagramId, creatorId } =
      req.body;

    if (!diagramState) {
      return res.status(400).json({
        success: false,
        error: "Estado del diagrama requerido",
      });
    }

    console.log("Iniciando transformación del diagrama:", diagramName);
    console.log("Configuración de BD:", databaseConfig);

    // Paso 1: Transformar modelo lógico a físico
    const transformationResult = transformLogicalToPhysical(diagramState);

    if (!transformationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Error en transformación: ${transformationResult.errors.join(
          ", "
        )}`,
        details: transformationResult,
      });
    }

    console.log("Transformación completada, guardando snapshot...");

    // Validar que el modelo físico no esté vacío
    if (
      !transformationResult.physicalModel ||
      Object.keys(transformationResult.physicalModel.tables || {}).length === 0
    ) {
      return res.status(400).json({
        success: false,
        error:
          "El modelo físico está vacío. Asegúrate de que el diagrama contenga clases válidas con atributos.",
        details: transformationResult,
      });
    }

    console.log(
      `Modelo físico contiene ${
        Object.keys(transformationResult.physicalModel.tables).length
      } tablas`
    );

    // Obtener modelo físico anterior Y migraciones existentes ANTES de actualizar el snapshot
    let previousPhysicalModel: any = undefined;
    let existingMigrations: string[] = [];
    let existingMigrationFiles: Array<{ fileName: string; sql: string }> = [];

    if (diagramId && creatorId) {
      try {
        const diagramSnapshotModel = new DiagramSnapshotModel();
        const existingSnapshot =
          await diagramSnapshotModel.getLatestByDiagramId(diagramId);
        if (existingSnapshot && existingSnapshot.physicalModel) {
          previousPhysicalModel = existingSnapshot.physicalModel;
          console.log(
            "✅ Modelo físico anterior encontrado para migraciones incrementales"
          );
          console.log(
            `   Tablas anteriores: ${
              Object.keys(existingSnapshot.physicalModel.tables || {}).length
            }`
          );

          // Leer migraciones existentes de la base de datos
          // Priorizar migrationFiles (nuevo formato con SQL completo)
          if (
            existingSnapshot.migrationFiles &&
            Array.isArray(existingSnapshot.migrationFiles)
          ) {
            existingMigrationFiles = existingSnapshot.migrationFiles as Array<{
              fileName: string;
              sql: string;
            }>;
            existingMigrations = existingMigrationFiles.map((m) =>
              m.fileName.replace(".sql", "")
            );
            console.log(
              `📂 Archivos de migración encontrados: ${existingMigrationFiles.length}`
            );
            existingMigrationFiles.forEach((m) =>
              console.log(`   - ${m.fileName} (${m.sql.length} caracteres SQL)`)
            );
          } else if (
            existingSnapshot.migrations &&
            Array.isArray(existingSnapshot.migrations)
          ) {
            // Fallback al formato antiguo (solo nombres)
            existingMigrations = existingSnapshot.migrations;
            console.log(
              `📂 Migraciones existentes encontradas (formato antiguo): ${existingMigrations.length}`
            );
            console.warn(
              "⚠️ ADVERTENCIA: Usando formato antiguo de migraciones (solo nombres). El SQL no estará disponible en el backend generado."
            );
            existingMigrations.forEach((m) => console.log(`   - ${m}`));
          } else {
            console.log("📂 No hay migraciones previas registradas");
          }
        } else {
          console.log(
            "ℹ️ No hay modelo físico anterior, se generará V1__initial_schema.sql"
          );
        }
      } catch (error) {
        console.warn(
          "Advertencia: No se pudo obtener modelo físico anterior:",
          error
        );
      }
    }

    // NOTA: NO actualizamos el snapshot aquí para evitar sobrescribir las migraciones
    // La actualización completa (physicalModel + migrations) se hará al final
    // después de generar el código

    console.log("Generando código Spring Boot...");

    // Paso 3: Generar código Spring Boot con soporte para migraciones incrementales
    const codeGenerator = new SpringBootCodeGenerator(
      transformationResult.physicalModel!,
      "com.example.demo",
      diagramName || "generated-backend",
      databaseConfig, // Configuración de base de datos
      previousPhysicalModel, // Modelo físico anterior para detectar cambios
      existingMigrations, // Nombres de migraciones existentes (DEPRECATED)
      existingMigrationFiles // Archivos completos de migración con SQL
    );

    // Generar el código para obtener las migraciones
    const generatedCode = codeGenerator.generateCode();

    // Obtener nombres de las migraciones generadas
    const newMigrations = (generatedCode.flywayMigrations || []).map((m) =>
      m.fileName.replace(".sql", "")
    );

    // Actualizar lista de migraciones (combinar existentes + nuevas)
    const allMigrations = [
      ...new Set([...existingMigrations, ...newMigrations]),
    ];

    console.log(
      `📝 Migraciones generadas en este backend: ${newMigrations.length}`
    );
    newMigrations.forEach((m) => console.log(`   - ${m}`));

    // Variable para rastrear advertencias (actualmente no hay advertencias)
    const warnings: string[] = [];

    // ℹ️ NOTA: La base de datos se creará automáticamente cuando el usuario
    // compile el proyecto Spring Boot generado. Flyway ejecutará las migraciones.
    console.log(
      "ℹ️ Base de datos será gestionada por Spring Boot/Flyway al compilar el proyecto"
    );

    // Paso 4: Crear estructura de archivos
    const fileStructure = createFileStructure(
      codeGenerator,
      diagramName || "backend",
      databaseConfig,
      warnings.length > 0 ? warnings : undefined,
      transformationResult.physicalModel
    );

    // ✅ Ya no necesitamos agregar lombok.jar manualmente porque está en pom.xml

    // Paso 5: Crear archivo ZIP
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Mejor compresión
    });

    // Configurar headers para descarga
    const zipFileName = `${diagramName || "backend"}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFileName}"`
    );

    // Pipe del archive a la respuesta
    archive.pipe(res);

    // Agregar archivos al ZIP
    for (const [filePath, content] of Object.entries(fileStructure)) {
      archive.append(content, { name: filePath });
    }

    // Manejar errores
    archive.on("error", (err) => {
      console.error("Error creando ZIP:", err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Error creando archivo ZIP",
        });
      }
    });

    // Finalizar el archive
    archive.finalize();

    console.log(
      `ZIP generado exitosamente con ${
        Object.keys(fileStructure).length
      } archivos`
    );

    // Actualizar/crear snapshot con physicalModel + migraciones (incluir SQL completo)
    if (diagramId && creatorId) {
      try {
        const diagramSnapshotModel = new DiagramSnapshotModel();

        // Combinar archivos de migración existentes + nuevos
        const allMigrationFiles = [
          ...(existingMigrationFiles || []),
          ...(generatedCode.flywayMigrations || []),
        ];

        // Verificar si ya existe un snapshot
        const existingSnapshot =
          await diagramSnapshotModel.getLatestByDiagramId(diagramId);

        if (existingSnapshot) {
          // Actualizar snapshot existente con physicalModel + migraciones
          await diagramSnapshotModel.update(diagramId, {
            name: diagramName || existingSnapshot.name,
            description: `Backend generado automáticamente para ${diagramName}`,
            state: diagramState,
            physicalModel: transformationResult.physicalModel,
            migrations: allMigrations, // Mantener para compatibilidad
            migrationFiles: allMigrationFiles, // Nuevo formato con SQL completo
            tags: ["generated", "backend"],
          });
          console.log(
            "✅ Snapshot actualizado con modelo físico y migraciones"
          );
        } else {
          // Crear nuevo snapshot con physicalModel + migraciones
          await diagramSnapshotModel.create({
            diagramId,
            name: diagramName || "Generated Backend",
            description: `Backend generado automáticamente para ${diagramName}`,
            creatorId,
            collaborators: [],
            state: diagramState,
            physicalModel: transformationResult.physicalModel,
            migrations: allMigrations,
            migrationFiles: allMigrationFiles,
            isPublic: false,
            tags: ["generated", "backend"],
          });
          console.log("✅ Snapshot creado con modelo físico y migraciones");
        }

        console.log(
          `📊 Total: ${
            allMigrationFiles.length
          } archivos de migración (${allMigrationFiles.reduce(
            (acc, m) => acc + m.sql.length,
            0
          )} caracteres SQL totales)`
        );
      } catch (error) {
        console.warn(
          "⚠️ Advertencia: No se pudo actualizar el snapshot con las migraciones:",
          error
        );
      }
    }
  } catch (error) {
    console.error("Error generando backend:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: `Error interno del servidor: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`,
      });
    }
  }
});

// Endpoint para generar proyecto Flutter
app.post("/api/flutter/generate", async (req, res) => {
  try {
    const { diagramId, apiBaseUrl } = req.body;

    if (!diagramId) {
      return res.status(400).json({ error: "diagramId es requerido" });
    }

    // URL por defecto para emulador Android
    const backendUrl = apiBaseUrl || "http://10.0.2.2:4000/api";

    console.log(`📱 Generando proyecto Flutter para diagrama: ${diagramId}`);
    console.log(`🌐 URL del backend: ${backendUrl}`);

    // 1. Obtener el diagrama
    const diagram = await databaseService.findDiagramSnapshotByDiagramId(
      diagramId
    );

    if (!diagram) {
      return res.status(404).json({ error: "Diagrama no encontrado" });
    }

    // 2. Validar que el diagrama tenga estado
    if (!diagram.state) {
      return res.status(400).json({
        error: "El diagrama no tiene estado definido",
      });
    }

    // 3. Transformar el estado del diagrama a modelo físico
    console.log("Transformando diagrama a modelo físico...");
    const transformationResult = transformLogicalToPhysical(diagram.state);

    if (!transformationResult.success) {
      return res.status(400).json({
        error: `Error en transformación: ${transformationResult.errors.join(
          ", "
        )}`,
      });
    }

    const physicalModel = transformationResult.physicalModel;

    if (!physicalModel) {
      return res.status(400).json({
        error: "No se pudo generar el modelo físico",
      });
    }

    // 4. Generar entidades de Spring Boot (para obtener la estructura)
    const springGenerator = new SpringBootCodeGenerator(
      physicalModel,
      "com.example.demo"
    );
    const entities = springGenerator.getEntities();

    // 5. Importar y usar FlutterCodeGenerator con la URL personalizada
    const { FlutterCodeGenerator } = await import(
      "./models/FlutterCodeGenerator.js"
    );
    const flutterGenerator = new FlutterCodeGenerator(
      "com.example.app",
      backendUrl
    );

    // 6. Crear directorio temporal
    const tempDir = path.join(os.tmpdir(), `flutter-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // 7. Generar proyecto Flutter
    flutterGenerator.generateFlutterProject(
      entities,
      tempDir,
      diagram.name.replace(/\s+/g, "_").toLowerCase()
    );

    // 7.b Ejecutar `flutter create .` en el directorio temporal para generar
    // la estructura nativa de plataformas (android/ ios / web) si flutter
    // está disponible en la máquina del servidor. Esto garantiza que el ZIP
    // contenga los archivos necesarios como AndroidManifest.xml.
    try {
      const { execSync } = await import("child_process");
      console.log(
        "🔧 Ejecutando 'flutter create .' para completar plataformas..."
      );
      // Ejecutar con PATH heredado; si flutter no está instalado, esto fallará y lo capturamos.
      execSync("flutter create .", { cwd: tempDir, stdio: "inherit" });
      console.log("✅ 'flutter create .' completado");

      // 7.c Configurar archivos de Android para soportar HTTP cleartext traffic
      console.log("🔧 Configurando archivos de Android para HTTP cleartext...");

      // Modificar build.gradle (Groovy)
      const buildGradlePath = path.join(tempDir, "android/app/build.gradle");
      if (fs.existsSync(buildGradlePath)) {
        let buildGradleContent = fs.readFileSync(buildGradlePath, "utf-8");

        // Reemplazar minSdkVersion
        buildGradleContent = buildGradleContent.replace(
          /minSdkVersion\s+flutter\.minSdkVersion/g,
          "minSdkVersion 23"
        );

        // Reemplazar targetSdkVersion
        buildGradleContent = buildGradleContent.replace(
          /targetSdkVersion\s+flutter\.targetSdkVersion/g,
          "targetSdkVersion 33"
        );

        fs.writeFileSync(buildGradlePath, buildGradleContent);
        console.log("✅ Configurado minSdkVersion = 23 en build.gradle");
      }

      // Modificar build.gradle.kts (Kotlin) si existe
      const buildGradleKtsPath = path.join(
        tempDir,
        "android/app/build.gradle.kts"
      );
      if (fs.existsSync(buildGradleKtsPath)) {
        let buildGradleKtsContent = fs.readFileSync(
          buildGradleKtsPath,
          "utf-8"
        );

        // Reemplazar minSdk
        buildGradleKtsContent = buildGradleKtsContent.replace(
          /minSdk\s*=\s*flutter\.minSdkVersion/g,
          "minSdk = 23"
        );

        // Reemplazar targetSdk
        buildGradleKtsContent = buildGradleKtsContent.replace(
          /targetSdk\s*=\s*flutter\.targetSdkVersion/g,
          "targetSdk = 33"
        );

        fs.writeFileSync(buildGradleKtsPath, buildGradleKtsContent);
        console.log("✅ Configurado minSdk = 23 en build.gradle.kts");
      }

      // Modificar AndroidManifest.xml
      const manifestPath = path.join(
        tempDir,
        "android/app/src/main/AndroidManifest.xml"
      );
      if (fs.existsSync(manifestPath)) {
        let manifestContent = fs.readFileSync(manifestPath, "utf-8");

        // Agregar permiso de INTERNET si no existe
        if (!manifestContent.includes("android.permission.INTERNET")) {
          manifestContent = manifestContent.replace(
            /<manifest([^>]*)>/,
            '<manifest$1>\n    <uses-permission android:name="android.permission.INTERNET"/>'
          );
          console.log("✅ Agregado permiso INTERNET al AndroidManifest");
        }

        // Agregar usesCleartextTraffic="true" si no existe
        if (!manifestContent.includes("usesCleartextTraffic")) {
          manifestContent = manifestContent.replace(
            /<application/,
            '<application\n        android:usesCleartextTraffic="true"'
          );
          console.log(
            "✅ Agregado usesCleartextTraffic=true al AndroidManifest"
          );
        }

        fs.writeFileSync(manifestPath, manifestContent);
      }

      console.log("✅ Configuración de Android completada");
    } catch (createErr) {
      console.warn(
        "⚠️ No se pudo ejecutar 'flutter create .' en el servidor. El ZIP contendrá sólo la app Dart. Si corres la app localmente, ejecuta 'flutter create .' dentro del proyecto extraído.",
        createErr
      );
    }

    // 8. Crear ZIP del proyecto
    const zipPath = path.join(os.tmpdir(), `flutter-${Date.now()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(tempDir, false);
      archive.finalize();
    });

    console.log(`✅ Proyecto Flutter generado: ${zipPath}`);

    // 9. Enviar el archivo
    res.download(zipPath, `flutter-${diagram.name}.zip`, (err) => {
      // Limpiar archivos temporales
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.unlinkSync(zipPath);

      if (err) {
        console.error("Error enviando archivo:", err);
      }
    });
  } catch (error) {
    console.error("Error generando proyecto Flutter:", error);
    res.status(500).json({
      error: "Error generando proyecto Flutter",
      details: error instanceof Error ? error.message : "Error desconocido",
    });
  }
});

// Iniciar servidor
server
  .listen(PORT, () => {
    console.log(`🚀 Servidor MVC corriendo en http://localhost:${PORT}`);
    console.log(`📊 WebSocket listo para conexiones`);
    console.log(`🎯 Patrón MVC implementado: Vista -> Controlador -> Modelo`);
  })
  .on("error", (error) => {
    console.error("Error al iniciar servidor:", error);
    process.exit(1);
  });

// Manejar errores no capturados
process.on("uncaughtException", (error) => {
  console.error("Error no capturado:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Rechazo no manejado en:", promise, "razón:", reason);
  process.exit(1);
});

// Endpoint de debug para ver invitaciones por usuario
app.get("/api/debug/invitations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await databaseService.findUserById(userId);

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Obtener invitaciones enviadas y recibidas
    const invitationModel = new InvitationModel();
    const sentInvitations = await invitationModel.findByCreatorId(userId);
    const receivedInvitations = await invitationModel.findByInviteeEmail(
      user.email
    );

    // Obtener diagramas del usuario
    const userDiagrams = await databaseService.findDiagramSnapshotsByUser(
      userId
    );

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      sentInvitations: sentInvitations.map((inv) => ({
        id: inv.id,
        diagramId: inv.diagramId,
        inviteeEmail: inv.inviteeEmail,
        status: inv.status,
        creatorId: inv.creatorId,
      })),
      receivedInvitations: receivedInvitations.map((inv) => ({
        id: inv.id,
        diagramId: inv.diagramId,
        inviteeEmail: inv.inviteeEmail,
        status: inv.status,
        creatorId: inv.creatorId,
      })),
      userDiagrams: userDiagrams.map((d) => ({
        diagramId: d.diagramId,
        name: d.name,
        creatorId: d.creatorId,
        collaborators: d.collaborators,
      })),
    });
  } catch (error) {
    console.error("Error en debug:", error);
    res.status(500).json({ error: "Error interno" });
  }
});

export { app, server, io };
