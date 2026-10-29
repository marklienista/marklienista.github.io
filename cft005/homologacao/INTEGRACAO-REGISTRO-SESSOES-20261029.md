# CFT-005 — coordenador HTTPS e BFFs integrados na branch de testes

29/10/2026. Implementação integrada e validada **localmente**, ainda não implantada. **102 testes de regressão PASS** (94 anteriores e oito novos de transporte/configuração). **64 controles na integração nativa PASS** (38 controles SQL/núcleo repetidos e 26 adicionais HTTP/HTTPS/BFF). Não somar os 38 históricos nem as repetições como novos casos distintos. A sintaxe do JavaScript servido à interface também foi compilada com sucesso; não é prova em navegador real.

Evidência: [session-ledger-integration-result-20261029.json](./session-ledger-integration-result-20261029.json), com fontes/hashes LF, resultados e SQLSTATEs sanitizados. PostgreSQL 17.11 novo em loopback, TLS e logins reais separados. Emissor OIDC **fictício local**, com assinatura RS256, PKCE/state/nonce e troca confidencial exercitados pelo provider existente; quatro cookie jars sintéticos independentes em memória. Não houve Auth0 real, browser real, leitura de conta pessoal, cookie/token real, banco Render ou aplicativo publicado nesta execução.

## Implementação

- `session-ledger/transport.mjs`: cliente HTTPS para URL fixa `https://cft005-session-ledger-teste.onrender.com/v1/command`, sem URL recebida do navegador/ambiente, redirects, retries ou cache positivo. TLS validado, mínimo 1.2, timeout oito segundos, pedido/resposta limitados. Ed25519 distinto por A/B; assinatura cobre destino/método/corpo/nonce/tempo. Resposta exige versão/emissor/nonce correspondentes e esquema/ação/época exatos. Recusa autenticada conserva `E_LEDGER_DENIED`; resposta desconhecida, redirect ou falha nega com `E_LEDGER_UNAVAILABLE`.
- Coordenador: verificação de assinatura/transporte antes de abrir a transação do comando; nonce persistido na mesma transação; reconhecimento depois de COMMIT. `GET /health` tem somente prontidão/versão, sem dados de sessão. Host e caminho exatos, sem cookie/bearer como alternativa. Em Render o TLS termina na borda e o processo HTTP recebe a requisição assinada. No teste local o mesmo handler rodou em servidor HTTPS com certificado temporário validado para o hostname lógico, ligado somente a 127.0.0.1. Não se comprovou certificado/implantação públicos do endereço proposto.
- `session-ledger/settings.mjs` e `session-ledger/start.mjs`: parsing estrito de chaves DER base64, Ed25519, públicas distintas, credencial SQL exclusiva do coordenador e endpoint/banco/TLS fixos. Nenhum administrador de banco em runtime. Sem DDL no startup.
- Startup A/B agora exige `HML_SESSION_LEDGER=required-v1`, origem fixa do registro e chave privada exclusiva; não há fallback de produção para sessões só em memória. Origem pública A/B deve ser a já aprovada. Sem configuração/schema correto, falha fechado; por isso não implantar antecipadamente sobre os serviços atuais.
- Entrada captura épocas no servidor **antes** de redirecionar ao OIDC. Callback válido/único só registra hash novo se a época ainda for atual. A sessão em memória conserva o binding; nenhum token é persistido. Callback antigo recebe diagnóstico sanitizado de revogação; indisponibilidade tem mensagem distinta. Reinício BFF perde a sessão local e exige entrada nova.
- Cada requisição protegida revalida principal e registro online; cada leitura/escrita SQL repete o fence e mantém locks de época/sessão até o commit na mesma conexão. SQL de dados continua limitado ao schema do produto e ao proprietário verificado. Não basta validar época e liberar a conexão antes da escrita.
- `POST /sessions/revoke`: sem corpo/identidade escolhida pelo browser, exige sessão atual, Origin e CSRF; deriva proprietário do servidor, avança sua época e só reconhece depois do commit. Resposta não expõe época/hash/chave. Botão “Encerrar sessões de homologação”; não faz logout do Auth0/Google.
- Logout local continua possível quando o coordenador cai: apaga memória/cookie, mas informa `durableLocalLogout=false` quando não confirmou o registro. `GET /logout/context` fornece **somente CSRF da sessão em memória** para limpeza, sem identidade/token/metadados ou autorização de dados; sem sessão não funciona. Não substitui `/session`, que continua negando durante a pane.
- Sonda técnica legada foi bloqueada na modalidade integrada com `503 technical_requires_ledger_review`: ela abre/desfaz transações próprias e não pode liberar os locks externos. Não houve alteração silenciosa dos seus recibos v2 ou aprovação dos novos objetos. Antes de reexecutá-la será necessário um auditor compatível com o registro e seu inventário. Os testes locais legados continuam isolados no modo fixture.

`001-ledger.DRAFT.sql` inclui agora CONNECT explícito para o papel coordenador, além dos grants de metadados já revisados. O novo grant foi incluído na rodada nativa final. O papel nasce NOLOGIN; ativação de login/segredo ocorre somente no ambiente de teste durante a instalação revisada. Os dois scripts DRAFT continuam sem chamada no build/startup. O fixture local e as pausas de concorrência não são selecionáveis por URL, corpo, header ou ambiente do serviço publicado.

## Casos adicionais observados

| Controle | Resultado local |
| --- | --- |
| HTTPS e assinatura | Comando sem assinatura 401; URL com query 404; certificado com hostname errado recusado pelo cliente; nunca desativou validação TLS. |
| A/U1, A/U2, B/U1, B/U2 | Código OIDC fictício validado, snapshot/registro durável, sessão HTTP com apenas produto/usuário/CSRF, leitura e escrita próprias no PostgreSQL. |
| Cruzamentos | Outro usuário: GET/PUT 404; outro produto: GET/PUT 403 nos quatro contextos, com principal e CSRF válidos. |
| Forgery/CSRF | Revogação sem CSRF válido 403; corpo escolhendo U2 400; nenhuma época alheia avançou. |
| Logout local | A/U1 saiu com confirmação durável; B/U1 e ambas U2 permaneceram válidas. |
| Gravação vs. revogação | PUT HTTP A/U1 ficou dentro do fence; POST de revogação em B/U1 aguardou lock real, correlacionado com pg_blocking_pids em memória. Sem reconhecimento antes da liberação/commit; sessões U1 antigas A/B passaram a 401; U2 continuou 200. |
| Callback pendente | Entrada iniciada antes da revogação não criou sessão; diagnóstico `session_ledger_denied`. |
| Replay | Repetição exata do comando de revogação ainda dentro da validade encontrou nonce já usado e foi recusada; sessões novas A/B U1 e U2 continuaram 200. |
| Pane HTTPS real | Servidor coordenador foi realmente fechado: `/session`, escrita e revogação A/B retornaram 503, sem sucesso em cache. Contexto de limpeza local funcionou; logout local confirmou só limpeza, não durabilidade. Ao restaurar, B/U1 e U2 continuaram; A/U1 precisou de entrada nova. |
| Reinício dos BFFs | Ambos os servidores locais foram fechados/recriados. Cookies fictícios antigos receberam 401; novas entradas funcionaram e dados persistiram. |
| Preservação | Valores dos quatro registros permaneceram `synthetic-proof`. Revisões finais **locais** A/U1=7, B/U1=6, A/U2=5, B/U2=5, explicadas pelas cinco escritas positivas da integração após a baseline SQL. Não são revisões do banco hospedado. |

O reinício PostgreSQL, a recusa de epoch/nonce após reinício e a retirada segura também foram repetidos na mesma rodada de 64. A pane deste bloco é do HTTPS local real, diferente da injeção de adaptador da rodada anterior. Os dois ensaios são mantidos com escopo explícito; nenhum é observação do serviço Render.

## Estado da homologação e ativação preparada

| Referência | PASS | FAIL | BLOCKED | Limite |
| --- | --- | --- | --- | --- |
| S01–S14 original | 9 | 2 | 3 | Publicados sem homologação por esta alternativa. |
| Candidato BFF/PostgreSQL comprovado anteriormente | 12 | 0 | 12 | Recibos reais da versão anterior, preservados. |
| Nova revisão com registro integrado | 0 | 0 | 24 | Modelo vazio antes da rodada hospedada; testes locais não são evidência Auth0/browser. |

O avaliador `ledger-candidate-evaluation-20261029.json` não reaproveita recibos de fonte diferente para aprovar a nova revisão. Isso não apaga os 12 PASS anteriores. H10 continua dependente de JWT Supabase genuíno em fronteira exclusivamente de teste. H18 depende de SSO isolado; H20–H23 e auditor compatível continuam pendentes. `publishedHomologation=NOT_GRANTED`; **CFT-005 ABERTO**.

My Workspace/Primary conferido no conector e no Chrome autenticado. Franquia e capacidade disponíveis foram conferidas no painel; valores exatos ficam somente no CFT-005 existente. Há franquia no instante observado; não garante uso futuro ilimitado. Documentação atual confirma Web Service `free`; cold start pode causar 503 com o timeout seguro, e o banco Free expira em 28/11/2026 às 00:09:38 UTC. Sem contratação/upgrade.

Pacote concreto em [ledger-activation-request-20261029.json](./ledger-activation-request-20261029.json): somente novo coordenador Free/Virginia, banco sintético `cft005-hml-db-teste`, dois novos papéis/um schema/três tabelas de metadados e variáveis protegidas dos BFFs A/B existentes. Branch, build/start, campos esperados e ordem de ativação estão listados; IDs exatos permanecem na ficha local e no CFT-005. Não alterar grants/dados de `records`, IdP, TTL, outras aplicações ou Apertaquem. Chaves definitivas só serão geradas/salvas nos campos protegidos quando a ativação for executada; não reutilizar as efêmeras locais.

**Ainda não executado:** criação/configuração do coordenador remoto, migração hospedada, deploy A/B e logins Auth0 da nova versão. Autodeploy de A/B continua `no`; network API confirmou `ipAllowList=[]`. Processos locais encerrados e arquivos temporários de senha/TLS removidos; clusters privados parados retidos, sem exclusão recursiva. Não foram usados segredos externos na validação local.

## Publicação pendente — rede novamente confirmada fechada

A revisão automática rejeitou o envio ao GitHub antes de qualquer commit/ref: primeiro pacote de 29 arquivos, depois alternativa reduzida de 23, mesmo após confirmar que o repositório público é o destino fornecido pelo usuário. A justificativa remanescente é a exposição pública de implementação, hostname do banco e endpoint proposto. IDs de workspace/serviços e números de consumo foram retirados do pacote público; ficha exata preservada só localmente e no CFT-005. O hostname que permanece no código já foi conferido na fonte pública anterior; isso não elimina a exigência de autorização específica da revisão. Nenhum terceiro envio será tentado sem essa autorização.

As duas regras temporárias chegaram a ser preenchidas sem Save. Depois do bloqueio de publicação, o próprio rascunho foi cancelado: painel com regras específicas vazias, mensagem de bloqueio, Save desabilitado e API `ipAllowList=[]`. Não deixar uma janela aberta enquanto o código não está publicado/revisado. O screenshot local `D:/Dev/cft005-evidencias/ledger-network-closed-publish-blocked-20261029.png` registra o estado final.

**Único próximo passo:** obter a autorização específica para publicar os 23 arquivos sanitizados na branch de testes do repositório público indicado. Revisão local: `D:/Dev/cft005-evidencias/ledger-publication-review-20261029.json`. Depois, executar o pacote de ativação HML com confirmação própria da janela temporária, fechando as duas redes ao terminar. Não testar nem declarar revogação entre versões legada/integrada misturadas. A implementação permanece somente na árvore de trabalho local; não há novo commit remoto desta etapa.

Fontes verificadas: [Render — Compute Plans](https://render.com/docs/compute-plans), [Free](https://render.com/docs/free), [variáveis protegidas](https://render.com/docs/configure-environment-variables), [Node HTTPS](https://nodejs.org/api/https.html). O Markdown Render não pôde ser lido pelo navegador de pesquisa por content-type; versões HTML foram lidas com sucesso.
