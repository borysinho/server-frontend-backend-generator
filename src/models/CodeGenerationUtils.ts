import { PhysicalModel } from "./TransformationManager.js";
import { SpringBootCodeGenerator } from "./SpringBootCodeGenerator.js";

export function generateSpringBootProject(
  physicalModel: PhysicalModel,
  basePackage?: string,
  projectName?: string,
  previousPhysicalModel?: PhysicalModel,
  existingMigrations?: string[]
): Record<string, string> {
  const generator = new SpringBootCodeGenerator(
    physicalModel,
    basePackage,
    projectName,
    undefined, // databaseConfig
    previousPhysicalModel,
    existingMigrations
  );
  return generator.generateJavaCode();
}

// Función para generar código Spring Boot incremental
export function generateIncrementalSpringBootCode(
  basePhysicalModel: PhysicalModel,
  incrementalPhysicalModel: PhysicalModel,
  basePackage?: string,
  projectName?: string,
  existingMigrations?: string[]
): Record<string, string> {
  // Para incrementales, generamos código completo con soporte de migraciones
  // El generador detectará automáticamente los cambios entre modelos
  return generateSpringBootProject(
    incrementalPhysicalModel,
    basePackage,
    projectName,
    basePhysicalModel, // Pasar el modelo anterior para comparación
    existingMigrations
  );
}
