const xlsx = require('xlsx');

const wbFechamento = xlsx.readFile('Fechamento Frangolandia Junho 2026.xlsx');
const dataFechamento = xlsx.utils.sheet_to_json(wbFechamento.Sheets['Planilha1']);

const wbExtraido = xlsx.readFile('Frangolandia_Extraido.xlsx');
const dataExtraido = xlsx.utils.sheet_to_json(wbExtraido.Sheets['Vendas Frangolandia']);

// Map de chaves do extraido para pegar a última ocorrência (ou de-duplicar)
const extraidoMap = new Map();
dataExtraido.forEach(row => {
    // Chave única: loja-data-plu
    const dateStr = row['Data']; // ex: '01/06/2026'
    const lojaId = row['Loja ID'];
    const plu = row['PLU'];
    const key = `${lojaId}-${dateStr}-${plu}`;
    
    // Como os e-mails estão em ordem cronológica de recebimento, a última ocorrência é a mais atualizada
    extraidoMap.set(key, row);
});

console.log(`Linhas no Fechamento: ${dataFechamento.length}`);
console.log(`Linhas de-duplicadas no Extraído (última versão de cada venda): ${extraidoMap.size}`);

// Comparando valores totais
let totalVendaFechamento = 0;
dataFechamento.forEach(r => totalVendaFechamento += parseFloat(r.VENDA));

let totalVendaExtraidoDedup = 0;
extraidoMap.forEach(r => totalVendaExtraidoDedup += parseFloat(r['Valor Venda']));

console.log(`Total Venda Fechamento: ${totalVendaFechamento.toFixed(2)}`);
console.log(`Total Venda Extraído De-duplicado: ${totalVendaExtraidoDedup.toFixed(2)}`);

// Vamos checar se há diferenças nas chaves
let missingInExtraido = 0;
let diffValues = 0;

dataFechamento.forEach(row => {
    // Formatar data de número serial do Excel para dd/mm/yyyy se necessário
    // No Excel, a data veio como serial 46174
    let dateStr = row.DATA;
    if (typeof dateStr === 'number') {
        const dateObj = new Date((dateStr - 25569) * 86400 * 1000);
        const dd = String(dateObj.getUTCDate()).padStart(2, '0');
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getUTCFullYear();
        dateStr = `${dd}/${mm}/${yyyy}`;
    }
    
    // O FILIAL veio como "L01 MARACANAU"
    const match = row.FILIAL.match(/\d+/);
    const lojaId = match ? parseInt(match[0], 10) : 0;
    
    const key = `${lojaId}-${dateStr}-${row.PLU}`;
    
    if (!extraidoMap.has(key)) {
        missingInExtraido++;
    } else {
        const ext = extraidoMap.get(key);
        const diff = Math.abs(parseFloat(row.VENDA) - ext['Valor Venda']);
        if (diff > 0.01) {
            diffValues++;
        }
    }
});

console.log(`Chaves do fechamento faltando no extraído: ${missingInExtraido}`);
console.log(`Chaves com valores divergentes: ${diffValues}`);
