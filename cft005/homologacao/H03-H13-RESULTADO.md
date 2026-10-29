# CFT-005 — nova rodada HTTP nos dois perfis

29/10/2026. **H03, H04, H07 e H09 PASS**, somados aos H01/H02 anteriores: contrato integrado com **6 PASS, 0 FAIL e 18 BLOCKED**. CFT-005 ABERTO; não há homologação de produto publicado.

## Execução real e proveniência

O operador realizou os cliques nos dois perfis separados já confirmados: P1/U1 e P2/U2, A/B. As quatro leituras iniciais e as oito releituras foram informadas pelo operador a partir da interface sanitizada. O agente consultou por HTTPS os quatro recibos públicos dos próprios servidores, sem ler token, código OAuth, cookie, armazenamento, senha ou credencial de banco. Essa consulta corrobora os mesmos recibos enviados pelo operador; não são quatro execuções adicionais nem atestação independente.

| Combinação | Início UTC | Término UTC | Controles |
|---|---|---|---|
| A/U1 | 12:31:12.386Z | 12:31:13.575Z | 13 PASS |
| B/U1 | 12:31:55.311Z | 12:31:56.385Z | 13 PASS |
| A/U2 | 12:33:16.173Z | 12:33:16.941Z | 13 PASS |
| B/U2 | 12:33:29.753Z | 12:33:30.539Z | 13 PASS |

São **52 controles HTTP PASS nesta rodada**, todos com `storage=postgres`, zero FAIL ou BLOCKED dentro dos quatro runners. Não confundir esse resultado com os gates completos H03–H13: um runner não cobre todos os critérios de contrato. Os 52 controles da rodada anterior e os 44 históricos em memória permanecem em seus escopos; não são reclassificados nem somados como se fossem uma execução única.

A primeira prova A/U1 já tinha sido concluída quando o agente coletou o recibo da resposta inicial; isso foi detectado e preservado, sem pedir nova execução. O operador depois informou também B/U1, a releitura intermediária, as duas provas U2 e a releitura final. O registro segue essa sequência real, mesmo tendo o último pedido do agente limitado a etapa U1. Os instantes exatos das leituras manuais não são conhecidos. O instante em que o relato foi recebido não deve ser confundido com o instante da leitura.

## Preservação dos quatro registros

| Registro sintético | Inicial | Após U1 | Após U2 | Valor em todas as leituras |
|---|---:|---:|---:|---|
| HML-A-U1 | 3 | 4 | 4 | synthetic-proof-U1-A |
| HML-B-U1 | 3 | 4 | 4 | synthetic-proof-U1-B |
| HML-A-U2 | 3 | 3 | 4 | synthetic-proof-U2-A |
| HML-B-U2 | 3 | 3 | 4 | synthetic-proof-U2-B |

Cada prova tem exatamente uma escrita própria HTTP 200, corroborada pelo recibo. U2 permaneceu com valor e revisão 3 após as tentativas U1; U1 permaneceu com valor e revisão 4 após as tentativas U2. As duas escritas U2 resultaram em revisão 4. Nesta rodada há snapshot manual intermediário pós-U1, melhor delimitado que a comparação por revisão esperada usada na rodada histórica. Leituras são da sessão autenticada de cada proprietário; não há consulta administrativa aos dados para substituir a RLS. Nenhum valor sintético mudou de conteúdo, mas a revisão comprova a escrita própria controlada.

## Gates completos e lacunas

| Gate | Estado | Evidência ou critério ainda faltante |
|---|---|---|
| H03 | PASS | Quatro leituras/escritas próprias 200, releitura compatível e adaptador PostgreSQL real. |
| H04 | PASS | Quatro leituras e quatro escritas alheias 404, com marcador de caminho SQL/RLS; preservação por proprietário na sequência acima, sem dados em respostas negadas. |
| H05 | BLOCKED | Oito corpos com owner/product adicionais receberam 400 e os registros conhecidos foram preservados. Falta conferir ausência de linhas extras pelo papel correto; não preencher o gate com contagem parcial. |
| H06 | BLOCKED | RLS e papéis reais já passaram nos 84 controles SQL históricos; a prontidão atual verifica papel e FORCE RLS. Faltam os critérios completos de contextos/WITH CHECK nesta rodada integrada, sem usar administrador como papel de teste. |
| H07 | PASS | Quatro leituras e quatro escritas de produto incompatível 403 com sessão válida/CSRF correto; quatro linhas preservadas, descontando apenas a própria escrita autorizada. |
| H08 | BLOCKED | Grants/SET ROLE passaram no SQL histórico. Falta completar a conferência com as credenciais de execução atuais na baseline integrada; não foi aberta credencial nesta rodada. |
| H09 | PASS | JWT real de A recusado em B e vice-versa para U1/U2 e ambos os escopos: oito respostas 401 com bindingVerified=true após assinatura/azp, em sonda sem acesso a dados. |
| H10 | BLOCKED | Falta a prova real completa de bearer direto e JWT comum de teste, sem obter token de aplicativos publicados. |
| H11 | BLOCKED | Falta variar Origin ausente/forjado conservando o caminho correto e evidência de política de produto. A interceptação por Origin/CSRF não será promovida a PASS de autorização. |
| H12 | BLOCKED | Falta inventário completo e comprovação das seis superfícies, incluindo grants/funções e ausência de bypass. |
| H13 | BLOCKED | A sequência U1/U2 passou com pool máximo 1; não há identificação da conexão reutilizada ou leitura do contexto após commit/rollback. Inspeção do código não substitui esses critérios reais. |

H07 cobre a política de produto das rotas do BFF autenticado. H09, separadamente, envia o JWT somente entre servidores à sonda fixa do outro BFF. Não houve exportação de token nem tentativa de transferir cookie entre domínios. Origin, CORS e JavaScript não foram usados como identidade de produto. A sonda retorna a categoria de cliente incompatível apenas depois de `jwtVerify` com issuer/audience/RS256, verificações de perfil, principal e escopo; rejeita antes de qualquer rota de dados.

H01/H02 são observações manuais anteriores herdadas explicitamente pelo recibo consolidado, sem nova alegação de persistência nesta rodada. H14–H24 continuam BLOCKED pelas dependências e provas integrais, inclusive registro durável, revogação coordenada, SSO isolado e inventários. A matriz SPA original permanece **9 PASS, 2 FAIL, 3 BLOCKED**; S02 original não foi reexecutado nos clientes SPA e S12/S13 publicados continuam sem solução comprovada.

## Versão e encerramento

Os dois deploys existentes continuam LIVE no commit `449d11a95739941b77b228875d36cac988066764`: A `dep-dbhhqtgm7kps73ev3i40`, B `dep-dbhhquuc6qcc73ffb920`. Os sete hashes de fonte/lockfile normalizados LF foram comparados ao registro anterior. Não houve alteração executável, novo deploy ou necessidade de repetir suítes de fixtures para esta alteração documental; o avaliador sanitizado foi executado e confirmou os seis gates PASS e dezoito BLOCKED.

O usuário salvou as duas redes temporárias já preparadas. API confirmou exclusivamente `74.220.49.0/24` e `74.220.57.0/24`; às 12:27:03.5318421Z, health A/B 200, ready=true e storage=postgres. Após os recibos finais, ambas foram removidas e Block All Inbound IPs confirmado. Às 12:36:22Z, API `ipAllowList=[]`; às 12:36:27.6275496Z, health A/B 503/database_unavailable, restrição esperada dos testes. O painel confirmou bloqueio específico do PostgreSQL; a regra genérica do workspace ficou intacta. Não houve sonda TCP externa independente nem atestação de término imediato de toda conexão antiga.

Captura local sanitizada: `D:/Dev/cft005-evidencias/h03-h13-network-closed-20261029.png`. Evidência [h03-h13-real-evidence-20261029.json](h03-h13-real-evidence-20261029.json), [recibo consolidado](h03-h13-receipt-20261029.json) e [avaliação](h03-h13-evaluation-20261029.json). Produção, Apertaquem, Supabase compartilhado, dados reais, usuários, Auth0 e TTL global foram preservados. Nenhum segredo ou identificador real integra os artefatos.

**Único próximo passo:** completar a instrumentação e as verificações técnicas dos sete gates restantes do bloco (H05/H06/H08/H10–H13), usando somente papéis e alvos sintéticos. Preparar a rodada técnica antes de abrir nova janela; não pedir repetição destes quatro testes manuais já comprovados. CFT-005 ABERTO.
