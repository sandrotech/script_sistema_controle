import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import "dotenv/config";

/**
 * Cria uma instância do Prisma conectada a um banco de dados específico.
 */
export function createPrismaClient(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Mantemos o padrão para compatibilidade, mas agora usamos a função acima
export const prisma = createPrismaClient(process.env.DATABASE_URL || "");
