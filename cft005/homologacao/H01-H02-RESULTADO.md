# CFT-005 — H01/H02: dois perfis, persistência e limites

29/10/2026, registro e corroboração a partir de 09:14:57 BRT. **H01 PASS e H02 PASS por execução manual do operador**, com contadores sanitizados dos servidores como corroboração parcial. Contrato integrado: **2 PASS, 0 FAIL, 22 BLOCKED**. CFT-005 ABERTO; homologação publicada não concedida.

| Perfil / identidade autorizada | Entrada | Recarga | Fechar/reabrir |
|---|---|---|---|
| P1 / U1 / A | Produto A · U1 | Preservado | Preservado |
| P1 / U1 / B | Produto B · U1 | Preservado | Preservado |
| P2 / U2 / A | Produto A · U2 | Preservado | Preservado |
| P2 / U2 / B | Produto B · U2 | Preservado | Preservado |

O operador confirmou explicitamente dois perfis separados, os quatro rótulos e que todos se mantiveram após recarregar e fechar/abrir. Informou aproximadamente **11 minutos** até a recarga. A preservação sem nova entrada é a observação manual relatada, não uma captura automatizada dos dois perfis. O teste executado foi o roteiro de reabertura de abas; não há prova independente de reinício completo do navegador, processo BFF ou sistema operacional. Não extrapolar para persistência além dos quinze minutos máximos da sessão local nem para renovação de token.

O agente só tinha acesso a um perfil conectado; o segundo foi operado pelo usuário. O campo `source=browser` do recibo enumera o meio da observação; **não declara automação nem atestação independente**. `at` registra o instante UTC da corroboração/registro, não o horário exato de cada ação manual. As identidades são somente U1/U2 já autorizadas para a prova sintética; nenhum registro pessoal foi consultado. Não foram persistidos e-mails, subjects ou segredos.

## Corroboração dos servidores

Antes da rodada, health 200/ready=true/storage=postgres em A/B, mesma versão implantada `449d11a95739941b77b228875d36cac988066764`, sem novo deploy. Em 11:47:39.6985596Z, os contadores eram zero. Em 12:14:57.0553380Z:

| Serviço | Entradas iniciadas | Callbacks | Sucessos | Falhas registradas | Último sucesso UTC |
|---|---:|---:|---:|---:|---|
| A | 2 | 2 | 2 | 0 | 11:59:39.430Z |
| B | 3 | 2 | 2 | 0 | 11:59:49.587Z |

São quatro autenticações concluídas. B tem uma tentativa adicional iniciada sem callback: sua causa e momento não foram determinados. Não existe snapshot intermediário entre H01 e H02. Esses contadores não provam identidade, separação de perfis nem ausência de todo novo início de login; portanto não recebem esse significado. H02 se apoia no relato do operador sobre a preservação das quatro páginas. Os 11 minutos são aproximados e não foram cronometrados pelo agente.

## Encerramento da janela

O salvamento humano liberou somente `74.220.49.0/24` e `74.220.57.0/24` no banco exclusivo `cft005-hml-db-teste`. Depois da rodada, as duas regras foram removidas, e o painel confirmou **All internet traffic is blocked by PostgreSQL inbound IP rules**. A API confirmou `ipAllowList=[]`; a regra genérica do workspace permaneceu intacta. Em 12:16:31.4812662Z, os dois health retornaram 503 e somente `database_unavailable`, indisponibilidade esperada dos testes após fechar a conexão externa. Não é sonda TCP independente nem garantia de encerramento imediato de todas as conexões antigas.

Captura sanitizada local: `D:/Dev/cft005-evidencias/h01-h02-network-closed-20261029.png`. Recibo de critérios: [profiles-receipt-20261029.json](profiles-receipt-20261029.json); avaliação: [profiles-evaluation-20261029.json](profiles-evaluation-20261029.json); proveniência e contadores: [profiles-real-evidence-20261029.json](profiles-real-evidence-20261029.json). O preflight anterior BLOCKED foi preservado.

## Matriz e único próximo passo

H01/H02 passam somente no candidato BFF/PostgreSQL. H03–H24 continuam BLOCKED até seus critérios completos; não foram executadas novas escritas ou negativas de dados nesta rodada. Os 52 controles HTTP PostgreSQL e quatro conferências por proprietário anteriores, 84 SQL reais, 44 controles históricos em memória e testes locais permanecem nos próprios escopos. Não somar recibos como novas execuções.

A matriz original SPA continua **9 PASS, 3 BLOCKED, 2 FAIL**: este teste BFF não reexecuta S02 na SPA original nem resolve S12/S13 publicados. Não há coordenador durável, revogação conjunta ou prova de logout SSO isolado. Produção, Apertaquem, Supabase compartilhado, dados reais, usuários, Auth0 e TTL global foram preservados. Nenhuma alteração executável ou deploy foi necessário.

**Único próximo passo:** executar o bloco H03–H13 com uma nova baseline positiva nos dois perfis U1/U2, completando os critérios ainda não cobertos pelas provas anteriores. Preparar nova janela restrita somente quando a rodada estiver pronta; a janela atual está encerrada.
