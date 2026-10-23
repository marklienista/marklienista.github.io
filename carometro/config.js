/*
  Configuração PÚBLICA do aplicativo Carômetro, não de cada professor.
  O responsável técnico registra UMA ÚNICA VEZ no Google Cloud:
  - um OAuth 2.0 Client ID do tipo Web application;
  - origem JavaScript autorizada https://carometro-teste.onrender.com;
  - Drive API ativada, escopo drive.file;
  - para convidados, Picker API e chave pública restrita.
  Não inserir Client Secret, credenciais do Google Drive ou tokens aqui.
  OAuth Web Client ID e Picker API key são identificadores públicos.
*/
export const CLOUD_CONFIG = Object.freeze({
  googleOAuthClientId: '',
  googlePickerApiKey: ''
});
export function isGoogleConfigured() {
  return /^\d+-[\w.-]+\.apps\.googleusercontent\.com$/.test(CLOUD_CONFIG.googleOAuthClientId);
}
