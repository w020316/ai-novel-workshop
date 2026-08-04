'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project-store';
import { WorldviewGenerator } from '@/components/settings/WorldviewGenerator';
import { WorldviewEditor } from '@/components/settings/WorldviewEditor';

export default function WorldviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { currentProject } = useProjectStore();
  const [editorKey, setEditorKey] = useState(0);

  const handleGenerated = useCallback(() => {
    // 触发编辑器重新加载
    setEditorKey((k) => k + 1);
  }, []);

  if (!currentProject) {
    return null;
  }

  return (
    <div className="space-y-4">
      <WorldviewGenerator
        projectId={projectId}
        genre={currentProject.genre}
        title={currentProject.title}
        summary={currentProject.summary}
        onGenerated={handleGenerated}
      />
      <WorldviewEditor key={editorKey} projectId={projectId} />
    </div>
  );
}
