import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryBrowser } from './MemoryBrowser';
import * as queries from '@/lib/db/queries';
import type {
  Worldview,
  Character,
  Outline,
  Foreshadowing,
  ChapterSummary,
} from '@/types';

vi.mock('@/lib/db/queries', () => ({
  getWorldview: vi.fn(),
  listCharacters: vi.fn(),
  getOutline: vi.fn(),
  listForeshadowings: vi.fn(),
  listChapterSummaries: vi.fn(),
}));

function mockWorldview(overrides: Partial<Worldview> = {}): Worldview {
  return {
    id: 'wv_1',
    projectId: 'proj_1',
    worldStructure: '独立位面',
    powerSystem: '灵力体系',
    geography: '',
    era: '架空历史',
    factions: '帝国',
    rules: ['禁止飞行'],
    locked: true,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char_1',
    projectId: 'proj_1',
    name: '林晓',
    role: 'protagonist',
    appearance: '',
    personality: '坚韧冷静',
    catchphrase: '',
    background: '',
    motivation: '',
    weakness: '',
    growthArc: '',
    relationships: [],
    speechStyle: '',
    behaviorPattern: '',
    locked: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockOutline(overrides: Partial<Outline> = {}): Outline {
  return {
    id: 'out_1',
    projectId: 'proj_1',
    volumes: [{ volumeNo: 1, title: '第一卷', summary: '', chapterRange: [1, 10], coreConflict: '' }],
    mainPlotline: '主角逆袭',
    climaxNodes: [],
    ending: '圆满结局',
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockForeshadowing(overrides: Partial<Foreshadowing> = {}): Foreshadowing {
  return {
    id: 'fh_1',
    projectId: 'proj_1',
    description: '神秘玉佩',
    setupChapter: 3,
    importance: 'high',
    status: 'planted',
    relatedCharacters: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function mockSummary(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  return {
    id: 'sum_1',
    projectId: 'proj_1',
    chapterId: 'ch_1',
    chapterNo: 1,
    volumeNo: 1,
    summary: '第一章剧情摘要',
    keyEvents: ['相遇'],
    characterStates: {},
    embedding: new Float32Array([1, 2, 3]),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('MemoryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queries.getWorldview).mockResolvedValue(undefined);
    vi.mocked(queries.listCharacters).mockResolvedValue([]);
    vi.mocked(queries.getOutline).mockResolvedValue(undefined);
    vi.mocked(queries.listForeshadowings).mockResolvedValue([]);
    vi.mocked(queries.listChapterSummaries).mockResolvedValue([]);
  });

  it('加载数据期间显示 loading，解析后渲染内容', async () => {
    let resolveWorldview!: (v: Worldview | undefined) => void;
    vi.mocked(queries.getWorldview).mockReturnValue(
      new Promise((r) => { resolveWorldview = r; })
    );
    render(<MemoryBrowser projectId="proj_1" />);
    // 查询未完成时处于 loading，不渲染世界观内容
    expect(screen.queryByText('世界观')).not.toBeInTheDocument();

    resolveWorldview(mockWorldview());
    await waitFor(() => {
      expect(screen.getByText('世界观')).toBeInTheDocument();
    });
  });

  it('加载完成后渲染长期记忆内容', async () => {
    vi.mocked(queries.getWorldview).mockResolvedValue(mockWorldview());
    vi.mocked(queries.listCharacters).mockResolvedValue([mockCharacter()]);
    vi.mocked(queries.getOutline).mockResolvedValue(mockOutline());
    vi.mocked(queries.listForeshadowings).mockResolvedValue([mockForeshadowing()]);

    render(<MemoryBrowser projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText('世界观')).toBeInTheDocument();
    });

    expect(screen.getByText(/独立位面/)).toBeInTheDocument();
    expect(screen.getByText(/灵力体系/)).toBeInTheDocument();
    expect(screen.getByText(/禁止飞行/)).toBeInTheDocument();
    expect(screen.getByText('已锁定')).toBeInTheDocument();
    expect(screen.getByText('林晓')).toBeInTheDocument();
    expect(screen.getByText('主角')).toBeInTheDocument();
    expect(screen.getByText(/主角逆袭/)).toBeInTheDocument();
    expect(screen.getByText('神秘玉佩')).toBeInTheDocument();
  });

  it('空数据时显示未设置/暂无提示', async () => {
    render(<MemoryBrowser projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('尚未设置世界观')).toBeInTheDocument();
    });
    expect(screen.getByText('暂无人物')).toBeInTheDocument();
    expect(screen.getByText('尚未设置大纲')).toBeInTheDocument();
    expect(screen.getByText('暂无伏笔')).toBeInTheDocument();
  });

  it('切换中期记忆 tab 显示章节摘要', async () => {
    vi.mocked(queries.listChapterSummaries).mockResolvedValue([mockSummary()]);
    render(<MemoryBrowser projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('世界观')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('中期记忆'));
    expect(screen.getByText('第一章剧情摘要')).toBeInTheDocument();
    expect(screen.getByText('第 1 章')).toBeInTheDocument();
    expect(screen.getByText('相遇')).toBeInTheDocument();
  });

  it('默认显示长期记忆 tab', async () => {
    render(<MemoryBrowser projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('世界观')).toBeInTheDocument();
    });
    expect(screen.queryByText('章节摘要')).not.toBeInTheDocument();
  });
});