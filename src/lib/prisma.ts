import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as PrismaClientOld } from './prisma-old';
import "dotenv/config";

/**
 * Cria uma instância do Prisma conectada a um banco de dados específico (Schema MDM).
 */
export function createPrismaClient(databaseUrl: string) {
  const pool = new Pool({ 
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

/**
 * Cria uma instância do Prisma conectada a um banco de dados específico (Schema Antigo).
 */
export function createPrismaClientOld(databaseUrl: string) {
  const pool = new Pool({ 
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClientOld({ adapter });
}

// Mantemos o padrão para compatibilidade, mas agora usamos a função acima
export const prisma = createPrismaClient(process.env.DATABASE_URL || "");
