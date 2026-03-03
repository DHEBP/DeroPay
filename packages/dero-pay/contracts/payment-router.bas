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
//   merchant        — deployers address (receives payouts)
//   feeRecipient    — address that receives the fee split
//   feeBasisPoints  — fee rate (100 = 1%, 250 = 2.5%, 0 = no fee)
//   totalProcessed  — cumulative DERO processed (atomic units)
//   totalFees       — cumulative fees collected (atomic units)
//   paymentCount    — number of payments processed
//

Function Initialize(feeRecipientAddress String, feeBasisPoints Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("merchant") THEN GOTO 200
30 IF feeBasisPoints > 10000 THEN GOTO 200
40 STORE("merchant", SIGNER())
50 IF feeBasisPoints > 0 THEN GOTO 70
60 STORE("feeRecipient", SIGNER())
65 GOTO 80
70 STORE("feeRecipient", ADDRESS_RAW(feeRecipientAddress))
75 IF LOAD("feeRecipient") == LOAD("merchant") THEN GOTO 200
80 STORE("feeBasisPoints", feeBasisPoints)
90 STORE("totalProcessed", 0)
100 STORE("totalFees", 0)
110 STORE("paymentCount", 0)
120 STORE("paused", 0)
130 RETURN 0
200 RETURN 1
End Function

Function Pay(invoiceId String) Uint64
10 IF DEROVALUE() == 0 THEN GOTO 200
20 IF LOAD("paused") == 1 THEN GOTO 200
30 DIM amount, fee, payout AS Uint64
40 LET amount = DEROVALUE()
50 LET fee = amount * LOAD("feeBasisPoints") / 10000
60 LET payout = amount - fee
70 IF payout > 0 THEN GOTO 80 ELSE GOTO 90
80 SEND_DERO_TO_ADDRESS(LOAD("merchant"), payout)
90 IF fee > 0 THEN GOTO 100 ELSE GOTO 110
100 SEND_DERO_TO_ADDRESS(LOAD("feeRecipient"), fee)
110 STORE("totalProcessed", LOAD("totalProcessed") + amount)
120 STORE("totalFees", LOAD("totalFees") + fee)
130 STORE("paymentCount", LOAD("paymentCount") + 1)
140 RETURN 0
200 RETURN 1
End Function

Function UpdateMerchant(newAddress String) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
25 IF LOAD("feeBasisPoints") > 0 THEN GOTO 27 ELSE GOTO 30
27 IF ADDRESS_RAW(newAddress) == LOAD("feeRecipient") THEN GOTO 200
30 STORE("merchant", ADDRESS_RAW(newAddress))
40 RETURN 0
200 RETURN 1
End Function

Function Pause() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
30 STORE("paused", 1)
40 RETURN 0
200 RETURN 1
End Function

Function Resume() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
30 STORE("paused", 0)
40 RETURN 0
200 RETURN 1
End Function

Function WithdrawTrapped(amount Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("merchant") THEN GOTO 200
30 SEND_DERO_TO_ADDRESS(LOAD("merchant"), amount)
40 RETURN 0
200 RETURN 1
End Function

Function GetStats() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("totalProcessed")
200 RETURN 1
End Function
