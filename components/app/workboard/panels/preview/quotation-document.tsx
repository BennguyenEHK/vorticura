// =============================================
// QUOTATION DOCUMENT - React Component
// =============================================
// Direct translation of assets/template/default-template.html
// Same layout: Header → Proposal Title → Customer Info → 8-Column Table → Total → Terms → Signature
// Edit mode: renders <input> fields instead of plain text

'use client';

import Image from 'next/image';
import type { QuotationDocumentData } from '@/types/preview';

interface QuotationDocumentProps {
  data: QuotationDocumentData;
  isEditing: boolean;
  onFieldChange: (path: string, value: string | number) => void;
}

/**
 * EditableField — renders <input> in edit mode, plain text in view mode
 */
function EditableField({
  value,
  path,
  isEditing,
  onFieldChange,
  className = '',
  type = 'text',
}: {
  value: string | number;
  path: string;
  isEditing: boolean;
  onFieldChange: (path: string, value: string | number) => void;
  className?: string;
  type?: 'text' | 'number';
}) {
  if (!isEditing) {
    return <span className={className}>{type === 'number' ? Number(value).toLocaleString('vi-VN') : value}</span>;
  }
  return (
    <input
      type={type}
      value={value}
      onChange={(e) =>
        onFieldChange(path, type === 'number' ? Number(e.target.value) : e.target.value)
      }
      className={`border-b border-blue-400 bg-blue-50/50 outline-none px-1 ${className}`}
    />
  );
}

export function QuotationDocument({ data, isEditing, onFieldChange }: QuotationDocumentProps) {
  return (
    <div className="font-serif text-[14px] leading-relaxed text-black bg-white p-5 min-h-full">

      {/* ============================================================ */}
      {/* HEADER — Logo + Company Info + Spacer (flex row)              */}
      {/* Maps to: .header in default-template.html                    */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between mb-5 relative">
        {/* Company Logo */}
        <div className="shrink-0 mr-5 w-[120px]">
          {data.seller_info.logo_url ? (
            <Image
              src={data.seller_info.logo_url}
              alt="Company Logo"
              width={120}
              height={80}
              className="w-full h-auto"
              unoptimized  // for base64 data URLs
            />
          ) : (
            <div className="text-gray-400 italic text-sm">No Logo</div>
          )}
        </div>

        {/* Company Info (center) */}
        <div className="grow text-center">
          <h3 className="my-0.5 text-[16px]">
            <strong>
              <EditableField value={data.seller_info.company_name} path="seller_info.company_name" isEditing={isEditing} onFieldChange={onFieldChange} />
            </strong>
          </h3>
          <h3 className="my-0.5 text-[16px]">
            <EditableField value={data.seller_info.address} path="seller_info.address" isEditing={isEditing} onFieldChange={onFieldChange} />
          </h3>
          <h3 className="my-0.5 text-[16px]">
            <strong>Tel:</strong>{' '}
            <EditableField value={data.seller_info.tel} path="seller_info.tel" isEditing={isEditing} onFieldChange={onFieldChange} />
            &nbsp;&nbsp;&nbsp;&nbsp;
            <strong>Fax:</strong>{' '}
            <EditableField value={data.seller_info.fax_number} path="seller_info.fax_number" isEditing={isEditing} onFieldChange={onFieldChange} />
          </h3>
        </div>

        {/* Spacer (balances logo on right) */}
        <div className="shrink-0 w-[120px]" />
      </div>

      {/* ============================================================ */}
      {/* PROPOSAL TITLE — "COMMERCIAL PROPOSAL" + RFQ Reference       */}
      {/* Maps to: .proposal-title in default-template.html            */}
      {/* ============================================================ */}
      <div className="text-center">
        <h3><strong>COMMERCIAL PROPOSAL</strong></h3>
        <p>
          <strong>RFQ Reference: </strong>
          <EditableField value={data.rfq_reference} path="rfq_reference" isEditing={isEditing} onFieldChange={onFieldChange} />
        </p>
      </div>

      {/* ============================================================ */}
      {/* CUSTOMER INFO SECTION                                         */}
      {/* Maps to: .customer-info in default-template.html             */}
      {/* ============================================================ */}
      <div className="font-serif text-[16px] leading-[1.6] mt-5 mb-5 relative">
        <p>
          <strong>To:</strong>{' '}
          <span className="font-bold text-[18px]">
            <EditableField value={data.customer_info.company_name} path="customer_info.company_name" isEditing={isEditing} onFieldChange={onFieldChange} />
          </span>
        </p>
        <p className="italic font-semibold">
          <EditableField value={data.customer_info.customer_address} path="customer_info.customer_address" isEditing={isEditing} onFieldChange={onFieldChange} />
        </p>
        <p>
          <strong>Tel:</strong>{' '}
          <EditableField value={data.customer_info.tel} path="customer_info.tel" isEditing={isEditing} onFieldChange={onFieldChange} />
          &nbsp;&nbsp;&nbsp;&nbsp;
          <strong>Fax:</strong>{' '}
          <EditableField value={data.customer_info.fax_number} path="customer_info.fax_number" isEditing={isEditing} onFieldChange={onFieldChange} />
        </p>
        <br />
        <p>
          <strong>Attn:</strong>{' '}
          <EditableField value={data.customer_info.attention_person} path="customer_info.attention_person" isEditing={isEditing} onFieldChange={onFieldChange} />
        </p>

        {/* CC Persons (dynamic array) */}
        {data.customer_info.carbon_copy_person.map((person, i) => (
          <p key={i}>
            <strong>Cc:</strong>{' '}
            <EditableField
              value={person}
              path={`customer_info.carbon_copy_person.${i}`}
              isEditing={isEditing}
              onFieldChange={onFieldChange}
            />
          </p>
        ))}

        {/* Document Metadata (top-right absolute) */}
        <div className="absolute top-0 right-0 text-right text-[14px] leading-[1.4]">
          <p>Quotation No.: {data.quotation_id || 'N/A'}</p>
          <p>
            <EditableField value={data.quotation_date} path="quotation_date" isEditing={isEditing} onFieldChange={onFieldChange} />
          </p>
          <p>
            Page: <EditableField value={data.page_number} path="page_number" isEditing={isEditing} onFieldChange={onFieldChange} />
          </p>
        </div>
      </div>

      {/* Subject Line */}
      <p className="font-bold mb-2">
        Subj: <EditableField value={data.rfq_reference} path="rfq_reference" isEditing={isEditing} onFieldChange={onFieldChange} />
      </p>

      {/* ============================================================ */}
      {/* QUOTATION TABLE — 8 Columns                                   */}
      {/* Matches default-template.html exactly:                       */}
      {/*   Company's Requirement: Description | UOM | Qty             */}
      {/*   Bidder's Proposal: Description | Unit Price | Ext Price | Delivery */}
      {/* ============================================================ */}
      <div className="overflow-x-auto">
      <table className="w-full border-collapse mb-5 text-left">
        <thead>
          {/* Scope of Supply header */}
          <tr>
            <th colSpan={8} className="text-left font-bold bg-white border-none !border-0 py-1.5 px-0">
              I.&nbsp;&nbsp;SCOPE OF SUPPLY
            </th>
          </tr>

          {/* Group headers: Company's Requirement | Bidder's Proposal */}
          <tr>
            <th className="border border-black p-2 bg-gray-100" rowSpan={1}>&nbsp;</th>
            <th colSpan={3} className="border border-black p-2 bg-[#f9d7c2] text-center font-bold">
              COMPANY&apos;S REQUIREMENT
            </th>
            <th colSpan={4} className="border border-black p-2 bg-[#d9ead3] text-center font-bold">
              BIDDER&apos;S PROPOSAL
            </th>
          </tr>

          {/* Column headers */}
          <tr>
            <th className="border border-black p-2 bg-gray-100 font-bold">Item No.</th>
            <th className="border border-black p-2 bg-[#f9d7c2] text-center font-bold">Description</th>
            <th className="border border-black p-2 bg-[#f9d7c2] text-center font-bold">UOM</th>
            <th className="border border-black p-2 bg-[#f9d7c2] text-center font-bold">Qty</th>
            <th className="border border-black p-2 bg-[#d9ead3] text-center font-bold">Description</th>
            <th className="border border-black p-2 bg-[#d9ead3] text-center font-bold">Unit price (VND)</th>
            <th className="border border-black p-2 bg-[#d9ead3] text-center font-bold">Ext. price (VND)</th>
            <th className="border border-black p-2 bg-[#d9ead3] text-center font-bold">Delivery time</th>
          </tr>
        </thead>

        <tbody>
          {data.quotation_items.length === 0 ? (
            <tr>
              <td colSpan={8} className="border border-black p-2 text-center text-gray-500">
                No items available
              </td>
            </tr>
          ) : (
            data.quotation_items.map((item, index) => (
              <tr key={item.item_id}>
                {/* Column 1: Item No. */}
                <td className="border border-black p-2">{item.item_id}</td>

                {/* Column 2: Company Description */}
                <td className="border border-black p-2">
                  <EditableField
                    value={item.company_requirement.company_description}
                    path={`quotation_items.${index}.company_requirement.company_description`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                  />
                </td>

                {/* Column 3: UOM */}
                <td className="border border-black p-2">
                  <EditableField
                    value={item.company_requirement.uom}
                    path={`quotation_items.${index}.company_requirement.uom`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                  />
                </td>

                {/* Column 4: Qty */}
                <td className="border border-black p-2 text-right">
                  <EditableField
                    value={item.company_requirement.qty}
                    path={`quotation_items.${index}.company_requirement.qty`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                    type="number"
                  />
                </td>

                {/* Column 5: Bidder Description */}
                <td className="border border-black p-2">
                  <EditableField
                    value={item.bidder_proposal.bidder_description}
                    path={`quotation_items.${index}.bidder_proposal.bidder_description`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                  />
                </td>

                {/* Column 6: Unit Price (VND) */}
                <td className="border border-black p-2 text-right">
                  <EditableField
                    value={item.sales_unit_price}
                    path={`quotation_items.${index}.sales_unit_price`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                    type="number"
                  />
                </td>

                {/* Column 7: Ext. Price (VND) */}
                <td className="border border-black p-2 text-right">
                  <EditableField
                    value={item.ext_price}
                    path={`quotation_items.${index}.ext_price`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                    type="number"
                  />
                </td>

                {/* Column 8: Delivery Time */}
                <td className="border border-black p-2">
                  <EditableField
                    value={item.bidder_proposal.delivery_time}
                    path={`quotation_items.${index}.bidder_proposal.delivery_time`}
                    isEditing={isEditing}
                    onFieldChange={onFieldChange}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>

        {/* Total Row */}
        <tfoot>
          <tr className="font-bold bg-gray-50">
            <td colSpan={6} className="border border-black p-2 text-right">
              <strong>SUM (Exclusive of VAT):</strong>
            </td>
            <td className="border border-black p-2 text-right">
              <strong>
                <EditableField
                  value={data.total_amount}
                  path="total_amount"
                  isEditing={isEditing}
                  onFieldChange={onFieldChange}
                  type="number"
                />
              </strong>
            </td>
            <td colSpan={1} className="border border-black p-2" />
          </tr>
        </tfoot>
      </table>
      </div>

      {/* ============================================================ */}
      {/* TERMS AND CONDITIONS                                          */}
      {/* ============================================================ */}
      <div className="mt-8">
        <h4 className="font-bold">II.&nbsp;&nbsp;TERMS AND CONDITIONS</h4>
        {isEditing ? (
          <textarea
            value={data.commercial_terms}
            onChange={(e) => onFieldChange('commercial_terms', e.target.value)}
            className="w-full min-h-[80px] border border-blue-400 bg-blue-50/50 rounded p-2 outline-none"
          />
        ) : (
          <p>{data.commercial_terms}</p>
        )}
      </div>

      {/* ============================================================ */}
      {/* SIGNATURE                                                     */}
      {/* ============================================================ */}
      <div className="mt-10 text-right">
        <p><strong>Authorized by:</strong></p>
        <div className="my-5 w-[200px] h-auto inline-block">
          {data.seller_info.signature_url ? (
            <Image
              src={data.seller_info.signature_url}
              alt="Signature"
              width={150}
              height={60}
              className="max-h-[60px] max-w-[150px]"
              unoptimized
            />
          ) : (
            <div className="text-gray-400 italic text-sm">No Signature</div>
          )}
        </div>
      </div>
    </div>
  );
}
