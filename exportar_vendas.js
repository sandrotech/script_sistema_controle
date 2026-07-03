const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const res = await prisma.venda.findMany({
    where: {
      origem: 'FRANGOLANDIA_EMAIL',
      data: {
        gte: new Date('2026-06-01'),
        lte: new Date('2026-06-16T23:59:59Z')
      }
    },
    orderBy: [
      { data: 'asc' },
      { loja: 'asc' }
    ]
  });

  // Agrupar por produto também
  const produtos = {};

  let csv = 'Data;Loja ID;Nome Produto;Quantidade;Valor Venda\n';
  res.forEach(r => {
    const d = r.data.toISOString().split('T')[0];
    const val = r.venda.toFixed(2).replace('.', ',');
    csv += `${d};${r.loja};${r.produto};${r.qtd};${val}\n`;

    if (!produtos[r.produto]) produtos[r.produto] = 0;
    produtos[r.produto] += r.venda;
  });

  // Resumo por produto
  let csvResumo = 'Produto;Valor Total Venda\n';
  Object.keys(produtos).sort((a,b) => produtos[b] - produtos[a]).forEach(p => {
    csvResumo += `${p};${produtos[p].toFixed(2).replace('.', ',')}\n`;
  });

  fs.writeFileSync('Vendas_Frangolandia_Detalhado.csv', csv);
  fs.writeFileSync('Vendas_Frangolandia_ResumoProduto.csv', csvResumo);
  
  console.log('Arquivos CSV gerados com sucesso!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
