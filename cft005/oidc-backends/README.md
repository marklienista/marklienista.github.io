# CFT-005 — Integração de dois backends confidenciais

**27/10/2026: A/B LIVE e health HTTP 200. Segredos inseridos pelo usuário nos campos protegidos. Login humano e bloqueio com JWT real: BLOCKED, aguardando execução no navegador. Runner sanitizado preparado e validado localmente. CFT-005 continua ABERTO.**

O código de integração está preparado nesta branch; os resultados locais abaixo não comprovam emissão pelo Auth0. Esta pasta é independente de `oidc/` e `backend-proof/` e não substitui os aplicativos publicados.

## Continuidade: bootstrap e prova executável — 27/10/2026

O usuário confirmou o salvamento de A e B, sem transmitir os segredos ao agente. O deploy A `dep-dbghg02fngtc73dkb4j0` ficou LIVE em 21:31:20Z; B `dep-dbghimnb9u1s73c85img` em 21:36:46Z. Ambos usaram o commit `466ad11d4112f68d2e05b938bd1d4ea1e4868703`; `/health` retornou HTTP 200, ready=true e produto correto. Isso confirma configuração e discovery, não validade do segredo no token endpoint.

O botão **Executar prova de isolamento** requer uma sessão obtida por login, Origin próprio e CSRF. O backend usa a sessão em memória para testar por HTTP leitura/escrita próprias (200), de outro usuário (404) e de outro produto (403). Somente o registro sintético do próprio usuário recebe um valor sintético fixo. Confere também a preservação do outro registro.

Em seguida, o backend envia o access token, somente por HTTPS, ao endpoint fixo `/proof/token-policy` do outro serviço de teste. Não há destino selecionável por entrada HTTP ou variável de ambiente. O receptor usa a mesma função `authorize` das rotas de dados: assinatura RS256, emissor, audience, expiração, subject autorizado, perfil e escopo são conferidos antes de rejeitar `azp` do outro cliente. São duas recusas HTTP 401, para records:read e records:write. A razão sanitizada `other_client_after_signature_verification` distingue esse bloqueio de JWT inválido. A sonda não lê/escreve registros, não cria sessão e não oferece troca de token; as rotas de dados continuam recusando bearer. O teste remoto comprova a política criptográfica do receptor, enquanto as verificações HTTP locais exercitam as rotas de dados com sessão.

`GET /proof/results` publica no máximo oito recibos em memória, contendo somente horários, produto, rótulo U1/U2 e códigos/veredictos. Não contém registro, subject, e-mail, token, cookie, CSRF ou segredo. Apenas uma sessão válida pode gerar um recibo. O processo não registra requisições ou erros brutos. Conforme [documentação Render](https://render.com/docs/logging), o explorador de logs HTTP é recurso Pro; não foi ativado nem contratado. O callback continua `form_post`, mantendo código OAuth fora da URL. Não foi feita inspeção de logs brutos de autenticação; esta verificação não garante políticas internas de retenção dos provedores.

Regressão do runner: **49/49 cenários locais PASS** (50 testes incluindo o agrupador). São fixtures OIDC, sem emissão real. Os três casos novos verificam o runner em A/B, recusas após assinatura, limites de autenticação e ausência de credenciais nos recibos. Os resultados desta seção substituem apenas o estado atual; as seções datadas abaixo preservam o histórico.

## Estado comprovado em 26/10/2026

- Descoberta pública do tenant existente: HTTP 200; suporta S256, `form_post`, `client_secret_basic` e RS256. É metadado público, não autenticação nem registro dos dois clientes.
- Busca de plugins Auth0: nenhum conector dedicado retornado. Make oferece módulo Auth0, mas a verificação inicial dos dois espaços acessíveis encontrou zero conexões existentes. Após a escolha do usuário, foi criada uma solicitação de conexão nova no espaço privado `Marcelo's space` (team 2908515). Aguarda autorização do usuário; nenhuma automação ou chamada administrativa ao tenant foi executada.
- Ambiente de execução: nenhum dos seis parâmetros conhecidos AUTH0_DOMAIN/CLIENT_ID/CLIENT_SECRET/MANAGEMENT_TOKEN/MANAGEMENT_CLIENT_ID/MANAGEMENT_CLIENT_SECRET disponível. Foram verificados apenas indicadores de presença; não houve busca de segredos em arquivos.
- Chrome: tentativa de abrir aba separada interrompida pelo mecanismo Computer Use por não conseguir determinar a URL atual com confiança. Sem leitura de página ou nova ação após o bloqueio. Não contornar com outro protocolo de controle.
- Render: usuário confirmou `My Workspace`, conta Primary. Foram criados somente os dois serviços novos abaixo, plano free, região Virginia, branch de testes e AutoDeploy desligado. Aplicativos existentes preservados.
- Os dois clientes OIDC confidenciais, seus segredos e as contas sintéticas autorizadas ainda não puderam ser verificados. Não presumir que a conta já existente é sintética. A escolha do caminho Make foi resolvida; falta autorizar a conexão.

## Provisionamento confirmado — 26/10/2026, 19:41 BRT

| Produto | Serviço novo / origem efetiva | Último deploy |
|---|---|---|
| A | `srv-dbftdpvf3r2c73bflvjg` / https://cft005-bff-a-teste.onrender.com | `dep-dbfte6ff3r2c73bfnd8g`, `update_failed` |
| B | `srv-dbftdt3l550s739sao1g` / https://cft005-bff-b-teste.onrender.com | `dep-dbfte7fb9u1s73e9bp50`, `update_failed` |

As origens foram retornadas pelo Render e configuradas como `PUBLIC_ORIGIN`. As callbacks exatas a registrar são `https://cft005-bff-a-teste.onrender.com/auth/callback` e `https://cft005-bff-b-teste.onrender.com/auth/callback`. Isso não comprova registro dos clientes no Auth0 nem disponibilidade dos serviços.

O build do commit `65c6816e98b0b4d1bfb26e368abf5bf1e411257c` passou nos dois serviços com Node 24.22.1 e dependências fixadas. A configuração pública foi instalada, mas IDs, segredos e subjects sintéticos não. O processo recusou iniciar, conforme a validação de configuração prevista, com código de saída 1 e mensagem fixa sem credenciais. Logs filtrados confirmam a recusa em A às 22:41:46Z e em B às 22:41:55Z. Não inserir valores fictícios para liberar a inicialização. Nenhum backend chegou a LIVE; zero emissões Auth0 e zero logins nesta rodada.

A atualização de variáveis dispara deploy mesmo com AutoDeploy desligado. Não repetir deploys enquanto a configuração necessária estiver ausente. O link privado de autorização Make não integra este repositório nem as evidências públicas.

## Código preparado

### Continuidade de 27/10/2026: acesso administrativo validado

O conector Auth0 padrão do Make foi recusado com HTTP 403 porque sua validação tenta `GET /api/v2/users`, exigindo `read:users` ou `read:user_idp_tokens`. Essas permissões não foram solicitadas para contornar a falha. Foi preparado um cenário separado no espaço privado escolhido, com HTTP Basic em campo protegido, origem de destino restrita ao tenant, `confidential=true`, execuções incompletas desativadas e sem redirects. Os segredos permanecem fora de corpo literal, arquivos e saídas da prova.

Após o usuário salvar o cenário inteiro, a credencial protegida foi reconhecida. A solicitação administrativa `POST /oauth/token` passou com HTTP 200. A consulta `GET /api/v2/clients`, com lista explícita de campos sem segredo, também passou e confirmou ausência de `CFT-005 BFF A` e `CFT-005 BFF B`. `GET /api/v2/resource-servers`, filtrado pelo identificador exato da API sintética, passou e retornou zero resultados. As saídas continham somente status e metadados selecionados; nenhum access token, client secret ou registro de usuário foi retornado à conversa.

A revisão automática inicialmente rejeitou o preparo da criação por faltar aprovação explícita de configuração e escopos. O usuário então aprovou exatamente os três objetos e `records:read`/`records:write`. Foram executadas somente essas três criações, todas HTTP 201, e conferidas por GET HTTP 200. [auth0-provisioning-request.json](auth0-provisioning-request.json) preserva os corpos aprovados e registra os IDs observados; não é um script de execução. [admin-validation-evidence.json](admin-validation-evidence.json) contém resultados sanitizados. A emissão administrativa não comprova login humano A/B ou isolamento por produto.

| Objeto criado | Identificador público | Configuração verificada |
|---|---|---|
| CFT-005 Synthetic API | `6ae0f4bbb64763b9b470a321` | Audience sintética exata; RS256; access_token; somente records:read e records:write; offline access desativado |
| CFT-005 BFF A | `iWciRxJTG4XPVlp2ajnwSbaasHlAFyfP` | Regular Web, OIDC, first-party, Authorization Code, Client Secret Basic, ID Token RS256, callback exclusiva A |
| CFT-005 BFF B | `U2tmH2LoKGdU3soq5jfY6hht6ucNfibm` | Mesmas propriedades, ID distinto e callback exclusiva B |

Ambos os clientes novos já têm as conexões de login Google e banco Auth0 habilitadas. Nenhuma conexão existente foi reconfigurada pelo agente. Os dois IDs públicos foram mesclados nos ambientes dos serviços de teste, preservando as outras variáveis. Essa escrita disparou deploys A `dep-dbgfclg473hc73dsnek0` e B `dep-dbgfcmom7kps73d8kung`, ambos `update_failed`; logs filtrados retornaram somente a mensagem fixa de indisponibilidade prevista para configuração incompleta. Não repetir deploys até concluir os campos protegidos.

A revisão automática bloqueou uma proposta de transferência que declararia Client Secret como saída do Make, por risco de exposição nos resultados. Essa alteração não foi aplicada, nenhum segredo foi retornado e a rejeição não foi contornada. Os clientes foram criados com saídas limitadas a status e configuração pública. O Make foi devolvido a uma consulta GET da API sintética, sem chamada de criação pendente. A instalação dos segredos deve ocorrer diretamente nos campos protegidos do Render; não enviar valores por chat. O controle Windows/Chrome permanece interrompido por não conseguir determinar a URL atual com confiança.

O usuário indicou duas identidades autorizadas para a prova e forneceu seus User IDs do Auth0. O mapeamento de dois subjects para U1/U2 foi instalado somente em `SYNTHETIC_SUBJECTS_JSON` nos ambientes protegidos dos dois serviços; endereços e subjects não integram o repositório. A integração não consultou listas de usuários. Essa escrita disparou os deploys A `dep-dbgfifou01pc73fagvf0` e B `dep-dbgfihek1f9s73e60je0`, ambos `update_failed`, commit `0b85633e439af49eec50a65d569522c5e2ce0cd7`. Somente a instalação dos Client Secrets permanece pendente. A busca no Make não encontrou conector Render utilizável nem credencial HTTP API key existente para uma transferência direta protegida. A nova autorização do usuário foi preservada; ela não remove os bloqueios técnicos de navegador e saída de segredos. O Apertaquem e seus dados permanecem fora do escopo de alteração.

`start.mjs` inicia uma única instância por serviço: `PRODUCT=A` ou `PRODUCT=B`. Cada instância recebe seu próprio segredo, guarda suas sessões e seus dados sintéticos somente em memória e não oferece Data API genérica. Não existe mecanismo que transforme um bearer recebido do navegador em autorização de produto.

`provider.mjs` usa openid-client 6.8.8 para descoberta e Authorization Code com autenticação confidencial Basic. Cada entrada gera PKCE S256, state e nonce novos; o callback exige `form_post`. A assinatura RS256 de ID Token e access token é validada por jose 6.2.13 com JWKS do emissor exato. A API confere audience, expiração, subject previamente autorizado, escopo e `azp` igual ao cliente daquela instância. JWT de outro cliente, API, emissor ou perfil é recusado.

O perfil é o **Auth0 padrão**, access token `typ=JWT` com `azp`. O perfil RFC 9068 com `client_id` é recusado para evitar interpretação ambígua; ele precisaria de uma política separada. Não usar ID Token como access token da API.

`backend.mjs` mantém cookies opacos `__Host-`, Secure, HttpOnly, sem Domain. A transação OIDC usa SameSite=None para receber o POST do provedor, tem cinco minutos e é consumida antes da troca; a sessão usa SameSite=Lax e no máximo quinze minutos ou a validade menor do access token. Esses prazos são locais à prova e não alteram TTL global do provedor. Cookies, PKCE, state, nonce, CSRF e JWTs ficam somente em memória; não são gravados em evidências.

Rotas de escrita exigem sessão válida, proprietário, produto, escopo, token CSRF e Origin próprio. Origin é proteção adicional de requisição, não identidade do aplicativo. Os dados pertencem apenas ao produto fixado no servidor. Logout local remove a sessão mesmo durante falha de verificação do provedor; não encerra Auth0 nem promete revogação global.

O callback POST mantém o código OAuth fora da URL. Respostas não refletem parâmetros do provedor, e o processo não registra URLs, cabeçalhos, corpos ou erros brutos de autenticação. Ainda será necessário verificar a política de logs da hospedagem antes de testes reais. Nenhum segredo foi obtido, armazenado em arquivo ou publicado.

## Testes executados: PASS local, emissão real bloqueada

`node --test integration.test.mjs`: **49/49 cenários locais PASS** (50 testes contando o agrupador). Duas instâncias HTTP de backend e um emissor de protocolo local foram usados no mesmo processo, com RS256, JWKS, endpoints HTTP e troca de código reais do protocolo. O emissor e todas as identidades são fixtures; não são o Auth0.

Foram verificados login e escrita/leitura próprias U1/U2 em A/B; recusa de outro usuário/produto; cliente, audience, issuer, assinatura, nonce e escopo incorretos; PKCE inválido; state incorreto antes da troca; replay de callback; código A apresentado ao cliente B; cookies de sessão/transação copiados entre instâncias; bearer do navegador; CSRF; alteração de proprietário no corpo; callback com código em query; rota genérica de dados; preservação dos quatro registros; logout A sem encerrar B e logout durante indisponibilidade do provedor. Configuração vazia ou clientes iguais falha de forma fechada.

Durante a integração local, o emissor de teste inicialmente recusou Basic porque comparava codificação URI simples, em vez de decodificar o formato OAuth form-urlencoded. A fixture foi corrigida; o cliente OIDC usa a implementação da biblioteca. Não houve exposição de credenciais no diagnóstico: somente indicadores booleanos e códigos de erro fixos foram inspecionados.

`integration-evidence.json` contém somente rótulos, PASS/FAIL, metadados e hashes SHA-256 dos fontes em UTF-8/LF. Declara `realAuth0Issuance=BLOCKED`, `deployedBackends=0`, `realAccountsUsed=0` e encerramento dos servidores. Não contém código OAuth, JWT, cookie ou CSRF. A auditoria das três dependências retornou zero vulnerabilidades conhecidas na consulta; isso não garante ausência de falhas.

## Configuração exata necessária para a emissão real

1. **Provisionamento realizado:** usar somente os dois serviços novos identificados acima, em `My Workspace`, plano free e AutoDeploy desligado. Conexão administrativa protegida validada em `Marcelo's space`. Nenhum serviço existente será reconfigurado.
2. **Clientes criados e verificados:** `CFT-005 BFF A` e `CFT-005 BFF B`, com os IDs públicos da tabela. Não recriar nem habilitar grants de senha, client credentials ou OAuth Server beta para substituir login humano.
3. **Callbacks verificadas:** somente a origem de cada serviço mais `/auth/callback`, conforme tabela. Sem wildcard ou callback cruzada.
4. **API criada e verificada:** identifier `https://cft005-synthetic-api.invalid`, RS256, access_token e somente `records:read` e `records:write`. TTL global preservado; API de dados reais não reutilizada.
5. Definir as variáveis da tabela abaixo no ambiente protegido. Cada segredo vai somente ao seu backend. Selecionar subjects somente de contas sintéticas autorizadas; aceitar no máximo U1/U2. Se só uma conta estiver disponível, provar emissão dessa conta e manter as provas entre duas pessoas BLOCKED.
6. Verificar `/health` e então entrar manualmente nas duas origens com conta sintética autorizada. Health apenas confirma bootstrap/configuração pública, não registro do cliente ou emissão. Registrar somente resultado, produto, rótulo U1/U2 e status de acesso; jamais copiar tokens, códigos ou cookies para evidências.
7. Entrar em A e B com a mesma identidade U1 autorizada e clicar **Executar prova de isolamento** em cada serviço. O agente consulta somente `/proof/results` para consolidar a prova. Repetir com U2 em sessão de navegador separada. A emissão local da fixture não satisfaz esse gate. Repetir sessão, persistência, logout e matriz S01–S14 no navegador disponível.

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

Há dois serviços LIVE, health PASS e emissão administrativa validada. Ainda não há emissão humana A/B ou prova remota com JWT de usuário. Os testes locais não removem o FAIL de S12 na arquitetura publicada. Sessões/dados/recibos em memória são adequados apenas à prova de instância única, sem disponibilidade, durabilidade ou logout central. As rotas dos aplicativos existentes continuam fora desta mudança. Os recibos públicos são evidência sanitizada de teste, não um sistema de auditoria durável ou com atestação externa.

**Único próximo passo:** executar login nas duas origens com U1 e clicar **Executar prova de isolamento** em ambas; conferir os recibos e repetir a rodada com U2. Não enviar segredos por chat. A participação humana no login é necessária enquanto o controle autenticado do Chrome permanecer interrompido.

Referências: [openid-client](https://github.com/panva/openid-client), [Auth0: clientes confidenciais](https://auth0.com/docs/get-started/applications/confidential-and-public-applications), [Render: variáveis e segredos](https://render.com/docs/configure-environment-variables).
