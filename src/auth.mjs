const REGION = import.meta.env.VITE_COGNITO_REGION || (import.meta.env.VITE_COGNITO_USER_POOL_ID || '').split('_')[0];
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

export const authConfigured = Boolean(REGION && USER_POOL_ID && CLIENT_ID);

async function cognito(target, payload) {
  if (!authConfigured) throw new Error('ยังไม่ได้ตั้งค่า Cognito ในตัวแปร VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID และ VITE_COGNITO_CLIENT_ID');
  const response = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method:'POST',
    headers:{'content-type':'application/x-amz-json-1.1','x-amz-target':`AWSCognitoIdentityProviderService.${target}`},
    body:JSON.stringify(payload)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.message || data.Message || 'Cognito request failed');
  return data;
}

export async function registerAccount(email, password) {
  return cognito('SignUp',{ClientId:CLIENT_ID,Username:email,Password:password,UserAttributes:[{Name:'email',Value:email}]});
}
export async function confirmAccount(email, code) {
  return cognito('ConfirmSignUp',{ClientId:CLIENT_ID,Username:email,ConfirmationCode:code});
}
export async function signIn(email, password) {
  const result = await cognito('InitiateAuth',{AuthFlow:'USER_PASSWORD_AUTH',ClientId:CLIENT_ID,AuthParameters:{USERNAME:email,PASSWORD:password}});
  if (!result.AuthenticationResult?.IdToken) throw new Error('เข้าสู่ระบบไม่สำเร็จ: ไม่ได้รับ ID token');
  return {idToken:result.AuthenticationResult.IdToken,accessToken:result.AuthenticationResult.AccessToken,refreshToken:result.AuthenticationResult.RefreshToken || ''};
}
export async function refreshSession(session) {
  if (!session?.refreshToken) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
  const result = await cognito('InitiateAuth',{AuthFlow:'REFRESH_TOKEN_AUTH',ClientId:CLIENT_ID,AuthParameters:{REFRESH_TOKEN:session.refreshToken}});
  if (!result.AuthenticationResult?.IdToken) throw new Error('ต่ออายุเซสชันไม่สำเร็จ');
  return {...session,idToken:result.AuthenticationResult.IdToken,accessToken:result.AuthenticationResult.AccessToken};
}
export function tokenExpired(token) {
  try { const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); return !payload.exp || payload.exp*1000 < Date.now()+60000; }
  catch { return true; }
}
