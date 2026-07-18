// PREMINT escrow — empty-box template (deploy-ahead, bind-at-assign, fund-at-checkout)
//  MINT   Initialize()  -- no args, no DERO: creates an EMPTY isolated box
//  ASSIGN Bind(...)     -- owner-gated, zero-DERO, one-shot: writes order terms
//  FUND   Deposit()     -- buyer's ONE standard scinvoke: funds + captures buyer
//  SETTLE ConfirmDelivery / RefundBuyer / ClaimAfterExpiry / Dispute->Arbitrate / CancelUnfunded
//         + RefundAfterDisputeTimeout -- buyer self-refund if the arbitrator never resolves
//  Status: 0 await-deposit 1 funded 2 confirmed 3 refunded 4 expiry-claim 5 disputed 6 arbitrated 7 cancelled

// RINGSIZE NOTE: any function that PERSISTS SIGNER() as an identity (Initialize->owner,
// Deposit->buyer) rejects an unidentifiable signer. A DERO SC call made at ringsize > 2
// yields a zero SIGNER() (the daemon cannot single out the sender); storing that zero
// address would brick the box (refunds route to a null address) and let any other
// ringsize>2 caller pass a '!= buyer' gate. IS_ADDRESS_VALID(SIGNER()) is 0 for the zero
// address, so line 5 forces a real, ringsize-2 signer before any identity is captured.

Function Initialize() Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("owner") THEN GOTO 200
30 STORE("owner", SIGNER())
40 STORE("status", 0)
50 STORE("bound", 0)
60 STORE("paused", 0)
70 RETURN 0
200 RETURN 1
End Function

// Owner writes the order terms into an empty box. Zero DERO, one-shot (bound guard).
// buyer is NOT set here -- it does not exist until the buyer funds.
Function Bind(sellerAddress String, arbitratorAddress String, feeBasisPoints Uint64, blockExpiration Uint64, expectedAmount Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 IF LOAD("bound") != 0 THEN GOTO 200
40 IF feeBasisPoints >= 5000 THEN GOTO 200
50 IF blockExpiration < 4000 THEN GOTO 200
60 IF blockExpiration > 10000000 THEN GOTO 200
70 IF expectedAmount == 0 THEN GOTO 200
80 IF ADDRESS_RAW(arbitratorAddress) == ADDRESS_RAW(sellerAddress) THEN GOTO 200
90 STORE("seller", ADDRESS_RAW(sellerAddress))
100 STORE("arbitrator", ADDRESS_RAW(arbitratorAddress))
110 STORE("feeBasisPoints", feeBasisPoints)
120 STORE("blockExpiration", blockExpiration)
130 STORE("expectedAmount", expectedAmount)
140 STORE("escrowBalance", 0)
150 STORE("bound", 1)
160 RETURN 0
200 RETURN 1
End Function

// The ONLY fund entry. Captures buyer = SIGNER() at first funding and enforces the
// two distinctness checks that in escrow.bas lived only in Initialize.
//
// LINE 5 (ringsize guard) rejects an unidentifiable signer BEFORE any state change, so
// buyer is always a real ringsize-2 address (never the zero address).
//
// GUARD ORDER IS LOAD-BEARING (do not reorder): lines 10/15/20/30 LOAD only keys that
// ALWAYS exist (set in Initialize), so they are safe on an unbound box. Lines 40/45
// LOAD "seller"/"arbitrator" -- keys that DO NOT EXIST until Bind. They are reached
// only because line 15 (bound != 1) already bailed on any unbound box. Moving a
// terms-LOAD above line 15 reintroduces a panic AND lets the self-dealing check be
// skipped. Line 50 (underpayment) MUST precede line 120 (overage subtraction) so the
// Uint64 subtraction cannot underflow.
Function Deposit() Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF LOAD("paused") != 0 THEN GOTO 200
15 IF LOAD("bound")  != 1 THEN GOTO 200
20 IF LOAD("status") != 0 THEN GOTO 200
30 IF DEROVALUE() == 0 THEN GOTO 200
40 IF SIGNER() == LOAD("seller")     THEN GOTO 200
45 IF SIGNER() == LOAD("arbitrator") THEN GOTO 200
50 IF DEROVALUE() < LOAD("expectedAmount") THEN GOTO 200
60 STORE("buyer", SIGNER())
70 STORE("escrowBalance", LOAD("expectedAmount"))
80 STORE("status", 1)
90 STORE("depositHeight", BLOCK_HEIGHT())
100 IF DEROVALUE() > LOAD("expectedAmount") THEN GOTO 120
110 RETURN 0
120 SEND_DERO_TO_ADDRESS(SIGNER(), DEROVALUE() - LOAD("expectedAmount"))
130 RETURN 0
200 RETURN 1
End Function

// Buyer confirms delivery -> seller paid minus fee.
Function ConfirmDelivery() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
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

// Seller or owner refunds the buyer in full (no fee).
Function RefundBuyer() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
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

// Seller claims after the expiry window (buyer had time to dispute).
Function ClaimAfterExpiry() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
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

// Buyer raises a dispute -> locks funds for the arbitrator. Records disputeHeight so
// the buyer has a timeout escape hatch if the arbitrator never resolves (see
// RefundAfterDisputeTimeout).
Function Dispute() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
20 IF LOAD("status") != 1 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 STORE("status", 5)
50 STORE("disputeHeight", BLOCK_HEIGHT())
60 RETURN 0
200 RETURN 1
End Function

// Arbitrator resolves. releaseToSeller: 1 = pay seller (minus fee), 0 = full refund buyer.
Function Arbitrate(releaseToSeller Uint64) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
15 IF LOAD("paused") != 0 THEN GOTO 200
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

// Buyer's escape hatch against a lost/offline/malicious arbitrator. After the dispute
// window (14400 blocks ~= 3 days at ~18s/block) has passed since Dispute(), the buyer
// may reclaim their FULL deposit (no fee). Refund-to-buyer is the safe default for an
// absent arbitrator -- NEVER auto-release to the seller.
//
// DELIBERATELY NOT PAUSE-GATED: this is the box's guaranteed liveness escape, so it must
// work even on a frozen box -- otherwise a freeze left on (or a lost owner key) would
// trap the funds forever, re-creating the very lock this timeout removes. Safe to exempt
// because it can ONLY return the buyer's own deposit to the (guard-verified, real) buyer;
// it can never move funds to any other party, so it does not weaken Pause's anti-exploit
// purpose. Pause still freezes Deposit and every discretionary settlement path.
//
// GUARD ORDER: line 20 (status != 5) bails on every box that has not been disputed, so
// the terms-LOADs at 30/40/50 (buyer/disputeHeight/escrowBalance) are never reached on
// an unfunded/undisputed box (all three exist by the time status == 5).
Function RefundAfterDisputeTimeout() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 5 THEN GOTO 200
30 IF SIGNER() != LOAD("buyer") THEN GOTO 200
40 IF BLOCK_HEIGHT() < LOAD("disputeHeight") + 14400 THEN GOTO 200
50 SEND_DERO_TO_ADDRESS(LOAD("buyer"), LOAD("escrowBalance"))
60 STORE("escrowBalance", 0)
70 STORE("status", 3)
80 RETURN 0
200 RETURN 1
End Function

// Cancel a never-funded box (status 0). Owner may cancel ANY status-0 box (incl. an
// unbound idle box -- reclaim path); seller may cancel only a bound box. Owner is
// checked FIRST and the seller LOAD is EXISTS-guarded so an unbound box never panics.
Function CancelUnfunded() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF LOAD("status") != 0 THEN GOTO 200
30 IF SIGNER() == LOAD("owner") THEN GOTO 70
40 IF EXISTS("seller") == 0 THEN GOTO 200
50 IF SIGNER() == LOAD("seller") THEN GOTO 70
60 GOTO 200
70 STORE("status", 7)
80 RETURN 0
200 RETURN 1
End Function

// Owner circuit-breaker: freeze a box discovered mid-flight to be buggy. Blocks the
// fund-movers (Deposit + discretionary settlement); cannot claw back an in-tx exploit
// (honest limit), and cannot block the buyer's RefundAfterDisputeTimeout escape.
Function Pause() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 STORE("paused", 1)
40 RETURN 0
200 RETURN 1
End Function

Function Unpause() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 STORE("paused", 0)
40 RETURN 0
200 RETURN 1
End Function

// NOTE: no UpdateCode / UPDATE_SC_CODE by design — the code that holds escrowed funds
// is immutable once deployed. The platform can freeze a suspect box (Pause) but can
// never rewrite or drain a funded box.

// Two-step ownership transfer (cold-key rotation without exposing the cold key at deploy).
Function TransferOwnership(newOwner String) Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF SIGNER() != LOAD("owner") THEN GOTO 200
30 STORE("pendingOwner", ADDRESS_RAW(newOwner))
40 RETURN 0
200 RETURN 1
End Function

// Line 5 (ringsize guard) is redundant today — line 30 (SIGNER()==pendingOwner, a real
// stored address) already implies a valid non-zero signer — but it is kept so ALL three
// identity-capturing functions (Initialize/Deposit/ClaimOwnership -> owner/buyer/owner)
// carry the same guard and the invariant survives future edits to how pendingOwner is set.
Function ClaimOwnership() Uint64
5 IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10 IF DEROVALUE() > 0 THEN GOTO 200
20 IF EXISTS("pendingOwner") == 0 THEN GOTO 200
30 IF SIGNER() != LOAD("pendingOwner") THEN GOTO 200
40 STORE("owner", SIGNER())
50 DELETE("pendingOwner")
60 RETURN 0
200 RETURN 1
End Function

Function GetStatus() Uint64
10 IF DEROVALUE() > 0 THEN GOTO 200
20 RETURN LOAD("status")
200 RETURN 1
End Function
