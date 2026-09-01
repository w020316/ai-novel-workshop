import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

describe('Card', () => {
  it('渲染容器并显示子内容', () => {
    render(<Card>内容</Card>);
    const card = screen.getByText('内容');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveClass('rounded-lg');
    expect(card).toHaveClass('border');
  });

  it('合并自定义 className', () => {
    render(<Card className="my-shadow">卡片</Card>);
    expect(screen.getByText('卡片')).toHaveClass('my-shadow');
  });

  it('组合渲染全部卡片子组件', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardDescription>描述文本</CardDescription>
        </CardHeader>
        <CardContent>正文内容</CardContent>
        <CardFooter>底部</CardFooter>
      </Card>
    );

    expect(screen.getByText('标题').tagName).toBe('H3');
    expect(screen.getByText('标题')).toHaveClass('text-lg');
    expect(screen.getByText('描述文本').tagName).toBe('P');
    expect(screen.getByText('描述文本')).toHaveClass('text-sm');
    expect(screen.getByText('正文内容').tagName).toBe('DIV');
    expect(screen.getByText('底部').tagName).toBe('DIV');
  });

  it('各子组件透传并合并自定义 className', () => {
    render(
      <Card>
        <CardTitle className="title-x">标题</CardTitle>
        <CardContent className="content-x">正文</CardContent>
      </Card>
    );
    expect(screen.getByText('标题')).toHaveClass('title-x');
    expect(screen.getByText('正文')).toHaveClass('content-x');
  });
});