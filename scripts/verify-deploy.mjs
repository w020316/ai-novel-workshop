// 部署验证：经本地代理抓线上页面 chunk，grep 新功能特征串（用法：node scripts/verify-deploy.mjs <path> <特征串>）
const BASE = 'https://ai-novel-workshop-o25z.vercel.app';
const [, , path = '/project/new', needle = '目标章节数'] = process.argv;
const { ProxyAgent, setGlobalDispatcher } = await import('undici');
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:7890'));

const html = await (await fetch(BASE + path)).text();
const chunks = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]);
const uniq = [...new Set(chunks)];
console.log(`page=${path} chunks=${uniq.length}`);
for (const c of uniq) {
  const res = await fetch(BASE + c);
  if (!res.ok) continue;
  const js = await res.text();
  if (js.includes(needle)) {
    console.log(`FOUND "${needle}" in ${c}`);
    process.exit(0);
  }
}
console.log(`NOT FOUND "${needle}"（部署可能未完成或特征串不在该页）`);
process.exit(1);
