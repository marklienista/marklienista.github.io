# CFT-005 — sonda técnica H05/H06/H08/H10–H13

29/10/2026. **Preparada e validada localmente; execução hospedada BLOCKED pela janela de rede fechada.** Não há novo PASS de gate real. Contrato preservado em **6 PASS, 0 FAIL, 18 BLOCKED**. Os quatro runners manuais anteriores não precisam ser repetidos.

## Implementação concreta

Somente os BFFs A/B da branch `cft005-oidc-dominios` recebem um botão adicional **Executar verificação técnica**, que chama POST `/proof/technical/run`. A rota exige sessão autenticada, verificação OIDC existente, Origin próprio e CSRF válido. O principal do provedor define o proprietário; corpo/query/cabeçalhos não escolhem produto, conta, credencial ou SQL. O produto e os destinos HTTPS continuam fixos no código. Recibos públicos separados em GET `/proof/technical/results`, até oito por backend, sem substituir os recibos de `/proof/results`.

O método de banco aceita apenas o principal já validado pelo BFF. Usa a credencial restrita e o pool existentes; nunca a credencial administrativa. Não há DDL, migração, seed, concessão de privilégio, alteração Auth0 ou consulta a registro fora dos quatro IDs sintéticos. O SQL de inspeção de catálogo tem alvos fixos nos dois schemas HML e public do banco exclusivo.

| Caso | Instrumentação preparada | Limite para o resultado real |
|---|---|---|
| H05 | Conferir a única linha própria visível e as constraints validadas de domínio U1/U2, produto, vínculo record_id/owner e chave primária | Só as quatro identidades/contextos completos e a revisão do resultado permitem concluir ausência de linhas extras; os oito corpos negados anteriores são preservados. |
| H06 | Papel exato sem privilégios/bypass/membership, TLS, dono separado, FORCE RLS; SELECT próprio/alheio, UPDATE próprio/alheio e WITH CHECK de owner/product | Toda tentativa de escrita fica em transação desfeita. UPDATE próprio sem mudança demonstra permissão antes de atribuir erro 42501 à política. Nenhum erro bruto é exportado. |
| H08 | SELECT do schema oposto, SET LOCAL ROLE do outro produto/dono e tentativa de desativar row_security | SAVEPOINT e rollback após cada tentativa, inclusive se um acesso inesperadamente funcionar; resultado inesperado vira FAIL. |
| H10 | Usar o JWT Auth0 real somente dentro do servidor em uma rota de dados, com cookie/sessão, confirmando a recusa incondicional de bearer | **JWT Supabase genuíno continua não testado**; não capturar token de aplicativo publicado. O recibo declara sharedSupabaseJwtRealTest=false. Isso impede promover H10 inteiro. |
| H11 | Leitura própria positiva sem Origin; leituras de produto incompatível com Origin ausente/forjado e CSRF válido | Exigir a categoria product_forbidden, distinta de csrf_required. Não atribuir identidade de produto ao Origin. |
| H12 | REST de dados próprio, legacy REST, GraphQL GET/POST, RPC GET/POST, Storage e Realtime HTTP; catálogo de views/foreign tables, SECURITY DEFINER, PUBLIC EXECUTE/default ACL, public e publicações | Rotas inexistentes devem chegar a not_found com sessão válida. Realtime HTTP não equivale a um handshake WebSocket; confirmar também a ausência de handler upgrade no código atual. Não promover inventário incompleto. |
| H13 | PID privado comparado em memória, antes/depois de rollback e commit, contexto vazio, sequência de principais OIDC diferentes no mesmo cliente | PID nunca integra o recibo. A segunda identidade deve informar conexão física igual e proprietário anterior diferente; conexão nova não recebe PASS de reutilização. |

As sondas de UPDATE são precedidas da conferência de ausência de triggers customizados. Falha dessa precondição impede mutações. A transação de testes é sempre desfeita; o único COMMIT da sonda é de transação READ ONLY. O registro próprio é comparado em memória antes/depois do rollback; valores, catálogo bruto e PID não são retornados.

## Defeito corrigido e validação

O adaptador anterior tentava rollback após erro, mas liberava a conexão ao pool mesmo quando o rollback também falhava. Agora `release(true)` descarta essa conexão; falhas/limpeza incerta da auditoria também descartam o cliente. Um teste específico demonstra esse caminho. Isso evita reutilização de contexto transacional incerto; não é alegação de exploração observada.

A conexão ociosa do pool passa de 30 para 120 segundos, mantendo máximo 1 por serviço, para permitir comparar U1/U2 na mesma conexão durante a sonda. Não há alteração de TTL de sessão, JWT ou refresh. Se a conexão reiniciar ou exceder esse intervalo, a igualdade não será presumida.

**69 testes locais PASS**, incluindo os nove testes do adaptador, oito da sonda técnica e a suíte de protocolo local. São fixtures/mocks, sem emissão Auth0 nova ou banco remoto nesta preparação. Foram verificados rollback, falha de rollback, descarte/reutilização, pré-condição de papel, erros sanitizados, destinos fixos, Origin ausente/forjado, autenticação/CSRF, rate limit, vínculo do principal, isolamento de recibos e ausência de segredos/PID no resultado. Não há nova dependência; versões e lock existentes preservados.

## Implantação e execução previstas

Alvos exclusivos: A `srv-dbftdpvf3r2c73bflvjg`, B `srv-dbftdt3l550s739sao1g`, My Workspace/Virginia/Free, AutoDeploy=no. Banco `dpg-dbh8tghsrm7s73f4tc9g-a` / `cft005_hml_db_teste`. Não criar outro serviço nem acessar produção/Apertaquem. Antes de implantar, conferir somente as duas redes regionais já autorizadas e disponibilidade do banco. Não implantar com a rede fechada: o startup exige banco pronto e falha de forma fechada.

Depois de LIVE e health PostgreSQL 200 nos dois serviços, o executor pode realizar novas entradas OIDC U1/U2 e usar somente a sonda técnica. H05–H13 não exigem refazer H01/H02; a separação de perfis anterior continua com sua proveniência manual. A sequência técnica pode ser feita pelo executor em um perfil conectado, alternando apenas as sessões locais de teste, sem logout central ou interferência no outro perfil. Se o provedor exigir intervenção humana, parar nesse ponto sem pedir senha por chat.

Executar A/U1 seguido de A/U2 e B/U1 seguido de B/U2, cada par com a mesma conexão ainda disponível. Ler os quatro registros ao terminar: o resultado esperado continua revisão 4 e os valores sintéticos anteriores, pois a sonda não confirma escritas. Se não houver prova da preservação, manter o critério correspondente BLOCKED. Não repetir o botão antigo Executar prova de isolamento, que faria outra escrita própria.

Registrar cada critério observado como PASS/FAIL/BLOCKED, incluindo falhas e limites, e fechar novamente a janela do banco. O transporte continua externo com certificado/hostname verificados; a tentativa interna anterior não foi reclassificada. A allowlist regional é compartilhada por serviços Render, não identificação exclusiva dos BFFs; as credenciais restritas e a autorização por cliente continuam necessárias.

**Único próximo passo para executar no banco real:** salvar temporariamente apenas `74.220.49.0/24` e `74.220.57.0/24` no painel do banco exclusivo. O controle do navegador exige confirmação no momento dessa reabertura. Após confirmar a API, implantar somente A/B e executar a nova sonda. Até lá, os gates continuam BLOCKED; CFT-005 ABERTO e publishedHomologation=NOT_GRANTED.
