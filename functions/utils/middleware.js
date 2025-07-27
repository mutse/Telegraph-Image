import sentryPlugin from "@cloudflare/pages-plugin-sentry";
import '@sentry/tracing';

export async function errorHandling(context) {
  const env = context.env;
  if (typeof env.disable_telemetry == "undefined" || env.disable_telemetry == null || env.disable_telemetry == "") {
    context.data.telemetry = true;
    let remoteSampleRate = 0.001;
    try {
      const sampleRate = await fetchSampleRate(context)
      console.log("sampleRate", sampleRate);
      //check if the sample rate is not null
      if (sampleRate) {
        remoteSampleRate = sampleRate;
      }
    } catch (e) { console.log(e) }
    const sampleRate = env.sampleRate || remoteSampleRate;
    console.log("sampleRate", sampleRate);
    return sentryPlugin({
      dsn: "https://219f636ac7bde5edab2c3e16885cb535@o4507041519108096.ingest.us.sentry.io/4507541492727808",
      tracesSampleRate: sampleRate,
    })(context);
  }
  return context.next();
}

export function telemetryData(context) {
  const env = context.env;
  if (typeof env.disable_telemetry == "undefined" || env.disable_telemetry == null || env.disable_telemetry == "") {
    try {
      const parsedHeaders = {};
      context.request.headers.forEach((value, key) => {
        parsedHeaders[key] = value
        //check if the value is empty
        if (value.length > 0) {
          context.data.sentry.setTag(key, value);
        }
      });
      const CF = JSON.parse(JSON.stringify(context.request.cf));
      const parsedCF = {};
      for (const key in CF) {
        if (typeof CF[key] == "object") {
          parsedCF[key] = JSON.stringify(CF[key]);
        } else {
          parsedCF[key] = CF[key];
          if (CF[key].length > 0) {
            context.data.sentry.setTag(key, CF[key]);
          }
        }
      }
      const data = {
        headers: parsedHeaders,
        cf: parsedCF,
        url: context.request.url,
        method: context.request.method,
        redirect: context.request.redirect,
      }
      //get the url path
      const urlPath = new URL(context.request.url).pathname;
      const hostname = new URL(context.request.url).hostname;
      context.data.sentry.setTag("path", urlPath);
      context.data.sentry.setTag("url", data.url);
      context.data.sentry.setTag("method", context.request.method);
      context.data.sentry.setTag("redirect", context.request.redirect);
      context.data.sentry.setContext("request", data);
      const transaction = context.data.sentry.startTransaction({ name: `${context.request.method} ${hostname}` });
      //add the transaction to the context
      context.data.transaction = transaction;
      return context.next();
    } catch (e) {
      console.log(e);
    } finally {
      if (context.data.transaction) {
        context.data.transaction.finish();
      }
    }
  }
  return context.next();
}

export async function traceData(context, span, op, name) {
  const data = context.data
  if (data.telemetry) {
    if (span) {
      console.log("span finish")
      span.finish();
    } else {
      console.log("span start")
      span = await context.data.transaction.startChild(
        { op: op, name: name },
      );
    }
  }
}

export async function requireAuth(context) {
  const { request, env } = context;
  
  const validUsername = env.UPLOAD_USERNAME;
  const validPassword = env.UPLOAD_PASSWORD;
  
  if (!validUsername || !validPassword) {
    console.error('UPLOAD_USERNAME or UPLOAD_PASSWORD not configured');
    return new Response('Server configuration error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  // Try Basic Auth first
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');
    
    if (username === validUsername && password === validPassword) {
      return null; // Authentication successful
    }
  }
  
  // Try form data authentication (for file uploads)
  try {
    const clonedRequest = request.clone();
    const formData = await clonedRequest.formData();
    const username = formData.get('username');
    const password = formData.get('password');
    
    if (username === validUsername && password === validPassword) {
      return null; // Authentication successful
    }
  } catch (error) {
    // If formData parsing fails, continue to authentication failure
  }
  
  return new Response(JSON.stringify({ 
    error: 'Authentication required',
    message: 'Please provide valid username and password'
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function fetchSampleRate(context) {
  const data = context.data
  if (data.telemetry) {
    const url = "https://frozen-sentinel.pages.dev/signal/sampleRate.json";
    const response = await fetch(url);
    const json = await response.json();
    return json.rate;
  }
}