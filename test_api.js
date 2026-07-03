const axios = require('axios');
async function test() {
  try {
    const login = await axios.post('https://ultradistribuicao.alessandrosantos.dev/api/login', {
      email: 'victor@ultrarota.com.br',
      password: 'Cometa@ultrarota'
    });
    const token = login.data.token || login.data;
    const res = await axios.get('https://ultradistribuicao.alessandrosantos.dev/api/vendas?startDate=2026-06-29&endDate=2026-07-02', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const vendas = res.data.vendas || res.data;
    const frango = vendas.filter(v => v.origem === 'FRANGOLANDIA_EMAIL');
    console.log('Total Vendas encontradas:', vendas.length);
    console.log('Vendas Frangolandia:', frango.length);
    if (frango.length > 0) { console.log(frango[0]); }
  } catch(e) {
    console.log(e.response ? e.response.data : e.message);
  }
}
test();
