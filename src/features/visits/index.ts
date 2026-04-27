export { VisitsSidebar } from "./components/VisitsSidebar";
export { VisitCard } from "./components/VisitCard";
export { NewVisitDialog } from "./components/NewVisitDialog";
export type { NewVisitFormValue } from "./components/NewVisitDialog";
export { VisitSummaryView } from "./components/VisitSummaryView";
export { groupVisitsByDate, bucketOf } from "./lib/grouping";
export { filterVisitsByQuery, normalize } from "./lib/search";
export {
  buildSectionSummary,
  countSummaryGlobals,
  groupMediaBySection,
  isSectionFullyEmpty,
  sectionHasCriticalEmpty,
  type SummaryEntry,
  type SummaryEntryStatus,
  type SummaryGlobals,
} from "./lib/summary";
export {
  listCriticalChecks,
  listEmptyCriticalPaths,
  countEmptyCriticalFields,
} from "./lib/critical-fields";

