// CBI / APS Fawateer-E error codes (from spec v1.7)
// Use these constants in BillPull / PaymentNotification responses.

export const ApsErrorCodes = {
  SUCCESS: '0',

  // Auth/security
  INVALID_TOKEN: '1',
  INVALID_SIGNATURE: '2',
  INVALID_CODE_OR_PASSWORD: '3',
  EXPIRED_TOKEN: '4',
  INVALID_SENDER_CODE: '5',
  INVALID_GUID: '6',
  DUPLICATED_GUID: '7',

  // Format/protocol
  INVALID_XML_SCHEMA: '101',
  INTERNAL_ERROR: '303',
  INVALID_TIMESTAMP: '304',
  BILLER_NOT_FOUND: '306',
  BANK_NOT_FOUND: '307',
  INACTIVE_BILLER: '308',
  INACTIVE_BANK: '309',

  // Customer/billing
  CUSTOMER_NOT_EXIST: '310',
  INACTIVE_CUSTOMER: '311',
  INACTIVE_BILLING: '313',
  BILLING_NUMBER_MISMATCH: '314',
  BILLING_NOT_EXIST: '315',
  BILLING_ALREADY_EXIST: '316',

  // Dates
  INVALID_ISSUE_DATE: '317',
  INVALID_OPEN_DATE: '318',
  INVALID_DUE_DATE: '319',
  INVALID_CLOSE_DATE: '320',
  INVALID_EXPIRY_DATE: '321',

  // Service / amounts
  UNRECOGNIZED_SERVICE_TYPE: '322',
  BILL_EXPIRED_OR_CLOSED: '323',
  BILL_PAID_PREVIOUSLY: '324',
  INVALID_PAID_AMOUNT: '325',
  INVALID_DUE_AMOUNT: '326',
  INVALID_PROCESS_DATE: '327',
  PAYMENT_DOES_NOT_BELONG_TO_BILL: '328',
  BILL_AMOUNT_NOT_IN_RANGE: '329',
  INVALID_LOWER_OR_UPPER: '330',

  // Transaction limits
  MAX_TRX_REACHED: '332',
  MAX_AMOUNT_REACHED: '333',
  INVALID_BILL_TYPE: '334',
  TOTAL_SUB_PMTS_MISMATCH: '336',
  DUPLICATED_PAYMENT: '340',
  DUPLICATED_PAYMENTS_SAME_BILL: '341',
  BILL_HAS_PAYMENT_PROCESSING: '342',
  DUPLICATED_BILL: '343',

  // Settlement / banks
  SETTLEMENT_BANK_NOT_RELATED: '350',
  INACTIVE_SETTLEMENT_BANK: '351',
  PROCESS_DATE_AFTER_TIMESTAMP: '352',
  PAID_EXCEEDS_UPPER: '353',
  INVALID_REC_COUNT: '355',
  BILLING_NUMBER_RESPONSE_MISMATCH: '356',
  BILL_NUMBER_NOT_EQUAL_BILLING: '357',
  INVALID_JOEBPPS_TRX: '358',

  // Misc
  INVALID_BILLER_CODE: '379',
  SIGNATURE_MISSING: '380',
  REVERSED_PAYMENT: '701',
  BILL_NOT_FOUND: '401',
  ERROR_SENT_BY_BILLER: '404',
  NO_DUE_AMOUNT: '409',
} as const

export const ApsErrorMessages: Record<string, string> = {
  '0': 'Success',
  '101': 'Invalid XML Schema',
  '303': 'Internal Error',
  '306': 'Biller Not Found',
  '308': 'Inactive Biller',
  '310': 'Customer ID Or JOEBPPSNo Does Not Exist',
  '313': 'Inactive Billing Account',
  '314': 'Billing Number Does Not Match Bill Number',
  '315': 'Billing Does Not Exist Under This Profile',
  '322': 'Unrecognized Service Type',
  '323': 'Bill Has Been Expired Or Closed',
  '324': 'Bill Has Been Paid Previously',
  '325': 'Invalid Paid Amount',
  '326': 'Invalid Due Amount',
  '328': 'This Payment Does Not Belong To Any Bill',
  '340': 'Duplicated Payment',
  '353': 'Paid Amount Exceeds The Upper Limit Of The Bill',
  '358': 'Invalid JOEBPPSTrx',
  '401': 'Bill Not Found',
  '404': 'Error Sent By Biller',
  '409': 'No Due Amount',
}

export function apsError(code: string, customDesc?: string) {
  return {
    ErrorCode: code,
    ErrorDesc: customDesc ?? ApsErrorMessages[code] ?? 'Unknown error',
    Severity: code === '0' ? 'Info' as const : 'Error' as const,
  }
}

export const apsSuccess = () => apsError(ApsErrorCodes.SUCCESS)
