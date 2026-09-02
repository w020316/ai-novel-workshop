'use client';

import { useParams } from 'next/navigation';
import { NameGenerator } from '@/components/settings/NameGenerator';

export default function NameSettingsPage() {
  const params = useParams<{ id: string }>();
  return <NameGenerator projectId={params.id} />;
}