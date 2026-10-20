# Pick & Go · backend (Fase 1)

API do Portal Paraguai Pick & Go: catálogo, pedidos, Pix com split no ledger de dupla entrada, central de operação (coleta, teste da loja, entrega por QR), Scan & Go, ocorrências da regra 3.3.2 e painéis. Segue a especificação técnica v0.1 (split 85 / 7,5 / 7,5, mais 1% de Pix e 0,5% de câmbio pagos pelo comprador).

## Rodar

```bash
npm install
npm run dev      # http://127.0.0.1:3333 · banco PGlite em .data/pglite
npm test         # 54 testes: critérios 14.2, catálogo, lista mestre, acesso, CRM, campanhas e ERP
npm run typecheck
```

Requer Node 22.18 ou superior (roda TypeScript direto, sem build). Em desenvolvimento, um banco vazio recebe as 5 lojas e os 15 produtos do piloto. Para começar do zero, pare o servidor e apague `.data/`. O `npm run seed` faz o mesmo sem subir a API, mas não roda com o servidor ligado, porque o PGlite só aceita um processo por pasta.

## Acesso da equipe (Keycloak)

A equipe entra pelo Keycloak (`../pickgo-keycloak`). Cada usuário pertence a uma organização (Portal Paraguai, EPYX ou uma loja) e tem um perfil de acesso; o perfil dá permissões de ver e de editar (`src/acesso/modelo.ts`). Quem é de loja só enxerga a própria loja.

```bash
KEYCLOAK_URL=http://localhost:8180 KEYCLOAK_CLIENT_SECRET=dev-pickgo-api-secret-troque-em-producao npm run dev
```

Sem `KEYCLOAK_URL`, a API fica no modo demonstração: os usuários da equipe ficam em memória e o `/v1/dev/login` emite tokens com perfis antigos (`admin`, `central`, `lojista`, `operador`) ou novos (`perfil_acesso: "epyx-suporte"`). Em produção, o `KEYCLOAK_URL` é obrigatório e token HMAC só vale para o turista.

| Perfil | Organização | Resumo |
|---|---|---|
| Administrador do Portal | Portal | Tudo, e usuários de todas as organizações |
| Operador da central | Portal | Fila, coleta, conferência, entrega por QR e ocorrências |
| Atendimento do Portal | Portal | CRM: funil, chamados e mensagens; consulta pedidos e catálogo |
| Marketing do Portal | Portal | Público, ofertas, campanhas e captação de leads |
| Financeiro do Portal | Portal | Plataforma, ledger, conciliação, estornos e o ERP (faturas, compras, contas, livros) |
| Almoxarifado do Portal | Portal | Estoque do ERP: itens, depósitos, movimentações e inventário |
| Administrador EPYX | EPYX | Suporte, integrações, financeiro e usuários da EPYX |
| Suporte EPYX | EPYX | Acompanha pedidos, catálogo e integrações, sem editar |
| Financeiro EPYX | EPYX | Split, ledger e conciliação |
| Gerente da loja | Loja | Tudo da própria loja, inclusive a equipe dela |
| Estoque da loja | Loja | Lista mestre e planilha, sem publicar no Pick & Go |
| Operador da loja | Loja | Teste de defeitos, separação e entrega por QR |
| Financeiro da loja | Loja | Vendas, comissões e repasse da loja |

Regras de gestão de usuários: o gerente cuida da equipe da própria loja; o admin EPYX, da EPYX; o admin do Portal, de todas. Ninguém altera o próprio acesso nem concede um perfil que o próprio perfil não concede. Usuário bloqueado perde as sessões na hora; o token de acesso já emitido vale até expirar (5 minutos).

## CRM e atendimento

- **Funil:** cada cliente do app vira um contato (os leads do formulário, de mensagens recebidas e os cadastrados à mão também). As etapas são lead → contato feito → onboarding → cliente ativo → recorrente / perdido. Cadastro, primeira compra e retiradas movem o contato sozinhos.
- **Onboarding** calculado dos dados reais: cadastro, aceite de mensagens, primeiro pedido pago, primeira retirada e segunda compra.
- **Chamados:** dúvida, cancelamento, retirada atrasada, reclamação e defeito, com prioridade e prazo de resposta. Abrem sozinhos quando o pedido está pronto há mais de `LEMBRETE_RETIRADA_HORAS` (24 h, junto com o lembrete), quando não é retirado no prazo (prioridade alta) e quando há defeito depois da saída. O cliente abre pelo app (`POST /v1/atendimento`) ou escrevendo no WhatsApp/SMS.
- **Mensagens** (outbox): toda saída nasce `PENDENTE` e a rotina envia. No envio são checados o aceite do canal, o pedido de parar (resposta PARAR/STOP) e o limite de `LIMITE_MARKETING_SEMANA` ofertas por semana. A resposta do atendimento vale no canal em que o cliente escreveu nas últimas 24 h. Sem aceite em nenhum canal, a mensagem fica só na caixa do app. Falha temporária tenta de novo com espera crescente (até 5 vezes). Entrega pelo menos uma vez: uma queda entre o envio e a gravação pode repetir a mensagem.
- **Mensagens automáticas:** boas-vindas, Pix confirmado, pedido pronto, lembrete de retirada, não retirado, Pix expirado, cancelado e reembolso (`src/crm/modelos.ts`).
- **Twilio:** WhatsApp e SMS pela API de mensagens, e-mail pelo SendGrid. Os webhooks `POST /v1/webhooks/twilio/status` (entrega e leitura) e `POST /v1/webhooks/twilio/entrada` (mensagens recebidas) têm a assinatura `X-Twilio-Signature` validada. Sem `TWILIO_ACCOUNT_SID`, as mensagens são simuladas e registradas como entregues.

Para ligar a Twilio: configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (ex.: `whatsapp:+14155238886` no sandbox), `TWILIO_SMS_FROM`, `SENDGRID_API_KEY`, `EMAIL_REMETENTE` e `URL_PUBLICA` (endereço público da API, para os webhooks). Na Twilio, aponte "A message comes in" do número para `URL_PUBLICA/v1/webhooks/twilio/entrada`. Fora da janela de 24 h, o WhatsApp só aceita modelo aprovado pela Meta: cadastre os modelos na Twilio (Content API) e informe `TWILIO_CONTENT_SIDS={"pedido_pronto":"HX…",…}`.

## Campanhas e ofertas

- **Público** (segmento): etapas do funil, gasto mínimo, número de compras, sem compra há N dias, já comprou na categoria ou na loja, interesse e etiquetas. Há atalhos (clientes preferenciais, reativar, primeira compra, leads) e prévia com quantos cada canal alcança. O público é congelado no disparo.
- **Oferta por quantidade e por tempo**: preço promocional num produto, unidades reservadas, início e fim, limite por cliente e cupom `PICKGO-XXXX`. Pública aparece na vitrine do app; exclusiva só vale para quem está no público da campanha. As unidades voltam se o Pix expirar, o pedido for cancelado ou estornado.
- **Quem paga o desconto** (RF-29): a loja abre mão, o Portal completa o repasse da loja com um lançamento `SUBSIDIO_CAMPANHA` (`portal:campanhas` → repasse da loja), ou dividido meio a meio. O estorno reverte o subsídio. As comissões são calculadas sobre o preço pago.
- **Cascata** (RF-36): a campanha tenta o primeiro canal aceito; se a pessoa não ler (WhatsApp) nem clicar em `espera_horas`, tenta o próximo. Clique, compra ou oferta esgotada encerram a cascata. Cada campanha conta uma vez no limite semanal, mesmo passando por vários canais.
- **Link curto** `GET /l/{codigo}`: registra o clique e leva ao app com o cupom (`URL_APP/#turista?c=…&oferta=…`). O pedido guarda a campanha de origem pelo cupom ou pelo link (RF-31).
- **Métricas** (RF-38): público, sem canal, enviadas, entregues, lidas, bloqueadas, cliques, compras e receita.

## ERP do Portal Paraguai (controle interno)

ERP da empresa Portal Paraguai, separado do estoque das lojas (que fica na lista mestre). **Não emite fatura eletrônica válida**: a integração com o SIFEN/e-Kuatia da DNIT vem depois, com certificado digital, timbrado eletrônico e validação de um contador paraguaio.

- **Empresa e timbrado:** RUC (dígito verificador conferido, módulo 11), timbrado com vigência, estabelecimento, ponto de expedição e numeração `001-001-0000001`. Fatura fora da vigência é recusada, e número anulado não é reaproveitado.
- **Cadastros:** clientes e fornecedores (RUC, CI, CPF, CNPJ, passaporte, exterior). Cada loja do Pick & Go vira cliente, ligada pelo `loja_id`. Itens podem ser mercadoria, insumo ou serviço, com IVA de 10%, 5% ou isento. Há também os depósitos.
- **Controle de estoque:** saldo por item e depósito, que não fica negativo. O custo médio ponderado é calculado em guaranis, sem o IVA recuperável. As movimentações não se alteram depois de gravadas (há uma trava no banco): entrada de compra, saída de venda, devolução, estorno de compra, ajustes, consumo interno, transferência e inventário. Há kardex por item e alerta de estoque mínimo. O inventário fotografa o saldo na abertura, recebe a contagem e, ao fechar, ajusta as diferenças (um inventário aberto por depósito).
- **Compras (entrada de produtos):** a fatura do fornecedor (timbrado e número, sem repetir) dá entrada no estoque, gera contas a pagar (à vista quitada, ou em parcelas iguais) e entra no livro de compras. A anulação tira o estoque de volta e cancela as contas.
- **Faturas e notas de crédito:** o preço já inclui o IVA (10% = total ÷ 11; 5% = total ÷ 21). A mercadoria sai do estoque e são geradas as contas a receber. A nota de crédito pode ser parcial, por linha, com devolução ao estoque; ela abate o que falta receber e, se já foi recebido, gera um valor a devolver ao cliente. Para anular uma fatura com recebimento lançado à mão, é preciso estornar a baixa antes. Nota de crédito não se anula nesta versão.
- **Comissões das lojas:** `POST /erp/faturas/comissoes` gera uma fatura por loja e mês com a comissão do Portal no ledger do Pick & Go, convertida para guaranis (`COTACAO_BRL_PYG`), com IVA de 10%. A fatura sai à vista e quitada pela retenção no split.
- **Contas a pagar e a receber:** parcelas, baixas parciais, estorno de baixa, vencidos com dias de atraso e contas avulsas (aluguel, energia).
- **Livros do IVA:** vendas e compras do mês em guaranis, com documento em dólar convertido pelo câmbio dele e anulados marcados e zerados. O CSV segue as colunas da RG 90 (leiaute a validar com o contador).
- **Perfis:** "Financeiro do Portal" (cadastros, compras, faturas, contas, livros) e "Almoxarifado do Portal" (itens, depósitos, movimentações e inventário).

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL real; obrigatório em produção |
| `PGLITE_DIR` | `.data/pglite` | Pasta do Postgres embutido (desenvolvimento) |
| `TOKEN_SECRET`, `CPF_HASH_SECRET`, `PIX_WEBHOOK_SECRET` | `dev-…` | Obrigatórios em produção |
| `COTACAO_USD_BRL_E4` | `55000` | US$ 1 = R$ 5,50 [D1] |
| `COMISSAO_PORTAL_BPS`, `COMISSAO_EPYX_BPS` | `750` | 7,5% cada [D4] |
| `TAXA_PIX_BPS`, `TAXA_CAMBIO_BPS` | `100`, `50` | Pagas pelo comprador [D4] |
| `PIX_VALIDADE_MIN` | `30` | Validade da cobrança |
| `PRAZO_RETIRADA_HORAS` | `72` | Depois disso o pedido vira `NAO_RETIRADO` |
| `COTA_USD_CENTAVOS` | `50000` | Aviso de cota por terra [D3] |
| `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | —, `pickgo`, `pickgo-api`, — | Login da equipe e gestão de usuários |
| `COTACAO_BRL_PYG` | `1380` | Guaranis por real, nas faturas de comissão |
| `URL_APP` | `http://localhost:5180` | Para onde o link curto da campanha leva |
| `NODE_ENV=production` | — | Desliga o login de desenvolvimento e o simulador de Pix |

## Rotas (`/v1`)

| Domínio | Rotas |
|---|---|
| Catálogo | `GET /lojas`, `GET /categorias`, `GET /produtos`, `GET /produtos/{id}`, `GET /lojas/{id}/produtos/codigo/{ean}`, `PUT /loja/ponto-retirada` |
| Lista mestre | `GET/POST/PATCH /loja/produtos` (lojista na própria loja, admin em qualquer uma), `POST /loja/catalogo/importar`, `GET /loja/sincronizacoes`, `POST /lojas/{id}/chave-integracao`, `PUT /integracao/catalogo` (sistema da loja, cabeçalho `x-chave-loja`) |
| Identidade | `POST /clientes`, `GET /clientes/eu`, `POST /dev/login` (só fora de produção) |
| Pedidos | `POST /pedidos`, `GET /pedidos`, `GET /pedidos/{id}`, `POST /pedidos/{id}/cancelar`, `POST /pedidos/{id}/cheguei` |
| Pagamentos | `POST /pedidos/{id}/pix`, `POST /webhooks/pix`, `POST /pagamentos/{id}/estorno`, `POST /dev/pix/{txid}/pagar` (simulador) |
| Operação | `GET /central/fila`, `GET /loja/pedidos`, `POST /pedidos/{id}/coleta/iniciar`, `POST /pedidos/{id}/coleta/conferir`, `POST /pedidos/{id}/itens/{item}/teste`, `POST /pedidos/{id}/itens/{item}/separar`, `POST /retirada/consultar`, `POST /pedidos/{id}/retirada/confirmar`, `POST /pedidos/{id}/saida/liberar` |
| Ocorrências | `GET /ocorrencias`, `POST /ocorrencias`, `POST /ocorrencias/{id}/resolver` |
| Acesso e usuários | `GET /acesso/eu`, `GET /acesso/modelo`, `GET/POST /usuarios`, `PATCH /usuarios/{id}`, `POST /usuarios/{id}/senha-temporaria` |
| CRM | `GET /crm/funil`, `GET/POST /crm/contatos`, `GET/PATCH /crm/contatos/{id}`, `POST /crm/contatos/{id}/mensagens`, `GET/POST /crm/tickets`, `GET/PATCH /crm/tickets/{id}`, `POST /crm/tickets/{id}/mensagens`, `POST /leads` (público), `GET/POST /atendimento` (turista), `POST /webhooks/twilio/status`, `POST /webhooks/twilio/entrada` |
| Campanhas | `GET /publico/atalhos`, `POST /publico/previa`, `GET /ofertas` (vitrine), `GET /ofertas/gestao`, `POST /ofertas`, `POST /ofertas/{id}/encerrar`, `GET/POST /campanhas`, `GET /campanhas/{id}`, `POST /campanhas/previa-mensagem`, `POST /campanhas/{id}/agendar`, `POST /campanhas/{id}/cancelar`, `GET /l/{codigo}` |
| ERP | `GET/PUT /erp/empresa`, `GET/POST/PATCH /erp/terceiros`, `GET/POST /erp/depositos`, `GET/POST/PATCH /erp/itens`, `GET /erp/estoque/saldos`, `GET/POST /erp/estoque/movimentos`, `GET/POST /erp/inventarios`, `GET /erp/inventarios/{id}`, `PATCH /erp/inventarios/{id}/contagem`, `POST /erp/inventarios/{id}/fechar`, `GET/POST /erp/compras`, `POST /erp/compras/{id}/anular`, `GET/POST /erp/faturas`, `POST /erp/faturas/{id}/anular`, `POST /erp/faturas/{id}/nota-credito`, `POST /erp/faturas/comissoes`, `GET/POST /erp/titulos`, `POST /erp/titulos/{id}/baixas`, `POST /erp/baixas/{id}/estornar`, `GET /erp/livros/{ventas,compras}`, `GET /erp/painel` |
| Relatórios | `GET /config/publica`, `GET /relatorios/lojas/{id}`, `GET /relatorios/plataforma`, `GET /lancamentos`, `GET /relatorios/conciliacao.csv` |

Padrões: token `Bearer` com perfil (`cliente`, `lojista`, `operador`, `central`, `admin`); `Idempotency-Key` na criação de pedido, no Pix, no estorno e na resolução de ocorrência; erros em `application/problem+json`, com `codigo` legível (ex.: `qr-ja-usado`).

## Lista mestre

O catálogo de cada loja vem do sistema dela, com preço em dólar, estoque, código de barras, código da loja (SKU), descrição e até 10 fotos. O Pick & Go vende só o que está **publicado**.

- **Integração:** o admin gera uma chave por loja (`POST /lojas/{id}/chave-integracao`; só o hash fica guardado e gerar outra revoga a anterior). O sistema da loja chama `PUT /integracao/catalogo` com até 5.000 itens. O código da loja é a chave: item conhecido é atualizado, item novo entra **fora do Pick & Go** até alguém publicar. Com `"completo": true`, o que não veio fica com estoque zero (nada é apagado).
- **Planilha:** para loja sem integração, o mesmo envio a partir de um CSV lido no navegador (`POST /loja/catalogo/importar`).
- **Estoque:** `estoque_loja` é o que a loja informou; `estoque` (o disponível no app) é esse número menos as unidades reservadas em pedidos do Pick & Go ainda não retirados. Premissa a confirmar com as lojas: elas só baixam a venda no próprio sistema quando o pedido é retirado. Se baixarem antes, a reserva conta duas vezes.
- **Erros por item:** código da loja repetido no envio ou código de barras de outro produto entram na lista de erros, sem barrar os demais itens. Cada envio fica no histórico (`GET /loja/sincronizacoes`).

## Decisões tomadas na implementação

- **Retirada na loja aceita uma loja por pedido.** Pedidos com várias lojas usam a retirada na central [D6].
- **Estorno também a partir de** `EM_SEPARACAO`, `PRONTO_RETIRADA`, `LIBERADO_SAIDA` e `NAO_RETIRADO`, além de `PAGO` e `RETIRADO` da seção 7. O pedido pago sai de `PAGO` na hora, então sem isso o estorno quase nunca seria possível. Durante a coleta e o teste o estorno espera, porque o item está em trânsito.
- **Divergência na saída do Scan & Go segura a liberação** até a ocorrência ser resolvida.
- **Acerto na fatura dividido entre loja e Portal:** metade para cada um, e o centavo ímpar fica com a loja.
- **Defeito pós-saída sem item informado** abre um ticket para cada loja do pedido.
- **Entrega exige o documento conferido** (`documento_conferido: true`).

## O que ainda falta

- Estorno parcial (RF-09).
- Provedor de Pix real e liquidação com a Cambio Real [D1].
- Login OIDC no lugar do `/dev/login`.
- Login do cliente por código no WhatsApp: hoje, CPF já cadastrado não recebe token.
- Barramento de eventos: o outbox só registra no log.
- Fases 2 a 4: carteira, KYC, envio ao Brasil, CRM, campanhas.
