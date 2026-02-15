// Full Escrow Smart Contract with Arbitrator Support
//
// Roles:
//   - Owner: the DeroPay platform (deploys the contract)
//   - Seller: the merchant receiving payment
//   - Buyer: the customer making payment
//   - Arbitrator: optional third party for dispute resolution
//
// Status codes:
//   0 = awaiting deposit
//   1 = funded (buyer deposited)
//   2 = released to seller (buyer confirmed or expiry claimed)
//   3 = refunded to buyer
//   4 = released after expiry
//   5 = disputed (arbitrator needed)
//   6 = resolved by arbitrator
//
// Flow:
//   1. Platform deploys contract with seller, arbitrator, fee, and expiration
//   2. Buyer deposits DERO
//   3. Resolution: confirm, refund, expiry claim, or dispute -> arbitrate
//
// Deploy: curl --request POST --data-binary @escrow.bas http://127.0.0.1:40403/install_sc

Function Initialize(sellerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64) Uint64
10 IF EXISTS("owner") THEN GOTO 200
20 STORE("owner", SIGNER())
30 STORE("seller", ADDRESS_RAW(sellerAddress))
40 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
50 STORE("feeBasisPoints", feeBasisPoints)
60 STORE("blockExpiration", blockExpiration)
70 STORE("escrowBalance", 0)
80 STORE("status", 0)
90 RETURN 0
200 RETURN 1
End Function

// Buyer deposits DERO into escrow.
Function Deposit() Uint64
10 IF LOAD("status") != 0 THEN GOTO 200
20 IF DEROVALUE() == 0 THEN GOTO 200
30 STORE("buyer", SIGNER())
40 STORE("escrowBalance", LOAD("escrowBalance") + DEROVALUE())
50 STORE("status", 1)
60 STORE("depositHeight", BLOCK_HEIGHT())
70 RETURN 0
200 RETURN 1
End Function

// Buyer confirms delivery. Funds release to seller minus platform fee.
Function ConfirmDelivery() Uint64
10 IF LOAD("status") != 1 THEN GOTO 200
20 IF SIGNER() != LOAD("buyer") THEN GOTO 200
30 DIM balance, fee, payout AS Uint64
40 LET balance = LOAD("escrowBalance")
50 LET fee = balance * LOAD("feeBasisPoints") / 10000
60 LET payout = balance - fee
70 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
80 IF fee > 0 THEN GOTO 90 ELSE GOTO 100
90 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
100 STORE("escrowBalance", 0)
110 STORE("status", 2)
120 RETURN 0
200 RETURN 1
End Function

// Seller or owner refunds the buyer.
Function RefundBuyer() Uint64
10 IF LOAD("status") != 1 THEN GOTO 200
20 IF SIGNER() == LOAD("seller") THEN GOTO 50
30 IF SIGNER() == LOAD("owner") THEN GOTO 50
40 GOTO 200
50 SEND_DERO_TO_ADDRESS(LOAD("buyer"), LOAD("escrowBalance"))
60 STORE("escrowBalance", 0)
70 STORE("status", 3)
80 RETURN 0
200 RETURN 1
End Function

// Seller claims funds after expiration (buyer had time to dispute).
Function ClaimAfterExpiry() Uint64
10 IF LOAD("status") != 1 THEN GOTO 200
20 IF SIGNER() != LOAD("seller") THEN GOTO 200
30 IF BLOCK_HEIGHT() < LOAD("depositHeight") + LOAD("blockExpiration") THEN GOTO 200
40 DIM balance, fee, payout AS Uint64
50 LET balance = LOAD("escrowBalance")
60 LET fee = balance * LOAD("feeBasisPoints") / 10000
70 LET payout = balance - fee
80 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
90 IF fee > 0 THEN GOTO 100 ELSE GOTO 110
100 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
110 STORE("escrowBalance", 0)
120 STORE("status", 4)
130 RETURN 0
200 RETURN 1
End Function

// Buyer raises a dispute. Locks funds until arbitrator resolves.
Function Dispute() Uint64
10 IF LOAD("status") != 1 THEN GOTO 200
20 IF SIGNER() != LOAD("buyer") THEN GOTO 200
30 STORE("status", 5)
40 RETURN 0
200 RETURN 1
End Function

// Arbitrator resolves the dispute.
// releaseToSeller: 1 = pay seller, 0 = refund buyer
Function Arbitrate(releaseToSeller Uint64) Uint64
10 IF LOAD("status") != 5 THEN GOTO 200
20 IF SIGNER() != LOAD("arbitrator") THEN GOTO 200
30 DIM balance, fee, payout AS Uint64
40 LET balance = LOAD("escrowBalance")
50 LET fee = balance * LOAD("feeBasisPoints") / 10000
60 LET payout = balance - fee
70 IF releaseToSeller == 1 THEN GOTO 100
80 SEND_DERO_TO_ADDRESS(LOAD("buyer"), balance)
85 STORE("escrowBalance", 0)
87 STORE("status", 6)
90 GOTO 150
100 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
110 IF fee > 0 THEN GOTO 120 ELSE GOTO 130
120 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
130 STORE("escrowBalance", 0)
140 STORE("status", 6)
150 RETURN 0
200 RETURN 1
End Function

// Read the current escrow status (convenience function).
Function GetStatus() Uint64
10 RETURN LOAD("status")
End Function
