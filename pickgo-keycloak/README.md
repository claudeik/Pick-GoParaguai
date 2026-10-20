# Keycloak do Pick & Go

Login da equipe (Portal Paraguai, EPYX e lojas) com OIDC. O turista não usa o Keycloak: ele entra pelo cadastro com CPF do app.

## Rodar

```bash
./iniciar.sh        # sem Docker: baixa JDK 21 e Keycloak 26.7.5 para .ferramentas/ na primeira vez
# ou
docker compose up   # com Docker
```

- Keycloak: http://localhost:8180 · console: http://localhost:8180/admin (admin / admin, só local)
- O realm `pickgo` é importado de `realm-pickgo.json` só se ainda não existir. Para recriar do zero, pare o Keycloak e apague `.ferramentas/keycloak/data/h2`.
- Backend: `KEYCLOAK_URL=http://localhost:8180 KEYCLOAK_CLIENT_SECRET=dev-pickgo-api-secret-troque-em-producao npm run dev`
- Front: o `.env.development` do `pickgo-web` já aponta para http://localhost:8180.

## Usuários de demonstração (senha `PickGo@2026`)

| E-mail | Organização | Perfil |
|---|---|---|
| admin@portalparaguai.com | Portal | Administrador do Portal |
| central@portalparaguai.com | Portal | Operador da central |
| atendimento@portalparaguai.com | Portal | Atendimento do Portal (CRM) |
| marketing@portalparaguai.com | Portal | Marketing do Portal (campanhas) |
| financeiro@portalparaguai.com | Portal | Financeiro do Portal (inclui o ERP) |
| almoxarifado@portalparaguai.com | Portal | Almoxarifado do Portal (estoque do ERP) |
| admin@epyx.com.br | EPYX | Administrador EPYX |
| suporte@epyx.com.br | EPYX | Suporte EPYX |
| gerente@cellshop.com.py | Loja Cellshop | Gerente da loja |
| estoque@cellshop.com.py | Loja Cellshop | Estoque da loja |
| balcao@nissei.com.py | Loja Nissei | Operador da loja |

## Como o acesso funciona

- **Perfis** são papéis do realm (`portal-admin`, `loja-gerente`…). As permissões de cada perfil ficam em `pickgo-backend/src/acesso/modelo.ts`, que é a fonte da verdade; um teste garante que o realm declara os mesmos perfis.
- **Organização e loja** são atributos do usuário (`organizacao`, `loja_id`), editáveis só pelo admin, e chegam no token por mapeadores do client `pickgo-web`.
- **`pickgo-web`**: client público, código de autorização com PKCE S256, sem login por senha direto. O token leva a audiência `pickgo-api`, que a API exige.
- **`pickgo-api`**: client confidencial com conta de serviço (`manage-users`, `view-users`, `query-users`, `view-realm`), usada pela tela de usuários do Pick & Go.
- **Senha:** no mínimo 10 caracteres, com maiúscula, minúscula, número e símbolo, e sem repetir as 3 últimas. Usuário novo recebe uma senha temporária e cria a própria no primeiro acesso. Há proteção contra força bruta.

## Antes de produção

- Trocar o segredo do client `pickgo-api` e as senhas de demonstração (ou não importar os usuários de demonstração).
- `start` em vez de `start-dev`, banco PostgreSQL, HTTPS e o domínio real nos redirecionamentos do `pickgo-web`.
- Configurar SMTP para "esqueci minha senha" e verificação de e-mail.
- Avaliar MFA (TOTP) obrigatório para os perfis de administrador e financeiro.
