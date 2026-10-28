# Repetir o teste de persistência e vencimento local

Use o Chrome habitual e somente U1, a identidade Google de teste já autorizada. Este roteiro não reinicia o projeto, não altera prazos do provedor e não depende de U2.

1. Abra as duas páginas e espere ambas mostrarem **Backend isolado de teste**. O Render gratuito pode levar algum tempo para iniciar; uma tela de carregamento ainda não é falha de autenticação.
   - A: https://cft005-bff-a-teste.onrender.com/
   - B: https://cft005-bff-b-teste.onrender.com/
2. Na página A, clique **Entrar** e use U1. Se o Auth0 já reconhecer a identidade, a volta pode ser automática. Confirme **Produto A · U1**, anote o horário dessa entrada e clique **Executar prova de isolamento**. O resultado esperado é PASS, 11 verificações.
3. Recarregue a página A. Depois feche somente essa aba e reabra seu endereço inicial acima. Ela deve continuar como U1. Durante esta rodada, não clique Entrar novamente nem feche todo o navegador: uma nova entrada muda o início da contagem.
4. Cerca de cinco minutos após a entrada A, clique **Entrar** na página B. Confirme **Produto B · U1**, anote esse horário e execute a prova. Deixe as duas páginas abertas.
5. Ao completar dezesseis minutos desde a entrada A, recarregue o endereço inicial A, sem clicar Entrar. O esperado é **Sem sessão local**. Recarregue B: enquanto ainda não tiverem passado quinze minutos desde sua própria entrada, deve continuar **Produto B · U1**. Execute a prova B; o esperado é PASS, 11 verificações.

Se B também já passou de quinze minutos, essa comparação perdeu a janela de observação; registre o limite e repita a rodada, sem mudar os prazos. Registre apenas mensagens, horários, produto e resultado. Não copie senhas, tokens, códigos OAuth ou parâmetros de autenticação.

O resultado comprova a sessão **local dos backends de teste**. Não equivale à expiração do access token Auth0, refresh Supabase, logout central ou isolamento da arquitetura publicada. O CFT-005 continua aberto até homologar os requisitos pendentes.
