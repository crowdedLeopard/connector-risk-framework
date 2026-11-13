// Gets a Dataverse access token for a Microsoft Entra service principal, with no dependencies.
//
// Two ways to prove the app's identity, in order of preference:
//   1. Workload identity federation from GitHub Actions. No secret is stored anywhere: the job asks
//      GitHub for an OIDC token and exchanges it with Entra ID. Needs `permissions: id-token: write`
//      and a federated credential on the app registration (see powerplatform/docs/DEPLOY.md).
//   2. A client secret in AZURE_CLIENT_SECRET, for running the sync from a workstation.

const AUTHORITY = process.env.AZURE_AUTHORITY_HOST ?? "https://login.microsoftonline.com";

async function githubOidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return null;
  const response = await fetch(`${url}&audience=api://AzureADTokenExchange`, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: HTTP ${response.status}`);
  return (await response.json()).value;
}

/**
 * Returns a function that yields a valid token, refreshing it five minutes before it expires.
 * @param {{tenantId: string, clientId: string, clientSecret?: string, resource: string}} options
 */
export function tokenProvider({ tenantId, clientId, clientSecret, resource }) {
  let cached = null;
  return async () => {
    if (cached && cached.expires > Date.now() + 5 * 60 * 1000) return cached.token;
    const form = new URLSearchParams({
      client_id: clientId,
      grant_type: "client_credentials",
      scope: `${resource.replace(/\/$/, "")}/.default`,
    });
    const assertion = clientSecret ? null : await githubOidcToken();
    if (clientSecret) form.set("client_secret", clientSecret);
    else if (assertion) {
      form.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
      form.set("client_assertion", assertion);
    } else {
      throw new Error("No credential: set AZURE_CLIENT_SECRET, or run in GitHub Actions with id-token: write.");
    }
    const response = await fetch(`${AUTHORITY}/${tenantId}/oauth2/v2.0/token`, { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(`Token request failed: ${body.error_description ?? body.error ?? response.status}`);
    cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return cached.token;
  };
}
