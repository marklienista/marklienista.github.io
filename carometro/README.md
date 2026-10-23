# Carômetro — integração Google Drive (laboratório 0.9)

Aplicação de testes: https://carometro-teste.onrender.com  
Fonte atual: GitHub `marklienista/marklienista.github.io`, branch isolada `carometro-lab-002`, diretório `carometro/`.  
Condutor: https://docs.google.com/document/d/1JSY62EjOjDT73UchbGdGqq3VdD5zs4eQ2UU6PRnb92k/edit

## Experiência para a pessoa que utiliza

A tela **Configurações** exibe somente **nome da escola e logotipo**. A pessoa clica em **Conectar ao Google Drive**, escolhe sua conta na janela do Google e autoriza o escopo limitado `drive.file`. Não precisa de Client ID, chave de API, projeto Google Cloud ou acesso ao painel técnico.

## Configuração única do aplicativo — responsável técnico

**Estado em 23/10/2026:** Marcelo forneceu um Client ID OAuth Web público e o número de projeto `784125401141`, que foram registrados na configuração técnica `config.js`. O botão está habilitado para solicitar acesso por janela Google (escolha de conta), mas **a autorização real ainda não foi comprovada**: a configuração de origem, audiência, usuários de teste, escopo e Drive API no Google Cloud não é verificável nesta sessão. A Google Picker API key ainda não foi fornecida; portanto a seleção assistida de arquivos compartilhados continua indisponível. Não cadastrar imagens ou informações reais de estudantes neste estágio.

1. Em https://console.cloud.google.com/ selecione ou crie um **projeto de teste** com nome Carômetro. Não contratar plano sem avaliação.
2. Em **APIs e serviços → Biblioteca**, habilite **Google Drive API**. Para o seletor de arquivo compartilhado, habilite também **Google Picker API**.
3. Em **Google Auth Platform → Branding/Audience**, configure o aplicativo **Carômetro**, audiência **External** (se usar Gmail comum), contato responsável e usuários de teste adultos, mantendo o projeto em **Testing** durante a homologação.
4. Em **Google Auth Platform → Data Access**, inclua o escopo `https://www.googleapis.com/auth/drive.file`, sem habilitar escopos amplos `drive` ou `drive.readonly`.
5. Em **Google Auth Platform → Clients**, crie um **OAuth 2.0 Client ID** do tipo **Web application**, com **Authorized JavaScript origins** exatamente `https://carometro-teste.onrender.com`. O modelo de token JavaScript não exige redirect URI no aplicativo.
6. **Concluído no código:** os campos `googleOAuthClientId` e `googleCloudProjectNumber` do arquivo **`carometro/config.js`** já receberam os valores públicos. Não enviar nem incluir `client_secret` no frontend. Confira no Google Cloud se o client pertence mesmo a esse projeto e se a origem autorizada está exata.
7. Se desejar habilitar **Google Picker** para convidados, crie uma API key pública e restrinja por **HTTP referrers** e à **Google Picker API**. A documentação do Google também exige incluir `https://docs.google.com/*` ao restringir sites porque o seletor roda em iframe. Essa chave ainda não foi fornecida. Depois, coloque-a no `googlePickerApiKey` do mesmo arquivo, sem usá-la para autenticar dados privados; o código do Picker já passa `setAppId(googleCloudProjectNumber)` exigido pelo escopo `drive.file`.
8. Publique exclusivamente o serviço Render **`carometro-teste`**, com autoDeploy desligado. Teste primeiro login da conta Google cadastrada como testadora, depois criação de pasta, fotos fictícias, reabertura e convite de uma segunda conta adulta. Com Picker API key configurada, teste escolha de arquivos, permissões de leitura/edição/retirada e isolamento entre contas. Um deploy sem erro não valida OAuth.

Não copiar tokens OAuth do ChatGPT Google Drive, de outros aplicativos nem secrets do Supabase. O Google autoriza cada usuário, e o navegador mantém o access token apenas em memória.

## Limites

- **Conta Marcelo Santos** e o SSO da arquitetura A (CFT-005) não se tornam automáticos ao autenticar no Google Drive.
- O escopo `drive.file` permite usar arquivos do app e selecionados no Google Picker, não ler o Drive inteiro.
- Pasta compartilhada não equivale automaticamente a acesso via API de todos os arquivos por cada colaborador: exige teste integrado por usuário.
- Não marcar essa integração como homologada antes da prova real em duas contas e fotos fictícias.
- A versão publicada é técnica, não lançamento.

## Referências oficiais

- OAuth Web client: https://developers.google.com/workspace/guides/create-credentials
- Modelo de token: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Escopo Drive `drive.file`: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Picker: https://developers.google.com/workspace/drive/picker/guides/web-picker
