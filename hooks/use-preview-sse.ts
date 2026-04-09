// =============================================
// PREVIEW SSE HOOK - Real-time document updates
// =============================================

import { useEffect, useRef } from 'react';
import type { ProcessorResult } from '@/lib/utils/validator';
import type { DocumentData, QuotationDocumentData, EmailDocumentData, RfqAnalysisDocumentData, SupplierSearchDocumentData } from '@/types/preview';

interface UsePreviewSSEOptions {
  onDocumentReceived: (doc: DocumentData) => void;
  onError?: (error: string) => void;
}

/**
 * Hook that connects to /api/preview-stream SSE endpoint
 * Transforms ProcessorResult → DocumentData and dispatches to reducer
 */
export function usePreviewSSE({ onDocumentReceived, onError }: UsePreviewSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/preview-stream');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const result: ProcessorResult = JSON.parse(event.data);

        // Skip error results
        if (!result.success || result.status === 'error') {
          onError?.(result.error || 'Processing failed');
          return;
        }

        // Transform ProcessorResult → DocumentData based on data_type
        const document = transformResultToDocument(result);
        if (document) {
          onDocumentReceived(document);
        }
      } catch (err) {
        console.error('[SSE] Failed to parse event:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('[SSE] Connection error, will auto-reconnect');
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [onDocumentReceived, onError]);
}

// ---------------------------------------------
// Transform ProcessorResult → DocumentData
// ---------------------------------------------

/**
 * Maps the `data` field from each processor's result to our typed DocumentData
 * Each processor returns different shapes — we normalize them here
 */
function transformResultToDocument(result: ProcessorResult): DocumentData | null {
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return null;

  switch (result.data_type) {
    case 'quotation': {
      // quotation-actions.ts returns: { quotation_id, rfq_reference, items, customer_info, commercial_terms, calculated_pricing }
      const items = (data.items as Array<Record<string, unknown>>) || [];
      const customerInfo = (data.customer_info as Record<string, unknown>) || {};
      const calcPricing = data.calculated_pricing as Record<string, unknown> | undefined;
      const calcItems = (calcPricing?.calculated_pricing as Array<Record<string, unknown>>) || [];

      const quotationData: QuotationDocumentData = {
        quotation_id: (data.quotation_id as number) || null,
        quotation_name: (data.rfq_reference as string) || 'Commercial Proposal',
        quotation_date: (data.generated_at as string) || new Date().toLocaleDateString('vi-VN'),
        page_number: '1',
        rfq_reference: (data.rfq_reference as string) || 'N/A',
        seller_info: {
          company_name: '',    // Loaded separately from CLIENT_COMPANY
          address: '',
          tel: '',
          phone: '',
          fax_number: '',
          email: '',
          logo_url: null,
          signature_url: null,
        },
        customer_info: {
          company_name: (customerInfo.company_name as string) || 'N/A',
          attention_person: (customerInfo.attention_person as string) || 'N/A',
          carbon_copy_person: (customerInfo.carbon_copy_person as string[]) || [],
          email: (customerInfo.email as string) || '',
          tel: (customerInfo.tel as string) || (customerInfo.phone as string) || '',
          phone: (customerInfo.phone as string) || '',
          fax_number: (customerInfo.fax_number as string) || '',
          customer_address: (customerInfo.customer_address as string) || '',
        },
        quotation_items: items.map((item, index) => {
          const compReq = (item.company_requirement as Record<string, unknown>) || {};
          const bidProp = (item.bidder_proposal as Record<string, unknown>) || {};
          const itemId = (item.item_id as number) || index + 1;

          // Find matching calculated pricing
          const calcItem = calcItems.find(
            (c) => Number(c.item_id) === itemId
          );

          return {
            item_id: itemId,
            company_requirement: {
              company_description: (compReq.company_description as string) || '',
              qty: Number(compReq.qty) || 0,
              uom: (compReq.uom as string) || 'EA',
            },
            bidder_proposal: {
              bidder_description: (bidProp.bidder_description as string) || '',
              delivery_time: (bidProp.delivery_time as string) || '',
              compliance_deviation: (bidProp.compliance_deviation as string) || '',
            },
            sales_unit_price: Number(calcItem?.sales_unit_price) || 0,
            ext_price: Number(calcItem?.ext_price) || 0,
          };
        }),
        total_amount: Number(calcPricing?.total_amount) || 0,
        commercial_terms: (data.commercial_terms as string) || '',
      };

      return { type: 'quotation', data: quotationData };
    }

    case 'email': {
      // email-actions.ts returns: { to, subject, body }
      const emailData: EmailDocumentData = {
        email_id: null,
        subject: (data.subject as string) || '',
        email_content: (data.body as string) || '',
        recipient_email: (data.to as string) || '',
      };
      return { type: 'email', data: emailData };
    }

    case 'rfq_analysis': {
      // analysis-actions.ts returns: { rfq_analysis: { subject, analysis_content }, rfq_items, customer_info }
      const rfqAnalysis = (data.rfq_analysis as Record<string, unknown>) || {};
      const analysisData: RfqAnalysisDocumentData = {
        rfq_id: null,
        subject: (rfqAnalysis.subject as string) || 'RFQ Analysis',
        analysis_content: (rfqAnalysis.analysis_content as string) || '',
      };
      return { type: 'rfq_analysis', data: analysisData };
    }

    case 'supplier_search': {
      // supplier-search-actions.ts returns: { suppliers, searchTimestamp }
      const suppliers = (data.suppliers as Array<Record<string, unknown>>) || [];
      const content = suppliers
        .map((s, i) => `${i + 1}. ${s.name} (${s.email}) — Match: ${((s.matchScore as number) * 100).toFixed(0)}%`)
        .join('\n');

      const searchData: SupplierSearchDocumentData = {
        search_id: null,
        subject: 'Supplier Search Results',
        search_content: content,
      };
      return { type: 'supplier_search', data: searchData };
    }

    default:
      return null;
  }
}
