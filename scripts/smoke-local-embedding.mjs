// 冒烟验证：public/models 本地 embedding 资源完整性（禁用远程强制走本地）
import { pipeline, env } from '@xenova/transformers';

env.localModelPath = './public/models/';
env.allowRemoteModels = false;

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
  quantized: true,
});
const out = await extractor('少年在杂役房发现一枚神秘古鼎', {
  pooling: 'mean',
  normalize: true,
});
console.log('OK dim =', out.data.length, 'sample =', Array.from(out.data.slice(0, 3)).map((v) => v.toFixed(4)).join(', '));
