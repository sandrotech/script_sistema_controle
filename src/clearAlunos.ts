import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function clearAlunos() {
  console.log("Deletando todos os alunos...");
  const result = await prisma.aluno.deleteMany();
  console.log(`Sucesso: ${result.count} alunos deletados.`);
  await prisma.$disconnect();
}

clearAlunos();
