# Portal Paraguai · Pick & Go

Compra nas lojas do Portal Paraguai com Pix e retirada sem fila, mais CRM, campanhas e o ERP do Portal.

| Pasta | O que é |
|---|---|
| [pickgo-backend](pickgo-backend/) | API em Node 24 + Fastify + TypeScript, migrações SQL e testes (`npm test`) |
| [pickgo-web](pickgo-web/) | Front em React 19 + Vite + TypeScript |
| [pickgo-keycloak](pickgo-keycloak/) | Realm `pickgo` do Keycloak e scripts para rodar localmente |
| `index.html`, `app.js`, `styles.css` | Mockup original que deu origem ao front |
| [ESPECIFICACAO.md](ESPECIFICACAO.md) | Especificação técnica |

Para rodar: Keycloak (`pickgo-keycloak/iniciar.sh`, porta 8180), API (`pickgo-backend`, `npm run dev`, porta 3333) e front (`pickgo-web`, `npm run dev`, porta 5180). Cada pasta tem um README com os detalhes.

As senhas e o segredo do client que aparecem no realm e nos READMEs são só de desenvolvimento e precisam ser trocados em produção.
