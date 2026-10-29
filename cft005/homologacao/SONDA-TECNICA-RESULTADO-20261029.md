# CFT-005 — sonda técnica real por produto

29/10/2026. **H05, H06, H08, H11, H12 e H13 PASS** no candidato BFF/PostgreSQL de homologação. H10 continua BLOCKED na parte que exige JWT Supabase genuíno exclusivamente de teste. Contrato consolidado: **12 PASS, 0 FAIL, 12 BLOCKED**. Matriz SPA original preservada em **9 PASS, 2 FAIL, 3 BLOCKED**. CFT-005 ABERTO; nenhuma homologação publicada concedida.

## Execução e repetição controlada

O usuário salvou somente as redes temporárias previamente preparadas, `74.220.49.0/24` e `74.220.57.0/24`, no banco exclusivo. API e metadados confirmados antes dos deploys. Os dois serviços Free/Virginia/My Workspace continuaram na branch de testes, AutoDeploy=no. Nenhum recurso novo foi criado e nenhuma credencial foi aberta nesta rodada.

Versão 1 `9fdc9a5e07ed2ef8b01f0b08ba3f8fddf1014190`: A `dep-dbhkdhgn74is73e9bt40`, B `dep-dbhkdioae00c73e0h5i0`, ambos LIVE. As quatro sondas tiveram 48 controles PASS cada, **192 PASS nessa versão**, com reutilização entre U1/U2 em ambos os produtos. Essa execução foi preservada, mas não contém a precondição de privilégio de coluna adicionada depois.

Foi reforçada a precisão da prova de WITH CHECK: exigir permissão UPDATE na tabela e nas colunas record_id, owner_label e product antes de atribuir a recusa 42501 à RLS. Falta de privilégio deve interromper a sonda antes das mutações; não receberá falso PASS de política. Nenhum grant/política foi alterado. O teste de regressão correspondente passou; suíte final **70 testes locais PASS**, com fixtures/mocks separados da prova real.

Versão final `bbd9410a35275d7a24aa81aa0eff5cadea78799e`: A `dep-dbhkj8uc6qcc73flpg60` LIVE às 13:27:36.847Z; B `dep-dbhkj9vlk1mc73d0dhr0` LIVE às 13:27:39.488Z. Health PostgreSQL 200 e recibos técnicos vazios confirmados antes de autenticar. Somente os casos técnicos afetados foram repetidos; o runner antigo que confirma escrita própria não foi executado.

| Contexto | Início UTC | Fim UTC | Recibo final |
|---|---|---|---|
| A/U1 | 13:30:17.682Z | 13:30:18.407Z | 49 PASS |
| B/U1 | 13:30:50.444Z | 13:30:51.313Z | 49 PASS |
| A/U2 | 13:32:19.371Z | 13:32:20.167Z | 49 PASS |
| B/U2 | 13:32:50.707Z | 13:32:51.358Z | 49 PASS |

São **196 controles finais PASS**, zero FAIL/BLOCKED dentro dos runners técnicos. Os 192 controles da versão anterior são outra execução dos mesmos objetivos, sem o critério novo; não somar como 388 casos distintos de homologação. A consulta HTTPS aos recibos sanitizados corrobora as mesmas execuções do navegador, não provas adicionais ou atestação independente.

## Provas completas do contrato

| Caso | Estado | Evidência |
|---|---|---|
| H05 | PASS | Quatro contextos com uma única linha própria; constraints validadas limitam proprietário a U1/U2, produto fixo, record_id vinculado ao proprietário e chave primária. Os quatro contextos cobrem as quatro linhas possíveis. Com os quatro pedidos anteriores de owner forjado e quatro de product forjado, todos 400, confirma ausência de reassociação/linhas extras. A contagem do recibo HML seleciona os quatro pedidos de owner; os outros quatro são evidência adicional, não ocultados. |
| H06 | PASS | Quatro principais OIDC reais, papéis distintos do dono, sem super/DDL/bypass/replication/inherit/membership, TLS e FORCE RLS. SELECT próprio visível, alheio zero; UPDATE próprio permitido sem mudança, alheio zero. UPDATE de owner/record_id e product recusados com 42501, após confirmar UPDATE nessas colunas. Releituras preservadas. |
| H08 | PASS | A não lê schema B e vice-versa; USAGE oposto ausente, SET ROLE oposto/dono negado e row_security=off não permite leitura. Papel real A/B, sem credencial administrativa compartilhada. Cada tentativa foi desfeita, inclusive uma eventual permissão inesperada teria sido marcada FAIL. |
| H10 | BLOCKED | JWT Auth0 real enviado somente pelo servidor à própria rota de dados: 401/browser_bearer_forbidden nos quatro contextos. Não foi obtido JWT Supabase genuíno exclusivamente de teste, nem capturado token publicado. sharedSupabaseJwtRealTest=false permanece explícito; a parte comprovada não aprova o gate inteiro. |
| H11 | PASS | Leitura própria positiva sem Origin; oito recusas de produto com Origin ausente/forjado, sessão real e CSRF correto. Categoria product_forbidden demonstra alcance da política, distinta de csrf_required. Identidade do principal e registros preservados. |
| H12 | PASS | Inventário do candidato cobre REST de dados, GraphQL, RPC, views, Storage e Realtime. Rotas ausentes GET e POST negadas com not_found após autenticação. Catálogo confirmou ausência de views/foreign tables, SECURITY DEFINER, funções PUBLIC EXECUTE, relações public e publicações; default de execução PUBLIC do dono revogado. REST própria real e política negativa comprovadas. Realtime: HTTP 404 e revisão do código sem handler upgrade; não é alegação de handshake WebSocket real. |
| H13 | PASS | Em A e B, U2 informou previousVerifiedOwnerDifferent=true e samePhysicalConnection=true após U1; PID comparado somente em memória, nunca exportado. Contexto vazio antes e depois do rollback e do commit READ ONLY; principal validado define o owner. Não inferido do intervalo de tempo ou do tamanho do pool. |

A ausência de linhas extras foi provada pela cardinalidade por contexto junto com constraints validadas e chave primária, sem usar administrador para contar dados ocultos e sem desabilitar RLS. H12 é inventário dos serviços de homologação e seus recursos, não auditoria de todos os serviços internos do provedor ou da produção. As rotas de dados foram comparadas ao código do controle positivo HTTP anterior e permaneceram idênticas; os novos endpoints são separados.

## Preservação e autenticação

O agente operou o Chrome externo conectado. Realizou as novas entradas somente das identidades U1/U2 já autorizadas, selecionando as contas Google existentes, sem ler senha, token, código, cookie ou armazenamento. B usou SSO nas entradas posteriores, sem senha. Não houve logout central, vinculação de contas, redefinição, novo usuário, alteração Auth0 ou interferência no segundo perfil. Esta sequência técnica em um perfil não substitui a prova manual de perfis H01/H02, herdada explicitamente.

Cada uma das quatro combinações teve leitura própria antes e depois da sonda, com revisão **4** e o mesmo valor synthetic-proof correspondente. Depois das quatro sondas finais, novas leituras U2 em A/B confirmaram revisão 4. O agente voltou a U1 e também releu A/B após U2, com revisão 4. Nenhum INSERT, DDL ou escrita definitiva ocorreu nas sondas: mutações sempre em rollback; o único COMMIT foi READ ONLY. O registro próprio foi também comparado em memória dentro da transação e após o rollback.

A lentidão/transição do Google causou timeouts de observação; não foram repetidos cliques de prova ou atribuídas falhas de autenticação por esses timeouts. O agente esperou o retorno e conferiu rótulo antes de continuar. Não foram exportadas URLs de autenticação. Screenshots locais mostram somente recibo/registro sintético ou regras de rede.

## Correção e limites preservados

O descarte da conexão após falha de rollback foi implantado nos dois BFFs. A regressão desse caminho foi testada localmente; não foi injetada uma falha real de rollback no banco hospedado. As sondas reais comprovaram o contexto limpo após rollback e commit bem-sucedidos. O pool mantém uma conexão por serviço, ociosidade de 120 segundos, sem mudança de TTL de sessão/JWT/refresh.

H01–H09 e H11–H13 estão PASS no contrato consolidado. H10 e H14–H24 permanecem BLOCKED: faltam o JWT Supabase de teste, registro durável/coordenador/revogação/corrida/reinício, fronteira SSO isolada e revisão completa de segurança/retenção. Os resultados atuais não resolvem S12/S13 dos aplicativos publicados. O isolamento real do candidato é comprovado no âmbito descrito; não houve migração ou homologação dos produtos publicados.

## Fechamento da janela e próximo passo

As duas regras foram removidas ao terminar e Block All Inbound IPs confirmado. Às 13:36:28Z, API ipAllowList=[] e painel com bloqueio específico do PostgreSQL; regra genérica do workspace intacta. A primeira conferência health às 13:36:33.9978127Z ainda retornou 200 em A/B, compatível com conexões do pool já estabelecidas. Isso foi preservado como limite: fechar a allowlist não foi tratado como revogação imediata de toda conexão. A conferência posterior após o período ocioso está no recibo de rede final; não houve nova sonda ou login depois do fechamento. Não foi feita sonda TCP externa independente.

Evidências em technical-real-evidence-20261029.json, technical-server-receipts-20261029.json, technical-v1-server-receipts-20261029.json, technical-surface-review-20261029.json, technical-hml-receipt-20261029.json e technical-hml-evaluation-20261029.json. Capturas locais: technical-network-closed-20261029.png, technical-v2-B-U2-20261029.png e technical-v2-final-record-B-U1-20261029.png em D:/Dev/cft005-evidencias/. Sem segredos ou identificadores reais nos artefatos. Produção, Apertaquem, Supabase compartilhado, dados reais, usuários, Auth0 e TTL global preservados.

**Único próximo passo:** preparar o registro durável de sessões e revogação exclusivamente na homologação para os casos H14–H19/H24, mantendo H10 bloqueado até existir token genuíno de teste em fronteira isolada. Não reabrir a rede antes de a próxima rodada estar preparada. CFT-005 ABERTO.
