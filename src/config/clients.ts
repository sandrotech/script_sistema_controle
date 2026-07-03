export interface ClientConfig {
  name: string;
  apiEmail: string;
  apiPassword: string;
  tenantId?: string; // Novo campo para Multi-Tenant (ID do Tenant no banco unificado)
  databaseUrl?: string; // Mantido como opcional para retrocompatibilidade
}

export const clients: ClientConfig[] = [
  {
    name: "Serra Sul Morangos",
    apiEmail: "serrasulmorangos@gmail.com",
    apiPassword: "Serrasulmorangos@2026",
    databaseUrl: "postgres://postgres:j9pwyElD4fOaz9owOPRjchHqvluJiedyyoB1EvkOwkh4bygVAVIQ34P6INYMk9Kh@xok4kgoows80ok408gcw0coo:5432/postgres"
  },
  {
    name: "Casa do Frango",
    apiEmail: "financeiro@casadofrango.com.br",
    apiPassword: "@|1]Py6&9}£C",
    databaseUrl: "postgres://postgres:Hldvx1Do8m5L66eqVjOVOlrKgagfcvptmspyptALJhRGowHjQ4KBxYEneoT2qqTI@k0cg88kscsw8ko804884o04o:5432/postgres"
  },
  {
    name: "Ultra Rota",
    apiEmail: "victor@ultrarota.com.br",
    apiPassword: "Cometa@ultrarota",
    databaseUrl: "postgres://postgres:QL734wyPqYW3OuBHamcErl1RTxhvB97FiDDOsZmAg4SZMWG1UKY4HYk24QQnP2FH@oandn0cu1p1tigiwlkd70ttg:5432/postgres"
  },
  {
    name: "Costa frutas - limao",
    apiEmail: "leandrochiaba@gmail.com",
    apiPassword: "CostaFrutas@2026!",
    databaseUrl: "postgres://postgres:4Lkhl8MSofMavxtkkMdL6hPP0Zvu7pydJrRm0xN2xvEp1W2Olmti66Xce6JRS4PK@igs4wokcosk8skogw884koks:5432/postgres"
  },

  {
    name: "Costa frutas - maracuja",
    apiEmail: "andredomaracuja@gmail.com",
    apiPassword: "Maracuja@andre2026@",
    databaseUrl: "postgres://postgres:9W50H3L55QbFaRrRLgHPmUuAXeMYiddYWEp0uDQWDBhE6bKbxQZqwZZxBpvsYy7i@co4c40cssgw4o4o0o8ksgoks:5432/postgres"
  },
  {
    name: "Sthephanus Comercial",
    apiEmail: "sthephanuscomercial@gmail.com",
    apiPassword: "xJA9UCBJ^9FR",
    databaseUrl: "postgres://postgres:oNAW5IxQ5TPCm8vPSyYpzzuiV7v5rDoY8xDW3ihwh24LQP8Hw66sRyqRX3ZjQryt@titum47socz3b79zvega3oot:5432/postgres"
  },
  {
    name: "Sequilhos Paulista",
    apiEmail: "sequilhospaulista.relatorio@gmail.com",
    apiPassword: "W!S^Ic5k$FUO",
    databaseUrl: "postgres://postgres:lyrkoWCfId7DTrojd67YpG8TtWY8IqNzq93rpaZDzVhUU8cRAErFOIITyLEJ3Bj7@ftp4u735ks08jblj3dsjh93c:5432/postgres"
  }
];

