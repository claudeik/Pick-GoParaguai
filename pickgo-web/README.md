# Pick & Go · front-end (Fase 1)

Front-end do Portal Paraguai Pick & Go. É o mockup `PIck&go` (telas T1–T30) transformado em app React que consome a API do `pickgo-backend`, mantendo o visual (o `src/styles.css` é o do mockup).

## Rodar

```bash
# 1. backend (em outro terminal)
cd ../pickgo-backend && npm install && npm run dev   # porta 3333, cria lojas e produtos de demonstração

# 2. front
npm install
npm run dev                                          # http://localhost:5180
```

O Vite repassa `/v1` para `http://localhost:3333`. Para outra URL: `API_URL=http://host:porta npm run dev`.

## Telas

| Aba | Telas | Perfil na API |
|---|---|---|
| App do turista | T12 cadastro (aceite por canal: WhatsApp, SMS, e-mail), aba Ajuda (dúvida, cancelamento, respostas e avisos), vitrine de ofertas com contagem regressiva e cupom na sacola, T1 catálogo, T2 sacola, T3 Pix, T5/T6 Scan & Go, T4/T19 meus pedidos e QR | `cliente` (token do cadastro) |
| Central do Portal | T30 fila (separar → coleta → teste na loja → pronto → retirado), T7 conferência de QR, ocorrências 3.3.2 | `central` |
| Painel do lojista | T9 vendas e comissão, bancada de teste (RF-50), separação no balcão, entrega por QR | `lojista` da loja escolhida |
| Lista mestre das lojas | Catálogo de cada loja (preço, estoque, EAN, código da loja, descrição, fotos), publicar ou tirar do Pick & Go, importar planilha CSV, chave de integração e histórico de envios. O lojista vê a própria lista no painel dele | `admin` (ou `lojista`) |
| ERP do Portal | Painel (a receber, a pagar, IVA do mês, valor do estoque), estoque (saldos por depósito, movimentações, kardex, inventário), compras, faturas e notas de crédito com impressão, comissões do mês, contas a pagar e receber, livros do IVA com CSV, cadastros (empresa e timbrado, clientes e fornecedores com RUC, itens, depósitos) | quem tem `erp.ver` |
| Usuários e acesso | Equipe por organização e loja, novo usuário com senha temporária, troca de perfil, bloqueio e matriz de permissões | quem tem `usuarios.ver` |
| CRM e atendimento | Funil com o quadro do Gothan (arrastar entre etapas, lead novo na coluna, quadro ou lista), ficha do cliente com onboarding, consentimento, pedidos e mensagens, caixa de atendimento multicanal, captação de leads, campanhas em cascata com oferta exclusiva e resultados, ofertas por quantidade e tempo | quem tem `crm.ver` |
| Plataforma | T10 vendas por loja, saldos do ledger, estorno com reversão do split, ledger e exportação CSV | `admin` |

## Login da equipe (Keycloak)

Com o Keycloak rodando (`../pickgo-keycloak/iniciar.sh`, porta 8180), as abas da equipe pedem login e só aparecem as que o perfil permite. Os botões sem permissão somem, e o backend também recusa essas ações. Os usuários de demonstração estão no README do `pickgo-keycloak` (senha `PickGo@2026`). Sem `VITE_KEYCLOAK_URL` (apague o `.env.development`), o app volta ao modo demonstração.

## Ambiente de teste

- Os perfis da equipe usam `POST /v1/dev/login`, que o backend só liga fora de produção. Em produção isso vira o login OIDC.
- O botão **Simular pagamento do Pix** chama `POST /v1/dev/pix/{txid}/pagar`, que envia ao backend um webhook assinado. **Reenviar o webhook** testa a idempotência: o split é lançado uma vez só.
- O QR de retirada é um QR de verdade. Sem câmera, copie o código em “Meus pedidos” e cole na conferência da central.

## O que fica para as próximas fases

Carteira e cashback, KYC, envio ao Brasil, vídeo com link e compra em 1 clique, CRM, campanhas e ativação multicanal. Essas abas do mockup não entraram porque o backend da Fase 1 não tem esses módulos.
