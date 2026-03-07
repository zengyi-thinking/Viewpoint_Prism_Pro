'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { WorkbenchShell } from '@/components/workbench/WorkbenchShell';
import { projectApi, Project } from '@/services/project.api';
import { getToken } from '@/services/api';

export default function WorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    projectApi
      .get(id)
      .then(setProject)
      .catch(() => router.push('/projects'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-text-secondary" />
      </div>
    );
  }

  return <WorkbenchShell projectName={project?.name} projectId={id} />;
}

