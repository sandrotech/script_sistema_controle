import "dotenv/config";

export class PactoAPI {
  private static async fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<any> {
    while (retries > 0) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return await res.json();
        
        console.error(`  -> [ERRO] API Status ${res.status} em ${url}. Tentativas restantes: ${retries - 1}`);
      } catch (err: any) {
        console.error(`  -> [ERRO REDE] ${err.message}. Tentativas restantes: ${retries - 1}`);
      }
      retries--;
      if (retries > 0) await new Promise(r => setTimeout(r, 5000));
    }
    return null;
  }

  static async getUnidades(token: string) {
    const url = process.env.API_URL_UNIDADES || "https://app.pactosolucoes.com.br/api/prest/psec/vendas";
    return this.fetchWithRetry(url, {
      headers: { "Authorization": token, "Accept": "application/json" }
    });
  }

  static async getPlanos(token: string, page: number, size = 10) {
    const url = `https://apigw.pactosolucoes.com.br/planos?page=${page}&size=${size}&sort=codigo,asc`;
    return this.fetchWithRetry(url, {
      headers: { 
        "Authorization": token, 
        "empresaId": "1",
        "Accept": "application/json" 
      }
    });
  }

  static async getAlunos(token: string, situacao: string, page: number, size = 100) {
    const filters = JSON.stringify({ situacoesEnuns: [situacao] });
    const params = new URLSearchParams({
      filters,
      permiteAlunoOutraEmpresa: "false",
      incluirAutorizado: "false",
      page: String(page),
      size: String(size),
      sort: "nome,asc"
    });
    const url = `https://apigw.pactosolucoes.com.br/psec/alunos?${params.toString()}`;
    
    return this.fetchWithRetry(url, {
      headers: { 
        "Authorization": token, 
        "empresaId": "1",
        "Accept": "application/json" 
      }
    });
  }
}
