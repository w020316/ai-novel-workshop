// ============================================================================
// 技能导入解析器测试：frontmatter 解析 / 分类推导 / GitHub · HuggingFace URL 归一化
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  parseSkillMarkdown,
  normalizeRawUrl,
  isReservedIpv4,
  isReservedIpv6,
  isInternalHostname,
  extractHostname,
  checkUrlTarget,
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

describe('SSRF 防护：isReservedIpv4', () => {
  it.each([
    '10.0.0.1', '127.0.0.1', '192.168.1.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '100.64.0.1', '0.0.0.0',
  ])('拒绝保留段 %s', (ip) => {
    expect(isReservedIpv4(ip)).toBe(true);
  });
  it('放行公网地址', () => {
    expect(isReservedIpv4('8.8.8.8')).toBe(false);
    expect(isReservedIpv4('114.114.114.114')).toBe(false);
    expect(isReservedIpv4('1.2.3.4')).toBe(false);
  });
  it('拒绝非法八位（>255）', () => {
    expect(isReservedIpv4('10.0.0.256')).toBe(false);
  });
});

describe('SSRF 防护：isReservedIpv6', () => {
  it.each(['::1', '::', 'fe80::1', 'fc00::1', 'fd00::2', '2001:db8::1'])('拒绝保留段 %s', (ip) => {
    expect(isReservedIpv6(ip)).toBe(true);
  });
  it('放行公网 IPv6', () => {
    expect(isReservedIpv6('2606:4700::1111')).toBe(false);
  });
});

describe('SSRF 防护：isInternalHostname / extractHostname', () => {
  it('识别内部网域', () => {
    expect(isInternalHostname('localhost')).toBe(true);
    expect(isInternalHostname('foo.local')).toBe(true);
    expect(isInternalHostname('svc.internal')).toBe(true);
    expect(isInternalHostname('printer.localdomain')).toBe(true);
  });
  it('放行公网网域', () => {
    expect(isInternalHostname('raw.githubusercontent.com')).toBe(false);
    expect(isInternalHostname('huggingface.co')).toBe(false);
  });
  it('剥端口取 hostname', () => {
    expect(extractHostname('http://8.8.8.8:3000/x')).toBe('8.8.8.8');
    expect(extractHostname('not-a-url')).toBeNull();
  });
});

describe('SSRF 防护：checkUrlTarget', () => {
  it('拒绝内网 IP 字面量', () => {
    expect(checkUrlTarget('http://127.0.0.1:3000')).toContain('不允许');
    expect(checkUrlTarget('http://169.254.169.254/latest/meta-data/')).toContain('不允许');
    expect(checkUrlTarget('http://10.0.0.5/skill.md')).toContain('不允许');
  });
  it('拒绝本机/内部网域', () => {
    expect(checkUrlTarget('http://localhost:8080/SKILL.md')).toContain('不允许');
    expect(checkUrlTarget('http://db.internal/skill.md')).toContain('不允许');
  });
  it('拒绝本地 IPv6', () => {
    expect(checkUrlTarget('http://[::1]:80/skill.md')).toContain('不允许');
  });
  it('放行公网目标', () => {
    expect(checkUrlTarget('https://raw.githubusercontent.com/a/b/main/SKILL.md')).toBeNull();
    expect(checkUrlTarget('https://huggingface.co/u/s/raw/main/README.md')).toBeNull();
    expect(checkUrlTarget('https://example.com/skill')).toBeNull();
  });
  it('非法/非 http(s) URL 拒绝', () => {
    expect(checkUrlTarget('ftp://x')).toContain('仅支持');
    expect(checkUrlTarget('file:///etc/passwd')).toContain('仅支持');
    expect(checkUrlTarget('gopher://host')).toContain('仅支持');
  });
});