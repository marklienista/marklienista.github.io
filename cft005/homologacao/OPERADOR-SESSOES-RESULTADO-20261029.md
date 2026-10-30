# Operador de sessões CFT-005 — resultado local

29/10/2026, horário de Brasília. Implementado e validado localmente na branch de testes. **Nenhum novo PASS hospedado**: matriz incremental continua **12 PASS / 0 FAIL / 12 BLOCKED**. A publicação/deploy e a ativação hospedada têm evidência própria; este relatório não afirma que ocorreram.

| Validação final | PASS | FAIL | Escopo |
| --- | --- | --- | --- |
| Backends | 127 | 0 | 107 regressões e 20 testes do canal/limites |
| Avaliador e revisor de corrida | 46 | 0 | Fixtures de análise de evidências |
| PostgreSQL 17.11 nativo | 98 | 0 | 78 controles anteriores e 20 novos do operador |

A primeira rodada nativa intermediária teve 94 PASS / 0 FAIL. Foi conservada em session-operator-postgres17-attempt1-20261029.json; não corresponde à fonte final. A rodada de 98 conferiu 24 hashes LF dos fontes efetivamente testados, incluindo o operador e os startups. Não somar as duas rodadas como casos novos distintos.

## Canal implementado

- Desligado por padrão. Somente HML_CONTROLLED_SESSION_PROOF=enabled-v1 ativa o operador; valor desconhecido falha. A/B usam RENDER_GIT_COMMIT para vincular mensagens à mesma fonte implantada.
- Reutiliza as chaves Ed25519 existentes dos BFFs; audiência de protocolo separada da autoridade do registro. Assinatura cobre emissor, par de destino fixo, fonte, instante, validade, nonce e ação fechada. Corpo não pode escolher usuário, SQL ou URL. Pacotes com cookie/bearer não são comandos de serviço.
- Coordenador oferece somente suas duas chaves públicas por HTTPS, quando ativado. BFF valida formato/tipo, distinção A/B e correspondência da própria chave. Sem nova credencial, grant, tabela, dependência ou cliente Auth0.
- Cada proprietário prepara explicitamente sua sessão em cada produto usando o fluxo atual autenticado, com Origin/CSRF. Somente U1 pode iniciar/logout/corrida/finalizar/abortar. Exige as quatro sessões e leituras próprias válidas; consentimento de preparação dura no máximo cinco minutos e respeita a expiração original.
- O par reserva um contexto privado de uma rodada, com lease imprevisível. Comandos de continuação exigem esse lease e nonce inédito. Nonces são memória efêmera limitada; isso não substitui a defesa durável de replay do registro nem completa H17. Reinício perde reserva/consentimentos e não autoriza reutilizar lease antigo.
- A/B conservam localmente seus cookies, tokens, CSRF, bindings e snapshots sintéticos; não enviam credenciais de sessão ao outro produto. O par devolve somente prontidão, status e igualdade/preservação. Respostas são limitadas e validadas antes de compor recibos. Não há consulta de usuários reais.
- Uma rodada ativa por produto, intervalo mínimo de 15 segundos e reserva máxima de cinco minutos. Durante a reserva, outras provas e escritas são recusadas para não contaminar a corrida. Leitura autorizada U2 e limpeza local continuam disponíveis. Origin, CORS ou JavaScript não substituem assinatura, sessão verificada ou RLS.

Esse é um canal de operação exclusivo de homologação, com capacidade deliberada de coordenar a prova entre produtos preparados. Não deve ser transposto aos aplicativos publicados nem apresentado como política de autorização de produção.

## Ordem real observada no PostgreSQL local

A corrida faz PUT pela rota HTTP normal, com valor próprio já existente e revisão +1. Um marcador privado de uso único só seleciona a instrumentação depois de autenticação, principal, produto, CSRF e RLS normais. Ele não altera SQL, proprietário ou permissões.

Depois do UPDATE, a mesma conexão continua dentro do fence. O par inicia POST /sessions/revoke com sua própria sessão U1 preparada. Uma consulta fixa retorna somente se o coordenador está efetivamente bloqueado por essa conexão de dados, usando pg_blocking_pids. Sem resultado positivo, não há aprovação por espera, fila de pool ou relógio.

O monitor tem orçamento de 750 ms; se uma consulta ficar presa, fecha o cliente e a transação é desfeita. Nenhum lock_timeout, TTL global, grant ou papel administrativo foi ampliado. O teste nativo de falha confirmou valor/revisão preservados e uma conexão física nova na operação seguinte.

Nas duas direções, a sequência observada foi: fence → UPDATE → revogação solicitada → bloqueio positivo → ausência de ack enquanto bloqueado → COMMIT da escrita → COMMIT da revogação → ack. Cookies/bindings anteriores A/B de U1 foram negados; U2 continuou válido, com valores/revisões intactos.

O recibo fica pendente até U1 entrar novamente em A/B, preparar as novas sessões e reler cada registro sob seu proprietário. Finalização verifica +1 somente na linha U1 do produto escritor e zero nas demais; nenhum dado é compensado/resetado para esconder escrita. Abort/expiração encerram só controles, mantêm BLOCKED e não tornam seguro repetir uma escrita incerta.

## O que o ensaio local não comprova

O emissor OIDC, sujeitos e cookie jars são fictícios locais. PostgreSQL e HTTPS do coordenador/carregamento de chaves foram reais, com certificado temporário validado e papéis restritos; peers BFF são HTTP em loopback mapeado pelo fixture. A implementação hospedada fixa HTTPS e validação TLS normal, mas não houve tráfego real deste operador no Render.

O servidor não reconhece por si só dois perfis de navegador: separateProfilesVerified continua false. Os recibos locais ficam em mode=fixture e BLOCKED para homologação, embora as observações técnicas tenham coincidido. Uma futura consolidação deve unir a evidência externa de perfis sem modificar ou apagar os recibos originais.

H14 e a parte de corrida/rechecagem de H15 têm canal implementado; seu PASS depende da rodada hospedada completa. H16 (pane controlada), H17 (replay exato da revogação do registro), H19 (callback real pendente) e H24 (reinício hospedado) ainda não têm toda a orquestração neste incremento. Os testes locais anteriores dessas funções são preservados; não constituem a instrumentação hospedada que falta. H18/SSO central segue isoladamente BLOCKED.

## Ativação candidata, ainda sem janela nova

Somente os três serviços sintéticos existentes e o banco cft005-hml-db-teste. Antes de ativar: publicar a fonte revisada, conferir os três deploys, manter AutoDeploy desligado e confirmar capacidade gratuita existente. Nenhum signup, upgrade ou mudança de produção.

1. Em nova janela autorizada, abrir somente as duas redes Render já delimitadas; retomar o coordenador.
2. Atualizar o coordenador com a fonte candidata e a flag explícita; conferir chaves públicas/prontidão. Só depois ativar A/B no mesmo commit; o peer recusa revisão diferente. Validar LIVE, SHA e saúde separadamente.
3. Dois perfis independentes, U1 e U2: nova entrada A/B; leitura própria e Preparar sessão para ensaio nas quatro páginas. Não clicar na prova antiga de isolamento.
4. No A/U1, Provar saída local; reentrar A/U1, preparar e Conferir ensaio após reentrada. Confirmar B/U1 e ambas U2 antes de avançar.
5. Com quatro sessões preparadas/frescas, Provar revogação concorrente em A/U1. A/B U1 antigos devem cair; U2 fica. Reentrar/preparar U1 nos dois produtos; finalizar no A. Repetir espelhando escritor B, respeitando o intervalo e os recibos.
6. Se houver interrupção, não repetir: guardar o recibo, reler sob os proprietários e usar Encerrar ensaio interrompido após reentrada/preparação U1. Não presumir se uma escrita/revogação foi confirmada.
7. Registrar somente evidência sanitizada, fechar as redes e suspender o coordenador. Desativar a flag com o mesmo código/registro se for retirar o canal; nunca voltar ao modo sem registro nem resetar épocas/nonces.

Referências primárias: [Render — commit disponível no ambiente](https://render.com/docs/environment-variables) e [PostgreSQL 17 — bloqueadores de processo](https://www.postgresql.org/docs/17/functions-info.html). As medidas de execução deste relatório vieram dos testes locais, não dessas páginas.

**Único próximo passo:** publicar o candidato revisado e executar uma janela autorizada de ativação/prova real somente nos serviços sintéticos, preservando os bloqueios restantes. **CFT-005 ABERTO; homologação publicada não concedida.**
