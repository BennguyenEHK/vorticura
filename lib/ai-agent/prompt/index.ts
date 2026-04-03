// =============================================
// PROMPT INDEX — barrel re-export for all AI prompts
// =============================================
// Each prompt module exports:
//   SYSTEM_PROMPT  — static instruction string (JSON-only output enforced)
//   build*Message  — function that injects dynamic variables into user message

export {
  CLASSIFY_EMAIL_PROMPT,
  buildClassifyUserMessage,
} from './classify-email';

export {
  ANALYZE_RFQ_PROMPT,
  buildAnalyzeUserMessage,
  buildReanalyzeUserMessage,
} from './analyze-rfq';

export {
  SEARCH_SUPPLIERS_PROMPT,
  buildSearchUserMessage,
  buildResearchUserMessage,
} from './search-suppliers';

export {
  EXTRACT_SUPPLIER_RESPONSE_PROMPT,
  buildExtractUserMessage,
} from './extract-supplier-response';

export {
  GENERATE_EMAIL_PROMPT,
  buildEmailUserMessage,
  buildRegenerateEmailUserMessage,
} from './generate-email';
