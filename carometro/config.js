/*
  Configuração PÚBLICA do aplicativo FotoCrachá, não de cada professor.
  O responsável técnico registra UMA ÚNICA VEZ no Google Cloud:
  - um OAuth 2.0 Client ID do tipo Web application;
  - origem JavaScript autorizada https://carometro-teste.onrender.com;
  - Drive API ativada, escopo drive.file;
  - para convidados, Picker API e chave pública restrita.
  Não inserir Client Secret, credenciais do Google Drive ou tokens aqui.
  OAuth Web Client ID e Picker API key são identificadores públicos.
*/
export const CLOUD_CONFIG = Object.freeze({
  googleOAuthClientId: '784125401141-t2gv5h9323bl783281qpifplse69n5ln.apps.googleusercontent.com',
  googleCloudProjectNumber: '784125401141',
  googlePickerApiKey: 'AIzaSyBfHOahmkaUOSkvXMAzskbKUqWfaFFnrJk'
});
export function isGoogleConfigured() {
  return /^\d+-[\w.-]+\.apps\.googleusercontent\.com$/.test(CLOUD_CONFIG.googleOAuthClientId);
}
