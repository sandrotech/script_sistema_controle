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
  /* 
  Adicione os próximos clientes aqui seguindo o mesmo padrão:
  {
    name: "Nome do Cliente",
    apiEmail: "email@exemplo.com",
    apiPassword: "senha",
    databaseUrl: "postgres://usuario:senha@host:porta/banco"
  },
  */
];
