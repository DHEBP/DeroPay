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
//  Deploy: Initialize(seller, buyer, arbitrator, feeBps, blockExpiration, expectedAmount)
//          -- no DERO. Buyer is bound at deploy; only that address may fund via
//          Deposit(), and the deposit must be >= expectedAmount (blocks dust locks
//          and underpayment). blockExpiration must be within [4000, 10000000] blocks
//          (~20 hours to ~5.7 years at ~18s/block). The 4000-block floor exists so
//          a hostile seller cannot quote a sub-hour window and drain via
//          ClaimAfterExpiry before a human buyer can realistically dispute. The
//          window is disclosed to the buyer BEFORE deposit at the app layer.
//
//  Status codes
//    0  awaiting deposit
//    1  funded
//    2  released - buyer confirmed delivery
//    3  buyer fully refunded
//    4  released - seller claimed after expiry window
//    5  disputed - arbitrator action pending
//    6  closed - arbitrator decided outcome
//    7  cancelled - never funded, closed by seller/owner
//
//  Fee cap: feeBasisPoints must be < 5000 (< 50%). A 100% (or near-100%) fee
//  would let the platform route the entire balance to itself on release; the
//  seller must never be structurally payable zero. Basis-point ceiling is
//  enforced BOTH here (deploy JS guard) and on-chain (Initialize line 25).
//
//  Overpayment: Deposit() only credits exactly expectedAmount to escrowBalance
//  and refunds any excess to the buyer in-call, so a quoted-low expectedAmount
//  or a rounded-up send never traps buyer overage in the contract.
//
//  Dispute vs claim race: ClaimAfterExpiry() is blocked once status is
//  disputed (5); Dispute() and ClaimAfterExpiry() cannot both settle. The
//  buyer's dispute always wins the boundary block because a disputed escrow is
//  no longer in status 1, which ClaimAfterExpiry requires.
//
// =============================================================================

Function Initialize(sellerAddress String, buyerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64, expectedAmount Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("owner") THEN GOTO 200
25 IF feeBasisPoints >= 5000 THEN GOTO 200
26 IF blockExpiration < 4000 THEN GOTO 200
27 IF blockExpiration > 10000000 THEN GOTO 200
28 IF expectedAmount == 0 THEN GOTO 200
29 IF ADDRESS_RAW(arbitratorAddress) == ADDRESS_RAW(sellerAddress) THEN GOTO 200
30 IF ADDRESS_RAW(arbitratorAddress) == ADDRESS_RAW(buyerAddress) THEN GOTO 200
31 IF ADDRESS_RAW(sellerAddress) == ADDRESS_RAW(buyerAddress) THEN GOTO 200
32 STORE("owner", SIGNER())
40 STORE("seller", ADDRESS_RAW(sellerAddress))
45 STORE("buyer", ADDRESS_RAW(buyerAddress))
50 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
60 STORE("feeBasisPoints", feeBasisPoints)
70 STORE("blockExpiration", blockExpiration)
75 STORE("expectedAmount", expectedAmount)
80 STORE("escrowBalance", 0)
90 STORE("status", 0)
100 RETURN 0
200 RETURN 1
End Function

// Buyer deposits DERO into escrow. Only the bound buyer may fund, and the
// deposit must cover expectedAmount (blocks dust locks and underpayment).
// Exactly expectedAmount is escrowed; any overpayment is refunded in-call so
// buyer overage never gets absorbed and paid out to the seller/owner.
Function Deposit() Uint64
10 IF LOAD("status") != 0 THEN GOTO 200
20 IF DEROVALUE() == 0 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
35 IF DEROVALUE() < LOAD("expectedAmount") THEN GOTO 200
40 STORE("escrowBalance", LOAD("expectedAmount"))
50 STORE("status", 1)
60 STORE("depositHeight", BLOCK_HEIGHT())
65 IF DEROVALUE() > LOAD("expectedAmount") THEN GOTO 80 ELSE GOTO 70
70 RETURN 0
80 SEND_DERO_TO_ADDRESS(SIGNER(), DEROVALUE() - LOAD("expectedAmount"))
90 RETURN 0
200 RETURN 1
End Function

// Cancel a never-funded escrow (status 0). Seller or owner may close it so a
// mis-bound buyer address (buyer proved wallet A at claim but can only, or
// will only, deposit from wallet B) cannot leave a dangling contract that
// blocks quote reconciliation. No funds are ever at risk here: status 0 means
// Deposit() never succeeded, so escrowBalance is 0 and nothing is sent.
Function CancelUnfunded() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 0 THEN GOTO 200
30 IF SIGNER() == LOAD("seller") THEN GOTO 60
40 IF SIGNER() == LOAD("owner") THEN GOTO 60
50 GOTO 200
60 STORE("status", 7)
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
105 STORE("arbitrateResult", 0)
110 STORE("status", 6)
115 GOTO 170
120 IF payout > 0 THEN GOTO 130 ELSE GOTO 140
130 SEND_DERO_TO_ADDRESS(LOAD("seller"), payout)
140 IF fee > 0 THEN GOTO 150 ELSE GOTO 160
150 SEND_DERO_TO_ADDRESS(LOAD("owner"), fee)
160 STORE("escrowBalance", 0)
163 STORE("arbitrateResult", 1)
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

// Two-step ownership transfer. Lets the platform move owner authority (fee
// recipient + RefundBuyer + CancelUnfunded) off the hot deploy key onto a cold
// key WITHOUT ever exposing the cold key at deploy time. The current owner
// nominates a successor here; the successor must actively ClaimOwnership() to
// take over, so a fat-fingered address can never brick control. This bounds a
// hot-key compromise: rotate every live escrow's owner to a fresh cold key.
Function TransferOwnership(newOwner String) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 STORE("pendingOwner", ADDRESS_RAW(newOwner))
40 RETURN 0
200 RETURN 1
End Function

// The nominated successor accepts ownership. Only the address stored as
// pendingOwner may claim; on success it becomes owner and the pending slot is
// cleared so it cannot be replayed.
Function ClaimOwnership() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("pendingOwner") == 0 THEN GOTO 200
30 IF SIGNER() != LOAD("pendingOwner") THEN GOTO 200
40 STORE("owner", SIGNER())
50 DELETE("pendingOwner")
60 RETURN 0
200 RETURN 1
End Function
