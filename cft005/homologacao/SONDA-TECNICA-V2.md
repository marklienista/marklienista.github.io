# Sonda técnica — versão 2

29/10/2026. As quatro execuções da versão 1 tiveram 48 controles PASS cada, com reutilização física entre U1/U2 nos dois BFFs e leituras U2 preservadas na revisão 4. Os recibos dessa rodada serão preservados no relatório final; não são prova do critério novo abaixo.

Antes de atribuir a recusa 42501 do WITH CHECK à RLS, a versão 2 exige comprovar `has_table_privilege(UPDATE)` e `has_column_privilege(UPDATE)` nas colunas record_id, owner_label e product. Se faltar a permissão, a sonda para antes das mutações e não marca negação de RLS como PASS. Isso reforça a precisão do teste; nenhum grant ou política foi alterado. Há teste de regressão contra falso PASS por privilégio de coluna ausente.

**70 testes locais PASS**, sem nova dependência. Recibos técnicos passam a version=2 e incluem DB-withCheckColumnsWritable. Repetir somente as sondas técnicas afetadas nos backends A/B, dentro da mesma janela temporária autorizada. Nenhuma repetição dos runners antigos que confirmam escrita própria é necessária. As matrizes reais e os limites publicados não são promovidos por testes locais.
