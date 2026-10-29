# CFT-005 — Integração BFF e PostgreSQL de homologação

**Atualização — 29/10/2026, 09:36 BRT:** nova rodada em dois perfis: 52 controles HTTP PostgreSQL PASS e preservação manual dos quatro registros (revisões 3 → 4 somente na escrita própria). H03/H04/H07/H09 completos PASS, somados a H01/H02: **6 PASS, 0 FAIL, 18 BLOCKED**. [Resultado e limites](./H03-H13-RESULTADO.md). H05/H06/H08/H10–H13 ainda exigem complementos técnicos; o runner não comprova esses gates inteiros. Rede novamente fechada, health 503 esperado. Sem mudança executável/deploy. Próximo passo único: instrumentar/completar os sete gates técnicos restantes do bloco, sem repetir estes cliques manuais. CFT-005 ABERTO; os adendos abaixo são históricos.

**Atualização — 29/10/2026, 09:16 BRT:** [H01/H02 PASS por execução manual](./H01-H02-RESULTADO.md), quatro rótulos preservados em dois perfis após recarga/reabertura; intervalo informado de cerca de 11 minutos. Contrato completo: **2 PASS, 0 FAIL, 22 BLOCKED**. Quatro logins corroborados nos servidores, com um início extra sem callback em B; contadores não atestam perfis nem toda a persistência. Duas regras temporárias removidas, API vazia/painel bloqueado; health A/B 503 esperado. Sem novas escritas ou deploy. Próximo passo único: H03–H13 com nova baseline nos dois perfis. Os 52 controles PostgreSQL anteriores seguem no próprio escopo; não há homologação publicada. As seções abaixo são históricas.

## Resultado atual — 29/10/2026, 08:05 BRT: 52 controles HTTP reais PASS

**PASS na alternativa sintética BFF/PostgreSQL; CFT-005 ABERTO.** A/B executaram Authorization Code confidencial real com as duas identidades autorizadas, por seleção de conta no provedor, sem leitura de token, código OAuth, senha, cookie ou armazenamento. Cada combinação A/U1, B/U1, A/U2 e B/U2 passou **13/13**, total **52 PASS, zero FAIL e zero BLOCKED**, com `storage=postgres`. Os mesmos quatro recibos foram corroborados pela rota pública sanitizada; isso não é atestação independente.

O usuário salvou as duas redes temporárias. A API confirmou exclusivamente `74.220.49.0/24` e `74.220.57.0/24`; não foi acrescentado IP pessoal ou acesso administrativo. A versão `449d11a95739941b77b228875d36cac988066764` ficou LIVE em A (`dep-dbhhqtgm7kps73ev3i40`, 10:19:04Z) e B (`dep-dbhhquuc6qcc73ffb920`, 10:19:12Z). Antes dos logins, health 200 em ambos confirmou `ready=true` e `storage=postgres`. A prontidão do adaptador verifica papel de produto sem bypass, owner separado, RLS habilitada/forçada e conexão TLS. O endpoint externo exato usa certificado e hostname verificados; não foi reduzida essa validação.

| Grupo de controles reais | Quantidade PASS | Evidência e limite |
|---|---:|---|
| Permissões do token próprio | 8 | records:read/write validados no servidor nas quatro combinações |
| Leitura/escrita próprias | 8 | HTTP 200; consulta/UPDATE realmente alcançou o PostgreSQL |
| Outro usuário, mesmo produto | 8 | HTTP 404; marcador de execução da consulta RLS presente nos oito controles |
| Outro produto, mesma pessoa | 8 | HTTP 403 nas rotas do BFF, com a sessão válida e CSRF correto |
| JWT real do outro cliente | 8 | HTTP 401; assinatura e azp do outro cliente validados antes da recusa; sonda não acessa dados |
| Releitura própria dentro do runner | 4 | Valor sintético escrito conferido no PostgreSQL |
| Campos owner/product adicionais no corpo | 8 | HTTP 400; corpo não pode selecionar identidade ou produto |
| **Total HTTP** | **52** | Quatro recibos de 13 controles; não somar com os 44 históricos como se fosse a mesma rodada |

Além dos 52, houve **quatro conferências de preservação por sessão autenticada do proprietário**. U2 leu A/B na revisão 2 antes da prova U1 e, depois dela, confirmou valor e revisão 2 idênticos. U1 leu a revisão 2 antes de sua própria prova; ao retornar depois das tentativas U2, confirmou o valor sintético próprio e revisão 3, calculada como baseline 2 mais exatamente uma escrita própria bem-sucedida do runner. Esse segundo método confere a revisão esperada pela escrita controlada, não usa um snapshot intermediário pós-escrita. U2 também confirmou suas duas escritas próprias na revisão 3. Os quatro IDs continuam exclusivamente HML-A-U1, HML-A-U2, HML-B-U1 e HML-B-U2; não houve INSERT, seed, migração ou consulta a registro real nesta rodada.

A identificação do produto continua fixa no servidor e vinculada ao cliente OIDC validado. O owner da transação deriva somente do principal OIDC permitido. A etiqueta da URL seleciona a linha, não muda o contexto; por isso o teste negativo realmente chega à RLS. Origin/CSRF complementam a sessão e não concedem produto. A separação de grants A/B e a RLS já tinham passado em 84 controles SQL reais; esta rodada comprova a integração HTTP dessa fronteira com o principal verificado, sem usar administrador.

O plano gratuito exibiu SERVICE WAKING UP após a interrupção da execução; a rodada prosseguiu apenas com ambos os backends disponíveis. As leituras iniciais foram refeitas em sessões novas e os recibos finais são de 07:59–08:01 BRT. Uma captura de página inteira excedeu o prazo do navegador; a captura de viewport funcionou, sem alterar ou repetir controles. Nenhum desses eventos foi convertido em PASS de teste de perfis, reinício ou corrida.

**Rede fechada ao término:** as duas regras temporárias foram removidas e Block All Inbound IPs confirmado. Às 11:05:36Z (08:05:36 BRT), API com allowlist vazia e painel com bloqueio específico do banco. A regra genérica do workspace foi preservada. Depois, health A/B retornou **503/database_unavailable**, conforme a indisponibilidade esperada quando a conexão externa é fechada. Os backends de teste ficam sem acesso ao banco; isso não é falha de um produto publicado. Esta observação não substitui uma sonda TCP externa independente nem garante encerramento imediato de toda conexão antiga.

Evidências: [recibos, baselines, releituras, rede e hashes](postgres-http-real-evidence.json) e [corroboração pública dos mesmos recibos](postgres-http-server-receipts.json). SHA-256 de sete fontes/lockfile normalizadas para LF e commit implantado estão registrados; não houve novo executável ou alteração Auth0 nesta rodada. Os 60 testes locais anteriores e a auditoria então feita das 17 dependências permanecem separados, sem nova execução desnecessária. Capturas locais em `D:/Dev/cft005-evidencias/` mostram apenas recibos/estado de rede; não contêm credenciais.

**Limites consolidados:** os 44 controles BFF anteriores em memória, 84 SQL e 35 testes SPA locais ficam preservados. A matriz original continua **9 PASS, 3 BLOCKED, 2 FAIL**. Os 24 gates completos H01–H24 permanecem BLOCKED pelas dependências do contrato: a rodada usou um único perfil Chrome e alternou U1/U2; não prova perfis independentes, coordenador durável, revogação, corrida/reinício ou logout SSO isolado. Os subcontroles HTTP novos são PASS sem promover automaticamente esses gates. S12/S13 publicados continuam FAIL; esta alternativa não integra nem homologa os aplicativos publicados. Produção, Apertaquem, Supabase compartilhado, dados reais, usuários, clientes Auth0 e TTL global foram preservados.

**Único próximo passo:** executar H01/H02 em dois perfis persistentes independentes, P1/U1 e P2/U2, antes de promover os gates integrados que dependem dessa separação. Preparar a próxima janela de banco apenas quando a nova rodada estiver pronta; esta janela já está encerrada.

As seções datadas abaixo preservam tentativas e estados anteriores; não descrevem o estado atual.

## Adendo de 28/10/2026, 23:09 BRT — confirmação recebida; Save humano pendente

O usuário confirmou expressamente a liberação temporária apenas de `74.220.49.0/24` e `74.220.57.0/24`. As duas regras estão preenchidas no painel do banco novo, sem salvar. A revisão automática recusou duas vezes o clique em Save por ampliação da allowlist, alegando ausência de confirmação no momento da ação. A recusa foi preservada e não foi contornada por API, terminal ou outro canal. A API continua com allowlist vazia; o banco segue fechado externamente.

Foi concluído o trabalho independente: somente o hostname de `HML_DATABASE_URL` de A e B mudou para o endpoint externo fixo com certificado verificável, mantendo credencial, papel, banco e demais variáveis. Save only foi confirmado nos dois serviços, sem novo deploy. Os valores foram manipulados apenas em memória e nos campos protegidos, ocultados antes de qualquer observação; referências legíveis descartadas. Nenhum registro, sessão, cliente Auth0, TTL ou aplicativo publicado foi alterado.

**Único próximo passo atual:** o usuário clicar em Save nas duas regras preenchidas no painel do banco. Depois disso, conferir a allowlist, implantar somente A/B, executar U1/U2 e fechar novamente a rede externa ao fim da rodada. Os testes HTTP PostgreSQL permanecem BLOCKED; não repetir deploy enquanto a rede estiver fechada. A captura local `D:/Dev/cft005-evidencias/cft005-allowlist-pending-save-20261028.png` mostra a alteração exata pendente, sem credenciais.

## Registro anterior, 22:56 BRT

28/10/2026, 22:56 BRT. Estado: **BLOCKED no transporte interno; nenhum PASS HTTP com PostgreSQL**. Produção e Apertaquem preservados. A matriz original continua 9 PASS, 3 BLOCKED e 2 FAIL; H01–H24 continuam BLOCKED por suas dependências integrais. Os 84 controles SQL e os 44 controles históricos dos BFFs em memória permanecem válidos somente nos seus respectivos escopos.

## Preparação executada

O adaptador usa somente o banco `dpg-dbh8tghsrm7s73f4tc9g-a`, database `cft005_hml_db_teste`, papel exclusivo A/B e tabela fixa de cada produto. Não aceita administrador, destino arbitrário, parâmetros de conexão ou proprietário enviados pelo navegador. A autorização OIDC existente confere assinatura, issuer, audience, validade, escopo, subject exato e azp; somente o principal assim validado gera `set_config('cft005.owner', ..., true)` dentro de transação. O registro pedido continua sendo um parâmetro da consulta, permitindo que RLS negue o outro proprietário. Commit/rollback e liberação da conexão são obrigatórios.

Não há seed, DDL, SQL arbitrário, criação de usuário ou fallback em memória no início público. O pool mantém uma conexão por serviço, sob o limite de duas do papel. A prontidão exige papel correto sem bypass, dono separado, RLS habilitada/forçada e TLS. O diagnóstico retorna categorias fixas, sem erro bruto. A prova HTTP preparada tem 13 controles por combinação; a preservação alheia exige releitura independente pelo proprietário autorizado, sem forjar um principal no backend para obter esse resultado.

Credenciais novas A/B tiveram login real externo com certificado verificado e foram salvas somente em `HML_DATABASE_URL` do serviço correspondente. A janela externa administrativa foi fechada; API e painel confirmaram `ipAllowList=[]`. Nenhum registro foi alterado nesta configuração. O material de transferência cifrado de uso único foi excluído antes do SQL; as referências de credenciais em memória foram descartadas após o salvamento protegido. Retenção interna do provedor não foi atestada.

## Tentativas e causa comprovada

| Versão | Destino | Deploy | Resultado |
|---|---|---|---|
| 7e620506bcc23b53b0006bc894acc6d73e3d2c63 | A | dep-dbhacfgn74is73cqe2a0 | update_failed |
| 7e620506bcc23b53b0006bc894acc6d73e3d2c63 | B | dep-dbhacgifngtc73b3hnl0 | update_failed |
| f988af753aa06661cea626e64af1aeb7af33947c | A, diagnóstico fixo | dep-dbhadb142hec73bsskeg | update_failed; database_tls_validation |

A documentação atual do [Render Postgres](https://render.com/docs/postgresql-creating-connecting#ssl-modes-for-internal-connections) informa certificado autoassinado na conexão interna, sem suporte a verify-ca/verify-full. O código exige certificado verificável. Foi incorreto supor que o endpoint privado apresentaria a cadeia pública do endpoint externo. Não foram desativados TLS, validação de certificado ou verificação de identidade para liberar o deploy. A tentativa diagnóstica confirmou a classe TLS; não identifica o erro de certificado específico de B, que não recebeu essa versão.

Ambos os serviços anteriores continuam respondendo health 200, sem `storage=postgres`. São os BFFs antigos com dados em memória, não a nova integração. Nenhum login/prova HTTP foi atribuído ao PostgreSQL. Health check configurado no Render continua TCP; o novo código verifica o banco antes de abrir a porta.

Testes finais locais: **60/60 PASS**, incluindo o agrupador da suíte e oito testes do adaptador. São fixtures/mocks, não emissão Auth0 nem RLS real nesta versão. Auditoria das 17 dependências de produção/opcionais retornou zero avisos conhecidos. Os controles SQL reais anteriores não foram refeitos nem sobrescritos.

## Alternativa concreta preparada; rede ainda bloqueada

O adaptador aceita também, exclusivamente, o endpoint externo exato `dpg-dbh8tghsrm7s73f4tc9g-a.virginia-postgres.render.com`, com `rejectUnauthorized=true` e verificação de hostname. A URI protegida ainda usa o endpoint interno; não houve troca para o externo.

O menu Connect de A e B informou as mesmas redes de saída: `74.220.49.0/24` e `74.220.57.0/24`. A [documentação do Render](https://render.com/docs/outbound-ip-addresses) confirma que esses intervalos são compartilhados por serviços da região: a allowlist não identifica exclusivamente estes dois BFFs. As senhas exclusivas e os grants mínimos continuam necessários. IP dedicado pago não foi contratado.

Proposta restrita: liberar somente essas duas redes no banco sintético, mudar apenas o hostname das duas URIs protegidas para o endpoint externo verificável, implantar A/B e executar as quatro combinações U1/U2. Não liberar `0.0.0.0/0`, IP pessoal ou administrador, nem alterar outros recursos. Encerrar a liberação ao terminar a rodada, aceitando que os BFFs persistentes ficarão indisponíveis depois do fechamento. Essa mudança de acesso exige confirmação no momento da execução pelo controle do navegador e ainda não foi aplicada.

**Único próximo passo:** confirmar a liberação temporária das duas redes de saída para executar a alternativa com TLS verificável. A prova integrada e a homologação continuam BLOCKED até emissão/login e controles HTTP reais; não promover S12/S13 publicados a PASS. CFT-005 ABERTO.

Evidências sanitizadas: [integração/transporte](bff-database-integration-evidence.json), [logins exclusivos](bff-database-configuration-evidence.json) e [SQL anterior](database-real-evidence.json).
