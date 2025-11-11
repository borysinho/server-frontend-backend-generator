import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de la base de datos...");

  // Crear usuario administrador
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@jointjs.com" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@jointjs.com",
      password: adminPassword,
    },
  });
  console.log("✅ Usuario administrador creado:", admin.email);

  // Crear usuario de prueba
  const testPassword = await bcrypt.hash("123456", 10);
  const testUser = await prisma.user.upsert({
    where: { email: "borysquiroga@gmail.com" },
    update: {},
    create: {
      name: "Borys",
      email: "borysquiroga@gmail.com",
      password: testPassword,
    },
  });
  console.log("✅ Usuario de prueba creado:", testUser.email);

  // Crear usuario colaborador
  const collabPassword = await bcrypt.hash("collab123", 10);
  const collabUser = await prisma.user.upsert({
    where: { email: "colaborador@jointjs.com" },
    update: {},
    create: {
      name: "Colaborador",
      email: "colaborador@jointjs.com",
      password: collabPassword,
    },
  });
  console.log("✅ Usuario colaborador creado:", collabUser.email);

  // Crear diagramas de ejemplo
  console.log("\n📊 Creando diagramas de ejemplo...");

  // Diagrama 1: Sistema de Biblioteca
  const libraryDiagram = await prisma.diagramSnapshot.upsert({
    where: { diagramId: "library-system-demo" },
    update: {},
    create: {
      diagramId: "library-system-demo",
      name: "Sistema de Biblioteca",
      description:
        "Diagrama UML de un sistema de gestión de biblioteca con clases para libros, usuarios y préstamos",
      creatorId: admin.id,
      collaborators: [testUser.id],
      state: {
        elements: {
          "1": {
            id: "1",
            className: "Libro",
            attributes: [
              "codigo: String {id}",
              "titulo: String {required}",
              "autor: String",
              "isbn: String {unique}",
              "disponible: Boolean",
            ],
            methods: [
              "prestar(): Boolean",
              "devolver(): void",
              "estaDisponible(): Boolean",
            ],
            elementType: "class",
            x: 50,
            y: 50,
            width: 200,
            height: 120,
          },
          "2": {
            id: "2",
            className: "Usuario",
            attributes: [
              "codigo: String {id}",
              "nombre: String {required}",
              "email: String {unique, required}",
              "tipo: TipoUsuario",
            ],
            methods: [
              "solicitarPrestamo(libro: Libro): Prestamo",
              "devolverLibro(prestamo: Prestamo): void",
            ],
            elementType: "class",
            x: 300,
            y: 50,
            width: 200,
            height: 120,
          },
          "3": {
            id: "3",
            className: "Prestamo",
            attributes: [
              "numeroPrestamo: String {id}",
              "fechaPrestamo: Date {required}",
              "fechaDevolucion: Date",
            ],
            methods: ["calcularMulta(): Double", "estaVencido(): Boolean"],
            elementType: "class",
            x: 550,
            y: 50,
            width: 200,
            height: 120,
          },
          "4": {
            id: "4",
            className: "Biblioteca",
            attributes: ["nombre: String", "direccion: String"],
            methods: [
              "agregarLibro(libro: Libro): void",
              "registrarUsuario(usuario: Usuario): void",
              "procesarPrestamo(prestamo: Prestamo): void",
            ],
            elementType: "class",
            stereotype: "<<service>>",
            x: 200,
            y: 250,
            width: 200,
            height: 120,
          },
        },
        relationships: {
          rel1: {
            id: "rel1",
            source: "2",
            target: "3",
            relationship: "aggregation",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..*",
            label: "realiza",
          },
          rel2: {
            id: "rel2",
            source: "1",
            target: "3",
            relationship: "association",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..1",
            label: "prestado en",
          },
          rel3: {
            id: "rel3",
            source: "4",
            target: "1",
            relationship: "composition",
            sourceMultiplicity: "1",
            targetMultiplicity: "1..*",
            label: "contiene",
          },
          rel4: {
            id: "rel4",
            source: "4",
            target: "2",
            relationship: "aggregation",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..*",
            label: "gestiona",
          },
        },
      },
      version: 1,
      isPublic: true,
      tags: ["biblioteca", "gestión", "préstamos", "ejemplo"],
      thumbnail: null,
    },
  });
  console.log("✅ Diagrama 'Sistema de Biblioteca' creado");

  // Diagrama 2: Patrón Observer
  const observerDiagram = await prisma.diagramSnapshot.upsert({
    where: { diagramId: "observer-pattern-demo" },
    update: {},
    create: {
      diagramId: "observer-pattern-demo",
      name: "Patrón Observer",
      description:
        "Implementación del patrón de diseño Observer con Subject y Observers concretos",
      creatorId: testUser.id,
      collaborators: [],
      state: {
        elements: {
          "1": {
            id: "1",
            className: "Subject",
            attributes: ["observers: List<Observer>"],
            methods: [
              "attach(observer: Observer): void",
              "detach(observer: Observer): void",
              "notify(): void",
            ],
            elementType: "interface",
            x: 100,
            y: 50,
            width: 200,
            height: 100,
          },
          "2": {
            id: "2",
            className: "Observer",
            attributes: [],
            methods: ["update(subject: Subject): void"],
            elementType: "interface",
            x: 400,
            y: 50,
            width: 200,
            height: 80,
          },
          "3": {
            id: "3",
            className: "ConcreteSubject",
            attributes: ["state: String"],
            methods: ["getState(): String", "setState(state: String): void"],
            elementType: "class",
            x: 50,
            y: 200,
            width: 200,
            height: 100,
          },
          "4": {
            id: "4",
            className: "ConcreteObserver",
            attributes: ["name: String", "subject: ConcreteSubject"],
            methods: ["update(subject: Subject): void", "display(): void"],
            elementType: "class",
            x: 350,
            y: 200,
            width: 200,
            height: 100,
          },
        },
        relationships: {
          rel1: {
            id: "rel1",
            source: "3",
            target: "1",
            relationship: "realization",
            label: "implements",
          },
          rel2: {
            id: "rel2",
            source: "4",
            target: "2",
            relationship: "realization",
            label: "implements",
          },
          rel3: {
            id: "rel3",
            source: "3",
            target: "4",
            relationship: "association",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..*",
            label: "notifies",
          },
        },
      },
      version: 1,
      isPublic: true,
      tags: ["patrones", "observer", "diseño", "interfaces"],
      thumbnail: null,
    },
  });
  console.log("✅ Diagrama 'Patrón Observer' creado");

  // Diagrama 3: Sistema de E-commerce
  const ecommerceDiagram = await prisma.diagramSnapshot.upsert({
    where: { diagramId: "ecommerce-system-demo" },
    update: {},
    create: {
      diagramId: "ecommerce-system-demo",
      name: "Sistema de E-commerce",
      description:
        "Diagrama UML de un sistema de comercio electrónico con productos, pedidos y pagos",
      creatorId: collabUser.id,
      collaborators: [admin.id, testUser.id],
      state: {
        elements: {
          "1": {
            id: "1",
            className: "Producto",
            attributes: [
              "id: String",
              "nombre: String",
              "precio: Double",
              "stock: Integer",
              "categoria: String",
            ],
            methods: [
              "actualizarStock(cantidad: Integer): void",
              "calcularPrecioFinal(): Double",
            ],
            elementType: "class",
            x: 50,
            y: 50,
            width: 200,
            height: 120,
          },
          "2": {
            id: "2",
            className: "CarritoCompra",
            attributes: [
              "id: String",
              "cliente: Cliente",
              "items: List<ItemCarrito>",
              "total: Double",
            ],
            methods: [
              "agregarProducto(producto: Producto, cantidad: Integer): void",
              "removerProducto(producto: Producto): void",
              "calcularTotal(): Double",
            ],
            elementType: "class",
            x: 300,
            y: 50,
            width: 200,
            height: 120,
          },
          "3": {
            id: "3",
            className: "Cliente",
            attributes: [
              "id: String",
              "nombre: String",
              "email: String",
              "direccion: Direccion",
            ],
            methods: [
              "realizarPedido(): Pedido",
              "verHistorialPedidos(): List<Pedido>",
            ],
            elementType: "class",
            x: 550,
            y: 50,
            width: 200,
            height: 120,
          },
          "4": {
            id: "4",
            className: "Pedido",
            attributes: [
              "id: String",
              "cliente: Cliente",
              "items: List<ItemPedido>",
              "estado: EstadoPedido",
              "fechaCreacion: Date",
            ],
            methods: [
              "procesarPago(): Boolean",
              "enviarPedido(): void",
              "cancelarPedido(): void",
            ],
            elementType: "class",
            x: 200,
            y: 200,
            width: 200,
            height: 120,
          },
          "5": {
            id: "5",
            className: "Pago",
            attributes: [
              "id: String",
              "pedido: Pedido",
              "monto: Double",
              "metodo: MetodoPago",
              "estado: EstadoPago",
            ],
            methods: ["procesarPago(): Boolean", "reembolsar(): void"],
            elementType: "class",
            x: 450,
            y: 200,
            width: 200,
            height: 120,
          },
          "6": {
            id: "6",
            className: "ServicioPago",
            attributes: [],
            methods: [
              "procesarPago(pago: Pago): Boolean",
              "validarTarjeta(tarjeta: Tarjeta): Boolean",
            ],
            elementType: "interface",
            stereotype: "<<service>>",
            x: 350,
            y: 350,
            width: 200,
            height: 80,
          },
        },
        relationships: {
          rel1: {
            id: "rel1",
            source: "2",
            target: "1",
            relationship: "aggregation",
            sourceMultiplicity: "1",
            targetMultiplicity: "1..*",
            label: "contiene",
          },
          rel2: {
            id: "rel2",
            source: "3",
            target: "2",
            relationship: "composition",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..1",
            label: "tiene",
          },
          rel3: {
            id: "rel3",
            source: "3",
            target: "4",
            relationship: "aggregation",
            sourceMultiplicity: "1",
            targetMultiplicity: "0..*",
            label: "realiza",
          },
          rel4: {
            id: "rel4",
            source: "4",
            target: "5",
            relationship: "composition",
            sourceMultiplicity: "1",
            targetMultiplicity: "1",
            label: "tiene",
          },
          rel5: {
            id: "rel5",
            source: "5",
            target: "6",
            relationship: "dependency",
            label: "usa",
          },
        },
      },
      version: 1,
      isPublic: false,
      tags: ["ecommerce", "comercio", "productos", "pedidos", "pagos"],
      thumbnail: null,
    },
  });
  console.log("✅ Diagrama 'Sistema de E-commerce' creado");

  // Diagrama 4: Patrón Factory Method
  const factoryDiagram = await prisma.diagramSnapshot.upsert({
    where: { diagramId: "factory-pattern-demo" },
    update: {},
    create: {
      diagramId: "factory-pattern-demo",
      name: "Patrón Factory Method",
      description:
        "Implementación del patrón Factory Method para crear diferentes tipos de productos",
      creatorId: admin.id,
      collaborators: [],
      state: {
        elements: {
          "1": {
            id: "1",
            className: "Creator",
            attributes: [],
            methods: ["factoryMethod(): Product", "someOperation(): void"],
            elementType: "class",
            x: 100,
            y: 50,
            width: 200,
            height: 100,
          },
          "2": {
            id: "2",
            className: "Product",
            attributes: [],
            methods: ["operation(): String"],
            elementType: "interface",
            x: 400,
            y: 50,
            width: 200,
            height: 80,
          },
          "3": {
            id: "3",
            className: "ConcreteCreator",
            attributes: [],
            methods: ["factoryMethod(): Product"],
            elementType: "class",
            x: 50,
            y: 200,
            width: 200,
            height: 100,
          },
          "4": {
            id: "4",
            className: "ConcreteProduct",
            attributes: ["name: String"],
            methods: ["operation(): String"],
            elementType: "class",
            x: 350,
            y: 200,
            width: 200,
            height: 100,
          },
        },
        relationships: {
          rel1: {
            id: "rel1",
            source: "1",
            target: "2",
            relationship: "dependency",
            label: "creates",
          },
          rel2: {
            id: "rel2",
            source: "3",
            target: "1",
            relationship: "generalization",
            label: "extends",
          },
          rel3: {
            id: "rel3",
            source: "4",
            target: "2",
            relationship: "realization",
            label: "implements",
          },
          rel4: {
            id: "rel4",
            source: "3",
            target: "4",
            relationship: "dependency",
            label: "creates",
          },
        },
      },
      version: 1,
      isPublic: true,
      tags: ["patrones", "factory", "creational", "diseño"],
      thumbnail: null,
    },
  });
  console.log("✅ Diagrama 'Patrón Factory Method' creado");

  // Diagrama 5: Diagrama vacío para empezar desde cero
  const emptyDiagram = await prisma.diagramSnapshot.upsert({
    where: { diagramId: "empty-diagram-demo" },
    update: {},
    create: {
      diagramId: "empty-diagram-demo",
      name: "Diagrama en Blanco",
      description:
        "Diagrama vacío para crear desde cero usando el asistente de IA",
      creatorId: testUser.id,
      collaborators: [],
      state: {
        elements: {},
        relationships: {},
      },
      version: 1,
      isPublic: true,
      tags: ["vacío", "nuevo", "plantilla"],
      thumbnail: null,
    },
  });
  console.log("✅ Diagrama 'Diagrama en Blanco' creado");

  // Crear invitaciones de ejemplo
  console.log("\n📨 Creando invitaciones de ejemplo...");

  // Invitaciones enviadas por el usuario de prueba (borysquiroga@gmail.com)
  await prisma.invitation.create({
    data: {
      diagramId: libraryDiagram.diagramId,
      creatorId: testUser.id,
      inviteeEmail: "nuevo@colaborador.com",
      status: "pending",
      message: "Te invito a colaborar en el diagrama del sistema de biblioteca",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
    },
  });
  console.log("✅ Invitación pendiente enviada por", testUser.email);

  await prisma.invitation.create({
    data: {
      diagramId: observerDiagram.diagramId,
      creatorId: testUser.id,
      inviteeEmail: "desarrollador@empresa.com",
      status: "pending",
      message: "¿Te gustaría colaborar en el patrón Observer?",
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 días
    },
  });
  console.log("✅ Invitación pendiente enviada por", testUser.email);

  // Invitaciones enviadas por el administrador
  await prisma.invitation.create({
    data: {
      diagramId: ecommerceDiagram.diagramId,
      creatorId: admin.id,
      inviteeEmail: testUser.email,
      status: "pending",
      message: "Invitación para colaborar en el sistema de e-commerce",
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 días
    },
  });
  console.log("✅ Invitación pendiente enviada por", admin.email);

  // Invitaciones aceptadas (simulando que fueron aceptadas)
  await prisma.invitation.create({
    data: {
      diagramId: factoryDiagram.diagramId,
      creatorId: admin.id,
      inviteeEmail: collabUser.email,
      inviteeId: collabUser.id,
      status: "accepted",
      message: "Colabora con nosotros en el patrón Factory Method",
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 días
      acceptedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Aceptada hace 2 días
    },
  });
  console.log("✅ Invitación aceptada creada");

  await prisma.invitation.create({
    data: {
      diagramId: libraryDiagram.diagramId,
      creatorId: collabUser.id,
      inviteeEmail: testUser.email,
      inviteeId: testUser.id,
      status: "accepted",
      message: "Únete al equipo de desarrollo del sistema de biblioteca",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Aceptada hace 1 día
    },
  });
  console.log("✅ Invitación aceptada creada");

  // Invitaciones rechazadas (para mostrar el estado completo)
  await prisma.invitation.create({
    data: {
      diagramId: observerDiagram.diagramId,
      creatorId: testUser.id,
      inviteeEmail: "rechazado@usuario.com",
      status: "rejected",
      message: "Te invitamos a colaborar en el patrón Observer",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      rejectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // Rechazada hace 3 días
    },
  });
  console.log("✅ Invitación rechazada creada");

  // Invitaciones expiradas
  await prisma.invitation.create({
    data: {
      diagramId: ecommerceDiagram.diagramId,
      creatorId: admin.id,
      inviteeEmail: "expirado@usuario.com",
      status: "expired",
      message: "Invitación expirada para el sistema de e-commerce",
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expiró hace 1 día
    },
  });
  console.log("✅ Invitación expirada creada");

  console.log("🎉 Seed completado exitosamente!");
  console.log("\n📋 Credenciales de acceso:");
  console.log("Admin: admin@jointjs.com / admin123");
  console.log("Usuario: borysquiroga@gmail.com / 123456");
  console.log("Colaborador: colaborador@jointjs.com / collab123");

  console.log("\n📊 Diagramas de ejemplo creados:");
  console.log("1. Sistema de Biblioteca - library-system-demo");
  console.log("2. Patrón Observer - observer-pattern-demo");
  console.log("3. Sistema de E-commerce - ecommerce-system-demo");
  console.log("4. Patrón Factory Method - factory-pattern-demo");
  console.log("5. Diagrama en Blanco - empty-diagram-demo");

  console.log("\n📨 Invitaciones de ejemplo creadas:");
  console.log("• 3 invitaciones pendientes (esperando respuesta)");
  console.log("• 2 invitaciones aceptadas (colaboradores agregados)");
  console.log("• 1 invitación rechazada");
  console.log("• 1 invitación expirada");
  console.log(
    "\n💡 Inicia sesión con borysquiroga@gmail.com para ver invitaciones recibidas"
  );
  console.log(
    "💡 Inicia sesión con admin@jointjs.com para ver invitaciones enviadas"
  );
}

main()
  .catch((e) => {
    console.error("❌ Error durante el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
