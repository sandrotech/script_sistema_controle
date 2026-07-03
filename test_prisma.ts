import { createPrismaClient } from './src/lib/prisma';
async function test() {
  console.log('Criando prisma client...');
  const prisma = createPrismaClient('postgres://postgres:x@oandn0cu1p1tigiwlkd70ttg:5432/postgres');
  console.log('Iniciando query...');
  try {
    const res = await prisma.venda.findFirst();
    console.log(res);
  } catch(e) {
    console.log('ERRO:', e.message);
  }
}
test();
