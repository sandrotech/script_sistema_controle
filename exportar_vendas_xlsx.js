const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const xlsx = require('xlsx');

async function main() {
  console.log('Buscando vendas...');
  const res = await prisma.venda.findMany({
    where: {
      origem: 'FRANGOLANDIA_EMAIL',
      data: {
        // gte: new Date('2026-06-01'), // optionally add dates if needed, but for now we get all recent
        gte: new Date(new Date().setDate(new Date().getDate() - 30))
      }
    },
    orderBy: [
      { data: 'asc' },
      { loja: 'asc' }
    ]
  });

  console.log(`Encontradas ${res.length} vendas. Gerando XLSX...`);

  // Agrupar por produto também
  const produtos = {};
  const detalhado = [];

  res.forEach(r => {
    const d = r.data.toISOString().split('T')[0];
    detalhado.push({
      "Data": d,
      "Loja ID": r.loja,
      "Loja Nome": r.loja_nome || '',
      "EAN": r.ean,
      "Nome Produto": r.produto,
      "Quantidade": r.qtd,
      "Valor Venda": r.venda,
      "Valor Unitário": r.valor_unitario
    });

    if (!produtos[r.produto]) produtos[r.produto] = 0;
    produtos[r.produto] += r.venda;
  });

  const resumo = Object.keys(produtos)
    .sort((a,b) => produtos[b] - produtos[a])
    .map(p => ({
      "Produto": p,
      "Valor Total Venda": produtos[p]
    }));

  const wb = xlsx.utils.book_new();
  
  const wsDetalhado = xlsx.utils.json_to_sheet(detalhado);
  xlsx.utils.book_append_sheet(wb, wsDetalhado, "Detalhado");
  
  const wsResumo = xlsx.utils.json_to_sheet(resumo);
  xlsx.utils.book_append_sheet(wb, wsResumo, "Resumo por Produto");

  const fileName = 'Vendas_Frangolandia.xlsx';
  xlsx.writeFile(wb, fileName);
  
  console.log(`Arquivo XLSX gerado com sucesso: ${fileName}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
