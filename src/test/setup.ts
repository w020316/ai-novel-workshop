// ============================================================================
// 测试全局 setup
// ============================================================================
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每个测试后清理 DOM
afterEach(() => {
  cleanup();
});

// Mock IndexedDB（dexie 在 jsdom 中需要 fake-indexeddb）
import { default as fakeIndexedDB, IDBKeyRange } from 'fake-indexeddb';

if (typeof indexedDB === 'undefined') {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeIndexedDB,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    value: IDBKeyRange,
    writable: true,
    configurable: true,
  });
}

// Mock transformers.js（避免在测试中加载 23MB 模型）
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue({
    __call__: vi.fn(),
  }),
}));

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: MockIntersectionObserver,
  writable: true,
  configurable: true,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  value: MockResizeObserver,
  writable: true,
  configurable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
