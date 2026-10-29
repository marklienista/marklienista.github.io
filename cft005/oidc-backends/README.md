# CFT-005 — Integração de dois backends confidenciais

**Preparação técnica — 29/10/2026:** sonda autenticada H05/H06/H08/H10–H13 preparada; **69 testes locais PASS**, sem novo PASS remoto ou deploy. Corrigido descarte da conexão quando rollback falha. [Implementação, execução e limites](../homologacao/SONDA-TECNICA-H05-H13.md). Banco fechado; implantação aguarda janela restrita. Contrato real preservado em 6 PASS, 0 FAIL, 18 BLOCKED. O JWT Supabase genuíno permanece sem ensaio. CFT-005 ABERTO.

**Atualização — 29/10/2026, 09:36 BRT:** nova rodada em dois perfis: 52 controles HTTP PostgreSQL PASS e preservação manual dos quatro registros (revisões 3 → 4 somente na escrita própria). H03/H04/H07/H09 completos PASS, somados a H01/H02: **6 PASS, 0 FAIL, 18 BLOCKED**. [Resultado e limites](../homologacao/H03-H13-RESULTADO.md). H05/H06/H08/H10–H13 ainda exigem complementos técnicos; o runner não comprova esses gates inteiros. Rede novamente fechada, health 503 esperado. Sem mudança executável/deploy. Próximo passo único: instrumentar/completar os sete gates técnicos restantes do bloco, sem repetir estes cliques manuais. CFT-005 ABERTO; os adendos abaixo são históricos.

**Atualização — 29/10/2026, 09:16 BRT:** H01/H02 PASS por execução manual do operador em dois perfis U1/U2. Quatro sessões preservadas após recarga/reabertura, intervalo aproximado de 11 minutos; [resultado e limites](../homologacao/H01-H02-RESULTADO.md). Contrato: 2 PASS, 0 FAIL, 22 BLOCKED. Janela externa do banco novamente fechada, health 503 esperado. Sem novo executável/deploy, sem renovação ou revogação central demonstrada nesta rodada. CFT-005 ABERTO; estados abaixo são históricos.

**Estado atual — 29/10/2026, 08:05 BRT:** alternativa PostgreSQL executada com U1/U2 nos dois BFFs: **52/52 controles HTTP reais PASS**, mais quatro conferências de preservação por proprietário. TLS/certificado e hostname verificados, papéis A/B exclusivos e owner derivado do principal OIDC. Rede temporária fechada ao fim; health dos backends agora 503/database_unavailable por essa restrição. [Resultado, matriz e limites](../homologacao/INTEGRACAO-BFF-BANCO.md). Um único perfil Chrome foi usado sequencialmente; não homologa os gates completos nem produtos publicados. CFT-005 ABERTO. As seções datadas abaixo são históricas.

**28/10/2026, 23:09 BRT:** autorização temporária recebida; host externo com TLS verificável salvo nos campos protegidos de A/B, sem deploy. As duas redes estão preenchidas, mas Save foi bloqueado pela revisão automática; banco continua fechado. Falta o clique humano em Save para executar a rodada. [Adendo e limites](../homologacao/INTEGRACAO-BFF-BANCO.md). Sem novo PASS HTTP PostgreSQL.

**Estado atual, 28/10/2026, 22:56 BRT:** adaptador PostgreSQL preparado; 60 testes locais PASS. Credenciais exclusivas salvas nos dois serviços; acesso externo do banco fechado. Deploy integrado BLOCKED por validação TLS do certificado interno autoassinado. A versão anterior continua servindo dados em memória. [Resultado e alternativa restrita com certificado verificável](../homologacao/INTEGRACAO-BFF-BANCO.md). Os estados abaixo são históricos; não atribuir PASS PostgreSQL aos 44 controles BFF anteriores. CFT-005 ABERTO.

**28/10/2026: login real A/B com U1 PASS; prova de cada backend 11/11 PASS. JWT real A→B e B→A recusado após assinatura/azp para leitura/escrita. Logout local A e continuidade B PASS. U2 BLOCKED por credencial da identidade prevista indisponível. CFT-005 ABERTO.**

O código de integração está preparado nesta branch; os resultados locais abaixo não comprovam emissão pelo Auth0. Esta pasta é independente de `oidc/` e `backend-proof/` e não substitui os aplicativos publicados.

## Rodada automática no Chrome: persistência e vencimento — 28/10/2026, 13:48 BRT

O Chrome externo passou a estar conectado pela extensão oficial. O agente executou a entrada A/U1, sem digitar ou ler credenciais, às 13:32:33.892 BRT. Recarregar e fechar/reabrir a aba preservou U1 sem novo login; a prova passou 11/11, inclusive às 13:46:18.252. Às **13:48:24.214**, a recarga mostrou **Sem sessão local**, sem nova entrada ou renovação. **PASS para o vencimento da sessão local BFF**, limitada a quinze minutos.

B entrou mais tarde, às 13:38:20.481. Após vencer A, B continuou U1 às 13:48:25.171 e sua prova terminou **11/11 PASS** às 13:48:30.887, sem novo login B. Os contadores de autenticação e os recibos anteriores ficaram preservados nos dois serviços, corroborando continuidade do processo. Não é atestação externa nem teste de expiração do JWT Auth0, revogação central ou refresh Supabase. O teste manual anterior, interrompido pelo fechamento do navegador, continua inconclusivo; o resultado atual não o reclassifica.

O primeiro recibo A da nova rodada foi BLOCKED na etapa remota, com oito controles locais PASS; B foi observado na tela de inicialização do Render. Após disponibilidade do B, a repetição passou 11/11. Ambos os resultados foram preservados. Quatro respostas públicas de HTML/script em A/B também passaram nos controles CSP restritiva, no-store, no-referrer e nosniff. Isso não é homologação completa de XSS, armazenamento ou retenção interna de logs.

Evidências: [sessões do navegador](browser-session-evidence.json), [cabeçalhos HTTP](http-security-headers-evidence.json) e [matriz consolidada](../oidc/MATRIZ-CONSOLIDADA-2026-10-28.md). Capturas locais mostram somente interface sanitizada, sem parâmetros de autenticação. Nenhum segredo, cookie, token, código OAuth, subject ou conteúdo de registro integra os artefatos. Nenhuma alteração de executável, configuração, TTL ou deploy nesta rodada.

## Interrupção antes de autenticar — 28/10/2026, 09:17 BRT

O usuário confirmou que viu a tela Auth0, fechou a janela antes de autenticar e abriu a página inicial A em novo contexto anônimo, sem sessão. Entre as observações, A passou de três para cinco aberturas de entrada, mas permaneceu com cinco callbacks e um sucesso; o último evento foi `PENDING/redirect_started` às 12:17:13.266Z. O recibo U1 anterior permaneceu inalterado. **PASS para abandono antes da autenticação**, por relato da interface e contadores corroborantes. [login-abandonment-evidence.json](login-abandonment-evidence.json) preserva os limites.

Não foi recebido um callback de recusa do provedor nesta etapa. Não se atribui PASS a manipulação PKCE no navegador, limpeza imediata da transação ao fechar a janela, logout central ou toda a matriz original S08. A transação possui prazo local de cinco minutos; fechar a janela não promete exclusão imediata no servidor. Próxima observação: persistência do A no contexto habitual e vencimento de sua sessão local, após 09:27 BRT, sem nova entrada. O limite local de quinze minutos não é expiração do JWT Auth0 nem refresh Supabase. Nenhum executável ou configuração foi alterado.

## Logout B e reentrada A sem nova senha — 28/10/2026, 09:10 BRT

O usuário confirmou B sem sessão após sair apenas dali e A autenticado sem nova senha, com execução da prova. O servidor registrou login B às 12:10:32.796Z e recibo B/U1 **11/11 PASS** às 12:10:35.808Z; em seguida, login A às 12:10:43.987Z e recibo A/U1 **11/11 PASS** às 12:10:59.447Z. [session-reentry-evidence.json](session-reentry-evidence.json) preserva os dois recibos e os limites. O estado B após logout e a ausência de nova senha são relatos da interface; não houve leitura de cookies ou auditoria de evento de logout no servidor. A troca de código e a prova A corroboram a nova entrada funcional.

PASS nesta rodada para logout local B e reentrada A sem nova senha. Isso é compatível com a sessão central mantida; não comprova logout central ou revogação. Os contadores de falha incluem as sondas anônimas anteriores e a recusa U2, não novas falhas atribuídas ao usuário. U2, refresh real do SPA e o modelo publicado mantêm seus limites. Sem alteração de executável ou deploy.

## Continuidade sem U2 e retornos inválidos — 28/10/2026

O usuário confirmou não ter senha Auth0 para a identidade U2 configurada. Login positivo U2 e separação recíproca entre duas identidades ficam **BLOCKED** por indisponibilidade da credencial autorizada. A tentativa Google recusada foi preservada. Nenhuma conta foi criada, redefinida, vinculada ou adicionada à autorização; os PASS históricos U1 não mudam.

Às 09:07 BRT, **8/8 verificações HTTPS anônimas PASS** nos dois backends: GET no callback e POST com tipo incorreto retornaram 400; POST de erro sem transação retornou 303 para `/`, sem cookie de sessão; `/session` continuou 401. [anonymous-callback-evidence.json](anonymous-callback-evidence.json) contém somente resultados sanitizados. Não houve transação OIDC, código OAuth, token, cookie de usuário ou chamada ao provedor. As sondas geram eventos de falha no diagnóstico compartilhado; não confundir esses eventos com novo erro humano. Isso comprova as barreiras testadas, sem comprovar cancelamento real no Auth0, PKCE no navegador ou a matriz SPA original completa. Não houve mudança de executável ou deploy.

## Tentativa U2 recusada — 28/10/2026, 08:43 BRT

O usuário tentou entrar com o e-mail autorizado U2 e relatou a mensagem de conta não correspondente às autorizadas. A confirmou `FAIL/subject_allowlist` às 11:43:27.281Z, zero sucessos e nenhum recibo; B ainda tinha zero tentativas nesta instância. A recusa por subject exato é **PASS** como barreira, mas o login positivo U2 e a separação recíproca entre duas identidades continuam **BLOCKED**. [u2-login-denial-evidence.json](u2-login-denial-evidence.json) preserva somente diagnóstico sanitizado.

O identificador U2 fornecido corresponde à conexão Auth0 de e-mail/senha. Google e e-mail/senha podem representar identidades diferentes com o mesmo e-mail. O método usado na tentativa ainda não foi confirmado; essa possibilidade é hipótese, sem leitura do token ou alteração do mapeamento. Não autorizar por igualdade de e-mail nem vincular contas para contornar a recusa. Os recibos atuais em memória estavam vazios; os recibos históricos já preservados continuam documentados. Não houve mudança de código ou deploy. A resposta não esclareceu se a reentrada U1 anterior pediu senha.

Continuidade: o usuário confirmou que usou **Continuar com Google**. Esse método difere do cadastro Auth0 de e-mail/senha informado para U2 e é compatível com a recusa observada; o subject recebido não foi lido. Aguardamos nova tentativa pelo formulário Auth0 no A. Se essa credencial não estiver disponível, manter U2 BLOCKED sem criar, redefinir ou vincular contas.

## Logout local A e continuidade B — 27/10/2026, 22:37 BRT

O usuário confirmou A sem sessão e B ainda autenticado. O segundo recibo B/U1 terminou às 01:37:18.333Z de 28/10 com **11/11 PASS**, sem novo login B: o contador permaneceu em um sucesso e o último login continuou às 01:31:41.486Z. A nova entrada funcional do A passou às 01:36:56.235Z. A ausência de sessão A foi relatada na interface; não há auditoria de eventos de logout no servidor. A necessidade de senha na reentrada não foi informada.

Isso comprova logout local A/continuidade B nesta rodada e persistência B durante a navegação no mesmo navegador aberto, por cerca de cinco minutos e meio. Não comprova persistência após reinício do navegador/serviço, logout central, refresh Supabase nem login positivo U2. Os recibos sanitizados e os limites estão em [real-login-evidence.json](real-login-evidence.json). Nenhum novo deploy foi necessário.

## Emissão real B e prova bidirecional U1 — 27/10/2026, 22:31 BRT

Após reinstalar a credencial exclusiva, B registrou PASS/authenticated às 01:31:41.486Z de 28/10 (22:31 BRT de 27/10). O recibo B/U1 terminou às 01:31:48.320Z com **11/11 PASS**, incluindo HTTP 401 para seu JWT real no A após assinatura e vínculo do outro cliente, nos dois escopos. Em conjunto com o recibo A/U1, a recusa real está comprovada nas duas direções para a política do protótipo. O erro antigo B e o primeiro recibo A bloqueado foram preservados.

B usa deploy dep-dbgkttfb9u1s738jjma0, commit de evidências a87f74dbaa3dcbbcbb74fcd268a690520606441b; os executáveis são idênticos aos de b0839202423600018b8bd08fc364b5ab090ec899. A permanece no deploy anterior. Não há homologação da arquitetura publicada, login positivo de U2, logout/persistência completos ou refresh real do SPA. Nenhuma credencial ou conteúdo de registro integra os recibos.

## Prova A completa e erro B — 27/10/2026, 22:21 BRT

A repetição de A/U1 terminou PASS em 01:21:16.978Z de 28/10: **11/11 verificações PASS**. Além dos oito controles locais, o B recusou o JWT real do A com HTTP 401 para records:read e records:write, com confirmação de outro cliente após assinatura; o outro registro sintético permaneceu inalterado. O recibo anterior BLOCKED foi preservado. Não houve mudança de código ou novo deploy.

O próprio login B falhou no token endpoint, motivo sanitizado unauthorized, às 01:21:27.727Z. A configuração pública foi conferida anteriormente; a credencial exclusiva de CFT-005 BFF B precisa ser conferida/reinstalada diretamente em AUTH0_CLIENT_SECRET do serviço B. O valor não é solicitado por chat. Essa observação não atribui causa definitiva ao segredo anterior. A direção inversa B→A com token real, U2 e as sessões independentes ainda não foram comprovadas.

## Primeiro login real A/U1 — 27/10/2026, 22:15 BRT

Após o usuário reinstalar a credencial exclusiva do A no ambiente protegido e o deploy `dep-dbgkms4ipgvc73drq0cg`, o servidor registrou `PASS/authenticated` às 01:15:02.502Z de 28/10 (22:15 BRT de 27/10). A troca confidencial, assinatura de ID/access token e vínculo de cliente/subject foram validados pelo código em execução `b0839202423600018b8bd08fc364b5ab090ec899`. Não se inspecionou o segredo anterior.

[real-login-evidence.json](real-login-evidence.json) preserva a observação sanitizada. No primeiro recibo, oito verificações PASS: duas permissões do token próprio, leitura/escrita próprias 200, outro rótulo 404 e outro produto nas rotas do A 403. O recibo inteiro é **BLOCKED**, pois a etapa remota não concluiu; a preservação final do outro registro não foi alcançada. Não há ainda prova criptográfica A→B ou B→A com JWT real, nem login positivo de U2.

B respondeu depois com health 200 e recusou bearer fictício com 401. Isso permite repetir a prova, mas não comprova bloqueio de token válido estrangeiro. A possível partida após suspensão do plano gratuito é hipótese de transporte; não foi comprovada. Não repetir login do A ou implantar código sem necessidade, pois as sessões e os registros de teste são mantidos em memória.

## Continuidade: bootstrap e prova executável — 27/10/2026

O usuário confirmou o salvamento de A e B, sem transmitir os segredos ao agente. O deploy A `dep-dbghg02fngtc73dkb4j0` ficou LIVE em 21:31:20Z; B `dep-dbghimnb9u1s73c85img` em 21:36:46Z. Ambos usaram o commit `466ad11d4112f68d2e05b938bd1d4ea1e4868703`; `/health` retornou HTTP 200, ready=true e produto correto. Isso confirma configuração e discovery, não validade do segredo no token endpoint.

O botão **Executar prova de isolamento** requer uma sessão obtida por login, Origin próprio e CSRF. O backend usa a sessão em memória para testar por HTTP leitura/escrita próprias (200), de outro usuário (404) e de outro produto (403). Somente o registro sintético do próprio usuário recebe um valor sintético fixo. Confere também a preservação do outro registro.

Em seguida, o backend envia o access token, somente por HTTPS, ao endpoint fixo `/proof/token-policy` do outro serviço de teste. Não há destino selecionável por entrada HTTP ou variável de ambiente. O receptor usa a mesma função `authorize` das rotas de dados: assinatura RS256, emissor, audience, expiração, subject autorizado, perfil e escopo são conferidos antes de rejeitar `azp` do outro cliente. São duas recusas HTTP 401, para records:read e records:write. A razão sanitizada `other_client_after_signature_verification` distingue esse bloqueio de JWT inválido. A sonda não lê/escreve registros, não cria sessão e não oferece troca de token; as rotas de dados continuam recusando bearer. O teste remoto comprova a política criptográfica do receptor, enquanto as verificações HTTP locais exercitam as rotas de dados com sessão.

`GET /proof/results` publica no máximo oito recibos em memória, contendo somente horários, produto, rótulo U1/U2 e códigos/veredictos. Não contém registro, subject, e-mail, token, cookie, CSRF ou segredo. Apenas uma sessão válida pode gerar um recibo. O processo não registra requisições ou erros brutos. Conforme [documentação Render](https://render.com/docs/logging), o explorador de logs HTTP é recurso Pro; não foi ativado nem contratado. O callback continua `form_post`, mantendo código OAuth fora da URL. Não foi feita inspeção de logs brutos de autenticação; esta verificação não garante políticas internas de retenção dos provedores.

Regressão do runner: **51/51 cenários locais PASS** (52 testes incluindo o agrupador). São fixtures OIDC, sem emissão real. Os três casos novos verificam o runner em A/B, recusas após assinatura, limites de autenticação e ausência de credenciais nos recibos. Os resultados desta seção substituem apenas o estado atual; as seções datadas abaixo preservam o histórico.

O runner foi implantado em A (`dep-dbghl8bl550s738dqm1g`) e B (`dep-dbghl9ek1f9s738qeaag`), ambos LIVE às 21:42:18Z, commit `376b814a34dff3d7669b43e8fbd0191cf5e00968`. [runtime-gate-evidence.json](runtime-gate-evidence.json) registra **16/16 verificações HTTPS públicas PASS**: saúde, página/runner disponível, recusa anônima de sessão/dados/execução, recusa de bearer forjado nas rotas e na sonda. Os recibos estavam vazios. Isso não comprova login ou bloqueio de token válido de outro cliente.

## Diagnóstico da tentativa humana de entrada

O usuário relatou que a primeira tentativa chegou ao Google, mas as entradas seguintes voltaram rapidamente para Sem sessão local. Isso é uma falha relatada, ainda sem causa confirmada no servidor. A página anterior descartava toda categoria de erro no callback e exibia apenas ausência de sessão.

A correção adiciona `GET /auth/status`, com contadores e somente o horário/resultado/etapa fixa da última tentativa desta instância sintética. O frontend explica a etapa em linguagem simples. As categorias distinguem cookie/transação ausente, credencial do serviço recusada, troca de código, validação OIDC/ID Token/access token, conta permitida, escopo e criação de sessão. Mensagens/descrições brutas, códigos OAuth, claims, subjects, e-mails, cookies e tokens nunca são retornados ou registrados. A falha continua fechada: nenhum cheque de autenticação foi relaxado. O diagnóstico é compartilhado por instância e pode refletir tentativas anônimas; não é identidade ou atestação do usuário.

O cenário local adicional comprova que erros com material privado e categorias não autorizadas não aparecem no diagnóstico. **51/51 cenários locais PASS (51 com agrupador)**. Ainda é necessário repetir o login no serviço atualizado para identificar a causa real; esta correção de diagnóstico não comprova a solução da entrada.

## Recusa real observada — 27/10/2026, 18:58 BRT

O diagnóstico do A registrou uma tentativa, um callback e zero sucessos, com `provider_denied`. Não há sessão ou emissão comprovada. A investigação em [login-denial-evidence.json](login-denial-evidence.json) confirmou por GET somente a API sintética (`user.policy=allow_all`) e os dois clientes exatos: first-party, OIDC, callbacks exclusivas, authorization_code e client_secret_basic, sem exigência de organização. Nenhuma configuração Auth0 foi modificada. O Make foi restaurado a GET da API sintética com saídas públicas selecionadas; sem consulta a usuários.

A categoria antiga reunia access_denied recebido na autorização e no token endpoint. O diagnóstico agora separa essas fases pela classe de erro da biblioteca, sem ler/retornar causa bruta. Classifica a descrição apenas em memória numa lista fixa de motivos; retorna somente esse motivo, nunca a descrição ou outra parte da resposta. O cenário novo exercita recusa no callback e no token endpoint e confirma descarte de texto privado. **51/51 cenários locais PASS (52 com agrupador)**. É necessário repetir o login A para identificar a fase real; não declarar segredo inválido, cancelamento do usuário ou falha de Action sem observação.

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

`node --test integration.test.mjs`: **51/51 cenários locais PASS** (52 testes contando o agrupador). Duas instâncias HTTP de backend e um emissor de protocolo local foram usados no mesmo processo, com RS256, JWKS, endpoints HTTP e troca de código reais do protocolo. O emissor e todas as identidades são fixtures; não são o Auth0.

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

Há dois serviços LIVE, emissão humana A/B com U1, prova criptográfica remota bidirecional e logout local A/continuidade B PASS. Falta login positivo U2 e a rodada completa de sessões. Esses resultados não removem o FAIL de S12 na arquitetura publicada. Sessões/dados/recibos em memória são adequados apenas à prova de instância única, sem disponibilidade, durabilidade ou logout central. As rotas dos aplicativos existentes continuam fora desta mudança. Os recibos públicos são evidência sanitizada de teste, não um sistema de auditoria durável ou com atestação externa.

**Único próximo passo:** preparar a rodada de renovação manual real nos clientes SPA isolados de teste, conferindo a implantação da branch corrigida e o tratamento de callback/logs antes de autenticar. U2 permanece BLOCKED sem criar ou redefinir conta. Não enviar segredos por chat. O Chrome externo está conectado; as interrupções anteriores do controle de navegador permanecem apenas como histórico.

Referências: [openid-client](https://github.com/panva/openid-client), [Auth0: clientes confidenciais](https://auth0.com/docs/get-started/applications/confidential-and-public-applications), [Render: variáveis e segredos](https://render.com/docs/configure-environment-variables).
