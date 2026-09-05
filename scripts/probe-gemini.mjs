// Gemini 真实可用性探测：走本机代理（若设置 GEMINI_PROXY）验证 Key 与模型
// 只输出状态码与模型名，绝不输出 Key
import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const getKey = (name) => envText.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
const key = getKey('GEMINI_API_KEY');
const proxy = process.env.GEMINI_PROXY || 'http://127.0.0.1:7890';

if (!key) {
  console.error('GEMINI_API_KEY 未配置');
  process.exit(1);
}

// undici ProxyAgent 走代理
const { ProxyAgent, setGlobalDispatcher } = await import('undici');
setGlobalDispatcher(new ProxyAgent(proxy));

const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
for (const model of models) {
  const t0 = Date.now();
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '回复"OK"两个字母即可' }],
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - t0;
    if (res.ok) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? '';
      console.log(`✅ ${model} HTTP ${res.status} ${ms}ms 回复: ${content.slice(0, 20).replace(/\n/g, ' ')}`);
    } else {
      const text = await res.text();
      console.log(`❌ ${model} HTTP ${res.status} ${ms}ms ${text.slice(0, 150).replace(/\n/g, ' ')}`);
    }
  } catch (err) {
    console.log(`❌ ${model} 网络失败 ${Date.now() - t0}ms ${err.message?.slice(0, 100)}`);
  }
}
