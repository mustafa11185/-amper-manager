// APS Fawateer-E — Payment Notification endpoint (PUBLIC: called by APS)
//
// Spec: APS calls this AFTER a successful payment at any channel to notify us
// that funds have been collected. We must mark the bill as paid and respond
// with a success acknowledgment for each transaction.
//
// Operation: /ReceivePaymentNotification
// ReqType: BLRPMTNTFRQ
// ResType: BLRPMTNTFRS

import { NextRequest, NextResponse } from 'next/server'
import { parseMfep, buildMfep, buildSoapResponse, isSoap, apsTimestamp } from '@/lib/aps/xml'
import { applyApsPayment } from '@/lib/aps/bill-aggregator'
import { ApsErrorCodes, apsError, apsSuccess } from '@/lib/aps/error-codes'
import { verifySignature, getBillerCode } from '@/lib/aps/signature'

function send(soap: boolean, mfep: any, status = 200) {
  const xml = soap
    ? buildSoapResponse('ReceivePaymentNotification', mfep)
    : buildMfep(mfep)
  return new NextResponse(xml, {
    status,
    headers: {
      'Content-Type': soap ? 'text/xml; charset=utf-8' : 'application/xml; charset=utf-8',
    },
  })
}

function buildResponseHeader(guid: string, ourCode: string, theirCode: string | undefined, result: any) {
  return {
    TmStp: apsTimestamp(),
    GUID: guid,
    TrsInf: {
      SdrCode: ourCode,
      RcvCode: theirCode,
      ResTyp: 'BLRPMTNTFRS',
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
      MsgBody: { Transactions: { TrxInf: [] } },
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
      MsgBody: { Transactions: { TrxInf: [] } },
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
      MsgBody: { Transactions: { TrxInf: [] } },
    }, 401)
  }

  // 3. Validate request type
  if (header.TrsInf?.ReqTyp !== 'BLRPMTNTFRQ') {
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsError(ApsErrorCodes.INVALID_XML_SCHEMA, 'Expected ReqTyp=BLRPMTNTFRQ')),
      MsgBody: { Transactions: { TrxInf: [] } },
    }, 400)
  }

  // 4. Extract transactions (can be single or array)
  const trxRaw = body.Transactions?.TrxInf
  if (!trxRaw) {
    return send(soap, {
      MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsError(ApsErrorCodes.INVALID_XML_SCHEMA, 'Missing Transactions.TrxInf')),
      MsgBody: { Transactions: { TrxInf: [] } },
    }, 400)
  }
  const transactions: any[] = Array.isArray(trxRaw) ? trxRaw : [trxRaw]

  // 5. Process each transaction
  const responses: any[] = []
  for (const trx of transactions) {
    const billingNo = trx.AcctInfo?.BillingNo?.toString() ?? trx.AcctInfo?.BillNo?.toString()
    const joebppsTrx = trx.JOEBPPSTrx?.toString()
    const bankTrxId = trx.BankTrxID?.toString()
    const bankCode = trx.BankCode?.toString() ?? ''
    const paidAmount = Number(trx.PaidAmt ?? 0)
    const dueAmount = Number(trx.DueAmt ?? 0)
    const feesAmount = Number(trx.FeesAmt ?? 0)
    const feesOnBiller = String(trx.FeesOnBiller).toLowerCase() === 'true'
    const processDate = trx.ProcessDate ? new Date(trx.ProcessDate) : new Date()
    const stmtDate = trx.STMTDate ? new Date(trx.STMTDate) : new Date()
    const accessChannel = trx.AccessChannel?.toString() ?? 'UNKNOWN'
    const paymentMethod = trx.PaymentMethod?.toString() ?? 'UNKNOWN'
    const paymentType = trx.PaymentType?.toString()
    const serviceType = trx.ServiceTypeDetails?.ServiceType?.toString() ?? ''

    if (!billingNo || !joebppsTrx || paidAmount <= 0) {
      responses.push({
        JOEBPPSTrx: joebppsTrx ?? '',
        ProcessDate: trx.ProcessDate ?? apsTimestamp(),
        STMTDate: trx.STMTDate ?? '',
        Result: apsError(ApsErrorCodes.INVALID_XML_SCHEMA, 'Missing required fields'),
      })
      continue
    }

    try {
      const result = await applyApsPayment({
        billingNo,
        joebppsTrx,
        bankTrxId,
        bankCode,
        paidAmount,
        feesAmount,
        feesOnBiller,
        processDate,
        stmtDate,
        serviceType,
        accessChannel,
        paymentMethod,
        paymentType,
        rawPayload: trx,
      })

      responses.push({
        JOEBPPSTrx: joebppsTrx,
        ProcessDate: trx.ProcessDate,
        STMTDate: trx.STMTDate,
        Result: result.ok
          ? apsSuccess()
          : apsError(result.errorCode ?? ApsErrorCodes.INTERNAL_ERROR, result.errorMessage),
      })
    } catch (err: any) {
      console.error('[aps/payment-notification] processing error:', err)
      responses.push({
        JOEBPPSTrx: joebppsTrx,
        ProcessDate: trx.ProcessDate,
        STMTDate: trx.STMTDate,
        Result: apsError(ApsErrorCodes.INTERNAL_ERROR, err.message),
      })
    }
  }

  // 6. Build aggregated response
  return send(soap, {
    MsgHeader: buildResponseHeader(guid, ourCode, senderCode, apsSuccess()),
    MsgBody: {
      Transactions: {
        TrxInf: responses,
      },
    },
  })
}
