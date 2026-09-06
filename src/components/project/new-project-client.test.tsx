// ============================================================================
// 新建项目页集成测试：灵感卡跳转参数 → 自动开书 → 题材强绑定到三步向导
// 链路：?auto=1&genre=仙侠&idea=… → runGenerate → 开书包题材覆写 → ProjectForm 预填
// ============================================================================
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NewProjectClient } from './new-project-client';

const { chatMock, toastMock, pushMock, loadLiveMock, listCardsMock, toArrayMock } = vi.hoisted(
  () => ({
    chatMock: vi.fn(),
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    pushMock: vi.fn(),
    loadLiveMock: vi.fn(),
    listCardsMock: vi.fn(),
    toArrayMock: vi.fn(),
  })
);

vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));
vi.mock('@/lib/rank/store', () => ({ loadLiveRankedTitles: loadLiveMock }));
vi.mock('@/lib/db/queries', () => ({
  listInspirationCards: listCardsMock,
  GLOBAL_PROJECT_ID: 'global',
}));
vi.mock('@/lib/db/schema', () => ({
  db: { stylePresets: { toArray: () => toArrayMock() } },
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function chatResult(content: string) {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

/** 模拟灵感页「以此新建小说」跳入：写入 URL 后挂载组件 */
function mountWithInspirationLink(genre: string | null, idea: string) {
  const q = new URLSearchParams({ auto: '1', idea });
  if (genre) q.set('genre', genre);
  window.history.replaceState({}, '', `/project/new?${q.toString()}`);
  return render(<NewProjectClient />);
}

/** 断言三步向导第 1 步的题材 radio 选中状态 */
function expectGenreChecked(genre: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[type="radio"][value="${genre}"]`
  );
  expect(input, `应存在题材选项 ${genre}`).toBeTruthy();
  expect(input!.checked).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  loadLiveMock.mockResolvedValue([]);
  listCardsMock.mockResolvedValue([]);
  toArrayMock.mockResolvedValue([{ id: 'style-preset-1', name: '硬核爽文' }]);
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('灵感卡 → 新建项目 · 题材强绑定集成链路', () => {
  it('URL 携带 genre=仙侠 且 LLM 开书包误判都市 → 以仙侠为准填入向导', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          title: '灵根杂役的苟道',
          titleAlternatives: ['苟道长生'],
          genre: '都市', // LLM 误判
          summary: '杂役弟子身怀上古传承，凡人流苟到飞升。',
          goldenFinger: '前世记忆',
          mainConflict: '宗门大比',
        })
      )
    );
    mountWithInspirationLink('仙侠', '杂役弟子身怀上古传承，凡人流苟道飞升');

    // 开书包面板以仙侠展示（覆写生效）
    expect(await screen.findByText('灵根杂役的苟道')).toBeInTheDocument();
    await waitFor(() => expect(() => expectGenreChecked('仙侠')).not.toThrow());
    // 误判的都市不应成为向导题材
    const urban = document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="都市"]'
    );
    expect(urban?.checked ?? false).toBe(false);
  });

  it('LLM 不可用走启发式开书包 → genre 参数仍强绑定题材到向导', async () => {
    chatMock.mockRejectedValue(new Error('LLM 不可用'));
    mountWithInspirationLink('仙侠', '杂役弟子身怀上古传承，凡人流苟道飞升');

    // 模板兜底徽章出现
    expect(await screen.findByText('模板兜底')).toBeInTheDocument();
    await waitFor(() => expect(() => expectGenreChecked('仙侠')).not.toThrow());
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('无 genre 参数（手动输入灵感开书）→ 沿用开书包推断题材，不强行覆写', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          title: '隐藏大佬在都市',
          titleAlternatives: [],
          genre: '都市',
          summary: '落魄小子实为隐藏大佬，打脸逆袭。',
          goldenFinger: '身份反差',
          mainConflict: '阶层冲突',
        })
      )
    );
    mountWithInspirationLink(null, '落魄小子实为隐藏大佬，都市打脸逆袭');

    expect(await screen.findByText('隐藏大佬在都市')).toBeInTheDocument();
    await waitFor(() => expect(() => expectGenreChecked('都市')).not.toThrow());
  });

  it('非法 genre 参数被忽略 → 回落开书包推断题材', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          title: '星际拾荒者',
          titleAlternatives: [],
          genre: '科幻',
          summary: '末世飞船 AI 觉醒，拾荒求生。',
          goldenFinger: '飞船 AI',
          mainConflict: '资源争夺',
        })
      )
    );
    mountWithInspirationLink('不存在的题材', '末世飞船 AI 觉醒，拾荒求生');

    expect(await screen.findByText('星际拾荒者')).toBeInTheDocument();
    await waitFor(() => expect(() => expectGenreChecked('科幻')).not.toThrow());
  });
});
