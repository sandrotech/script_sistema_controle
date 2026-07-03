const axios = require('axios');
const xlsx = require('xlsx');

async function main() {
    // 1. Lojas na API
    const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
    let apiSales = [];
    try {
        const response = await axios.get(url, {
            params: { dataInicial: '01-06-2026', dataFinal: '01-06-2026' },
            headers: { 'X-User-Email': 'victor@ultrarota.com.br' }
        });
        apiSales = response.data.filter(v => v.origem === 'FRANGOLANDIA_EMAIL');
    } catch (e) {
        console.error(e);
    }
    
    // 2. Lojas no Fechamento
    const wb = xlsx.readFile('Fechamento Frangolandia Junho 2026.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const fechamentoSales = xlsx.utils.sheet_to_json(sheet).filter(r => {
        let dateStr = r.DATA;
        if (typeof dateStr === 'number') {
            const dateObj = new Date((dateStr - 25569) * 86400 * 1000);
            const dd = String(dateObj.getUTCDate()).padStart(2, '0');
            const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = dateObj.getUTCFullYear();
            dateStr = `${dd}/${mm}/${yyyy}`;
        }
        return dateStr === '01/06/2026';
    });

    console.log(`API Vendas: ${apiSales.length}`);
    console.log(`Fechamento Vendas: ${fechamentoSales.length}`);
    
    // Contar por loja na API
    const lojasApi = {};
    apiSales.forEach(v => {
        const key = `${v.loja} (${v.loja_nome})`;
        lojasApi[key] = (lojasApi[key] || 0) + 1;
    });
    
    // Contar por loja no Fechamento
    const lojasFechamento = {};
    fechamentoSales.forEach(v => {
        lojasFechamento[v.FILIAL] = (lojasFechamento[v.FILIAL] || 0) + 1;
    });
    
    console.log("\nLojas na API:");
    console.log(lojasApi);
    
    console.log("\nLojas no Fechamento:");
    console.log(lojasFechamento);
}

main();
