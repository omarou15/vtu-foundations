/**
 * VTU — LLM module (It. 10)
 * Barrel export.
 */

export type {
  AiCustomField,
  AiFieldPatch,
  ContextBundle,
  ConversationalResult,
  DescribeMediaResult,
  ExtractResult,
  LlmErrorCode,
  LlmMode,
  ProviderMeta,
  RouterDecision,
} from "./types";
export { LlmError } from "./types";

export { routeMessage } from "./router";
export { stableSerialize } from "./context/serialize-stable";
export { hashContext } from "./context/hash";
export { estimateTokens } from "./context/tokens-estimate";
export { compressContextBundle } from "./context/compress";
export { buildContextBundle } from "./context/builder";

export { applyPatches } from "./apply/apply-patches";
export { applyCustomFields } from "./apply/apply-custom-fields";

export {
  RouterOutputSchema,
  DescribeMediaOutputSchema,
  ExtractOutputSchema,
  ConversationalOutputSchema,
} from "./schemas";
