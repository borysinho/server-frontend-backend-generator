// Exportar todos los modelos
export { UserModel, type User } from "./UserModel.js";
export {
  InvitationModel,
  type Invitation,
  type InvitationStatus,
} from "./InvitationModel.js";
export {
  DiagramSnapshotModel,
  type DiagramSnapshot,
} from "./DiagramSnapshotModel.js";
export {
  DiagramModel,
  type DiagramState,
  type DiagramElement,
  type DiagramRelationship,
  type OperationResult,
} from "./DiagramModel.js";
export {
  DiagramOperationLogModel,
  type DiagramOperation,
  type OperationBatch,
  type DiagramOperationSummary,
} from "./DiagramOperationLogModel.js";
export {
  TransformationManager,
  transformLogicalToPhysical,
  generateSQLDDL,
  type PhysicalColumn,
  type PhysicalTable,
  type PhysicalRelationship,
  type PhysicalModel,
  type TransformationResult,
} from "./TransformationManager.js";
export {
  SpringBootCodeGenerator,
  generateSpringBootCode,
  type SpringBootEntity,
  type SpringBootField,
  type SpringBootRepository,
  type SpringBootService,
  type SpringBootController,
  type SpringBootEndpoint,
  type SpringBootDTO,
  type SpringBootMapper,
  type SpringBootGeneratedCode,
} from "./SpringBootCodeGenerator.js";
export {
  generateSpringBootProject,
  generateIncrementalSpringBootCode,
} from "./CodeGenerationUtils.js";
