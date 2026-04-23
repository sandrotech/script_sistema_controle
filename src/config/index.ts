import "dotenv/config";

export const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  API_URL_UNIDADES: process.env.API_URL_UNIDADES || "https://app.pactosolucoes.com.br/api/prest/psec/vendas",
  API_BASE_URL: "https://apigw.pactosolucoes.com.br",
  
  // Dicionário de Tokens lidos do .env para segurança
  TOKENS: {
    "a00731088b65cf657c64e9aef32bdd01": process.env.API_TOKEN_MARAPONGA,
    "1fa8785247bcc674c90f8d1ac925aef3": process.env.API_TOKEN_JOAO_CARLOS,
    "959d42126e55de7eca42be19ff225104": process.env.API_TOKEN_JOAO_23,
    "a1d22b16d4db9ff82e9da1e7a5d38f65": process.env.API_TOKEN_SAO_PAULO,
    "3c26c97bbdc5aad0280b70e2d145de98": process.env.API_TOKEN_OSORIO,
  } as Record<string, string | undefined>
};
