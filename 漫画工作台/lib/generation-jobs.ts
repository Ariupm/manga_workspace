export type GenerationJobState = {
  id: string;
  shotId: number;
  projectId?: number;
  persistentJobId?: number;
  status: "queued" | "running" | "completed" | "failed";
  error?: string;
  createdAt: number;
  finishedAt?: number;
};

const globalJobs = globalThis as typeof globalThis & {
  __comicGenerationJobs?: Map<string, GenerationJobState>;
};

const jobs = globalJobs.__comicGenerationJobs ?? new Map<string, GenerationJobState>();
globalJobs.__comicGenerationJobs = jobs;

export function createGenerationJob(id: string, shotId: number, projectId?: number, persistentJobId?:number) {
  const job: GenerationJobState = {id, shotId, projectId, persistentJobId, status:"queued", createdAt:Date.now()};
  jobs.set(id,job);
  return job;
}

export function updateGenerationJob(id: string, patch: Partial<GenerationJobState>) {
  const current=jobs.get(id);
  if(current)jobs.set(id,{...current,...patch});
}

export function getGenerationJob(id: string) {
  return jobs.get(id);
}

export function cleanupGenerationJobs() {
  const cutoff=Date.now()-60*60*1000;
  for(const [id,job] of jobs)if((job.finishedAt??job.createdAt)<cutoff)jobs.delete(id);
}
