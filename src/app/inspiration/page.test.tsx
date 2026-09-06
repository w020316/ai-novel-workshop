// ============================================================================
// 灵感页集成测试：题材选择 → 灵感卡生成（题材强绑定）→ 跳转链接题材联动
// 链路：radio 切题材 → generateTrendInspiration（真实强绑定逻辑）→ 卡片渲染 → Link href
// ============================================================================
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import InspirationPage from './page';
import { buildGenreSignature, getTrend } from '@/lib/trend/trends';

const { chatMock, toastMock, saveCardsMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  saveCardsMock: vi.fn(),
}));

vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/db/queries', () => ({
  saveInspirationCards: saveCardsMock,
  GLOBAL_PROJECT_ID: 'global',
}));
// next/link 在 jsdom 下需要 Router 上下文，测试中以普通 <a> 透传 href
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

/** 构造 chat 返回体 */
function chatResult(content: string) {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

/** 通过 label 文案点击题材 radio（结构：label > input.sr-only + span 文案） */
function selectGenre(container: HTMLElement, name: string) {
  const label = Array.from(container.querySelectorAll('label')).find(
    (l) => l.textContent === name
  );
  expect(label, `应存在题材选项 ${name}`).toBeTruthy();
  fireEvent.click(label!.querySelector('input')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom 无剪贴板：复制灵感按钮点击路径兜底
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    configurable: true,
  });
});

describe('灵感页 · 题材强绑定集成链路', () => {
  it('选仙侠题材生成：漂移卡被剔除重试后，页面仅渲染携带仙侠元素的卡', async () => {
    // 第一轮返回都市味漂移卡，第二轮（强绑定返工）返回仙侠签名词卡
    chatMock
      .mockResolvedValueOnce(
        chatResult(
          JSON.stringify({
            cards: [
              { kind: 'hook', title: '隐藏大佬', content: '开篇被轻慢，章末打脸反转' },
              { kind: 'hook', title: '重生暴富', content: '重生回到 2008 暴富' },
            ],
          })
        )
      )
      .mockResolvedValueOnce(
        chatResult(
          JSON.stringify({
            cards: [
              { kind: 'hook', title: '凡人流苟道', content: '杂役弟子身怀上古传承，靠筑基金丹一步步苟到飞升' },
              { kind: 'character', title: '夺舍重生', content: '宗门大比上灵根觉醒，前世记忆道基翻盘' },
              { kind: 'coolpoint', title: '丹器双修', content: '以丹入道兼修器符，金丹期名震一方' },
            ],
          })
        )
      );

    const { container } = render(<InspirationPage />);
    selectGenre(container, '仙侠');
    fireEvent.click(screen.getByRole('button', { name: /生成灵感/ }));

    // 等首轮有效卡出现（LLM 第二轮返工成功 → 3 张仙侠卡）
    await screen.findByText('凡人流苟道');
    // 漂移卡不渲染
    expect(screen.queryByText('隐藏大佬')).not.toBeInTheDocument();
    expect(screen.queryByText('重生暴富')).not.toBeInTheDocument();
    // 渲染的每张卡内容都命中仙侠签名词（真实校验逻辑兜底）
    const sig = buildGenreSignature(getTrend('qidian', '仙侠')!);
    const cardGrid = container.querySelector('.md\\:grid-cols-2');
    expect(cardGrid).toBeTruthy();
    const rendered = Array.from(cardGrid!.children);
    expect(rendered.length).toBe(3);
    rendered.forEach((card) => {
      const text = card.textContent ?? '';
      expect(sig.some((k) => text.includes(k))).toBe(true);
    });
  });

  it('每张卡的「以此新建小说」链接携带锁定题材 genre=仙侠 与灵感 idea', async () => {
    chatMock.mockRejectedValue(new Error('LLM 不可用')); // 走确定性题材卡兜底，题材必然锁定
    const { container } = render(<InspirationPage />);
    selectGenre(container, '仙侠');
    fireEvent.click(screen.getByRole('button', { name: /生成灵感/ }));

    await screen.findByText(/仙侠 · 起点中文网 选题方向|仙侠·凡人流苟道/);
    await waitFor(() => {
      const links = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('a[href^="/project/new?"]')
      );
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link.href).toContain(encodeURIComponent('仙侠'));
        expect(link.href).toContain('idea=');
      }
    });
  });

  it('切换到甜宠题材后生成：卡片与链接题材随之联动为甜宠', async () => {
    chatMock.mockRejectedValue(new Error('LLM 不可用'));
    const { container } = render(<InspirationPage />);
    selectGenre(container, '甜宠');
    fireEvent.click(screen.getByRole('button', { name: /生成灵感/ }));

    await waitFor(() => {
      const links = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('a[href^="/project/new?"]')
      );
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((l) => l.href.includes(encodeURIComponent('甜宠')))).toBe(true);
    });
    // 兜底卡标题含题材名（确定性卡或结构卡）
    expect(container.textContent).toContain('甜宠');
  });
});
