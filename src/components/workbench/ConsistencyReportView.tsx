'use client';

import type { ConsistencyReport } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface ConsistencyReportViewProps {
  report: ConsistencyReport;
}

export function ConsistencyReportView({ report }: ConsistencyReportViewProps) {
  if (report.passed && report.issues.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center gap-3 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <p className="text-sm text-green-700">一致性校验通过，未发现问题</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {report.passed ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          一致性校验报告
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.issues.map((issue, i) => (
          <div
            key={i}
            className={`rounded-md border p-3 ${
              issue.severity === 'error'
                ? 'border-red-200 bg-red-50'
                : 'border-yellow-200 bg-yellow-50'
            }`}
          >
            <div className="flex items-start gap-2">
              {issue.severity === 'error' ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-stone-500">
                    {issue.type}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      issue.severity === 'error'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-yellow-100 text-yellow-600'
                    }`}
                  >
                    {issue.severity === 'error' ? '错误' : '警告'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-700">{issue.description}</p>
                <p className="mt-1 text-xs text-stone-500">建议：{issue.suggestion}</p>
                {issue.paragraphIndex !== undefined && (
                  <p className="mt-1 text-xs text-stone-400">
                    第 {issue.paragraphIndex + 1} 段
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}