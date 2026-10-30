# Prova controlada de sessões — preparação de 29/10/2026

**Adendo posterior:** o [operador de logout/corrida foi implementado e validado localmente](./OPERADOR-SESSOES-RESULTADO-20261029.md), desligado por padrão. Os itens abaixo registram a preparação anterior; pane, replay exato da revogação, callback pendente e reinício hospedado ainda exigem seus complementos. Não há novo PASS real nem janela aberta por esse adendo.

**Preparação local; nenhuma rodada hospedada nesta etapa.** Matriz incremental preservada: **12 PASS / 0 FAIL / 12 BLOCKED**. CFT-005 ABERTO. O auditor hospedado continua a002037; os arquivos desta preparação não são importados pelo startup A/B/coordenador.

A API foi consultada: banco cft005-hml-db-teste com ipAllowList=[]; coordenador cft005-session-ledger-teste suspenso. Não abrir rede nem pedir novas entradas enquanto a instrumentação protegida abaixo não estiver implementada e revisada.

## O que falta para executar

O código integrado já executa logout/revogação, e o ensaio local integrated-postgres-proof.mjs já demonstrou uma corrida com PostgreSQL e HTTPS locais. Os pontos de pausa e o acesso aos cookie jars daquele fixture não são mecanismos de operação hospedada. Não transplantar cookies, envelopes assinados ou chaves para o computador, navegador, arquivos ou logs.

Falta um adaptador de operador no servidor que produza a evidência abaixo. Sua ausência é um bloqueio técnico concreto, não uma autorização para simular resultados. O pacote atual prepara o protocolo e um revisor offline da ordem dos eventos; não contém esse adaptador, rota pública de pausa nem alteração de runtime.

## Fronteira do adaptador a implementar

- Somente os backends A/B e coordenador CFT-005 já existentes; destinos fixos, protocolo de serviço assinado e validado, sem nova API administrativa genérica, SQL arbitrário, alvo/usuário/URL escolhido pelo navegador.
- Ativação explícita de teste, desligada por padrão. A entrada de operador exige sessão U1 verificada do produto, Origin e CSRF válidos, escopo de execução fixo e limite de uma rodada ativa. Origin/CSRF são defesa complementar; não dão identidade nem autoridade de produto.
- Requer quatro sessões novas: A/U1, B/U1, A/U2, B/U2, em dois perfis independentes. Usar apenas as contas já autorizadas e seus vínculos configurados. Não listar usuários ou criar/resetar senha.
- Referências a sessões anteriores, tokens e ao comando de replay ficam apenas em memória nos serviços que já os possuem. Nunca devolver segredo, hash de sessão, PID, época absoluta, nonce, assinatura, corpo OAuth ou erro bruto. Somente rótulos A/B/U1/U2, status, igualdade/diferença e ordem lógica verificada podem sair.
- Pausa fixa no fluxo normal de dados, depois do fence e antes de COMMIT, apenas na escrita própria U1. Requisição HTTP real usa a rota existente. Não usar conexão/consulta privilegiada nem uma operação solta depois de liberar o lock. Não alterar TTL, grant, RLS, chave ou pool para fazer o teste passar.
- Espera de barreira limitada a 750 ms, inferior ao lock_timeout=1500 ms existente. Timeout/cold start, falta de papel observável ou estado incerto: liberar no finally, interromper a rodada, registrar BLOCKED e conferir linhas. Não aumentar timeout ou repetir escrita automaticamente. A adequação do limite precisa ser validada na integração do adaptador antes da implantação.
- A observação de bloqueio deve correlacionar o revogador esperando no lock retido pela própria conexão de dados (por exemplo, pg_blocking_pids, reduzido internamente a boolean). Não basta Promise pendente, fila do pool, sleep ou horário de relógios de máquinas diferentes. Sem visibilidade com os papéis restritos atuais, BLOCKED; não conceder pg_monitor/administrador.
- O controlador ordena respostas e sinais causais recebidos. write_commit_confirmed vem da conclusão do COMMIT na conexão normal, revocation_commit_confirmed do coordenador, e só depois vem revocation_ack_received. Um timestamp no navegador não comprova commit.
- Todo recurso de pausa é interno e tem liberação em finally, inclusive após cancelamento. Comandos assinados de resultado incerto não são repetidos como se tivessem falhado. Nenhum switch de URL/header deve desativar autenticação, autorização, TLS, assinatura ou revogação.

## Sequência e critérios de parada

| Etapa | Execução preparada | Evidência exigida |
| --- | --- | --- |
| Preflight | Conferir commits/hashes e quatro sessões/leituras próprias frescas. | Identidades distintas, perfis separados, dados sintéticos e quatro linhas atuais. Não reutilizar uma baseline expirada. |
| H14 | Sair somente de A/U1; conferir A/U1, B/U1 e ambas U2. Reentrar A/U1 pelo fluxo normal. | A 401; B/U1 e A/B U2 200, dados preservados e logout central não chamado. |
| H15, corrida A | Gravação HTTP própria A/U1 entra no fence; revogação em B/U1 é iniciada durante a trava; observar bloqueio positivo, liberar a escrita e conferir COMMIT → COMMIT de revogação → ack. | Sessões U1 anteriores A/B 401; U2 200. Época avançou exatamente uma vez, binding anterior negado, escrita própria confirmada uma vez, demais linhas preservadas. |
| H15, corrida B | Recriar baseline U1 válida e repetir espelhando gravação B/U1 e revogação A/U1. | Mesmos critérios, recibo distinto e mesma versão implantada. Uma direção não representa a outra. |
| H17 | Repetir internamente o comando exato de revogação ainda válido; variar assinatura/emissor/destino e alvo incompatível com o binding U1 em sondas fixas separadas. | Negação pelo motivo esperado, não por expiração; replay não afeta sessão nova nem U2. Nenhum comando legítimo de revogação U2 é emitido. |
| H19 | Testar sessão/binding anteriores e bearer anterior, entrada iniciada antes da revogação e entrada nova depois dela. | Antigos negados; callback antigo não registra sessão; novo login cria binding na época atual. Não inventar refresh grant nos BFFs. |
| H16 | Após baseline nova, indisponibilizar somente o coordenador; testar GET/PUT e revogação protegidos. Limpeza local e recuperação. | Recusas sem cache/ack de sucesso; limpeza local possível com durabilidade não confirmada; recuperação conserva U2/linhas. Health 503 ou fechamento de rede, isoladamente, não satisfaz H16. |
| H24 | Reiniciar coordenador e BFFs em etapas, sem reiniciar/restaurar o banco; validar bindings antigos, nova entrada e ambas as corridas. | Revogação persistente, sessões antigas negadas, linhas persistentes e privilégios separados. Perda do mapa local após restart, sozinha, não prova epoch durável. |
| Fechamento | Liberar barreiras; conferir quatro linhas sob os proprietários; retirar redes temporárias e suspender coordenador. | API [], estado suspended e novas conexões recusadas após a ociosidade necessária. Conexões existentes podem sobreviver à retirada da ACL. |

A ordem exata H17/H19 deve permitir a prova de replay ainda dentro dos 30 segundos do envelope. Se os logins excederem a validade, não renovar/alterar o envelope capturado: marcar esse replay BLOCKED. Refazer exige nova rodada controlada explicitamente identificada, sem ocultar a tentativa anterior.

A entrada pendente de H19 exige ponto de controle depois da validação OIDC e antes do registro, com identidade já verificada e limite de tempo. Não consumir/capturar um código OAuth no executor para simular callback. Sem esse ponto implementado, o subcaso permanece BLOCKED.

## Dados e contabilização

Ler antes: somente HML-A-U1, HML-B-U1, HML-A-U2 e HML-B-U2, por seus respectivos proprietários. Última baseline conhecida é U1 A/B revisão 6, U2 A/B revisão 5; são expectativas históricas até novas leituras.

As duas corridas planejadas usam a rota HTTP normal com o mesmo valor sintético e revisão incrementada pelo código existente. Se cada corrida confirmar uma única escrita, a expectativa relativa é +1 na linha U1 do respectivo produto e zero nas U2; não fixar revisões absolutas sem baseline nova. Uma tentativa com resultado incerto pode já ter confirmado a escrita: interromper e reconciliar, sem repetir nem ajustar contador para coincidir.

Toda preservação alheia exige releitura pelo outro proprietário. As checagens devem usar os mesmos papéis restritos e TLS validado. Não usar consultas administrativas para ler as quatro linhas de uma vez nem consultar qualquer outro registro.

## Revisor da corrida e limites

session-race-receipt.mjs aceita somente esquema fechado de rótulos, fonte, booleanos, status HTTP, eventos enumerados e índices lógicos sequenciais. Campos extras, privados, repetidos ou malformados são rejeitados com erro fixo sem refletir entrada.

Exige fence, escrita iniciada, revogação solicitada, bloqueio positivo, ausência de ack durante lock, commit de escrita, commit de revogação, ack e conferências finais. Com evidência completa, um ack observado antes do commit falha; falta de evento não é preenchida por inferência. Uma sequência incompleta fica BLOCKED. Fixture sempre fica BLOCKED. Duas direções exigem recibos distintos e mesma fonte.

O revisor aceita observações declaradas pelo executor: não autentica o autor e não atesta execução real. Um recibo fabricado pode mentir sobre sinais; é obrigatório ligá-los à instrumentação revisada, aos commits implantados e às leituras independentes. Mesmo duas corridas PASS não promovem automaticamente H15/H24 nem a matriz completa. Usar depois o avaliador existente, somente com todos os critérios de cada gate.

Validação local: node --test cft005/homologacao/evaluate.test.mjs cft005/homologacao/session-race-receipt.test.mjs. São testes de análise de evidência, não logins/SQL/concorrência hospedados.

## Bloqueios separados e próximo passo

H18 continua BLOCKED por SSO exclusivo ausente: nenhum logout Auth0/Google compartilhado. H10 continua dependente de JWT Supabase genuíno exclusivo de teste. H20–H23 permanecem com seus critérios próprios. Não atribuir PASS aos aplicativos publicados ou ao Apertaquem.

**Único próximo passo:** implementar e validar localmente o adaptador de operador descrito acima, antes de propor nova publicação, deploy ou janela de rede. Sem esse canal, não pedir ao usuário para repetir logins/provas antigas.

Referências primárias conferidas em 29/10/2026: [bloqueios PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html) e [SELECT/locks PostgreSQL 17](https://www.postgresql.org/docs/17/sql-select.html). Os locks pertencem à transação; FOR SHARE conflita com o avanço de época protegido por FOR UPDATE. A prova proposta ainda precisa observar esse conflito no hospedado.
