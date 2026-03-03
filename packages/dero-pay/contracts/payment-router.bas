// Payment Router Smart Contract
//
// A reusable per-merchant contract for fast, simple payments.
// The merchant deploys this contract from their own wallet.
//
// Roles:
//   - Merchant: the deployer (SIGNER at initialization). Receives payouts.
//   - Fee Recipient: optional address that receives a fee split on each payment.
//     If feeBasisPoints is 0, no fee is taken and feeRecipient is unused.
//
// Flow:
//   1. Merchant deploys contract with feeRecipient address and fee rate
//   2. Customer calls Pay(invoiceId) with DERO attached
//   3. Contract instantly splits: merchant gets payout, feeRecipient gets fee
//   4. Single transaction, ~18 seconds
//
// On-chain state:
//   merchant        — deployer's address (receives payouts)
//   feeRecipient    — address that receives the fee split
//   feeBasisPoints  — fee rate (100 = 1%, 250 = 2.5%, 0 = no fee)
//   totalProcessed  — cumulative DERO processed (atomic units)
//   totalFees       — cumulative fees collected (atomic units)
//   paymentCount    — number of payments processed
//

Function Initialize(feeRecipientAddress String, feeBasisPoints Uint64) Uint64
10 IF EXISTS("merchant") THEN GOTO 200
20 STORE("merchant", SIGNER())
30 IF feeBasisPoints > 0 THEN GOTO 50
40 STORE("feeRecipient", SIGNER())
45 GOTO 60
50 STORE("feeRecipient", ADDRESS_RAW(feeRecipientAddress))
60 STORE("feeBasisPoints", feeBasisPoints)
70 STORE("totalProcessed", 0)
80 STORE("totalFees", 0)
90 STORE("paymentCount", 0)
100 RETURN 0
200 RETURN 1
End Function

Function Pay(invoiceId String) Uint64
10 IF DEROVALUE() == 0 THEN GOTO 200
20 DIM amount, fee, payout AS Uint64
30 LET amount = DEROVALUE()
40 LET fee = amount * LOAD("feeBasisPoints") / 10000
50 LET payout = amount - fee
60 SEND_DERO_TO_ADDRESS(LOAD("merchant"), payout)
70 IF fee > 0 THEN GOTO 80 ELSE GOTO 90
80 SEND_DERO_TO_ADDRESS(LOAD("feeRecipient"), fee)
90 STORE("totalProcessed", LOAD("totalProcessed") + amount)
100 STORE("totalFees", LOAD("totalFees") + fee)
110 STORE("paymentCount", LOAD("paymentCount") + 1)
120 RETURN 0
200 RETURN 1
End Function

Function UpdateMerchant(newAddress String) Uint64
10 IF SIGNER() != LOAD("merchant") THEN GOTO 200
20 STORE("merchant", ADDRESS_RAW(newAddress))
30 RETURN 0
200 RETURN 1
End Function

Function GetStats() Uint64
10 RETURN LOAD("totalProcessed")
End Function
