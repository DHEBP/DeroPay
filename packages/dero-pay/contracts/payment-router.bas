// =============================================================================
//
//  #####  #####  #####   ###   #####    ##   #    #
//  #    # #      #    # #    # #    #  #  #   #  #
//  #    # #####  #####  #    # #####  ######   ##
//  #    # #      #   #  #    # #      #    #   ##
//  #####  #####  #    #  ###   #      #    #   ##
//
//  DeroPay Payment Router * DVM-BASIC smart contract for DERO
//
// -----------------------------------------------------------------------------
//  Per-merchant contract: unlimited instant payments in one on-chain step.
//  Customer invokes Pay(invoiceId) with DERO; contract splits atomically
//  between merchant payout and optional fee recipient (basis points).
//
//  SPDX-License-Identifier: MIT
//  Copyright (c) 2026 DHEBP
//  https://deropay.com
// -----------------------------------------------------------------------------
//
//  Roles:  Merchant (deployer, primary payout) / Fee recipient (optional %)
//
//  Deploy: Initialize(feeRecipientAddress, feeBasisPoints) -- no DERO attached.
//          feeBasisPoints 0 skips split; feeRecipient stored as merchant.
//          feeBasisPoints > 0 requires feeRecipient distinct from merchant.
//
//  State keys
//    merchant         deployer address; receives payout slice each Pay
//    feeRecipient     receives fee slice when feeBasisPoints > 0
//    feeBasisPoints   fee rate (100 = 1%, 250 = 2.5%, 0 = no fee)
//    totalProcessed   cumulative DERO volume (atomic units)
//    totalFees        cumulative fees sent (atomic units)
//    paymentCount     number of successful Pay invocations
//    paused           merchant can halt new Pay (Pause / Resume)
//
// =============================================================================

Function Initialize(feeRecipientAddress String, feeBasisPoints Uint64) Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
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

// invoiceId is NOT used on-chain by design: it is recorded in the Pay transaction as the
// invoke argument, and the merchant's off-chain watcher reads it back to correlate the
// payment to an invoice -- the contract never needs to STORE it. Line 15 rejects an empty
// invoiceId so a payment cannot succeed uncorrelatable. NOTE: invoiceId rides in the tx in
// PLAINTEXT (SC invoke args are not encrypted) -- keep it an opaque token, never order data.
Function Pay(invoiceId String) Uint64
10 IF DEROVALUE() == 0 THEN GOTO 200
15 IF STRLEN(invoiceId) == 0 THEN GOTO 200
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
