const axios = require('axios');

async function checkApiSales() {
    const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
    try {
        const response = await axios.get(url, {
            params: {
                dataInicial: '01-06-2026',
                dataFinal: '30-06-2026'
            },
            headers: {
                'X-User-Email': 'victor@ultrarota.com.br'
            }
        });
        
        const vendas = response.data.filter(v => v.origem === 'FRANGOLANDIA_EMAIL');
        console.log(`Vendas FRANGOLANDIA_EMAIL no período: ${vendas.length}`);
        
        const porData = {};
        vendas.forEach(v => {
            const dateOnly = v.data.split('T')[0];
            if (!porData[dateOnly]) {
                porData[dateOnly] = { count: 0, sum: 0 };
            }
            porData[dateOnly].count++;
            porData[dateOnly].sum += parseFloat(v.venda);
        });
        
        console.log("\nValores na API por data:");
        Object.entries(porData).sort().forEach(([date, info]) => {
            console.log(`- ${date}: ${info.count} vendas, Total R$ ${info.sum.toFixed(2)}`);
        });
        
    } catch (error) {
        console.error("Erro:", error.message);
    }
}

checkApiSales();
