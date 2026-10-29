# CFT-005 — Banco criado e permissões/RLS comprovadas

28/10/2026, 21:18–21:22 BRT. **84 controles SQL reais PASS, zero FAIL**. Evidência integral sanitizada: [database-real-evidence.json](./database-real-evidence.json). A prova usa conexões PostgreSQL reais com os logins exclusivos A/B, não simulação nem troca de papel a partir do administrador para os controles de aplicação.

## Destino conferido

| Campo | Valor |
|---|---|
| Nome / ID | cft005-hml-db-teste / dpg-dbh8tghsrm7s73f4tc9g-a |
| Workspace / região | My Workspace, Primary / Virginia |
| Banco / versão | cft005_hml_db_teste / PostgreSQL 17 |
| Plano / capacidade | Free / 1 GB; autoscaling, HA e pool gerenciado desligados |
| Criação | 28/10/2026, 21:09:38 BRT — 2026-10-29T00:09:38.528462Z |
| Expiração | 27/11/2026, 21:09:38 BRT — 2026-11-28T00:09:38.528462Z |
| Estado final | Available; regras de acesso externo vazias |

A primeira criação com argumento de disco configurável foi recusada, sem criar recurso. A criação seguinte omitiu esse argumento e aceitou o plano Free com capacidade fixa. Nenhum upgrade, serviço pago, banco existente ou aplicação foi usado como substituto.

## Instalação e controles observados

O banco novo foi conferido vazio antes da instalação. Foram criados somente owner NOLOGIN, logins A/B, dois schemas privados e duas tabelas records. O administrador inicial permanece fora das credenciais de execução; somente ele pode assumir o owner para instalar/manter objetos. A/B não têm membership em qualquer papel, nem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS ou INHERIT. Seus logins reais e TLS com certificado verificado passaram.

| Grupo | Resultado real |
|---|---|
| Controle positivo | A/U1, A/U2, B/U1, B/U2: inserção, leitura e atualização próprias passaram |
| Fronteira de produto | Leitura e escrita A→B/B→A negadas com SQLSTATE 42501 por privilégios de schema/objeto |
| Separação de proprietário | Outro usuário retorna zero linhas; UPDATE alheio altera zero linhas; INSERT alheio é negado |
| WITH CHECK | Tentativas de reassociar proprietário ou produto negadas com 42501 nas quatro combinações |
| Contexto de transação | Ausente ou inválido não permite leitura; ausente não permite INSERT; após commit o contexto não persiste na conexão reutilizada |
| Escalada e DDL | SET ROLE para owner, administrador ou outro produto negado; CREATE de tabela permanente/temporária, DELETE, TRUNCATE e desativar RLS negados |
| RLS e dono separado | RLS habilitada e forçada nas duas tabelas; owner sem política também enxerga zero linhas |
| PUBLIC e superfícies SQL | Sem CONNECT/CREATE/TEMP de PUBLIC no banco, sem USAGE/CREATE de PUBLIC nos schemas; default global de EXECUTE em funções revogado para owner; não há view/RPC HML |
| Preservação | Releitura de cada proprietário confirmou exatamente seu ID, produto, valor sintético v2 e revisão 2; os quatro registros sobreviveram às negativas |

Os registros finais são HML-A-U1, HML-A-U2, HML-B-U1 e HML-B-U2, somente valores synthetic correspondentes. As escritas próprias levaram v1/revisão 1 a v2/revisão 2; negativas não alteraram linhas alheias. Testes que poderiam alterar DDL/dados inesperadamente usaram savepoint e rollback. Não foi executado DELETE de usuário ou de dado real.

Houve ajuste na configuração de privilégios padrão: revogar EXECUTE apenas por schema não remove o default global PUBLIC do PostgreSQL. O instalador agora usa a revogação global do owner; suplemento real conferiu catálogo e mais quatro controles, somados aos 80 controles iniciais. Nenhuma função de aplicação foi criada. A função temporária de instalação de credencial foi removida antes dos testes e não ficou disponível aos logins de execução.

## Credenciais e rede

O conector Render oferece SQL somente de leitura e não alcançava o banco com allowlist vazia. Uma regra temporária permitiu somente o IP administrativo indicado pelo painel. Ao final a regra foi removida e a confirmação explícita Block All Inbound IPs foi concluída. A API confirmou zero regras; nova tentativa do conector foi recusada pelo seu gate de allowlist, sem executar SQL. Isso prova configuração/recusa do conector; não houve uma sondagem TCP externa independente. Rede privada dos BFFs ainda não foi testada e não concede identidade de produto.

O ambiente bloqueou a conexão direta do navegador com EACCES e um canal local de memória com EPERM; nenhuma dessas tentativas executou SQL. A alternativa foi um cliente pg 8.23.1 no Windows com acesso de rede autorizado. Conexão administrativa foi lida do campo protegido do banco novo, em memória e sem cópia para saída. Transporte local RSA-3072/OAEP-SHA256 usou arquivo de cifra de uso único; chave privada só na memória e cifra removida antes do SQL. Os processos terminaram, as referências administrativas foram descartadas e o diretório de transferência ficou vazio. Não houve arquivo com credencial legível, captura de campo revelado ou segredo em repositório/Drive.

Senhas aleatórias A/B existiram só na memória; o banco mantém os verificadores necessários à autenticação. Nenhuma senha em texto foi enviada como instrução SQL ou salva em arquivo. O instalador exigiu log_statement=none e log_parameter_max_length_on_error=0 e usou verificador SCRAM como parâmetro de função temporária com erro fixo. Os recibos não refletem SQL bruto, parâmetros ou erros sensíveis. Isso não atesta retenção interna do provedor. As senhas de execução foram descartadas após a prova; a integração futura deverá instalar credenciais novas diretamente nos campos protegidos dos BFFs. Não usar o administrador como atalho.

Dependência pg 8.23.1 fixada, lockfile presente, scripts de instalação ignorados; consulta de auditoria dos 14 pacotes retornou zero avisos conhecidos. O avaliador de recibos manteve 22/22 verificações locais PASS; são evidências distintas da prova SQL. Os arquivos database-validation.mjs e database-admin-runner.mjs contêm somente lógica e alvos públicos, sem credenciais. O runner recusa sobrescrever a evidência existente ou repetir o suplemento concluído.

## Limites e estado consolidado

Esta prova demonstra **isolamento entre as credenciais de produto no banco novo** e RLS dentro da fronteira do backend confiável. O login de produto pode definir o contexto U1 ou U2 do seu próprio produto; esse contexto não é identidade criptográfica de usuário por si só. A integração deve derivá-lo exclusivamente do subject já validado no servidor. Não entregar a conexão PostgreSQL ao navegador, nem aceitar owner arbitrário da requisição. Sem essa integração, os resultados SQL não homologam a autorização de uma requisição web.

Nenhum BFF recebeu credencial de banco, alteração de ambiente ou deploy. Não há adaptador persistente, coordenador de revogação, novo teste de SSO, reinício de banco ou prova de retenção de logs. REST/GraphQL/Storage/Realtime não foram provisionados neste banco PostgreSQL; a ausência de views/RPC HML foi conferida no catálogo. Uma exposição futura exige nova avaliação. O plano Free continua temporário e sem backup; não usar como produção ou armazenamento após a expiração.

A matriz original continua **9 PASS, 3 BLOCKED e 2 FAIL**. Os 24 casos integrados H01–H24 continuam BLOCKED porque dependem de perfis, HTTP/identidade e adaptador/coordenador ainda ausentes; os subcontroles SQL de H06/H08/H13 foram comprovados aqui, sem convertê-los em aprovação integral. Os 44 controles reais antigos dos BFFs e os 35 testes locais SPA foram preservados. Aplicativos publicados, Supabase compartilhado, Auth0, TTL global, dados reais e Apertaquem não foram alterados. **CFT-005 ABERTO.**

**Único próximo passo:** integrar os BFFs de teste ao banco pela rede interna, com credenciais novas e exclusivas nos campos protegidos, derivar proprietário do principal OIDC validado e repetir os controles HTTP com U1/U2.
