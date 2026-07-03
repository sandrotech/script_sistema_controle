import { PrismaClient } from '@prisma/client';
import { clients } from './config/clients';

const clientConfig = clients.find(c => c.apiEmail === 'financeiro@casadofrango.com.br');
if (!clientConfig) throw new Error("Client not found");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: clientConfig.databaseUrl,
    },
  },
});

async function checkSales() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const salesToday = await prisma.venda.aggregate({
      _sum: {
        venda: true,
      },
      _count: {
        id: true,
      },
      where: {
        data: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const salesYesterday = await prisma.venda.aggregate({
      _sum: {
        venda: true,
      },
      _count: {
        id: true,
      },
      where: {
        data: {
          gte: yesterday,
          lt: today,
        },
      },
    });

    console.log('=== VENDAS HOJE ===');
    console.log(`Quantidade: ${salesToday._count.id}`);
    console.log(`Total (R$): ${salesToday._sum.venda?.toFixed(2) || '0.00'}`);
    
    console.log('\n=== VENDAS ONTEM ===');
    console.log(`Quantidade: ${salesYesterday._count.id}`);
    console.log(`Total (R$): ${salesYesterday._sum.venda?.toFixed(2) || '0.00'}`);

  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSales();
