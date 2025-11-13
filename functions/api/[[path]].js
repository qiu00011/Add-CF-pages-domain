export async function onRequest(context){
  const{request,env}=context;
  const url=new URL(request.url);
  const path=url.pathname;
  const token=env.CLOUDFLARE_API_TOKEN;
  if(!token){
    return new Response(JSON.stringify({success:false,error:'未配置 CLOUDFLARE_API_TOKEN'}),{status:500,headers:{'Content-Type':'application/json'}});
  }
  const match=path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
  if(!match){
    return new Response(JSON.stringify({success:false,error:'无效路由'}),{status:400,headers:{'Content-Type':'application/json'}});
  }
  const[,accountId,projectName,domain]=match;
  let cfApiUrl='';
  let method=request.method;
  let body=null;
  if(!projectName){
    cfApiUrl=`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
    method='GET';
  }else if(projectName&&!domain&&method==='GET'){
    cfApiUrl=`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
    method='GET';
  }else if(projectName&&!domain&&method==='POST'){
    const reqBody=await request.json();
    const domainName=reqBody.name;
    const autoDns=reqBody.auto_dns;
    cfApiUrl=`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
    const addResp=await fetch(cfApiUrl,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name:domainName})});
    const addData=await addResp.json();
    if(autoDns&&addData.success){
      const parts=domainName.split('.');
      const parentDomain=parts.slice(-2).join('.');
      const zonesResp=await fetch(`https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,{headers:{'Authorization':`Bearer ${token}`}});
      const zonesData=await zonesResp.json();
      if(zonesData.success&&zonesData.result?.length>0){
        const zoneId=zonesData.result[0].id;
        const dnsResp=await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({type:'CNAME',name:domainName,content:`${projectName}.pages.dev`,proxied:true})});
        const dnsData=await dnsResp.json();
        addData.dns_created=dnsData.success;
      }
    }
    return new Response(JSON.stringify(addData),{status:addResp.status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  }else if(projectName&&domain&&method==='DELETE'){
    cfApiUrl=`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains/${domain}`;
    method='DELETE';
  }
  if(!cfApiUrl){
    return new Response(JSON.stringify({success:false,error:'无效操作'}),{status:400,headers:{'Content-Type':'application/json'}});
  }
  try{
    const cfResponse=await fetch(cfApiUrl,{method,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const data=await cfResponse.json();
    return new Response(JSON.stringify(data),{status:cfResponse.status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  }catch(error){
    return new Response(JSON.stringify({success:false,error:error.message}),{status:500,headers:{'Content-Type':'application/json'}});
  }
}
