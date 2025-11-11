import { databaseService } from "../services/DatabaseService";
import bcrypt from "bcrypt";

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // Debería estar hasheada
  createdAt: Date;
  updatedAt: Date;
}

export class UserModel {
  constructor() {
    // El servicio de base de datos maneja la conexión
  }

  // Crear un nuevo usuario
  async create(
    userData: Omit<User, "id" | "createdAt" | "updatedAt">
  ): Promise<User> {
    // Hashear la contraseña antes de guardar
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

    const userWithHashedPassword = {
      ...userData,
      password: hashedPassword,
    };

    return await databaseService.createUser(userWithHashedPassword);
  }

  // Buscar usuario por ID
  async findById(id: string): Promise<User | null> {
    return await databaseService.findUserById(id);
  }

  // Buscar usuario por email
  async findByEmail(email: string): Promise<User | null> {
    return await databaseService.findUserByEmail(email);
  }

  // Actualizar usuario
  async update(
    id: string,
    updates: Partial<Omit<User, "id" | "createdAt">>
  ): Promise<User | null> {
    return await databaseService.updateUser(id, updates);
  }

  // Eliminar usuario
  async delete(id: string): Promise<boolean> {
    return await databaseService.deleteUser(id);
  }

  // Validar credenciales (para login)
  async validateCredentials(
    email: string,
    password: string
  ): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }
}
