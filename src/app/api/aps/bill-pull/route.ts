// APS Fawateer-E — BillPull endpoint (PUBLIC: called by APS)
//
// Spec: APS calls this when a customer wants to pay a bill at any channel
// (ATM, POS, mobile, web). We respond with the aggregated bill amount.
//
// Operation: /BillPull
// ReqType: BILPULRQ
// ResType: BILPULRS
//
// Both REST (raw XML body) and SOAP envelopes are supported.

import { NextRequest, NextResponse } from 'next/server'
import { parseMfep, buildMfep, buildSoapResponse, isSoap, apsTimestamp } from '@/lib/aps/xml'
import { aggregateBillForBilling } from '@/lib/aps/bill-aggregator'
import { ApsErrorCodes, apsError, apsSuccess } from '@/lib/aps/error-codes'
import { verifySignature, getBillerCode } from '@/lib/aps/signature'

// Build the response wrapper (REST or SOAP) based on incoming format
function send(soap: boolean, mfep: any, status = 200) {
  const xml = soap ? buildSoapResponse('BillPull', mfep) : buildMfep(mfep)
  return new NextResponse(xml, {
    status,
    headers: {
      'Content-Type': soap ? 'text/xml; charset=utf-8' : 'application/xml; charset=utf-8',
    },
  })
}

// Helper: build a BILPULRS message header
function buildResponseHeader(guid: string, ourCode: string, theirCode: string | undefined, result: any) {
  return {
    TmStp: apsTimestamp(),
    GUID: guid,
    TrsInf: {
      SdrCode: ourCode,
      RcvCode: theirCode,
      ResTyp: 'BILPULRS',
    },
    Result: result,
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const guidParam = url.searchParams.get('GUID') ?? ''
  const ourCode = getBillerCode()

  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return send(false, {
      MsgHeader: buildResponseHeader('', ourCode, undefined, apsError(ApsErrorCodes.INTERNAL_ERROR)),
      MsgBody: { RecCount: 0 },
    }, 400)
  }

  const soap = isSoap(req.headers.get('content-type'), rawBody)

  // 1. Parse the message
  let mfep: any
  try {
    mfep = parseMfep(rawBody)
  } catch (e: any) {
    return send(soap, {
      MsgHeader: buildResponseHeader(guidParam, ourCode, undefined, apsError(ApsErrorCodes.INVALID_XML_SCHEMA, e.message)),
      MsgBody: { RecCount: 0 },
    }, 400)
  }

  const header = mfep.MsgHeader ?? {}
  const body = mfep.MsgBody ?? {}
  const footer = mfep.MsgFooter ?? {}
  const guid = guidParam || header.GUID || ''
  const senderCode = header.TrsInf?.SdrCode

  // 2. Verify signature
  const signature = footer.Security?.Signature
  if (!verifySignature(rawBody, signature)) {
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsError(ApsErrorCodes.INVALID_SIGNATURE)),
      MsgBody: { RecCount: 0 },
    }, 401)
  }

  // 3. Validate request type
  if (header.TrsInf?.ReqTyp !== 'BILPULRQ') {
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsError(ApsErrorCodes.INVALID_XML_SCHEMA, 'Expected ReqTyp=BILPULRQ')),
      MsgBody: { RecCount: 0 },
    }, 400)
  }

  // 4. Extract billing info
  const billingNo = body.AcctInfo?.BillingNo?.toString()
  const serviceType = body.ServiceType?.toString()
  if (!billingNo || !serviceType) {
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsError(ApsErrorCodes.INVALID_XML_SCHEMA, 'Missing BillingNo or ServiceType')),
      MsgBody: { RecCount: 0 },
    }, 400)
  }

  // 5. Look up the bill
  try {
    const result = await aggregateBillForBilling(billingNo, serviceType)

    if (!result.found) {
      let errCode: string = ApsErrorCodes.BILL_NOT_FOUND
      if (result.notFoundReason === 'service_type_mismatch') errCode = ApsErrorCodes.UNRECOGNIZED_SERVICE_TYPE
      else if (result.notFoundReason === 'inactive_subscriber') errCode = ApsErrorCodes.INACTIVE_BILLING
      else if (result.notFoundReason === 'no_due_amount') errCode = ApsErrorCodes.NO_DUE_AMOUNT
      else if (result.notFoundReason === 'aps_not_enabled') errCode = ApsErrorCodes.INACTIVE_BILLER

      return send(soap, {
        MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsSuccess()),
        MsgBody: { RecCount: 0 },
      })
    }

    // 6. Build the success response
    const bill = result.bill!
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsSuccess()),
      MsgBody: {
        RecCount: 1,
        BillsRec: {
          BillRec: {
            Result: apsSuccess(),
            AcctInfo: {
              BillingNo: bill.BillingNo,
              BillNo: bill.BillNo,
              BillerCode: bill.BillerCode,
            },
            BillStatus: bill.BillStatus,
            DueAmount: bill.DueAmount,
            IssueDate: bill.IssueDate,
            DueDate: bill.DueDate,
            CloseDate: bill.CloseDate,
            ServiceType: bill.ServiceType,
            PmtConst: {
              AllowPart: bill.AllowPart ? 'true' : 'false',
              Lower: bill.Lower,
              Upper: bill.Upper,
            },
          },
        },
      },
    })
  } catch (err: any) {
    console.error('[aps/bill-pull]', err)
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsError(ApsErrorCodes.INTERNAL_ERROR, err.message)),
      MsgBody: { RecCount: 0 },
    }, 500)
  }
}
