// TypeScript types matching APS Fawateer-E EBPP v1.7 spec
// All XML element names preserved exactly as in the spec.

// ── Request types we receive from APS ─────────────────────────

export interface MfepRequest {
  MsgHeader: MsgHeaderRequest
  MsgBody: any
  MsgFooter?: MsgFooterRequest
}

export interface MsgHeaderRequest {
  TmStp: string                  // YYYY-MM-DDTHH:MM:SS
  GUID?: string
  TrsInf: {
    SdrCode?: string             // Code of Fawateer-E (sender)
    RcvCode: string              // Code of biller (us)
    ReqTyp: 'BILPULRQ' | 'BLRPMTNTFRQ'
  }
  Sequence?: { Sess: number; Seq: number }
}

export interface MsgFooterRequest {
  Extra?: any
  Security?: { Signature?: string }
}

export interface BillPullRequestBody {
  AcctInfo: {
    BillingNo: string
    BillNo?: string              // Same as BillingNo
  }
  ServiceType: string            // CBI service code
  PayerInfo?: PayerInfo
}

export interface PaymentNotificationRequestBody {
  Transactions: {
    TrxInf: TransactionInfo[] | TransactionInfo
  }
}

export interface TransactionInfo {
  AcctInfo: {
    BillingNo?: string
    BillNo: string
    BillerCode?: string
  }
  JOEBPPSTrx: string             // APS unique trx id
  BankTrxID: string
  PmtSrc?: string
  BankCode: string
  PmtStatus: 'PmtNew' | 'PmtSent' | 'PmtComplt'
  DueAmt: number
  PaidAmt: number
  FeesAmt: number
  FeesOnBiller: 'true' | 'false'
  ProcessDate: string
  STMTDate: string               // YYYY-MM-DD
  AccessChannel: string          // ATM | POS | MOB | WEB | ...
  PaymentMethod: string          // ACTDEB | CCDEB | ...
  PaymentType?: 'Postpaid' | 'Prepaid'
  Currency?: string
  ServiceTypeDetails: {
    ServiceType: string
    PrepaidCat?: string
  }
  SubPmts?: { SubPmt: any }
  PayerInfo?: PayerInfo
}

export interface PayerInfo {
  IdType?: string
  Id?: string
  Nation?: string
  Name?: string
  Phone?: string
  Address?: string
  Email?: string
  JOEBPPSNo?: string
}

// ── Response types we send back to APS ────────────────────────

export interface MfepResponse {
  MsgHeader: MsgHeaderResponse
  MsgBody: any
  MsgFooter?: { Security?: { Signature?: string } }
}

export interface MsgHeaderResponse {
  TmStp: string
  GUID: string                   // Echo from request URL params
  TrsInf: {
    SdrCode?: string
    RcvCode?: string
    ResTyp: 'BILPULRS' | 'BLRPMTNTFRS'
  }
  Sequence?: { Sess: number; Seq: number }
  Result?: ResultBlock
}

export interface ResultBlock {
  ErrorCode: string              // "0" = success
  ErrorDesc: string
  Severity: 'Info' | 'Error'
}

// ── BillPull Response Body ─────────────────────────────────────

export interface BillPullResponseBody {
  RecCount: number               // 0 or 1
  BillsRec?: {
    BillRec: BillRec
  }
}

export interface BillRec {
  Result: ResultBlock
  AcctInfo: {
    BillingNo: string
    BillNo: string
    BillerCode: string
  }
  BillStatus: 'BillNew' | 'BillUpdated' | 'BillPaid' | 'BillPartiallyPaid' | 'BillOverPaid'
  DueAmount: number
  IssueDate: string
  OpenDate?: string
  DueDate: string
  ExpiryDate?: string
  CloseDate?: string
  ServiceType: string
  BillType?: string
  PmtConst?: {
    AllowPart: 'true' | 'false'
    Lower: number
    Upper: number
  }
}

// ── Payment Notification Response Body ─────────────────────────

export interface PaymentNotificationResponseBody {
  Transactions: {
    TrxInf: PaymentNotificationResponseTrxInf[]
  }
}

export interface PaymentNotificationResponseTrxInf {
  JOEBPPSTrx: string
  ProcessDate: string
  STMTDate: string
  Result: ResultBlock
}
