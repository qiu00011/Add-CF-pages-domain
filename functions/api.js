// File: functions/api.js
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const body = await request.json().catch(() => ({}));

  const accountId = body.account_id;
  const action = body.action; // not used by frontend; kept for extensibility
  const projectId = body.project_id;
  const domain = body.domain;

  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing CLOUDFLARE_API_TOKEN' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Build Cloudflare API call based on provided action
  // For this minimal example, route is provided by frontend via specific endpoints in /api/...
  // We interpret path to decide operation
  let apiPath = '';
  let method = 'GET';
  let reqBody = null;

  // Interpret tail path to map to Cloudflare API
  switch (path) {
    case '/api/accounts/' + '${ACCOUNT_ID}' + '/projects': // placeholder, not used; real routing handled on frontend by separate endpoints
      break;
  }

  // Since dynamic path routing in CF Pages Functions requires explicit routes,
  // implement concrete handlers by inspecting request URL segments.
  const segments = path.split('/').filter(Boolean);
  // Expected: api, accounts, {accountId}, projects
  if (segments.length >= 4 && segments[0] === 'api' && segments[1] === 'accounts') {
    const accId = segments[2];
    if (segments[3] === 'projects') {
      // GET /api/accounts/{accountId}/projects
      apiPath = `https://api.cloudflare.com/client/v4/accounts/${accId}/pages/projects`;
      method = 'GET';
      return forward(apiPath, method, null, token);
    }
  }

  // Add domain: POST /api/accounts/{accountId}/projects/{projectId}/custom_domains
  if (segments.length === 7 && segments[0] === 'api' && segments[1] === 'accounts' && segments[3] === 'projects' && segments[5] === 'custom_domains') {
    // segments: api / accounts / {accountId} / projects / {projectId} / custom_domains
    const accId = segments[2];
    const projId = segments[4];
    apiPath = `https://api.cloudflare.com/client/v4/accounts/${accId}/pages/projects/${projId}/custom_domains`;
    method = 'POST';
    reqBody = { domain };
    return forward(apiPath, method, reqBody, token);
  }

  // Remove domain: DELETE /api/accounts/{accountId}/projects/{projectId}/custom_domains/{domain}
  if (segments.length === 8 && segments[0] === 'api' && segments[1] === 'accounts' && segments[3] === 'projects' && segments[6] === 'custom_domains') {
    const accId = segments[2];
    const projId = segments[4];
    const domain = segments[7];
    apiPath = `https://api.cloudflare.com/client/v4/accounts/${accId}/pages/projects/${projId}/custom_domains/${domain}`;
    method = 'DELETE';
    return forward(apiPath, method, null, token);
  }

  return new Response(JSON.stringify({ error: 'Unknown route' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

// Helper to proxy Cloudflare API
async function forward(url, method, body, token) {
  try {
    const resp = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await resp.json().catch(() => ({}));
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
