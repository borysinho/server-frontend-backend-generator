const { createServer } = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Importar los controladores y servicios
const { DiagramController, ViewObserver } = require('../src/controllers/DiagramController.js');
const { InvitationController } = require('../src/controllers/InvitationController.js');
const { DiagramSnapshotController } = require('../src/controllers/DiagramSnapshotController.js');
const { AIController } = require('../src/controllers/AIController.js');
const { JsonPatchOperation } = require('../src/validation/UMLValidator.js');
const { databaseService } = require('../src/services/DatabaseService.js');
const { InvitationModel } = require('../src/models/InvitationModel.js');
const { UserModel } = require('../src/models/UserModel.js');
const { DiagramSnapshotModel } = require('../src/models/DiagramSnapshotModel.js');
const { transformLogicalToPhysical } = require('../src/models/TransformationManager.js');
const { SpringBootCodeGenerator } = require('../src/models/SpringBootCodeGenerator.js');
const { PostmanCollectionGenerator } = require('../src/models/PostmanCollectionGenerator.js');
const archiver = require('archiver');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');

const execAsync = promisify(exec);

// Función para generar URL de base de datos
function generateDatabaseUrl(config) {
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
function createFileStructure(codeGenerator, projectName, databaseConfig, warnings, physicalModel) {
  // Usar el método generateJavaCode del generador que ya crea la estructura correcta
  const javaFiles = codeGenerator.generateJavaCode();

  // Crear archivos adicionales (configuración, etc.)
  const files = { ...javaFiles };

  const basePackage = "com.example.demo";

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
  constructor() {
    this.controllers = new Map();
  }

  async getController(diagramId) {
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
    return this.controllers.get(diagramId);
  }

  removeController(diagramId) {
    this.controllers.delete(diagramId);
  }

  // 🔥 NUEVO: Recargar estado del controller desde BD
  async reloadControllerState(diagramId) {
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

// Función principal que crea la app Express
function createApp() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? ["https://borysinho.github.io"]
        : ["http://localhost:5174", "http://localhost:5173"],
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
  const operationHistory = new Map();
  const redoHistory = new Map();

  // Conexiones activas - mapea socket.id a diagramId
  const activeConnections = new Map();

  // Función para crear operación inversa
  function createInverseOperation(operation, currentState) {
    const newOp = {
      ...operation,
      timestamp: Date.now(),
      sequenceNumber: operation.sequenceNumber + 1,
    };

    switch (operation.op) {
      case "add":
        let removePath = operation.path;
        if (operation.path.endsWith("/-") && operation.value && operation.value.id) {
          const id = operation.value.id;
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
        let addPath = operation.path;
        if (operation.path.match(/\/(elements|relationships)\/[^/]+$/)) {
          addPath = operation.path.replace(/\/[^/]+$/, "/-");
        }
        return {
          ...newOp,
          op: "add",
          path: addPath,
          value: operation.removedValue,
          description: `Deshacer: ${operation.description}`,
        };

      case "replace":
        const pathParts = operation.path.split("/").filter((p) => p);
        let previousValue = currentState;
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          if (part === "position" && i === pathParts.length - 1) {
            previousValue = {
              x: previousValue?.x,
              y: previousValue?.y,
            };
            break;
          }
          previousValue = previousValue?.[part];
        }
        return {
          ...newOp,
          op: "replace",
          value: previousValue,
          description: `Deshacer: ${operation.description}`,
        };

      default:
        return newOp;
    }
  }

  // Configuración de Socket.IO
  io.on("connection", (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    let currentController = null;
    let unregisterView = null;
    let userName = "Usuario Anónimo";

    const viewObserver = {
      id: socket.id,
      notify: (operation, newState) => {
        socket.emit("diagram:update", { operation, newState });
      },
    };

    socket.on("user:register", (data) => {
      userName = data.name || "Usuario Anónimo";
      socket.userName = userName;
      console.log(`Usuario registrado: ${userName} (Socket: ${socket.id})`);
    });

    socket.on("diagram:join", async (diagramId) => {
      if (unregisterView) {
        unregisterView();
      }

      currentController = await diagramManager.getController(diagramId);
      unregisterView = currentController.registerView(socket.id, viewObserver);

      socket.join(`diagram-${diagramId}`);
      activeConnections.set(socket.id, diagramId);
      console.log(`Cliente ${socket.id} se unió al diagrama ${diagramId}`);

      const roomSockets = await io.in(`diagram-${diagramId}`).fetchSockets();
      const connectedUsers = roomSockets.map((s) => ({
        id: s.id,
        name: s.userName || `Usuario ${s.id.substring(0, 6)}`,
        connectedAt: new Date(),
      }));

      io.to(`diagram-${diagramId}`).emit("users:update", {
        connectedUsers,
        totalUsers: connectedUsers.length,
      });

      socket.to(`diagram-${diagramId}`).emit("user:joined", {
        userId: socket.id,
        timestamp: Date.now(),
      });
    });

    socket.on("diagram:operation", async (operation) => {
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

        let operationWithPreviousValue = operation;

        if (operation.op === "add") {
          operationWithPreviousValue = { ...operation };
        } else if (operation.op === "remove") {
          const currentState = currentController.getCurrentState();
          const pathParts = operation.path.split("/").filter((p) => p);
          let elementToRemove = currentState;
          for (const part of pathParts) {
            elementToRemove = elementToRemove?.[part];
          }
          operationWithPreviousValue = {
            ...operation,
            removedValue: elementToRemove,
          };
        } else if (operation.op === "replace") {
          const currentState = currentController.getCurrentState();
          const pathParts = operation.path.split("/").filter((p) => p);
          let previousValue = currentState;
          for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (part === "position" && i === pathParts.length - 1) {
              previousValue = {
                x: previousValue?.x,
                y: previousValue?.y,
              };
              break;
            }
            previousValue = previousValue?.[part];
          }
          operationWithPreviousValue = {
            ...operation,
            previousValue,
          };
        }

        const result = await currentController.processOperation(socket.id, operation);

        if (result.success) {
          const diagramId = activeConnections.get(socket.id);
          if (diagramId) {
            const history = operationHistory.get(diagramId) || [];
            history.push(operationWithPreviousValue);
            if (history.length > 100) {
              history.shift();
            }
            operationHistory.set(diagramId, history);
            redoHistory.set(diagramId, []);
          }

          socket.emit("operation:confirmed", {
            operation,
            timestamp: Date.now(),
          });

          if (diagramId) {
            socket.to(`diagram-${diagramId}`).emit("diagram:operation", {
              operation,
              timestamp: Date.now(),
            });
          }
        } else {
          socket.emit("operation:rejected", {
            operation,
            reason: result.errors?.join(", ") || "Error desconocido",
            timestamp: Date.now(),
          });
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

    // UNDO/REDO handlers simplificados
    socket.on("diagram:undo", async () => {
      if (!currentController) {
        socket.emit("undo:error", {
          error: "No se ha unido a ningún diagrama",
          timestamp: Date.now(),
        });
        return;
      }

      const diagramId = activeConnections.get(socket.id);
      if (!diagramId) return;

      const history = operationHistory.get(diagramId) || [];
      if (history.length === 0) {
        socket.emit("undo:error", {
          error: "No hay operaciones para deshacer",
          timestamp: Date.now(),
        });
        return;
      }

      const lastOperation = history.pop();
      operationHistory.set(diagramId, history);

      try {
        const currentState = currentController.getCurrentState();
        const inverseOperation = createInverseOperation(lastOperation, currentState);
        const result = await currentController.processOperation(socket.id, inverseOperation);

        if (result.success) {
          socket.emit("undo:success", {
            undoneOperation: lastOperation,
            inverseOperation,
            canUndo: history.length > 0,
            canRedo: true,
            timestamp: Date.now(),
          });
          socket.to(`diagram-${diagramId}`).emit("diagram:operation", {
            operation: inverseOperation,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error(`Error en undo:`, error);
      }
    });

    socket.on("diagram:redo", async () => {
      if (!currentController) {
        socket.emit("redo:error", {
          error: "No se ha unido a ningún diagrama",
          timestamp: Date.now(),
        });
        return;
      }

      const diagramId = activeConnections.get(socket.id);
      if (!diagramId) return;

      const redoStack = redoHistory.get(diagramId) || [];
      if (redoStack.length === 0) {
        socket.emit("redo:error", {
          error: "No hay operaciones para rehacer",
          timestamp: Date.now(),
        });
        return;
      }

      const operationToRedo = redoStack.pop();
      redoHistory.set(diagramId, redoStack);

      try {
        const result = await currentController.processOperation(socket.id, operationToRedo);

        if (result.success) {
          const history = operationHistory.get(diagramId) || [];
          history.push(operationToRedo);
          operationHistory.set(diagramId, history);

          socket.emit("redo:success", {
            redoneOperation: operationToRedo,
            canUndo: true,
            canRedo: redoStack.length > 0,
            timestamp: Date.now(),
          });
          socket.to(`diagram-${diagramId}`).emit("diagram:operation", {
            operation: operationToRedo,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error(`Error en redo:`, error);
      }
    });

    socket.on("ai:request", async (data) => {
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
        io.to(`diagram-${diagramId}`).emit("ai:processing", {
          userId: socket.id,
          userName: data.userName || userName,
          prompt: data.request.prompt,
          timestamp: Date.now(),
        });

        const response = await aiController.processAIRequestSocket(data.request);

        if (response.success && response.delta) {
          io.to(`diagram-${diagramId}`).emit("ai:response", {
            delta: response.delta,
            prompt: data.request.prompt,
            userId: socket.id,
            userName: data.userName || userName,
            timestamp: Date.now(),
          });
        } else {
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
          error: error.message || "Error interno del servidor",
          userId: socket.id,
          userName: data.userName || userName,
          timestamp: Date.now(),
        });
      }
    });

    socket.on("disconnect", async () => {
      const diagramId = activeConnections.get(socket.id);
      if (diagramId) {
        socket.to(`diagram-${diagramId}`).emit("user:left", {
          userId: socket.id,
          timestamp: Date.now(),
        });
        activeConnections.delete(socket.id);

        const roomSockets = await io.in(`diagram-${diagramId}`).fetchSockets();
        const connectedUsers = roomSockets.map((s) => ({
          id: s.id,
          name: s.userName || `Usuario ${s.id.substring(0, 6)}`,
          connectedAt: new Date(),
        }));

        io.to(`diagram-${diagramId}`).emit("users:update", {
          connectedUsers,
          totalUsers: connectedUsers.length,
        });
      }

      if (unregisterView) {
        unregisterView();
      }

      console.log(`Cliente desconectado: ${socket.id}`);
    });
  });

  // Rutas HTTP
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log(`Intento de login - Email: ${email}`);

      const userModel = new UserModel();
      const user = await userModel.validateCredentials(email, password);

      if (user) {
        res.json({
          success: true,
          user: { id: user.id, name: user.name, email: user.email },
        });
      } else {
        res.status(401).json({ success: false, error: "Credenciales inválidas" });
      }
    } catch (error) {
      console.error("Error en login:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          error: "Faltan campos requeridos: name, email, password"
        });
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

  // Rutas de invitaciones
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

  app.get("/api/test", (req, res) => {
    res.json({
      message: "API funcionando correctamente",
      timestamp: new Date().toISOString(),
    });
  });

  // Rutas de diagramas
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
    await diagramManager.reloadControllerState(req.params.diagramId);
  });
  app.delete("/api/diagrams/:diagramId", (req, res) =>
    diagramSnapshotController.deleteDiagram(req, res)
  );

  app.post("/api/ai/process", (req, res) =>
    aiController.processAIRequest(req, res)
  );

  app.get("/api/diagrams/:diagramId/export/json", (req, res) =>
    diagramSnapshotController.exportDiagramAsJSON(req, res)
  );
  app.get("/api/diagrams/:diagramId/export/svg", (req, res) =>
    diagramSnapshotController.exportDiagramAsSVG(req, res)
  );

  // Endpoint para generar backend
  app.post("/api/diagrams/generate-backend", async (req, res) => {
    try {
      const { diagramState, diagramName, databaseConfig, diagramId, creatorId } = req.body;

      if (!diagramState) {
        return res.status(400).json({
          success: false,
          error: "Estado del diagrama requerido",
        });
      }

      const transformationResult = transformLogicalToPhysical(diagramState);

      if (!transformationResult.success) {
        return res.status(400).json({
          success: false,
          error: `Error en transformación: ${transformationResult.errors.join(", ")}`,
          details: transformationResult,
        });
      }

      if (!transformationResult.physicalModel ||
          Object.keys(transformationResult.physicalModel.tables || {}).length === 0) {
        return res.status(400).json({
          success: false,
          error: "El modelo físico está vacío. Asegúrate de que el diagrama contenga clases válidas con atributos.",
          details: transformationResult,
        });
      }

      let previousPhysicalModel = undefined;
      let existingMigrations = [];
      let existingMigrationFiles = [];

      if (diagramId && creatorId) {
        try {
          const diagramSnapshotModel = new DiagramSnapshotModel();
          const existingSnapshot = await diagramSnapshotModel.getLatestByDiagramId(diagramId);
          if (existingSnapshot && existingSnapshot.physicalModel) {
            previousPhysicalModel = existingSnapshot.physicalModel;

            if (existingSnapshot.migrationFiles && Array.isArray(existingSnapshot.migrationFiles)) {
              existingMigrationFiles = existingSnapshot.migrationFiles;
              existingMigrations = existingMigrationFiles.map((m) => m.fileName.replace(".sql", ""));
            } else if (existingSnapshot.migrations && Array.isArray(existingSnapshot.migrations)) {
              existingMigrations = existingSnapshot.migrations;
            }
          }
        } catch (error) {
          console.warn("Advertencia: No se pudo obtener modelo físico anterior:", error);
        }
      }

      const codeGenerator = new SpringBootCodeGenerator(
        transformationResult.physicalModel,
        "com.example.demo",
        diagramName || "generated-backend",
        databaseConfig,
        previousPhysicalModel,
        existingMigrations,
        existingMigrationFiles
      );

      const generatedCode = codeGenerator.generateCode();
      const newMigrations = (generatedCode.flywayMigrations || []).map((m) =>
        m.fileName.replace(".sql", "")
      );

      const allMigrations = [...new Set([...existingMigrations, ...newMigrations])];
      const warnings = [];

      const fileStructure = createFileStructure(
        codeGenerator,
        diagramName || "backend",
        databaseConfig,
        warnings.length > 0 ? warnings : undefined,
        transformationResult.physicalModel
      );

      const archive = archiver("zip", { zlib: { level: 9 } });
      const zipFileName = `${diagramName || "backend"}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

      archive.pipe(res);

      for (const [filePath, content] of Object.entries(fileStructure)) {
        archive.append(content, { name: filePath });
      }

      archive.on("error", (err) => {
        console.error("Error creando ZIP:", err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: "Error creando archivo ZIP",
          });
        }
      });

      archive.finalize();

      if (diagramId && creatorId) {
        try {
          const diagramSnapshotModel = new DiagramSnapshotModel();
          const allMigrationFiles = [
            ...(existingMigrationFiles || []),
            ...(generatedCode.flywayMigrations || []),
          ];

          const existingSnapshot = await diagramSnapshotModel.getLatestByDiagramId(diagramId);

          if (existingSnapshot) {
            await diagramSnapshotModel.update(diagramId, {
              name: diagramName || existingSnapshot.name,
              description: `Backend generado automáticamente para ${diagramName}`,
              state: diagramState,
              physicalModel: transformationResult.physicalModel,
              migrations: allMigrations,
              migrationFiles: allMigrationFiles,
              tags: ["generated", "backend"],
            });
          } else {
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
          }
        } catch (error) {
          console.warn("⚠️ Advertencia: No se pudo actualizar el snapshot con las migraciones:", error);
        }
      }
    } catch (error) {
      console.error("Error generando backend:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: `Error interno del servidor: ${error.message || "Error desconocido"}`,
        });
      }
    }
  });

  // Endpoint para generar Flutter
  app.post("/api/flutter/generate", async (req, res) => {
    try {
      const { diagramId, apiBaseUrl } = req.body;

      if (!diagramId) {
        return res.status(400).json({ error: "diagramId es requerido" });
      }

      const backendUrl = apiBaseUrl || "http://10.0.2.2:4000/api";

      const diagram = await databaseService.findDiagramSnapshotByDiagramId(diagramId);

      if (!diagram) {
        return res.status(404).json({ error: "Diagrama no encontrado" });
      }

      if (!diagram.state) {
        return res.status(400).json({
          error: "El diagrama no tiene estado definido",
        });
      }

      const transformationResult = transformLogicalToPhysical(diagram.state);

      if (!transformationResult.success) {
        return res.status(400).json({
          error: `Error en transformación: ${transformationResult.errors.join(", ")}`,
        });
      }

      const physicalModel = transformationResult.physicalModel;

      if (!physicalModel) {
        return res.status(400).json({
          error: "No se pudo generar el modelo físico",
        });
      }

      const springGenerator = new SpringBootCodeGenerator(physicalModel, "com.example.demo");
      const entities = springGenerator.getEntities();

      const { FlutterCodeGenerator } = await import("./models/FlutterCodeGenerator.js");
      const flutterGenerator = new FlutterCodeGenerator("com.example.app", backendUrl);

      const tempDir = path.join(os.tmpdir(), `flutter-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      flutterGenerator.generateFlutterProject(entities, tempDir, diagram.name.replace(/\s+/g, "_").toLowerCase());

      try {
        const { execSync } = await import("child_process");
        execSync("flutter create .", { cwd: tempDir, stdio: "inherit" });

        const buildGradlePath = path.join(tempDir, "android/app/build.gradle");
        if (fs.existsSync(buildGradlePath)) {
          let buildGradleContent = fs.readFileSync(buildGradlePath, "utf-8");
          buildGradleContent = buildGradleContent.replace(
            /minSdkVersion\s+flutter\.minSdkVersion/g,
            "minSdkVersion 23"
          );
          buildGradleContent = buildGradleContent.replace(
            /targetSdkVersion\s+flutter\.targetSdkVersion/g,
            "targetSdkVersion 33"
          );
          fs.writeFileSync(buildGradlePath, buildGradleContent);
        }

        const manifestPath = path.join(tempDir, "android/app/src/main/AndroidManifest.xml");
        if (fs.existsSync(manifestPath)) {
          let manifestContent = fs.readFileSync(manifestPath, "utf-8");
          if (!manifestContent.includes("android.permission.INTERNET")) {
            manifestContent = manifestContent.replace(
              /<manifest([^>]*)>/,
              '<manifest$1>\n    <uses-permission android:name="android.permission.INTERNET"/>'
            );
          }
          if (!manifestContent.includes("usesCleartextTraffic")) {
            manifestContent = manifestContent.replace(
              /<application/,
              '<application\n        android:usesCleartextTraffic="true"'
            );
          }
          fs.writeFileSync(manifestPath, manifestContent);
        }
      } catch (createErr) {
        console.warn("⚠️ No se pudo ejecutar 'flutter create .' en el servidor.", createErr);
      }

      const zipPath = path.join(os.tmpdir(), `flutter-${Date.now()}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      await new Promise((resolve, reject) => {
        output.on("close", () => resolve());
        archive.on("error", reject);
        archive.pipe(output);
        archive.directory(tempDir, false);
        archive.finalize();
      });

      res.download(zipPath, `flutter-${diagram.name}.zip`, (err) => {
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
        details: error.message || "Error desconocido",
      });
    }
  });

  return { app, server, io };
}

// Para Vercel - exportar la función handler
module.exports = (req, res) => {
  // Si es la primera vez, crear la app
  if (!global.appInstance) {
    const { app, server, io } = createApp();
    global.appInstance = app;
    global.serverInstance = server;
    global.ioInstance = io;

    // Iniciar el servidor solo una vez
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  }

  // Usar la instancia global de Express
  global.appInstance(req, res);
};

// Para desarrollo local - exportar la app
if (require.main === module) {
  const { app, server } = createApp();
  const PORT = process.env.PORT || 3001;

  server.listen(PORT, () => {
    console.log(`🚀 Servidor MVC corriendo en http://localhost:${PORT}`);
    console.log(`📊 WebSocket listo para conexiones`);
    console.log(`🎯 Patrón MVC implementado: Vista -> Controlador -> Modelo`);
  });
}