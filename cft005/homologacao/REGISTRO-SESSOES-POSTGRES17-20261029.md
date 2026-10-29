# CFT-005 — registro de sessões validado em PostgreSQL 17 isolado

29/10/2026. **38 controles finais PASS, zero FAIL**, em PostgreSQL nativo **17.11** (`server_version_num=170011`), com SQL real e logins distintos. **94 testes locais de regressão PASS**, incluindo os 24 do candidato. A evidência final é [session-ledger-postgres17-result-20261029.json](./session-ledger-postgres17-result-20261029.json). Os resultados iniciais divergentes foram preservados nos recibos `session-ledger-postgres17-attempt1/2/3-20261029.json`; não foram convertidos em PASS retroativamente.

O PostgreSQL já estava instalado em `C:/Program Files/PostgreSQL/17/bin`, fora do PATH. A preparação anterior identificou ausência dos comandos no PATH; esta rodada encontrou e utilizou a instalação existente, sem download/instalação, serviço Windows novo ou alteração de instância preexistente.

## Fronteira efetivamente executada

Foi inicializado um cluster **novo e descartável**, em pasta exclusiva `D:/Dev/cft005-evidencias/pg17-ledger-<sufixo>`, com ACL restrita ao executor. Escuta somente `127.0.0.1:57517`; TLS com certificado temporário confiado explicitamente e hostname `localhost`, validação do certificado ativa e mínimo TLS 1.2. HBA exige SCRAM e TLS; demais origens/conexões são recusadas. `fsync`, `full_page_writes` e `synchronous_commit` conferidos `on`. Chaves/credenciais de Auth0/Render não foram lidas.

A senha administrativa e a chave TLS **novas deste cluster local** precisaram de arquivos temporários protegidos para initdb/servidor; foram removidos ao final. Senhas dos três logins de ensaio e chaves Ed25519 ficaram só na memória do processo e nos verificadores SCRAM do cluster protegido. Logs de SQL e parâmetros foram desativados antes de aceitar conexões. Nenhuma senha/chave/envelope/hash de sessão foi exportada no recibo, GitHub ou CFT-005. As pastas privadas retêm o cluster parado e certificado público, não se destinam a evidência pública bruta.

O bootstrap `session-ledger/local-baseline.sql` criou do zero somente o banco local, papéis e quatro registros sintéticos equivalentes à fronteira requerida. Não importou tabelas ou dados do Render. As leituras de dados para os testes usaram o papel real A/B e seu contexto U1/U2; os acessos administrativos foram de instalação, catálogo, metadados de revogação e observação dos locks. Foram executados sem modificar texto os rascunhos `001-ledger.DRAFT.sql` e `002-rollback.DRAFT.sql`. O marcador de revisão foi fornecido somente na conexão administrativa local. Os papéis candidatos iniciaram NOLOGIN e receberam LOGIN/senhas aleatórias somente neste cluster de teste, nunca no banco hospedado.

O coordenador foi o **núcleo em processo**, usando conexões reais como `cft005_hml_coordinator`; A/B usaram conexões reais separadas como `cft005_hml_a`/`cft005_hml_b`. Não houve servidor HTTPS do coordenador, Auth0, cookies, sessão de navegador ou deploy nesta rodada. O comando de indisponibilidade foi injeção da falha no adaptador online antes do SQL, não desligamento de um serviço HTTP real. O reinício foi do servidor PostgreSQL local, não dos BFFs publicados ou candidatos hospedados.

## Resultados finais comprovados

| Bloco | Resultado observado |
| --- | --- |
| Migração | Sem marcador, recusada antes dos objetos; com marcador, SQL exato aplicado; reaplicação recusada sem reset. |
| Papéis e RLS | Três tabelas de metadados com ENABLE/FORCE RLS e dono NOLOGIN separado, sem grants PUBLIC. A/B reais sem super/bypass/create-role/create-db/replication/inherit/membership. |
| Produto e proprietário | A não lê/escreve records B e vice-versa (42501); proprietário alheio filtrado. Metadados de sessão limitados ao produto/usuário do contexto, e contexto ausente sem linhas. |
| Coluna de lock | FOR SHARE real permitido com UPDATE somente em lock_pad; tentativa de torná-la true alcançou CHECK e falhou 23514. Alterar época, revogação, inserir época, ler nonces, DELETE, DDL e SET ROLE foram negados. |
| Coordenador | Sem acesso de leitura/escrita aos records de nenhum produto e sem DDL. Nonce duplicado recusado por chave única 23505, inclusive após reinício. Comando B com sessão A negado sem avançar época. |
| Logout local | Hash de A/U1 revogado e recusado; B/U1 e A/B U2 continuaram válidos. Nova sessão A/U1 registrada com hash novo. Nenhum logout Auth0/Google. |
| Corrida A e B | Cada gravação retinha locks reais enquanto a revogação aguardava. `pg_stat_activity.wait_event_type='Lock'` e `pg_blocking_pids` comparados em memória identificaram a gravação como bloqueadora; PID não exportado. Antes de liberar, não havia ack. A gravação terminou e o comando avançou a época; sessões U1 antigas de A/B recusadas, U2 preservado. Não foi inferência por relógio ou tamanho do pool. |
| Consulta anterior à gravação | Revogação entre a autorização online e o começo do SQL foi detectada pela segunda verificação sob lock; callback de dados não executou. |
| Entrada pendente | Snapshot anterior à revogação não registrou sessão; entrada de teste nova usou a época atual. Trata-se do protocolo interno, não de callback OIDC real. |
| Indisponibilidade | Falha injetada do adaptador online recusou A/B antes de executar callbacks de dados. Limpeza real de cookie/UI e pane HTTP continuam pendentes da integração. |
| Reinício real | PostgreSQL foi parado e iniciado pelo diretório exclusivo. Época U1=6, nonce usado e dados persistiram; comando de sessão antiga e replay foram recusados. U2 continuou com época 1. Reinício normal não prova recuperação de queda de energia ou restauração de backup antigo. |
| Preservação e retirada | Leituras finais próprias: A/U1 e B/U1 revisão 5 somente pelas duas gravações positivas; A/U2/B/U2 revisão 4. Os quatro valores `synthetic-proof` permaneceram. SQL de retirada conservou épocas/nonces e retirou acesso A/B ao registro; novo login coordenador recusado 28000. Não houve DROP/DELETE/reset de época. |

O runner usa apenas destino de loopback fixo e exige marcador da pasta nova; não aceita URL de banco ou credencial hospedada. Os scripts de controle só aceitam o diretório com prefixo, sufixo e marcador exatos, iniciam processo oculto e não registram serviço Windows. Scripts e oito hashes das fontes usadas estão no recibo. O runner não faz parte do startup da aplicação nem do comando de testes padrão; sua execução é explícita.

## Divergências preservadas e correções

1. **Inicialização, antes dos controles SQL:** opção de log digitada no plural foi recusada pelo servidor; corrigida para `log_parameter_max_length`. Cluster não aceitou conexões. Chave temporária removida.
2. **Tentativas SQL 1 e 2:** 26 PASS / 1 FAIL em logout. A sessão estava bloqueada, mas `protectedTransaction` convertia a recusa tipada do coordenador em `E_LEDGER_UNAVAILABLE`. O modelo anterior só exigia que houvesse recusa e não detectava a classificação errada. Corrigido para preservar `E_LEDGER_DENIED` quando a recusa confiável contém `ledgerDenied`; falhas de disponibilidade continuam `E_LEDGER_UNAVAILABLE`. Regressões de logout e sessões antigas agora exigem a categoria exata. Não houve allow indevido, resposta HTTP real ou deploy a corrigir em produção.
3. **Tentativa SQL 3:** 32 PASS / 1 FAIL na etapa de reinício. O executor precisou encerrar manualmente apenas o PostgreSQL descartável porque o controle ficou aguardando. Esse resultado não comprova perda de durabilidade nem PASS de reinício. Foi adicionado stdin separado para o processo do servidor, limite de espera do auxiliar e diagnóstico de checkpoints; a rodada seguinte concluiu o reinício e 38/38. A herança de stdin é a explicação compatível com a correção, não uma observação de falha do PostgreSQL.
4. **Rodada final:** 38 PASS / 0 FAIL; suíte local depois da correção 94 PASS / 0 FAIL. Não somar as tentativas interrompidas como novos gates completos ou sobrescrever seu histórico.

## Encerramento e limites

Cinco pastas de cluster desta rodada conferidas: sem postmaster.pid, sem arquivo de senha inicial ou chave TLS; nenhuma escuta na porta 57517. São verificações de encerramento do ensaio, não atestação de toda a máquina. A API do Render reconfirmou `ipAllowList=[]` no banco `dpg-dbh8tghsrm7s73f4tc9g-a`. Não houve acesso SQL hospedado, migração remota, papel novo remoto, serviço/coordenador novo, deploy ou mudança em Auth0, produção, Apertaquem, usuários, dados reais ou TTL.

**Contrato HML continua 12 PASS / 0 FAIL / 12 BLOCKED**: PASS H01–H09/H11–H13, BLOCKED H10/H14–H24. **SPA original 9 PASS / 2 FAIL / 3 BLOCKED.** `sessionLedger=false` na matriz integrada: o núcleo e o SQL validados localmente ainda não são o registro integrado aos BFFs. H14–H17/H19/H24 exigem sessões OIDC e duas pessoas/perfis reais de teste no candidato integrado. H18 segue dependendo de SSO isolado; H10 de JWT Supabase genuíno em fronteira exclusivamente de teste; H20–H23 seguem nos limites registrados. `publishedHomologation=NOT_GRANTED`; **CFT-005 ABERTO**.

**Único próximo passo:** integrar o núcleo validado ao transporte HTTPS autenticado do coordenador e aos dois BFFs de teste, mantendo produção e Apertaquem preservados, antes da rodada real de navegador. Confirmar custo zero/ID do futuro serviço antes de provisioná-lo; não abrir a rede hospedada para desenvolver a integração.

Referências primárias: [PostgreSQL Windows](https://www.postgresql.org/download/windows/), [initdb 17](https://www.postgresql.org/docs/17/app-initdb.html), [TLS 17](https://www.postgresql.org/docs/17/ssl-tcp.html), [logging 17](https://www.postgresql.org/docs/17/runtime-config-logging.html) e [locks 17](https://www.postgresql.org/docs/17/explicit-locking.html). As observações desta rodada estão nos recibos locais, não são inferidas dessas páginas.
