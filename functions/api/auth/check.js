// 认证已禁用，总是返回已认证状态
export async function onRequest(context) {
  return new Response(JSON.stringify({ 
    authenticated: true,
    message: 'Authentication disabled - always authenticated'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
} 