const axios = require('axios');

async function main() {
    const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
    try {
        const response = await axios.get(url, {
            params: {
                dataInicial: '01-06-2026',
                dataFinal: '01-06-2026'
            },
            headers: {
                'X-User-Email': 'victor@ultrarota.com.br'
            }
        });
        
        const vendas = response.data.filter(v => v.origem === 'FRANGOLANDIA_EMAIL');
        console.log(`Encontradas ${vendas.length} vendas de FRANGOLANDIA_EMAIL no dia 01/06/2026.`);
        
        // Agrupar por PLU e Loja
        const grupos = {};
        vendas.forEach(v => {
            const key = `${v.loja}-${v.plu}`;
            if (!grupos[key]) grupos[key] = [];
            grupos[key].push(v);
        });
        
        // Mostrar exemplos de PLUs que aparecem mais de uma vez
        let count = 0;
        console.log("\nExemplos de vendas duplicadas para o mesmo PLU/Loja no dia 01/06:");
        for (const [key, list] of Object.entries(grupos)) {
            if (list.length > 1) {
                count++;
                console.log(`\nChave ${key} (Loja ${list[0].loja}, PLU ${list[0].plu}) aparece ${list.length} vezes:`);
                list.forEach((v, index) => {
                    console.log(`  [${index}] ID: ${v.id}, Chave Única: "${v.chave_unica}", Qtd: ${v.qtd}, Venda: ${v.venda}`);
                });
                if (count >= 5) break;
            }
        }
        
    } catch (error) {
        console.error("Erro:", error.message);
    }
}

main();
