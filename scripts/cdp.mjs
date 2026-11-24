export async function browser(port = 9321) {
  const tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const waiting = new Map();
  const listeners = new Map();
  const errors = [];
  ws.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (listeners.has(message.method)) listeners.get(message.method)(message.params);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (!waiting.has(message.id)) return;
    const {resolve, reject} = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    waiting.set(++id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
  const run = async expression => {
    const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true, userGesture:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const once = method => new Promise((resolve,reject)=>{
    const timer = setTimeout(()=>{
      listeners.delete(method);
      reject(new Error('Browser event missing: '+method));
    },3000);
    listeners.set(method,params=>{
      clearTimeout(timer);
      listeners.delete(method);
      resolve(params);
    });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  return {send, run, once, errors, close:() => ws.close()};
}
