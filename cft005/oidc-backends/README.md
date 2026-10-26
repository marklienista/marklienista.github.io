# CFT-005 — Integração de dois backends confidenciais

**EMISSÃO REAL AUTH0: BLOCKED. Nenhum backend novo foi hospedado. CFT-005 continua ABERTO.**

O código de integração está preparado nesta branch; os resultados locais abaixo não comprovam emissão pelo Auth0. Esta pasta é independente de `oidc/` e `backend-proof/` e não substitui os aplicativos publicados.

## Estado comprovado em 26/10/2026

- Descoberta pública do tenant existente: HTTP 200; suporta S256, `form_post`, `client_secret_basic` e RS256. É metadado público, não autenticação nem registro dos dois clientes.
- Busca de plugins Auth0: nenhum conector dedicado retornado. Make oferece módulo Auth0, mas a verificação dos dois espaços acessíveis encontrou zero conexões existentes. Nenhuma automação ou conexão foi criada e não houve chamada administrativa ao tenant.
- Ambiente de execução: nenhum dos seis parâmetros conhecidos AUTH0_DOMAIN/CLIENT_ID/CLIENT_SECRET/MANAGEMENT_TOKEN/MANAGEMENT_CLIENT_ID/MANAGEMENT_CLIENT_SECRET disponível. Foram verificados apenas indicadores de presença; não houve busca de segredos em arquivos.
- Chrome: tentativa de abrir aba separada interrompida pelo mecanismo Computer Use por não conseguir determinar a URL atual com confiança. Sem leitura de página ou nova ação após o bloqueio. Não contornar com outro protocolo de controle.
- Render: conexão Primary exige workspace confirmado. Foi retornado somente `My Workspace`; a pergunta de identificação foi enviada e permanece pendente. Não foram consultados serviços, criado recurso ou disparado deploy sem essa identificação.
- Os dois clientes OIDC confidenciais, seus segredos e as contas sintéticas autorizadas ainda não puderam ser verificados. A pergunta sobre acesso via Make ou configuração direta também permanece pendente. Não presumir que a conta já existente é sintética.

## Código preparado

`start.mjs` inicia uma única instância por serviço: `PRODUCT=A` ou `PRODUCT=B`. Cada instância recebe seu próprio segredo, guarda suas sessões e seus dados sintéticos somente em memória e não oferece Data API genérica. Não existe mecanismo que transforme um bearer recebido do navegador em autorização de produto.

`provider.mjs` usa openid-client 6.8.8 para descoberta e Authorization Code com autenticação confidencial Basic. Cada entrada gera PKCE S256, state e nonce novos; o callback exige `form_post`. A assinatura RS256 de ID Token e access token é validada por jose 6.2.13 com JWKS do emissor exato. A API confere audience, expiração, subject previamente autorizado, escopo e `azp` igual ao cliente daquela instância. JWT de outro cliente, API, emissor ou perfil é recusado.

O perfil é o **Auth0 padrão**, access token `typ=JWT` com `azp`. O perfil RFC 9068 com `client_id` é recusado para evitar interpretação ambígua; ele precisaria de uma política separada. Não usar ID Token como access token da API.

`backend.mjs` mantém cookies opacos `__Host-`, Secure, HttpOnly, sem Domain. A transação OIDC usa SameSite=None para receber o POST do provedor, tem cinco minutos e é consumida antes da troca; a sessão usa SameSite=Lax e no máximo quinze minutos ou a validade menor do access token. Esses prazos são locais à prova e não alteram TTL global do provedor. Cookies, PKCE, state, nonce, CSRF e JWTs ficam somente em memória; não são gravados em evidências.

Rotas de escrita exigem sessão válida, proprietário, produto, escopo, token CSRF e Origin próprio. Origin é proteção adicional de requisição, não identidade do aplicativo. Os dados pertencem apenas ao produto fixado no servidor. Logout local remove a sessão mesmo durante falha de verificação do provedor; não encerra Auth0 nem promete revogação global.

O callback POST mantém o código OAuth fora da URL. Respostas não refletem parâmetros do provedor, e o processo não registra URLs, cabeçalhos, corpos ou erros brutos de autenticação. Ainda será necessário verificar a política de logs da hospedagem antes de testes reais. Nenhum segredo foi obtido, armazenado em arquivo ou publicado.

## Testes executados: PASS local, emissão real bloqueada

`node --test integration.test.mjs`: **46/46 cenários locais PASS** (47 testes contando o agrupador). Duas instâncias HTTP de backend e um emissor de protocolo local foram usados no mesmo processo, com RS256, JWKS, endpoints HTTP e troca de código reais do protocolo. O emissor e todas as identidades são fixtures; não são o Auth0.

Foram verificados login e escrita/leitura próprias U1/U2 em A/B; recusa de outro usuário/produto; cliente, audience, issuer, assinatura, nonce e escopo incorretos; PKCE inválido; state incorreto antes da troca; replay de callback; código A apresentado ao cliente B; cookies de sessão/transação copiados entre instâncias; bearer do navegador; CSRF; alteração de proprietário no corpo; callback com código em query; rota genérica de dados; preservação dos quatro registros; logout A sem encerrar B e logout durante indisponibilidade do provedor. Configuração vazia ou clientes iguais falha de forma fechada.

Durante a integração local, o emissor de teste inicialmente recusou Basic porque comparava codificação URI simples, em vez de decodificar o formato OAuth form-urlencoded. A fixture foi corrigida; o cliente OIDC usa a implementação da biblioteca. Não houve exposição de credenciais no diagnóstico: somente indicadores booleanos e códigos de erro fixos foram inspecionados.

`integration-evidence.json` contém somente rótulos, PASS/FAIL, metadados e hashes SHA-256 dos fontes em UTF-8/LF. Declara `realAuth0Issuance=BLOCKED`, `deployedBackends=0`, `realAccountsUsed=0` e encerramento dos servidores. Não contém código OAuth, JWT, cookie ou CSRF. A auditoria das três dependências retornou zero vulnerabilidades conhecidas na consulta; isso não garante ausência de falhas.

## Configuração exata necessária para a emissão real

1. Identificar o workspace Render indicado na pergunta pendente. Criar somente os dois serviços novos planejados em `deployment-plan.json`, plano free, branch de testes e AutoDeploy desligado. Se o plano gratuito não estiver disponível, parar sem contratar. Nenhum serviço existente será reconfigurado.
2. No tenant já existente, criar somente dois aplicativos de teste `CFT-005 BFF A` e `CFT-005 BFF B`, tipo Regular Web Application, IDs distintos, Authorization Code e `client_secret_basic`. Usar a conexão central apropriada sem alterar clientes publicados. Não habilitar grants de senha, client credentials ou OAuth Server beta para substituir login humano.
3. Registrar somente a callback exata `<origem realmente retornada pelo Render>/auth/callback` de cada serviço. Não usar wildcard, URLs previstas pelo nome ou callbacks cruzadas. Este relatório não afirma URLs de recursos ainda inexistentes.
4. Criar uma API sintética de teste com identifier `https://cft005-synthetic-api.invalid`, RS256 e perfil padrão Auth0, com escopos `records:read` e `records:write`. Não alterar o TTL global. Não reutilizar API de dados reais.
5. Definir as variáveis da tabela abaixo no ambiente protegido. Cada segredo vai somente ao seu backend. Selecionar subjects somente de contas sintéticas autorizadas; aceitar no máximo U1/U2. Se só uma conta estiver disponível, provar emissão dessa conta e manter as provas entre duas pessoas BLOCKED.
6. Verificar `/health` e então entrar manualmente nas duas origens com conta sintética autorizada. Health apenas confirma bootstrap/configuração pública, não registro do cliente ou emissão. Registrar somente resultado, produto, rótulo U1/U2 e status de acesso; jamais copiar tokens, códigos ou cookies para evidências.
7. Comprovar emissão do tenant e repetir acessos negativos com o token do cliente A contra a política do backend B, e vice-versa, dentro de um runner em memória sem saída de credenciais. A emissão local da fixture não satisfaz esse gate. Repetir sessão, persistência, logout e matriz S01–S14 no navegador disponível.

| Variável | Origem/uso |
|---|---|
| PRODUCT | A ou B, fixo por serviço |
| PUBLIC_ORIGIN | Origem HTTPS efetivamente retornada pelo Render |
| AUTH0_ISSUER | `https://dev-2lz845k6nrma2nhm.us.auth0.com/` |
| AUTH0_AUDIENCE | `https://cft005-synthetic-api.invalid` |
| AUTH0_CLIENT_ID_A / AUTH0_CLIENT_ID_B | IDs públicos distintos, confirmados no tenant |
| AUTH0_CLIENT_SECRET | Segredo exclusivo daquele backend, inserido diretamente no ambiente protegido |
| SYNTHETIC_SUBJECTS_JSON | Mapeamento privado de subject autorizado para U1/U2; sem e-mail como chave de autorização |

## Limites e próximo passo

Não há implantação, emissão Auth0, login com contas reais de teste, teste de navegador ou revisão de logs da hospedagem nesta rodada. Os testes de assinatura e protocolo locais não removem o FAIL de S12 na arquitetura publicada. Sessões/dados em memória são adequados apenas à prova de instância única, sem disponibilidade, durabilidade ou logout central. Não são uma solução de produção ou substituto de políticas mínimas de banco; as rotas dos aplicativos existentes continuam fora desta mudança.

**Único próximo passo:** disponibilizar o acesso de configuração pendente — identificar o workspace e escolher conexão Auth0 via Make ou configuração direta — para registrar os dois clientes, instalar seus segredos no ambiente protegido e executar emissão real. Não enviar segredos por chat.

Referências: [openid-client](https://github.com/panva/openid-client), [Auth0: clientes confidenciais](https://auth0.com/docs/get-started/applications/confidential-and-public-applications), [Render: variáveis e segredos](https://render.com/docs/configure-environment-variables).
