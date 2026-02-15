// =============================================
// ANALYSIS ACTIONS - RFQ Analysis Server Actions
// =============================================
// Server actions for analyzing incoming RFQ emails:
// - Receive RFQ from email watcher
// - Call AI API via Supabase SDK (ky) for analysis
// - Return structured analysis JSON
// - Update Zustand store for PreviewPanel display

'use server';

import { createClient } from '@supabase/supabase-js';
import ky from 'ky';
import type {
  ActionResult,
  AnalysisInput,
  AnalysisOutput,
  AnalysisItem,
  CustomerInfo,
} from '@/lib/types/workflow';
import { AnalysisInputSchema } from '@/lib/types/workflow';

// ---------------------------------------------
// Configuration
// ---------------------------------------------

/** Supabase client for AI API calls */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** AI API endpoint (via Supabase Edge Function or external) */
const AI_API_URL = process.env.AI_API_URL || 'https://api.example.com/analyze';

// ---------------------------------------------
// Main Action: Analyze RFQ
// ---------------------------------------------

/**
 * Analyze an incoming RFQ email using AI
 * @param input - RFQ analysis input data
 * @returns ActionResult with analysis output
 */
export async function analyzeRFQ(
  input: AnalysisInput
): Promise<ActionResult<AnalysisOutput>> {
  const timestamp = new Date().toISOString();

  try {
    // Validate input using Zod schema
    const validationResult = AnalysisInputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
        timestamp,
        stepId: 'analysis',
        rfqId: input.rfqId,
      };
    }

    // Call AI API for analysis via ky (HTTP client)
    const aiResponse = await callAIAnalysis(input);

    // Store analysis result in Supabase
    const { error: dbError } = await supabase
      .from('rfq_analyses')
      .upsert({
        rfq_id: input.rfqId,
        analysis_data: aiResponse,
        created_at: timestamp,
        updated_at: timestamp,
      });

    if (dbError) {
      console.error('[Analysis] Database error:', dbError);
      // Continue even if DB fails - analysis is still valid
    }

    return {
      success: true,
      data: aiResponse,
      timestamp,
      stepId: 'analysis',
      rfqId: input.rfqId,
    };

  } catch (error) {
    console.error('[Analysis] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
      timestamp,
      stepId: 'analysis',
      rfqId: input.rfqId,
    };
  }
}

// ---------------------------------------------
// AI API Call
// ---------------------------------------------

/**
 * Call AI API for RFQ analysis
 * Uses ky for HTTP requests with automatic retries
 */
async function callAIAnalysis(input: AnalysisInput): Promise<AnalysisOutput> {
  try {
    // Make API call with ky (includes retry logic)
    const response = await ky.post(AI_API_URL, {
      json: {
        email_content: input.emailContent,
        attachments: input.attachments,
        sender_email: input.senderEmail,
        sender_name: input.senderName,
        subject: input.subject,
      },
      timeout: 30000, // 30 second timeout
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

    // Transform AI response to our schema
    return transformAIResponse(input.rfqId, response);

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

/**
 * Transform AI API response to our schema
 */
function transformAIResponse(
  rfqId: string,
  response: AIAnalysisResponse
): AnalysisOutput {
  // Map extracted items to our format
  const items: AnalysisItem[] = response.extracted_items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    specifications: item.specs,
  }));

  // Map customer info
  const customerInfo: CustomerInfo = {
    name: response.customer.name,
    email: response.customer.email,
    company: response.customer.company,
    phone: response.customer.phone,
  };

  return {
    rfqId,
    summary: response.summary,
    items,
    customerInfo,
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
function generateMockAnalysis(input: AnalysisInput): AnalysisOutput {
  return {
    rfqId: input.rfqId,
    summary: `Analysis of RFQ from ${input.senderEmail}: ${input.subject}`,
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
      name: input.senderName || 'Unknown',
      email: input.senderEmail,
      company: 'Extracted Company Name',
    },
    deadlines: ['2026-03-15'],
    specialRequirements: ['Urgent delivery required', 'Quality certification needed'],
    confidence: 0.85,
  };
}

// ---------------------------------------------
// Helper Actions
// ---------------------------------------------

/**
 * Get existing analysis for an RFQ
 * @param rfqId - RFQ identifier
 */
export async function getAnalysis(
  rfqId: string
): Promise<ActionResult<AnalysisOutput | null>> {
  const timestamp = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('rfq_analyses')
      .select('analysis_data')
      .eq('rfq_id', rfqId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return {
          success: true,
          data: null,
          timestamp,
          stepId: 'analysis',
          rfqId,
        };
      }
      throw error;
    }

    return {
      success: true,
      data: data.analysis_data as AnalysisOutput,
      timestamp,
      stepId: 'analysis',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analysis',
      timestamp,
      stepId: 'analysis',
      rfqId,
    };
  }
}

/**
 * Delete analysis for an RFQ (for re-analysis)
 * @param rfqId - RFQ identifier
 */
export async function deleteAnalysis(
  rfqId: string
): Promise<ActionResult<void>> {
  const timestamp = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('rfq_analyses')
      .delete()
      .eq('rfq_id', rfqId);

    if (error) throw error;

    return {
      success: true,
      timestamp,
      stepId: 'analysis',
      rfqId,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete analysis',
      timestamp,
      stepId: 'analysis',
      rfqId,
    };
  }
}
