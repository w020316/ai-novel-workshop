// ============================================================================
// ESLint Flat 扁平配置（ESLint v9）
// 依据：`next lint` 已弃用（Next 16 将移除），迁移到标准 ESLint CLI。
// 方式：用 FlatCompat 兼容既有 next/core-web-vitals + next/typescript 规则集。
// ============================================================================
import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'coverage/**',
      'public/**',
      'next-env.d.ts',
      'eslint.config.mjs',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];