// =============================================
// ANALYSIS ACTIONS - RFQ Analysis Processor
// =============================================
// Internal server module (called by data-processor, NOT a server action)
// Flow: ProcessorInput → route by action_type → AI API call → save to DB → emit SSE → return ProcessorResult
// Supports: analyze | reanalyze

import ky from 'ky';
import { eventBus } from '@/lib/event-bus';
import { modifyDatabase } from '@/lib/utils/databaseHandler';
import type { ProcessorInput, ProcessorResult } from '@/lib/utils/validator';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** AI API endpoint for RFQ analysis */
const AI_API_URL = process.env.AI_API_URL || 'https://api.example.com/analyze';

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
    const { action_type, quotation_id, rfq_reference, analysis, workspace } = input;
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
        quotation_id,
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

/** AI API response shape */
interface AIAnalysisResponse {
  summary: string;
  extracted_items: Array<{
    description: string;
    quantity?: number;
    unit?: string;
    specs?: string;
  }>;
  customer: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
  };
  deadlines?: string[];
  special_requirements?: string[];
  confidence_score: number;
}

/** Internal input for AI call */
interface AICallInput {
  subject: string;
  analysisContent: string;
  actionType: string;
}

/**
 * Call AI API for RFQ analysis
 * Uses ky for HTTP requests with automatic retries
 */
async function callAIAnalysis(input: AICallInput): Promise<AnalysisData> {
  try {
    const response = await ky.post(AI_API_URL, {
      json: {
        subject: input.subject,
        analysis_content: input.analysisContent,
        action_type: input.actionType,
      },
      timeout: 30000,
      retry: {
        limit: 2,
        methods: ['post'],
        statusCodes: [408, 429, 500, 502, 503, 504],
      },
      headers: {
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }).json<AIAnalysisResponse>();

    // Transform AI response to our format
    return transformAIResponse(response);
  } catch (error) {
    // If AI API fails, return mock analysis for development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Analysis] AI API failed, using mock data');
      return generateMockAnalysis(input);
    }
    throw error;
  }
}

// ---------------------------------------------
// Response Transformation
// ---------------------------------------------

/** Analysis data shape returned to caller */
interface AnalysisData {
  summary: string;
  items: Array<{
    description: string;
    quantity?: number;
    unit?: string;
    specifications?: string;
  }>;
  customerInfo: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
  };
  deadlines?: string[];
  specialRequirements?: string[];
  confidence: number;
}

/**
 * Transform AI API response to our schema
 */
function transformAIResponse(response: AIAnalysisResponse): AnalysisData {
  return {
    summary: response.summary,
    items: response.extracted_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      specifications: item.specs,
    })),
    customerInfo: {
      name: response.customer.name,
      email: response.customer.email,
      company: response.customer.company,
      phone: response.customer.phone,
    },
    deadlines: response.deadlines,
    specialRequirements: response.special_requirements,
    confidence: response.confidence_score,
  };
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
