import type { QuotationDocumentData } from '@/types/preview';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtVND(v: number): string {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString('vi-VN') : '0';
}

export function buildQuotationPrintHTML(data: QuotationDocumentData): string {
  const { seller_info, customer_info, quotation_items } = data;

  const logoHtml = seller_info.logo_url
    ? `<img src="${escapeHtml(seller_info.logo_url)}" alt="logo">`
    : `<div class="no-logo">No Logo</div>`;

  const signatureHtml = seller_info.signature_url
    ? `<img src="${escapeHtml(seller_info.signature_url)}" alt="signature">`
    : `<div class="no-signature">No Signature</div>`;

  const ccLines = customer_info.carbon_copy_person
    .map(p => `<p><strong>Cc:</strong> ${escapeHtml(p)}</p>`)
    .join('\n');

  const itemRows = quotation_items.length === 0
    ? `<tr><td colspan="8" style="text-align:center;color:#666;">No items available</td></tr>`
    : quotation_items.map(item => `
      <tr>
        <td class="item-no-col">${item.item_id}</td>
        <td>${escapeHtml(item.company_requirement.company_description)}</td>
        <td>${escapeHtml(item.company_requirement.uom)}</td>
        <td class="number">${item.company_requirement.qty}</td>
        <td>${escapeHtml(item.bidder_proposal.bidder_description)}</td>
        <td class="number">${fmtVND(item.sales_unit_price)}</td>
        <td class="number">${fmtVND(item.ext_price)}</td>
        <td>${escapeHtml(item.bidder_proposal.delivery_time)}</td>
      </tr>`).join('\n');

  const title = escapeHtml(data.quotation_name || 'Commercial Proposal');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
    }
    body { padding: 0; }
    .page { padding: 0; }

    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; position: relative; }
    .company-logo { flex-shrink: 0; margin-right: 20px; width: 120px; }
    .company-logo img { width: 100%; height: auto; max-height: 80px; object-fit: contain; }
    .company-info-header { flex-grow: 1; text-align: center; }
    .company-info-header h3 { margin: 2px 0; font-size: 14px; font-weight: normal; }
    .company-info-header h3 strong { font-weight: bold; }
    .header-spacer { flex-shrink: 0; width: 120px; }

    .proposal-title { text-align: center; margin: 8px 0; }
    .proposal-title h3 { margin: 4px 0; font-size: 14px; }

    .customer-info { font-size: 13px; line-height: 1.5; margin: 12px 0; position: relative; }
    .customer-info p { margin: 2px 0; }
    .customer-info .company-name { font-weight: bold; font-size: 15px; }
    .customer-info .address { font-style: italic; font-weight: 600; }
    .doc-metadata { position: absolute; top: 0; right: 0; text-align: right; font-size: 12px; line-height: 1.4; }
    .doc-metadata p { margin: 2px 0; }

    .subject-line { font-weight: bold; margin: 8px 0; }

    .scope-title { text-align: left; font-weight: bold; padding: 6px 0; margin: 8px 0 4px; }

    .quotation-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 12px; }
    .quotation-table th, .quotation-table td {
      border: 1px solid #000;
      padding: 6px 8px;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: anywhere;
      text-align: left;
    }
    .quotation-table thead { display: table-header-group; }
    .quotation-table tbody tr:nth-child(even) td { background-color: #fafafa; }
    .quotation-table .item-no-col { background-color: #f0f0f0; font-weight: bold; text-align: center; }
    .quotation-table .company-header,
    .quotation-table .company-child { background-color: #f9d7c2; text-align: center; font-weight: bold; }
    .quotation-table .bidder-header,
    .quotation-table .bidder-child { background-color: #d9ead3; text-align: center; font-weight: bold; }
    .quotation-table .total-row td { background-color: #f9f9f9; font-weight: bold; }
    .quotation-table .number { text-align: right; }

    .footer { margin-top: 16px; }
    .footer h4 { font-weight: bold; margin: 8px 0; }
    .signature-section { margin-top: 24px; text-align: right; }
    .signature-section img { max-height: 60px; max-width: 150px; }
    .no-logo, .no-signature { color: #999; font-style: italic; }

    @page { @bottom-right { content: "Page " counter(page) " / " counter(pages); font-family: "Times New Roman", serif; font-size: 10px; color: #444; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="company-logo">${logoHtml}</div>
      <div class="company-info-header">
        <h3><strong>${escapeHtml(seller_info.company_name)}</strong></h3>
        <h3>${escapeHtml(seller_info.address)}</h3>
        <h3>Tel: ${escapeHtml(seller_info.tel)} &nbsp;&nbsp; Fax: ${escapeHtml(seller_info.fax_number)}</h3>
      </div>
      <div class="header-spacer"></div>
    </div>

    <div class="proposal-title">
      <h3><strong>COMMERCIAL PROPOSAL</strong></h3>
      <p><strong>RFQ Reference: </strong>${escapeHtml(data.rfq_reference)}</p>
    </div>

    <div class="customer-info">
      <p><strong>To:</strong> <span class="company-name">${escapeHtml(customer_info.company_name)}</span></p>
      <p class="address">${escapeHtml(customer_info.customer_address)}</p>
      <p><strong>Tel:</strong> ${escapeHtml(customer_info.tel)} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Fax:</strong> ${escapeHtml(customer_info.fax_number)}</p>
      <br>
      <p><strong>Attn:</strong> ${escapeHtml(customer_info.attention_person)}</p>
      ${ccLines}
      <div class="doc-metadata">
        <p>Quotation No.: ${escapeHtml(String(data.quotation_id ?? 'N/A'))}</p>
        <p>${escapeHtml(data.quotation_date)}</p>
        <p>Page: ${escapeHtml(data.page_number)}</p>
      </div>
    </div>

    <p class="subject-line">Subj: ${escapeHtml(data.rfq_reference)}</p>
    <h4 class="scope-title">I.&nbsp;&nbsp;SCOPE OF SUPPLY</h4>

    <table class="quotation-table">
      <colgroup>
        <col style="width: 5%">
        <col style="width: 22%">
        <col style="width: 6%">
        <col style="width: 6%">
        <col style="width: 25%">
        <col style="width: 12%">
        <col style="width: 12%">
        <col style="width: 12%">
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th colspan="3" class="company-header">COMPANY'S REQUIREMENT</th>
          <th colspan="4" class="bidder-header">BIDDER'S PROPOSAL</th>
        </tr>
        <tr>
          <th class="item-no-col">Item No.</th>
          <th class="company-child">Description</th>
          <th class="company-child">UOM</th>
          <th class="company-child">Qty</th>
          <th class="bidder-child">Description</th>
          <th class="bidder-child">Unit price (VND)</th>
          <th class="bidder-child">Ext. price (VND)</th>
          <th class="bidder-child">Delivery time</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="6" style="text-align:right;"><strong>SUM (Exclusive of VAT):</strong></td>
          <td class="number"><strong>${fmtVND(data.total_amount)}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <h4>II.&nbsp;&nbsp;TERMS AND CONDITIONS</h4>
      <p>${escapeHtml(data.commercial_terms)}</p>
    </div>

    <div class="signature-section">
      <p><strong>Authorized by:</strong></p>
      <div style="margin: 20px 0; width: 200px; display: inline-block;">
        ${signatureHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
}
