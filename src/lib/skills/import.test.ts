// ============================================================================
// 技能导入解析器测试：frontmatter 解析 / 分类推导 / GitHub · HuggingFace URL 归一化
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  parseSkillMarkdown,
  normalizeRawUrl,
} from './import';

describe('parseFrontmatter', () => {
  it('解析 YAML frontmatter 与正文', () => {
    const { fields, body } = parseFrontmatter(
      '---\nname: 冷叙述\nversion: 1.0\ndescription: 克制风格\n---\n\n正文开始'
    );
    expect(fields.name).toBe('冷叙述');
    expect(fields.version).toBe('1.0');
    expect(fields.description).toBe('克制风格');
    expect(body).toContain('正文开始');
  });
  it('无 frontmatter 时返回原正文', () => {
    const { fields, body } = parseFrontmatter('只有一段正文');
    expect(Object.keys(fields)).toHaveLength(0);
    expect(body).toBe('只有一段正文');
  });
});

describe('parseSkillMarkdown', () => {
  it('根据名称推导文风类', () => {
    const d = parseSkillMarkdown('# 冷峻文风\n\n要求克制', 'fallback', 'https://x.com/a.md', 'web');
    expect(d.category).toBe('style');
  });
  it('根据名称推导钩子类', () => {
    const d = parseSkillMarkdown('开篇钩子技巧', 'fallback');
    expect(d.category).toBe('hook');
  });
  it('无名称时使用兜底名', () => {
    const d = parseSkillMarkdown('随便的正文', 'SKILL');
    expect(d.name).toBe('SKILL');
  });
  it('保留 frontmatter 的 title 为名称', () => {
    const d = parseSkillMarkdown('---\ntitle: 黄金三章\n---\n\n正文', 'fallback');
    expect(d.name).toBe('黄金三章');
  });
});

describe('normalizeRawUrl', () => {
  it('GitHub blob → raw 直链', () => {
    expect(normalizeRawUrl('https://github.com/foo/bar/blob/main/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/foo/bar/main/SKILL.md'
    );
  });
  it('GitHub 仓库首页 → null（由 API 层尝试常见路径）', () => {
    expect(normalizeRawUrl('https://github.com/foo/bar')).toBeNull();
  });
  it('HuggingFace blob → raw 直链', () => {
    expect(normalizeRawUrl('https://huggingface.co/spaces/user/space/blob/main/README.md')).toBe(
      'https://huggingface.co/spaces/user/space/raw/main/README.md'
    );
  });
  it('md 直链原样返回', () => {
    expect(normalizeRawUrl('https://example.com/a.md')).toBe('https://example.com/a.md');
  });
  it('网页 URL 原样返回', () => {
    expect(normalizeRawUrl('https://example.com/course')).toBe('https://example.com/course');
  });
});