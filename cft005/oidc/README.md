# CFT-005 — OIDC externo com domínios independentes

Estado em 25/10/2026: **preparação funcional isolada**, não publicada. Oito testes unitários com mocks passaram em Node.js; o browser automatizado foi bloqueado pelo ambiente antes de navegar. SSO real A → B **não executado**. Não criar clientes de produção, contas ou tokens de prova antes de configurar o provedor.

## Decisão técnica

- Cada solução mantém domínio, hospedagem, identidade visual, código e dados próprios. Não reunir aplicações em caminhos de um único domínio.
- Uma conta adulta compartilhada e a área **Minha conta**, sem marca nova. O site de autoria Marcelo Santos é independente.
- **Auth0/OIDC como candidato a provedor central**, em um único tenant e conexão de usuários, com Universal Login. A senha é digitada no provedor central após redirecionamento, não nos formulários das aplicações.
- **Supabase Auth como cliente OIDC** por **Custom OAuth/OIDC Provider** `custom:conta-central`, emitindo tokens normais Supabase para as aplicações. O recurso é diferente do **Supabase OAuth Server beta**, que permanece DESLIGADO.
- A autenticação entre domínios requer redirecionamento breve ao provedor; navegadores podem bloquear autenticação silenciosa por cookies de terceiros. Não afirmar que não haverá redirecionamento.
- Após login, cada domínio conserva sua sessão local do Supabase. Sair de uma ferramenta não encerra automaticamente a sessão central.

Documentação: https://supabase.com/docs/guides/auth/custom-oauth-providers e https://support.auth0.com/center/s/article/single-log-in-across-multiple-spa-applications-without-relying-on-3rd-party-cookies

## Preparação disponível

- `identity.mjs`: valida callbacks exatos, inicializa Supabase com PKCE, inicia o provedor externo, troca o código na origem e verifica usuário em Auth.
- `identity.test.mjs`: contratos locais, com dados sintéticos. Executar `node --test cft005/oidc/identity.test.mjs` a partir da raiz do repositório. Teste local: 8/8 PASS.
- `index.html`, `callback.html`, `app.mjs`: interfaces de demonstração. Não coletam senha.
- `config.example.json`: **modelo de configuração pública**. `config.json` não é versionado aqui nem existe na branch: é criado somente na hospedagem isolada de teste com URLs de callback exatas e chave publicável do Supabase.

## Conexão real — ainda não executada

1. Criar ou conectar tenant gratuito do Auth0 por ação explícita do titular. Criar aplicação OIDC **Regular Web Application**, com Universal Login. Não habilitar cobrança nem domínio personalizado nesta prova.
2. No painel Supabase `conta_base` (ref `jxyylpdgwvswaapeefsy`), cadastrar **Custom OAuth/OIDC Provider** `custom:conta-central`, usando o issuer OIDC, client ID e client secret do Auth0. **Nunca colocar o secret no GitHub ou no frontend.**
3. Na aplicação Auth0, configurar a **callback exata fornecida pelo Supabase**. Não inventar o callback do provedor: ele deve ser copiado do painel.
4. No Supabase Auth > URL Configuration, acrescentar somente as callbacks de teste A/B à lista permitida; preservar o Site URL e os redirects anteriores.
5. Hospedar o conteúdo desta pasta em **duas origens de teste diferentes**, por exemplo duas URLs gratuitas do Render aprovadas e configuradas. Em cada origem preparar `config.json` com a mesma URL Supabase e `allowedCallbacks` incluindo exatamente as callbacks A/B dessas origens. Testar com duas contas sintéticas.
6. Testar entrada em A, abertura de B sem senha (com redirecionamento), `auth.users.id` igual, separação das sessões de navegador, expiração/refresh, logout local, cancelamento, conta não vinculada e reversão.
7. Só depois examinar integração de MeEmpresta, Som da Turma e ApertaLetra e a área Minha conta. Apertaquem permanece fora desta implementação.

## Barreiras importantes antes de migração de dados

- Tokens normais Supabase preservam `auth.uid()` (UUID), mas a associação de uma identidade externa à conta preexistente deve ser comprovada. **Nunca vincular dados apenas por igualdade de e-mail não verificado.**
- `auth.uid() = user_id` impede acesso aos dados de **outra pessoa**, mas **não separa tokens de cada aplicativo** quando todos compartilham um único projeto Supabase. Isso é um requisito adicional de autorização por ferramenta, a resolver antes de integrar os dados privados; não declarar isolamento completo por cliente.
- A política restritiva existente `cft005_meempresta_direct_sessions_only` foi criada para bloquear tokens do **antigo OAuth Server** com claim `client_id`; não substitui a análise do novo fluxo OIDC.
- O Auth0 é apenas o candidato inicial. Plano Free e limites devem ser reconfirmados no cadastramento. Um domínio personalizado para a página de login não é necessário no teste e pode requerer verificação de cartão.
- Sem implantação pública, migração, alteração de credenciais, nova contratação ou modificação do Apertaquem.

Fonte de decisão: [ARC-001](https://docs.google.com/document/d/1vctr9mkKTUa5ZHRcb_x4k3iXldXkmQWBSsOr2jT6ZAg/edit) e [CFT-005](https://docs.google.com/document/d/14Tgta3SrAmtJgk8XaQcS-z6SeEnlzIyUGYHkhFQqCPY/edit).
