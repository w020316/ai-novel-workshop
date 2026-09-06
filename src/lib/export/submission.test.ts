// ============================================================================
// 投稿格式排版导出 单元测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { exportSubmission } from './submission';
import type { Chapter, NovelProject, Volume } from '@/types';

function project(over: Partial<NovelProject> = {}): NovelProject {
  return {
    id: 'p1',
    title: '测试书',
    genre: '玄幻',
    targetWords: 100000,
    status: 'drafting',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as NovelProject;
}

function chapter(no: number, title: string, content: string): Chapter {
  return {
    id: `c${no}`,
    projectId: 'p1',
    chapterNo: no,
    title,
    content,
    wordCount: content.length,
    status: 'completed',
    createdAt: 0,
    updatedAt: 0,
  } as Chapter;
}

const volumes: Volume[] = [
  { volumeNo: 1, title: '开局', chapterRange: [1, 2], summary: '', coreConflict: '' },
  { volumeNo: 2, title: '推进', chapterRange: [3, 5], summary: '', coreConflict: '' },
];

describe('lib/export/submission（投稿格式排版）', () => {
  it('书名为首行，简介随后；不含目录与分隔线等 Markdown 痕迹', () => {
    const text = exportSubmission({
      project: project({ summary: '一个扫地的故事' }),
      chapters: [chapter(1, '初入禁地', '叶尘拿起扫帚。\n天地变色。')],
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('测试书');
    expect(text).toContain('简介：一个扫地的故事');
    expect(text).not.toContain('---');
    expect(text).not.toContain('##');
    expect(text).not.toContain('目录');
  });

  it('段落首行缩进两个全角空格，段间空行', () => {
    const text = exportSubmission({
      project: project(),
      chapters: [chapter(1, '第一章名', '第一段。\n第二段。')],
    });
    expect(text).toContain('　　第一段。');
    expect(text).toContain('\n\n　　第二段。');
  });

  it('只导出已完成章并按章号升序', () => {
    const draft = { ...chapter(2, '草稿', '未完成'), status: 'pending' } as Chapter;
    const text = exportSubmission({
      project: project(),
      chapters: [chapter(3, '三章', '丙'), chapter(1, '一章', '甲'), draft],
    });
    expect(text).not.toContain('草稿');
    expect(text.indexOf('第1章 一章')).toBeLessThan(text.indexOf('第3章 三章'));
  });

  it('提供卷规划时按章节落卷插入卷标题，且每卷只出现一次', () => {
    const text = exportSubmission({
      project: project(),
      chapters: [chapter(1, '一', '甲'), chapter(2, '二', '乙'), chapter(3, '三', '丙'), chapter(4, '四', '丁')],
      volumes,
    });
    expect(text.split('第1卷 开局').length - 1).toBe(1);
    expect(text.split('第2卷 推进').length - 1).toBe(1);
    const i1 = text.indexOf('第1卷 开局');
    const i3 = text.indexOf('第3章 三');
    expect(i1).toBeLessThan(i3);
    expect(text.indexOf('第2卷 推进')).toBeLessThan(i3);
  });

  it('清理 Markdown 痕迹（标题/列表/加粗）', () => {
    const text = exportSubmission({
      project: project(),
      chapters: [chapter(1, '一', '# 标题行\n- 列表项\n**加粗词**')],
    });
    expect(text).not.toContain('# ');
    expect(text).not.toContain('- ');
    expect(text).not.toContain('**');
    expect(text).toContain('标题行');
    expect(text).toContain('列表项');
    expect(text).toContain('加粗词');
  });

  it('indent 可自定义缩进格数', () => {
    const text = exportSubmission({
      project: project(),
      chapters: [chapter(1, '一', '段落')],
      indent: 0,
    });
    expect(text).toContain('\n段落');
  });
});
