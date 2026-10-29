# CFT-005 — registro durável de sessões: candidato preparado

29/10/2026. **Preparação local; sem migração, implantação, novo serviço ou abertura de rede.** O candidato está em `../oidc-backends/session-ledger/`, separado do caminho executado por `start.mjs`, `backend.mjs` e `record-store.mjs`. A única alteração no pacote ativo é incluir os testes candidatos no comando de testes. Nenhuma dependência foi acrescentada.

**Resultado:** 24 testes novos PASS; suíte BFF completa 94 PASS (70 anteriores + 24 novos), zero FAIL. Testes criptográficos usam Ed25519 real com chaves efêmeras somente na memória. Os testes transacionais usam um modelo determinístico de SQL/bloqueios, **não PostgreSQL**, e não comprovam RLS, durabilidade física, reinício do serviço, HTTPS ou concorrência no banco hospedado. Não há PostgreSQL, psql ou Docker disponíveis nesta sessão. Nenhum gate real foi promovido.

Contrato integrado permanece **12 PASS, 0 FAIL, 12 BLOCKED**: PASS H01–H09/H11–H13; BLOCKED H10/H14–H24. Matriz original S01–S14 preservada: 9 PASS, 2 FAIL, 3 BLOCKED. `publishedHomologation=NOT_GRANTED`; **CFT-005 ABERTO**. Os 196 controles reais v2, quatro registros na revisão 4 e evidências anteriores continuam históricos, sem repetição nesta preparação.

## Decisão e fronteiras

O registro proposto guarda apenas metadados HML: produto A/B, rótulo sintético U1/U2, época monotônica, expiração, indicador de revogação, hash SHA-256 de identificador opaco de 256 bits e nonces de comandos de serviço. Não guarda e-mail, subject Auth0, senha, código OAuth, cookie bruto, CSRF, access/ID/refresh token ou Client Secret. O hash tem separação de domínio por produto; não aceita ser usado como cookie ou criar uma sessão.

Tokens e a associação do cookie com o contexto OIDC continuam somente na memória do BFF. Reiniciar o BFF exige nova entrada e não recupera sessões antigas do banco. Reiniciar o coordenador deve conservar épocas e nonces no PostgreSQL. Esta escolha oferece persistência da **revogação**, não restauração de login após reinício. Não acrescenta refresh grants e não muda os 900 segundos máximos atuais da sessão nem TTL do emissor.

Um coordenador HML separado verificará comandos A/B. O endereço **proposto, ainda inexistente e não contatado**, é `https://cft005-session-ledger-teste.onrender.com/v1/command`. Antes de criá-lo, confirmar disponibilidade de serviço gratuito em My Workspace/Virginia e registrar o ID exato; se exigir pagamento, manter o provisionamento BLOCKED. Nenhuma criação/contratação está embutida no código candidato. O coordenador terá somente a credencial restrita de metadados, sem privilégios de leitura/escrita em `cft005_hml_a.records` ou `cft005_hml_b.records`.

Cada BFF terá uma chave privada Ed25519 diferente em campo protegido; coordenador terá somente as duas chaves públicas fixadas. Nenhuma chave de desenvolvimento foi criada/salva para uso real. A/B não receberão credenciais do coordenador nem de administrador. A assinatura vincula versão, emissor A/B, audiência exclusiva, URL de destino exata, método POST, caminho fixo, corpo estrito, nonce aleatório de 256 bits, emissão e validade máxima de 30 segundos. Transporte deverá validar TLS, proibir redirecionamentos e URL variável, limitar tamanho/tempo e recusar campos extras. Origin/CORS/JavaScript não concedem autorização. O adaptador HTTP ainda não está implementado: o núcleo não abre sockets nem presume que uma chamada local prove HTTPS.

## Fluxos preparados

1. **Entrada:** antes de redirecionar ao Auth0, enviar o comando `snapshot` assinado e receber pelo canal TLS fixo do coordenador as épocas U1/U2. Guardar a resposta somente na transação OIDC do servidor, junto de state/nonce/PKCE. No callback único validado, derivar U1/U2 do subject já autorizado; gerar um novo cookie opaco e registrar seu hash com a época capturada e expiração limitada também pelo JWT. Registrar exige época atual igual à capturada. Entrada iniciada antes de uma revogação é recusada, sem tentar atualizar sua época silenciosamente. A operação INSERT não usa UPSERT: hash antigo nunca é reativado. Nenhum bearer, hash de sessão ou corpo do navegador cria login.
2. **Toda operação protegida:** a sessão em memória identifica produto, proprietário, hash e época; chamar `authorize` online uma vez por requisição, sem cache positivo. Coordenador indisponível recusa antes de SQL de dados. Depois abrir **uma única transação READ COMMITTED** com a credencial de A/B; validar identidade do login/TLS, aplicar proprietário via `set_config(..., true)`, bloquear época e sessão com `FOR SHARE`, verificar vínculo/expiração/revogação e executar o SQL fixo de dados **na mesma conexão**. Manter os bloqueios até COMMIT/ROLLBACK. Responder dados apenas depois do commit. O callback do adaptador é interno e não pode abrir outra conexão, fazer efeito externo ou executar SQL recebido do navegador.
3. **Sair deste produto:** o comando `logout` comprova sessão/produto e marca somente aquele hash revogado, sob bloqueio exclusivo da sessão. A outra sessão/produto/U2 continuam. O BFF sempre pode apagar sua memória e cookie, mesmo com coordenador indisponível; nesse caso informar apenas limpeza local, sem alegar confirmação durável. A rota e a interface atuais ainda não foram alteradas.
4. **Encerrar sessões HML do usuário:** `revoke` exige sessão atual válida do próprio emissor/proprietário, usa `FOR UPDATE` da época e incrementa exatamente uma unidade. Uma operação de dados que já retém `FOR SHARE` termina antes do comando; operações posteriores verificam a nova época. A ordem é sempre época → sessão → dados. O reconhecimento só é entregue depois de COMMIT com `synchronous_commit=on`; falha/resultado desconhecido não gera sucesso. U2 tem linha de época diferente. Não é logout do Auth0/Google.
5. **Replay/reinício:** INSERT de `(issuer, nonce)` na mesma transação da ação, com chave primária. Duplicata é recusada; expiração volta a ser conferida pelo relógio do banco após esperas. Não reexecutar comando de resultado incerto como se tivesse falhado definitivamente: consultar estado com nova sessão/fluxo válido. Conexão com COMMIT incerto ou ROLLBACK falho é destruída. Epoca antiga não é reduzida nem reutilizada após reinício.

O lock escolhido é `FOR SHARE`, **não `FOR KEY SHARE`**: este último não impediria uma atualização comum da época. A consulta de época seguida de gravação fora da mesma transação permanece proibida. A linearização é do acesso SQL; não se promete retirar bytes de uma resposta de leitura já concluída antes da revogação. Timeouts encerram a operação sem allow ou reconhecimento positivo em cache.

## Alterações administrativas candidatas, não aplicadas

Destino exclusivo: `dpg-dbh8tghsrm7s73f4tc9g-a`, banco `cft005_hml_db_teste`, Free/Virginia, validade atual até 28/11/2026 às 00:09:38 UTC. A durabilidade proposta depende da vida desse banco; não é backup, recuperação contra restauração de snapshot antigo ou solução permanente de produção.

`001-ledger.DRAFT.sql` exige destino correto, tabelas sintéticas existentes, ausência dos objetos novos e marcador explícito de revisão antes de criar qualquer coisa. O marcador é trava operacional, **não credencial/autorização de segurança**. O script não é chamado pela aplicação. Novos objetos propostos:

| Objeto | Papel e privilégios propostos |
| --- | --- |
| `cft005_hml_session_owner` | NOLOGIN, dono separado, sem super/bypass/create-role/create-db/replication/inherit. Membership apenas do executor administrativo revisado. |
| `cft005_hml_coordinator` | Inicialmente NOLOGIN, conexão máxima 2, nenhum membership. Futuro login/segredo somente após revisão; SELECT metadados, INSERT sessões/nonces, UPDATE apenas época ou indicador revogado. Sem DDL, DELETE ou dados dos produtos. |
| `cft005_hml_auth.epochs` | Duas linhas U1/U2, contador crescente. A/B só SELECT no contexto e UPDATE da coluna neutra `lock_pad`, que tem CHECK exigindo false. |
| `cft005_hml_auth.sessions` | Metadados limitados por produto do papel DB e rótulo validado. A/B não inserem nem alteram binding/época/expiração/revogação. UPDATE só de `lock_pad`. |
| `cft005_hml_auth.nonces` | Acesso somente do coordenador; PK de emissor/nonce contra replay. Sem acesso A/B/PUBLIC. |

As três tabelas terão ENABLE + FORCE RLS. PostgreSQL exige UPDATE em pelo menos uma coluna para locks de linha; `lock_pad` existe somente para isso, sem conceder alteração de autoridade. Sua efetividade, as políticas SELECT/UPDATE e os erros corretos precisam ser testados em **PostgreSQL 17 real**. O contexto `cft005.owner` continua vindo exclusivamente do principal verificado no BFF; ele não é prova criptográfica de usuário quando alguém já possui a credencial SQL. A credencial de A não alcança dados B; comprometimento do BFF A ou de seu papel SQL continua dentro da fronteira confiável de A. Não ampliar essa alegação.

Nenhum grant de dados existente muda; sem SECURITY DEFINER, função, trigger, view, publication ou role compartilhada de administrador. EXECUTE PUBLIC de futuras funções do novo dono é revogado **globalmente para esse novo dono**, pois REVOKE só por schema não remove o padrão global. A sonda técnica atual espera exatamente duas tabelas privadas: a futura instalação exige inventário explícito das três novas tabelas e repetição de H06/H08/H12/H13, sem trocar a contagem cegamente por cinco ou invalidar evidências históricas.

Retenção candidata: nenhum purge automático e nenhuma permissão DELETE nesta primeira rodada curta. Épocas nunca são removidas/reinicializadas. Nonces e sessões expiradas ficam até a retirada revisada do ensaio; limitar a janela e volume de chamadas e medir ocupação antes de ampliar. Uma política de manutenção durável, backup/restauração e retenção externa continua pendente, vinculada a H23. Não exportar linhas/assinaturas/envelopes/hash de sessão para documentação ou logs.

`002-rollback.DRAFT.sql` é **retirada segura**, não reset da autoridade: exige parar os serviços candidatos, drenar conexões e invalidar cookies antes; revoga acessos runtime e desabilita login do coordenador, conservando épocas/nonces/sessões. Não usa DROP/CASCADE/DELETE/TRUNCATE. Não voltar à versão só em memória com sessões antigas, pois isso reabriria sessões revogadas. Retirada deve falhar fechado; NOLOGIN/ACL de rede não encerram por si sós conexões existentes.

## Rodada real preparada e ainda BLOCKED

Antes da instalação: revisar estes grants/SQL em PostgreSQL 17 isolado, preparar HTTP fixo autenticado e integração completa em A/B; aprovar ficha com IDs, custo zero, chaves públicas e hashes. Não abrir rede para desenvolver ou obter segredos. Em uma janela futura já preparada, somente redes temporárias aprovadas e apenas este banco; fechar novamente e considerar conexões existentes conforme a prova de 13:36/13:40 já registrada.

| Gate | Sequência real e evidência sanitizada exigidas |
| --- | --- |
| H14 | Dois perfis U1/U2; confirmar quatro sessões novas e leituras próprias. Logout somente A/U1: A 401, B/U1 200, A/B U2 200, mesmo registro/valor/revisão. Recibo sem cookie/hash/token. |
| H15 | Reentrar A/U1. Prender uma gravação sintética controlada antes do commit, iniciar revogação e provar que ainda não houve ack; liberar a gravação e então observar commit → ack. Após ack, A/B U1 antigos 401; U2 200 e preservado. Guardar apenas ordem/booleans, nunca identificadores de sessão. |
| H16 | Parar somente o coordenador de teste antes de uma nova requisição. Leitura/escrita protegidas recusadas, sem cache positivo/ack; limpeza local ainda possível. Restaurar e confirmar estado persistente sem mudar produção. |
| H17 | Assinatura ausente/alterada, outro cliente, URL/método/corpo errados e replay do mesmo comando de serviço: negar. Novo login após revogação não é revogado por replay; U2 preservado. Executar no servidor; não copiar envelopes ao navegador/documento. |
| H19 | Cookie anterior, época anterior e bearer anterior não criam/restauram sessão. Entrada OIDC iniciada antes da revogação falha; entrada nova validada registra hash novo na época atual. Não salvar nem ler cookie/token para executar: usar sonda servidor com recibo sanitizado. |
| H24 | Reiniciar coordenador e BFFs candidatos; não restaurar DB nem resetar épocas. Revogação permanece; BFF exige login novo. Repetir corrida real nos dois produtos e conferência independente dos quatro registros; negar papel SQL cruzado. |
| H18 | Continua separadamente BLOCKED: não existe fronteira SSO isolada comprovada. Não executar logout central/federado no tenant compartilhado. Registro HML não satisfaz este gate. |

Os pontos de pausa/falha/replay do ensaio precisam de canal de operador isolado e desativado na configuração normal. Não adicionar query string, rota pública sem autenticação ou chave de administração no navegador. Antes/depois de qualquer escrita positiva, registrar as quatro leituras sob seus respectivos proprietários; mutação negativa deve ser desfeita e preservação comprovada pelo outro perfil. Os IDs continuam somente HML-A-U1/HML-B-U1/HML-A-U2/HML-B-U2.

## Verificação desta preparação e próximo passo

API Render consultada somente para metadados: `ipAllowList=[]`; nenhum acesso SQL ou ao navegador, nenhuma leitura de credenciais, nenhuma mudança externa. Documentos/código somente na branch `cft005-oidc-dominios`. O recibo `session-ledger-preparation-20261029.json` identifica hashes, escopo local, resultados e bloqueios; não se passa por recibo de execução H14–H24.

**Único próximo passo:** validar a migração candidata e seus privilégios em uma instância PostgreSQL 17 isolada, antes de integrar/implantar o coordenador e os BFFs. Não reabrir a rede do banco hospedado nesta etapa. H10 e a homologação publicada permanecem bloqueados nas condições já registradas.

## Referências primárias verificadas em 29/10/2026

- [PostgreSQL 17 — bloqueios explícitos](https://www.postgresql.org/docs/17/explicit-locking.html): conflitos e retenção dos locks por transação.
- [PostgreSQL 17 — SELECT](https://www.postgresql.org/docs/17/sql-select.html): UPDATE exigido para locks de linha.
- [PostgreSQL 17 — RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html): políticas e cautela com leituras de autorização concorrentes.
- [PostgreSQL 17 — GRANT](https://www.postgresql.org/docs/17/sql-grant.html) e [privilégios padrão](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html): coluna neutra e alcance global dos defaults.
- [Node.js — crypto](https://nodejs.org/api/crypto.html): assinatura/verificação Ed25519 com algoritmo nulo. Biblioteca nativa, sem dependência adicional.
