# Auditor técnico integrado ao coordenador — 29/10/2026

Preparado e validado localmente na branch `cft005-oidc-dominios`: **107 testes automatizados PASS e 78 verificações com PostgreSQL 17.11 nativo PASS**. Sem deploy, migração hospedada, abertura de rede ou novo PASS de homologação nesta preparação.

## Alteração e fronteira de autorização

O auditor anterior controlava suas transações e estava bloqueado no modo integrado. O novo adaptador usa duas fases fixas. Ambas exigem autorização online e obtêm as travas de epoch/sessão na mesma conexão da operação, com proprietário derivado do principal verificado.

1. Sondas de RLS/privilégios terminam em rollback integral. Sondas negativas usam savepoints. Nenhuma alteração de registro é confirmada.
2. A leitura posterior exige nova autorização e novas travas antes de acessar a linha; somente essa leitura termina em commit. Fora da transação, a inspeção lê apenas PID/papel/contexto. PID não é exportado no recibo.

Conexão com contexto residual ou término incerto é descartada. Recusa de sessão e indisponibilidade conservam categorias fixas sanitizadas. A rota exige `ledgerAuditVersion=1`, sessão, Origin e CSRF existentes. Origin/CSRF não substituem autorização criptográfica ou RLS. O recibo integrado é versão 3, com três controles adicionais obrigatórios.

Semântica conferida: [travas PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html) e [rollback para savepoint](https://www.postgresql.org/docs/17/sql-rollback-to.html). O rollback integral encerra a primeira trava; o adaptador não acessa registros novamente antes de readquirir autorização e proteção SQL.

## Tentativas preservadas

| Rodada local | Resultado | Diagnóstico |
|---|---|---|
| 1 | 37 PASS / 1 FAIL | Cópia local com política de produto incompleta; diagnóstico inicial agregado. |
| 2 | 37 PASS / 1 FAIL | `withCheckProductDenied=false`: constraint CHECK não comprova negação RLS 42501. |
| 3 | 41 PASS / 1 FAIL | Quatro auditorias positivas passaram; adaptador mascarava recusa concorrente como erro de banco. |
| Final | 78 PASS / 0 FAIL | Cópia local alinhada ao predicado revisado e categorias corrigidas. |

Os três JSONs de tentativa foram conservados. A política ajustada é apenas a cópia local, comparada ao instalador `database-validation.mjs`; nenhum SQL foi aplicado ao Render. A classificação corrigida mantém recusas e indisponibilidade precisas, sem mensagens privadas.

Os 78 casos incluem 11 novos controles nativos, quatro auditorias HTTP completas com coordenador HTTPS e regressões de revogação/reinício. Revogação concorrente foi observada esperando travas reais nas duas fases e produtos. Revogar ao fim da primeira fase impede a leitura seguinte. Falha online na segunda fase nunca devolve PASS. Principal/binding forjados são recusados antes das sondas. Reuso da conexão entre U1/U2 e preservação dos quatro registros foram verificados.

OIDC, cookies e contas são fixtures locais: não representam nova emissão Auth0 ou sessão real de navegador. PostgreSQL escuta somente em loopback com TLS validado. O processo foi encerrado; listener e arquivos temporários de senha/chave ficaram ausentes. Não há segredos nos recibos.

## Evidências e limites

- `session-ledger-audit-postgres17-result-20261029.json`: resultado, quatro contextos booleanos e hashes dos fontes.
- `session-ledger-audit-postgres17-attempt1/2/3-20261029.json`: tentativas falhas.
- `audit-local-oidc-fixture-evidence-20261029.json`: fixture de protocolo atual; recibo histórico anterior preservado.

Matriz hospedada da revisão `ac8a8bed`: **6 PASS / 0 FAIL / 18 BLOCKED**, incluindo persistência H02. CFT-005 existente registra as fontes e os relatos U2. A revisão do auditor requer recibos próprios após implantação. H05/H06/H08/H11–H13 não recebem PASS por equivalência local; H10 e H14–H24 mantêm seus limites, incluindo JWT/SSO isolados, retenção e corrida hospedada.

API confirmou banco sintético com `ipAllowList=[]` e coordenador suspenso. Produção, Apertaquem, credenciais, dados reais e TTL global preservados; AutoDeploy não foi habilitado.

**Único próximo passo:** publicar a revisão sanitizada e executar a rodada técnica nos dois backends de teste em nova janela temporária autorizada, sem repetir as provas de escrita concluídas. Fechar novamente as redes e suspender o coordenador ao terminar. CFT-005 ABERTO.
