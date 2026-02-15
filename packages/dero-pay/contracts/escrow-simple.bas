// Simple Escrow Smart Contract (no arbitrator)
// 
// Flow:
//   1. Deploy with seller address and block expiration
//   2. Buyer deposits DERO by calling Deposit()
//   3. Buyer confirms delivery -> funds release to seller
//   4. OR seller refunds buyer
//   5. OR after blockExpiration, seller can claim funds
//
// Deploy: curl --request POST --data-binary @escrow-simple.bas http://127.0.0.1:40403/install_sc

Function Initialize(sellerAddress String, blockExpiration Uint64) Uint64
10 IF EXISTS("owner") THEN GOTO 100
20 STORE("owner", SIGNER())
30 STORE("seller", ADDRESS_RAW(sellerAddress))
40 STORE("blockExpiration", blockExpiration)
50 STORE("escrowBalance", 0)
60 STORE("status", 0)
70 RETURN 0
100 RETURN 1
End Function

// Buyer deposits DERO into escrow.
// Status must be 0 (awaiting deposit).
// The depositor becomes the "buyer".
Function Deposit() Uint64
10 IF LOAD("status") != 0 THEN GOTO 100
20 IF DEROVALUE() == 0 THEN GOTO 100
30 STORE("buyer", SIGNER())
40 STORE("escrowBalance", LOAD("escrowBalance") + DEROVALUE())
50 STORE("status", 1)
60 STORE("depositHeight", BLOCK_HEIGHT())
70 RETURN 0
100 RETURN 1
End Function

// Buyer confirms they received the goods/service.
// Releases all escrowed funds to the seller.
Function ConfirmDelivery() Uint64
10 IF LOAD("status") != 1 THEN GOTO 100
20 IF SIGNER() != LOAD("buyer") THEN GOTO 100
30 SEND_DERO_TO_ADDRESS(LOAD("seller"), LOAD("escrowBalance"))
40 STORE("escrowBalance", 0)
50 STORE("status", 2)
60 RETURN 0
100 RETURN 1
End Function

// Seller refunds the buyer voluntarily.
// Only the seller (or contract owner) can call this.
Function RefundBuyer() Uint64
10 IF LOAD("status") != 1 THEN GOTO 100
20 IF SIGNER() != LOAD("seller") THEN GOTO 50
30 GOTO 60
50 IF SIGNER() != LOAD("owner") THEN GOTO 100
60 SEND_DERO_TO_ADDRESS(LOAD("buyer"), LOAD("escrowBalance"))
70 STORE("escrowBalance", 0)
80 STORE("status", 3)
90 RETURN 0
100 RETURN 1
End Function

// Seller claims funds after the expiration period.
// Buyer had enough time to dispute/confirm.
Function ClaimAfterExpiry() Uint64
10 IF LOAD("status") != 1 THEN GOTO 100
20 IF SIGNER() != LOAD("seller") THEN GOTO 100
30 IF BLOCK_HEIGHT() < LOAD("depositHeight") + LOAD("blockExpiration") THEN GOTO 100
40 SEND_DERO_TO_ADDRESS(LOAD("seller"), LOAD("escrowBalance"))
50 STORE("escrowBalance", 0)
60 STORE("status", 4)
70 RETURN 0
100 RETURN 1
End Function
