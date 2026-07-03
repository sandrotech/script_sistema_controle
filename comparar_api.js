const axios = require('axios');

async function checkApiSales() {
    const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
    console.log(`Buscando vendas na API remota: ${url}`);
    
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
        
        const vendas = response.data;
        console.log(`Retornadas ${vendas.length} vendas do período.`);
        
        let totalVenda = 0;
        let totalQtd = 0;
        const porOrigem = {};
        
        vendas.forEach(v => {
            const val = parseFloat(v.venda);
            const qtd = parseFloat(v.qtd);
            const orig = v.origem || 'DESCONHECIDA';
            
            if (!isNaN(val)) totalVenda += val;
            if (!isNaN(qtd)) totalQtd += qtd;
            
            porOrigem[orig] = (porOrigem[orig] || 0) + val;
        });
        
        console.log(`\nSoma Total do Valor de Vendas na API: R$ ${totalVenda.toFixed(2)}`);
        console.log(`Soma Total da Quantidade na API: ${totalQtd.toFixed(2)}`);
        console.log('\nDivisão por Origem das Vendas:');
        Object.entries(porOrigem).forEach(([orig, val]) => {
            console.log(`- ${orig}: R$ ${val.toFixed(2)}`);
        });
        
    } catch (error) {
        console.error("Erro ao chamar API:", error.message);
        if (error.response) {
            console.error("Status da resposta:", error.response.status);
            console.error("Dados da resposta:", error.response.data);
        }
    }
}

checkApiSales();
