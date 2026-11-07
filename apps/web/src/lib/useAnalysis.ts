import { useMemo } from 'react';
import { analyseDesign, type SystemAnalysis } from '@vanvolt/engine';
import { useActiveDesign } from '../store/designStore';

/** Live analysis of the active design, recomputed on every edit. */
export function useAnalysis(): SystemAnalysis {
  const design = useActiveDesign();
  return useMemo(() => analyseDesign(design), [design]);
}
