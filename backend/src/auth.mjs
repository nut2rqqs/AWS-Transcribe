export function getAuthenticatedUserId(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims
    || event?.requestContext?.authorizer?.claims
    || {};
  const subject = claims.sub;
  return typeof subject === 'string' && subject.length > 0 ? subject : null;
}
