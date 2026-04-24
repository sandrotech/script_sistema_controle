export interface ClientConfig {
  name: string;
  apiEmail: string;
  apiPassword: string;
  databaseUrl: string;
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
    databaseUrl: "postgres://postgres:iaXZPUnlRGIi9soiV2SS8qgJLuzgcTBkqcaeVotvdeyPkOfOIntkRo0kM118SqQG@lwws8kg4ckggwgws0gg4400k:5432/postgres"
  }
];
