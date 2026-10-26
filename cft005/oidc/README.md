# CFT-005 — OIDC externo com domínios independentes

Estado em 26/10/2026: **SSO entre duas origens confirmado por relato do usuário e corroborado parcialmente no Supabase**; testes locais ampliados. O **isolamento dos dados por aplicativo está BLOQUEADO** no modelo de tokens atual. Os testes reais de refresh, expiração e logout ainda não foram concluídos. OAuth Server beta segue desligado, sem migração ou lançamento.

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
- `identity.test.mjs`: contratos locais, com dados sintéticos. Executar `node --test cft005/oidc/identity.test.mjs` a partir da raiz do repositório. Rodada atual: 11/11 PASS; suíte de sessões: 11/11 PASS. Isso não comprova sessões reais.
- `index.html`, `callback.html`, `app.mjs`: interfaces de demonstração. Não coletam senha.
- `config.example.json`: **modelo de configuração pública**. A branch já contém `config.json` dos clientes fictícios, com chave publicável (não secreta) e duas callbacks de teste. A afirmação anterior de ausência desse arquivo estava desatualizada. Não incluir segredos de backend nesse arquivo.

## Procedimento de conexão — referência histórica (A→B já relatado)

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

## Verificação de segurança/sessões — 26/10/2026

Resultados executados:
- Banco conta_base, tabelas públicas: 1 tabela, RLS ligada, sem permissões de tabela para anon. Funções públicas MeEmpresta são SECURITY INVOKER e não permitem EXECUTE por anon; nenhuma função pública SECURITY DEFINER.
- RLS SELECT efetiva em transação SQL com rollback, sem leitura do conteúdo nem alteração de dados: proprietário vê 1 registro; UUID sintético diferente vê zero; JWT simulado do antigo OAuth Server com client_id vê zero. Todos PASS.
- BLOQUEIO DE SEGREGAÇÃO POR PRODUTO: teste SQL com mesmo usuário e token sem client_id, variando o Origin simulado entre A e B, consegue ler o mesmo registro do MeEmpresta em ambos os casos. Origin, Referer ou CORS não provam a identidade de um aplicativo. Antes de migrar dados de outros produtos, exigir uma fronteira real de autorização por cliente.
- Autenticação A para B foi confirmada anteriormente pelo usuário; o banco confirmou duas identidades (e-mail e provedor customizado) do mesmo UUID. Nenhum acesso real de segundo usuário foi testado.
- Node: 19 testes locais PASS, zero falhas. Comando: node --test cft005/oidc/identity.test.mjs cft005/oidc/session-contract.test.mjs . A suíte adicional usa apenas mocks e NÃO prova renovação, timeout ou revogação reais.
- Código de teste ampliado: botão Renovar sessão (teste) disponível em index.html, com função refreshCurrentSession, verificação pelo servidor e mensagem E_REFRESH quando falhar. Nenhum token é exibido.
- Supabase tem 5 sessões registradas (um usuário), duas atualizadas nas últimas 24h no momento da inspeção; oauth_client_id não nulo = zero. Isso NÃO é teste de expiração.
- Playwright local bloqueado pelo administrador do ambiente antes de navegar; não declarar teste visual PASS.
- Advisor de segurança mantém WARN preexistente: leaked password protection desabilitada. Não fazer upgrade por esta rodada.

Próxima matriz para Codex no Windows — somente ambiente de teste:
S01 Entrada em A e depois B sem repetir senha, comparar UUID.
S02 Dois usuários sintéticos em perfis distintos: impedir acesso cruzado.
S03 Clicar Renovar sessão (teste) em A e confirmar mesma pessoa.
S04 Confirmar que B continua autenticado após renovar A.
S05 Sair apenas de A e confirmar B ainda ativa.
S06 Sair também de B; sessão central Auth0 pode continuar válida.
S07 Reentrar em A e observar se Auth0 dispensa senha (isso NÃO significa logout central).
S08 Cancelar login, retorno inválido, PKCE e não exposição de código em URL.
S09 Expiração e refresh inválido em ambiente sintético, sem mudar TTL global.
S10 Persistência de sessão após reload, sem localStorage compartilhado entre domínios.
S11 Testes de leitura e escrita com usuários distintos em dados sintéticos.
S12 Isolamento POR PRODUTO, mesmo UUID: BLOQUEADO até solução de autorização baseada em identificador de cliente confiável.
S13 Logout central/revogação Auth0: ainda não implementado; registrar limitação sem fingir aprovação.
S14 Revisão de dependência externa, CSP, XSS, URLs, logs e segredos.

Escopo Codex: sincronizar a branch cft005-oidc-dominios, testar A https://cft005-login-a-teste.onrender.com/ e B https://cft005-login-b-teste.onrender.com/, corrigir código apenas nesta branch e repetir os testes afetados. Não registrar tokens, refresh tokens, senhas, segredos, códigos OAuth ou URLs contendo credenciais; não mudar a configuração do Auth0 ou Supabase, não apagar dados, não contratar serviços, não tocar o Apertaquem ou publicar em main. Se não houver duas contas de teste sob controle, marcar S02/S11 como BLOCKED, sem usar contas pessoais como dados sintéticos. Atualizar somente o CFT-005 existente com evidências e limites; um escritor por arquivo.

Decisão técnica ainda necessária: a autenticação prova QUEM é a pessoa, não QUAL aplicativo. Para isolar produtos, exigir claims por aplicativo assinadas por um emissor confiável e verificadas pelo backend, ou separar os recursos em fronteiras próprias. Não resolver somente na interface JavaScript.

## Rodada Windows de continuidade

Consultar [matriz consolidada, correções e limites](./VERIFICACAO-2026-10-26.md) e [avaliação de autorização por produto](./AUTORIZACAO-POR-PRODUTO.md). As correções desta rodada estão somente na branch; não foram implantadas nos clientes Render. O navegador externo foi bloqueado pelo mecanismo de segurança antes da leitura da página. CFT-005 permanece aberto, com isolamento por produto FAIL.
