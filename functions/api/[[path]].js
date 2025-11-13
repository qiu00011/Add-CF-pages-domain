export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 从请求头获取配置
  const accountId = request.headers.get('X-Account-Id');
  const apiToken = request.headers.get('X-Api-Token') || env.CLOUDFLARE_API_TOKEN;
  
  if (!apiToken) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '未配置 API Token' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const match = path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
  
  if (!match) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '无效的路由' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const [, accountIdFromPath, projectName, domain] = match;
  const finalAccountId = accountId || accountIdFromPath;
  
  let cfApiUrl = '';
  let method = request.method;
  let body = null;

  if (!projectName) {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects`;
    method = 'GET';
  } 
  else if (projectName && !domain && method === 'GET') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects/${projectName}/domains`;
    method = 'GET';
  }
  else if (projectName && !domain && method === 'POST') {
    const requestBody = await request.json();
    const domainName = requestBody.name;
    const createDns = requestBody.create_dns;
    
    // 先添加域名到 Pages
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects/${projectName}/domains`;
    method = 'POST';
    body = { name: domainName };
    
    const addDomainResponse = await fetch(cfApiUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const domainResult = await addDomainResponse.json();
    
    // 如果需要创建 DNS 记录
    if (createDns && domainResult.success) {
      const parentDomain = domainName.split('.').slice(-2).join('.');
      const subdomain = domainName.split('.').slice(0, -2).join('.');
      
      // 获取 Zone ID
      const zonesResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,
        {
          headers: { 'Authorization': `Bearer ${apiToken}` }
        }
      );
      const zonesData = await zonesResponse.json();
      
      if (zonesData.success && zonesData.result.length > 0) {
        const zoneId = zonesData.result[0].id;
        const pagesUrl = `${projectName}.pages.dev`;
        
        // 创建 CNAME 记录
        const dnsResponse = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'CNAME',
              name: domainName,
              content: pagesUrl,
              proxied: true
            })
          }
        );
        
        const dnsResult = await dnsResponse.json();
        domainResult.dns_record_created = dnsResult.success;
        domainResult.dns_details = dnsResult;
      }
    }
    
    return new Response(JSON.stringify(domainResult), {
      status: addDomainResponse.status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  else if (projectName && domain && method === 'DELETE') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects/${projectName}/domains/${domain}`;
    method = 'DELETE';
  }

  if (!cfApiUrl) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '无效操作' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const cfResponse = await fetch(cfApiUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await cfResponse.json();
    
    return new Response(JSON.stringify(data), {
      status: cfResponse.status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
