import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsistencyReportView } from './ConsistencyReportView';
import type { ConsistencyReport, ConsistencyIssue } from '@/types';

function makeReport(overrides: Partial<ConsistencyReport> = {}): ConsistencyReport {
  return {
    chapterId: 'ch_1',
    passed: true,
    issues: [],
    checkedAt: Date.now(),
    ...overrides,
  };
}

function makeIssue(overrides: Partial<ConsistencyIssue> = {}): ConsistencyIssue {
  return {
    type: 'plot',
    severity: 'warning',
    description: '时间线出现矛盾',
    suggestion: '调整事件顺序',
    ...overrides,
  };
}

describe('ConsistencyReportView', () => {
  it('通过且无问题时显示通过提示', () => {
    render(<ConsistencyReportView report={makeReport()} />);
    expect(screen.getByText('一致性校验通过，未发现问题')).toBeInTheDocument();
  });

  it('有问题时渲染报告标题与问题列表', () => {
    const report = makeReport({
      passed: false,
      issues: [makeIssue({ description: '人物性格不符', suggestion: '调整描写' })],
    });
    render(<ConsistencyReportView report={report} />);
    expect(screen.getByText('一致性校验报告')).toBeInTheDocument();
    expect(screen.getByText('人物性格不符')).toBeInTheDocument();
    expect(screen.getByText(/建议：调整描写/)).toBeInTheDocument();
  });

  it('error 严重度显示"错误"，warning 显示"警告"', () => {
    const report = makeReport({
      passed: false,
      issues: [
        makeIssue({ severity: 'error', type: 'character' }),
        makeIssue({ severity: 'warning', type: 'worldview' }),
      ],
    });
    render(<ConsistencyReportView report={report} />);
    expect(screen.getByText('错误')).toBeInTheDocument();
    expect(screen.getByText('警告')).toBeInTheDocument();
  });

  it('存在 paragraphIndex 时显示段落号', () => {
    const report = makeReport({
      passed: false,
      issues: [makeIssue({ paragraphIndex: 2 })],
    });
    render(<ConsistencyReportView report={report} />);
    expect(screen.getByText('第 3 段')).toBeInTheDocument();
  });

  it('issue 显示类型标签', () => {
    const report = makeReport({
      passed: false,
      issues: [makeIssue({ type: 'foreshadowing' })],
    });
    render(<ConsistencyReportView report={report} />);
    expect(screen.getByText('foreshadowing')).toBeInTheDocument();
  });

  it('passed 为 true 但仍有 issue 时展示警告标题', () => {
    const report = makeReport({
      passed: true,
      issues: [makeIssue({ severity: 'warning', type: 'style' })],
    });
    render(<ConsistencyReportView report={report} />);
    expect(screen.getByText('一致性校验报告')).toBeInTheDocument();
    expect(screen.queryByText('一致性校验通过，未发现问题')).not.toBeInTheDocument();
    expect(screen.getByText('警告')).toBeInTheDocument();
  });
});