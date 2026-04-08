// =============================================================================
//
//  #####  #####  #####   ###   #####    ##   #    #
//  #    # #      #    # #    # #    #  #  #   #  #
//  #    # #####  #####  #    # #####  ######   ##
//  #    # #      #   #  #    # #      #    #   ##
//  #####  #####  #    #  ###   #      #    #   ##
//
//  DeroPay Escrow * DVM-BASIC smart contract for DERO
//
// -----------------------------------------------------------------------------
//  Four-party DERO escrow: platform owner, seller, buyer, optional arbitrator.
//  Atomic settlement, fee-on-release (basis points), timed seller claim path,
//  buyer dispute with arbitrator resolution.
//
//  SPDX-License-Identifier: MIT
//  Copyright (c) 2026 DHEBP
//  https://deropay.com
// -----------------------------------------------------------------------------
//
//  Roles:  Owner (deploys, fee recipient) / Seller / Buyer / Arbitrator
//
//  Deploy: Initialize(seller, arbitrator, feeBps, blockExpiration) -- no DERO.
//          Then buyer funds via Deposit().
//
//  Status codes
//    0  awaiting deposit
//    1  funded
//    2  released - buyer confirmed delivery
//    3  buyer fully refunded
//    4  released - seller claimed after expiry window
//    5  disputed - arbitrator action pending
//    6  closed - arbitrator decided outcome
//
// =============================================================================

Function Initialize(sellerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("owner") THEN GOTO 200
25 IF feeBasisPoints > 10000 THEN GOTO 200
30 STORE("owner", SIGNER())
40 STORE("seller", ADDRESS_RAW(sellerAddress))
50 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
60 STORE("feeBasisPoints", feeBasisPoints)
70 STORE("blockExpiration", blockExpiration)
80 STORE("escrowBalance", 0)
90 STORE("status", 0)
100 RETURN 0
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
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 DIM balance, fee, payout AS Uint64
50 LET balance = LOAD("escrowBalance")
60 LET fee = balance * LOAD("feeBasisPoints") / 10000
70 LET payout = balance - fee
80 IF payout > 0 THEN GOTO 90 ELSE GOTO 100
90 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
100 IF fee > 0 THEN GOTO 110 ELSE GOTO 120
110 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
120 STORE("escrowBalance", 0)
130 STORE("status", 2)
140 RETURN 0
200 RETURN 1
End Function

// Seller or owner refunds the buyer.
Function RefundBuyer() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() == LOAD("seller") THEN GOTO 60
40 IF SIGNER() == LOAD("owner") THEN GOTO 60
50 GOTO 200
60 SEND_DERO_TO_ADDRESS(LOAD("buyer"), LOAD("escrowBalance"))
70 STORE("escrowBalance", 0)
80 STORE("status", 3)
90 RETURN 0
200 RETURN 1
End Function

// Seller claims funds after expiration (buyer had time to dispute).
Function ClaimAfterExpiry() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("seller") THEN GOTO 200
40 IF BLOCK_HEIGHT() < LOAD("depositHeight") + LOAD("blockExpiration") THEN GOTO 200
50 DIM balance, fee, payout AS Uint64
60 LET balance = LOAD("escrowBalance")
70 LET fee = balance * LOAD("feeBasisPoints") / 10000
80 LET payout = balance - fee
90 IF payout > 0 THEN GOTO 100 ELSE GOTO 110
100 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
110 IF fee > 0 THEN GOTO 120 ELSE GOTO 130
120 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
130 STORE("escrowBalance", 0)
140 STORE("status", 4)
150 RETURN 0
200 RETURN 1
End Function

// Buyer raises a dispute. Locks funds until arbitrator resolves.
Function Dispute() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 STORE("status", 5)
50 RETURN 0
200 RETURN 1
End Function

// Arbitrator resolves the dispute.
// releaseToSeller: 1 = pay seller, 0 = refund buyer
Function Arbitrate(releaseToSeller Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 5 THEN GOTO 200
30 IF SIGNER() != LOAD("arbitrator") THEN GOTO 200
40 DIM balance, fee, payout AS Uint64
50 LET balance = LOAD("escrowBalance")
60 LET fee = balance * LOAD("feeBasisPoints") / 10000
70 LET payout = balance - fee
80 IF releaseToSeller == 1 THEN GOTO 120
90 SEND_DERO_TO_ADDRESS(LOAD("buyer"), balance)
100 STORE("escrowBalance", 0)
110 STORE("status", 6)
115 GOTO 170
120 IF payout > 0 THEN GOTO 130 ELSE GOTO 140
130 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
140 IF fee > 0 THEN GOTO 150 ELSE GOTO 160
150 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
160 STORE("escrowBalance", 0)
165 STORE("status", 6)
170 RETURN 0
200 RETURN 1
End Function

// Read the current escrow status (convenience function).
Function GetStatus() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("status")
200 RETURN 1
End Function
