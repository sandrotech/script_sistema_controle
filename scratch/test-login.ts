import axios from 'axios';
import https from 'https';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

async function testLogin() {
  const apiUrl = "https://vendas.cometasupermercados.com.br";
  const email = "serrasulmorangos@gmail.com";
  const password = "Serrasulmorangos@2026";

  console.log(`🚀 Testando login para: ${email}...`);

  try {
    const response = await axios.post(`${apiUrl}/login`, {
      email,
      password
    }, { httpsAgent: agent });

    console.log("✅ Status da Resposta:", response.status);
    console.log("📦 Tipo dos Dados:", typeof response.data);
    console.log("📄 Conteúdo da Resposta:", JSON.stringify(response.data).substring(0, 50) + "...");

    const token = typeof response.data === 'string' ? response.data : response.data.token;

    if (token) {
      console.log("✨ Token capturado com sucesso!");
      console.log("🔑 Início do Token:", token.substring(0, 20) + "...");
    } else {
      console.error("❌ Token não encontrado na resposta.");
    }
  } catch (error: any) {
    console.error("❌ Erro no Login:", error.response?.data || error.message);
  }
}

testLogin();
