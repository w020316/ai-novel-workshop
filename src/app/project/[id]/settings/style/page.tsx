'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project-store';
import { StyleSampleUploader } from '@/components/settings/StyleSampleUploader';
import { StyleSelector } from '@/components/settings/StyleSelector';

export default function StylePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { currentProject, refreshCurrentProject } = useProjectStore();
  const [selectorKey, setSelectorKey] = useState(0);

  const refreshSelector = useCallback(() => {
    setSelectorKey((k) => k + 1);
    void refreshCurrentProject();
  }, [refreshCurrentProject]);

  if (!currentProject) return null;

  return (
    <div className="space-y-4">
      <StyleSampleUploader projectId={projectId} onSaved={refreshSelector} />
      <StyleSelector
        key={selectorKey}
        projectId={projectId}
        currentStylePresetId={currentProject.stylePresetId}
        onSelected={refreshSelector}
      />
    </div>
  );
}
