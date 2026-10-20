# App do turista na Play Store e na App Store

O app do turista (catálogo, Scan & Go, pedidos, ajuda e conta) é empacotado com o Capacitor 8 para Android e iOS. É publicado pela **EPYX**, e o identificador nas duas lojas é `br.com.epyx.pickgo`. Ele não muda depois da primeira publicação.

| Parte | Onde fica |
|---|---|
| Entrada do app (só o turista) | `app-turista/` e `src/AppTurista.tsx` |
| Recursos nativos (leitor de código, push) | `src/nativo.ts` |
| Configuração do Capacitor | `capacitor.config.ts` |
| Projeto Android (Android Studio) | `android/` |
| Projeto iOS (Xcode, Swift Package Manager) | `ios/` |

## Rodar e gerar

```bash
npm run dev:turista     # app do turista no navegador: http://localhost:5181
npm run build:turista   # gera dist-turista/
npm run app:android     # build + cap sync + abre o Android Studio
npm run app:ios         # build + cap sync + abre o Xcode
```

Antes do build que vai para as lojas, preencha `.env.turista`:

- `VITE_API_URL`: endereço público da API com HTTPS (ex.: `https://api.pickgo.com.py`). O app instalado não alcança `localhost`.
- `VITE_PUSH_ANDROID=true`: só depois de colocar o `google-services.json` em `android/app/`. Sem esse arquivo, ligar o push derruba o app no Android.

## O que o app faz além do site

- **Leitor nativo** de código de barras e QR (`@capacitor/barcode-scanner`). Funciona também no iPhone, onde o navegador não lê códigos.
- **Push** dos avisos do pedido (Pix confirmado, pedido pronto, lembrete, cancelamento, reembolso). Tocar na notificação abre "Pedidos". O código de login continua indo só pelo WhatsApp.
- **Exclusão da conta** em "Conta". A Apple exige (regra 5.1.1(v)) e a LGPD também. Os dados pessoais são apagados e os pedidos ficam anônimos para o ledger e o fiscal. A exclusão é recusada enquanto houver pedido pago e não retirado.

## O que a EPYX precisa providenciar

1. **Apple Developer Program** como organização (US$ 99 por ano). Exige o número D-U-N-S da EPYX.
2. **Google Play Console** como organização (US$ 25, uma vez). Conta de organização não tem a exigência de 12 testadores por 14 dias.
3. **Xcode** pela App Store do Mac. Hoje só há as Command Line Tools, que não compilam iOS. Para Android, o **Android Studio**.
4. **Firebase**: crie um projeto, adicione o app Android `br.com.epyx.pickgo` e baixe o `google-services.json` para `android/app/`. Em Configurações > Contas de serviço, gere a chave JSON para a API.
5. **Chave APNs** (.p8) em developer.apple.com > Keys, com "Apple Push Notifications service". Anote o Key ID e o Team ID.
6. **Política de privacidade e termos** num endereço público. As lojas exigem, ainda mais porque o app coleta CPF.

## Variáveis da API para o app

| Variável | Para quê |
|---|---|
| `ORIGENS_APP` | CORS do app instalado. Padrão: `capacitor://localhost,https://localhost` (iOS e Android) |
| `APP_ID` | `br.com.epyx.pickgo` (o tópico do APNs) |
| `FCM_CONTA_SERVICO` | JSON da conta de serviço do Firebase (push no Android) |
| `APNS_CHAVE`, `APNS_KEY_ID`, `APNS_TEAM_ID` | Chave .p8 (com `\n` nas quebras de linha), Key ID e Team ID (push no iOS) |
| `APNS_PRODUCAO` | `true` para builds do TestFlight e da App Store |
| `REVISAO_CPF`, `REVISAO_CODIGO` | Conta da revisão das lojas (abaixo) |

Sem as credenciais de uma plataforma, o push dela é simulado e registrado como enviado, como acontece com a Twilio.

## Conta para a revisão das lojas

O revisor da Apple e do Google não recebe o código no nosso WhatsApp. Cadastre um cliente de teste, defina `REVISAO_CPF` e `REVISAO_CODIGO` na API e informe os dois em "App Review Information" (Apple) e em "Acesso ao app" (Google). Esse CPF entra com o código fixo e não dispara WhatsApp. Troque o código depois de cada revisão.

## Passos no Xcode (uma vez)

1. Em Signing & Capabilities, escolha o time da EPYX.
2. Clique em "+ Capability" e adicione **Push Notifications**. O arquivo `App/App.entitlements` já existe.
3. Troque o ícone em `App/Assets.xcassets/AppIcon` e a tela de abertura.
4. Product > Archive, depois Distribute App > App Store Connect.

## Passos no Android Studio (uma vez)

1. Gere a chave de assinatura (Build > Generate Signed Bundle). Guarde a chave e a senha fora do repositório; sem elas não dá para publicar atualizações.
2. Troque o ícone (botão direito em `res` > New > Image Asset).
3. Gere o `.aab` e envie na Play Console, primeiro no teste interno.

## Formulários das lojas

- **Apple, App Privacy**: nome, telefone, e-mail, CPF (identificador), histórico de compras, identificador do aparelho (push). Tudo ligado à identidade. Nada é usado para rastreamento.
- **Google, Segurança dos dados**: o mesmo, com criptografia em trânsito e exclusão de conta disponível no app.
- **Pagamento**: produto físico pago por Pix. Fica fora da compra no app da Apple e do faturamento do Google (Apple 3.1.3(e); Google, bens físicos).
- **Versão**: `versionCode` e `versionName` em `android/app/build.gradle`; `MARKETING_VERSION` e `CURRENT_PROJECT_VERSION` no Xcode. Cada envio precisa de um número maior.
