// =============================================
// ANALYSIS ACTIONS - RFQ Analysis Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → AI API call → save to DB → emit SSE → return ProcessorResult
// Supports: analyze | reanalyze

import { hfChatCompletion, ANALYSIS_SYSTEM_PROMPT } from '@/lib/ai-agent/hf-client';
import { eventBus } from '@/lib/event-bus';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import { getLocalModel } from '@/lib/ai-agent/local-model';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';
import type { AICallInput, AnalysisData } from '@/types/ai-agent';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI inference mode: 'local' = run model locally, anything else = call remote API */
const AI_MODE = process.env.AI_MODE || 'remote';

// ---------------------------------------------
// Main Processor: Process Analysis 
// ---------------------------------------------

/**
 * Process RFQ analysis based on action_type
 * @param input - Validated ProcessorInput (data_type: 'rfq_analysis')
 * @returns ProcessorResult with analysis data
 */
export async function processAnalysis(input: ProcessorInput): Promise<ProcessorResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const { action_type, rfq_id, rfq_reference, analysis, workspace } = input;
    // workspace should be provided by validator, but guard defensively
    if (!workspace) {
      throw new Error('Missing workspace context');
    }

    // Route by action_type: analyze | reanalyze → both call AI API
    const aiResponse = await callAIAnalysis({
      subject: analysis?.subject || '',
      analysisContent: analysis?.analysis_content || '',
      actionType: action_type,
    });

    // Build result
    const result: ProcessorResult = {
      success: true,
      data_type: 'rfq_analysis',
      action_type,
      status: 'completed',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      data: aiResponse,
      timestamp,
    };

    // Save to database (non-blocking, errors don't fail the response)
    try {
      await modifyDatabase({
        data_type: 'rfq_analysis',
        rfq_id,
        rfq_reference,
        rfq_analysis: {
          subject: analysis?.subject || '',
          analysis_content: aiResponse.summary || analysis?.analysis_content || '',
          analysis_status: 'completed',
        },
      }, workspace);
    } catch (dbError) {
      console.error('[Analysis] DB save failed (non-blocking):', dbError);
    }

    // Emit SSE for real-time preview update
    eventBus.emit('preview-update', result);

    return result;
  } catch (error) {
    console.error('[Analysis] Error:', error);

    const errorResult: ProcessorResult = {
      success: false,
      data_type: 'rfq_analysis',
      action_type: input.action_type,
      status: 'error',
      session_id: '',
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Analysis failed',
      timestamp,
    };

    eventBus.emit('preview-update', errorResult);
    return errorResult;
  }
}

// ---------------------------------------------
// AI API Call
// ---------------------------------------------

/**
 * Call AI for RFQ analysis — routes to local model or remote API based on AI_MODE.
 * Local mode: runs model in-process via @xenova/transformers
 * Remote mode: calls HuggingFace Inference API via hfChatCompletion
 */
async function callAIAnalysis(input: AICallInput): Promise<AnalysisData> {
  // Route: local model inference (no network required)
  if (AI_MODE === 'local') {
    console.log('[Analysis] Using local AI model');
    try {
      return await getLocalModel().analyzeRFQ(input);
    } catch (error) {
      console.error('[Analysis] Local model failed:', error);
      // Fallback to mock data in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Analysis] Local model failed, using mock data');
        return generateMockAnalysis(input);
      }
      throw error;
    }
  }

  // Route: remote API call via HuggingFace Inference SDK
  try {
    // Build user message from input fields
    const userMessage = `Subject: ${input.subject}\n\nContent:\n${input.analysisContent}`;
    // Call HuggingFace chatCompletion — returns parsed AnalysisData JSON
    return await hfChatCompletion<AnalysisData>(ANALYSIS_SYSTEM_PROMPT, userMessage);
  } catch (error) {
    // If AI API fails, return mock analysis for development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Analysis] HF Inference API failed, using mock data');
      return generateMockAnalysis(input);
    }
    throw error;
  }
}

// ---------------------------------------------
// Mock Data (Development)
// ---------------------------------------------

/**
 * Generate mock analysis for development/testing
 */
function generateMockAnalysis(input: AICallInput): AnalysisData {
  return {
    summary: `Analysis of RFQ: ${input.subject}`,
    items: [
      {
        description: 'Industrial Bearing Model XYZ-100',
        quantity: 100,
        unit: 'pcs',
        specifications: 'Grade A, Stainless Steel',
      },
      {
        description: 'Hydraulic Seal Kit HS-200',
        quantity: 50,
        unit: 'sets',
        specifications: 'NBR Material, High Pressure',
      },
    ],
    customerInfo: {
      name: 'Unknown',
      email: '',
      company: 'Extracted Company Name',
    },
    deadlines: ['2026-03-15'],
    specialRequirements: ['Urgent delivery required', 'Quality certification needed'],
    confidence: 0.85,
  };
}
