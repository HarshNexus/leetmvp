import { Problem } from '../models/Problem';
import { SolvedProblem } from '../models/SolvedProblem';
import { Revision } from '../models/Revision';

export async function cleanupOrphanedRecords() {
  const problemIds = await Problem.distinct('_id');
  const [solved, revisions] = await Promise.all([
    SolvedProblem.deleteMany({ problemId: { $nin: problemIds } }),
    Revision.deleteMany({ problemId: { $nin: problemIds } }),
  ]);
  if (solved.deletedCount || revisions.deletedCount) console.log(`Cleaned up orphaned records: ${solved.deletedCount} solved problem(s), ${revisions.deletedCount} revision(s)`);
  return { solved: solved.deletedCount, revisions: revisions.deletedCount };
}
