/* x402-pay.bas - hardened payment contract for the DeroPay x402 "dero-exact" scheme.

   An agent pays an x402 challenge by invoking Pay with the merchant and
   order from the challenge, depositing the price as DEROVALUE. The
   contract records three PUBLIC state keys per order that the facilitator
   reads via DERO.GetSC (payment evidence is public; balances stay
   homomorphically encrypted):

     paid_<mkey> = payer address string  (facilitator checks payer match)
     amt_<mkey>  = DERO atomic deposited (facilitator checks >= required)
     h_<mkey>    = block height at pay   (facilitator checks confirmations)

   where mkey = strlen(merchant_id) + "_" + merchant_id + "_" + order_id.
   The length prefix on merchant_id makes the key parse unambiguous, so no
   two distinct (merchant, order) pairs can ever collide onto one key
   (e.g. ("a","b_c") -> "1_a_b_c" vs ("a_b","c") -> "3_a_b_c").

   SECURITY MODEL (see packages/dero-pay/X402-RECEIPTS-SPEC.md threat model):
   - Duplicate or zero-value Pay calls PANIC(), which reverts the whole tx
     and refunds the payer's deposit (for a ring-size-2, identifiable
     signer). A second deposit to an already-paid order therefore bounces
     back instead of being silently absorbed. Anonymous (ring > 2) callers
     are not refundable and must not be used to pay.
   - Withdraw is owner-only: only the address that installed the contract
     can withdraw. INSTALL WITH RING SIZE 2 (the SDK's installSc default)
     so "owner" is a real, identifiable address; an anonymous caller's
     zero signer then never equals a real owner, so it cannot drain. (Do
     not install anonymously: that would set owner to the zero signer and
     let any anonymous caller match it.)
   - Withdraw's transfer is bounded by the DVM's external-transfer sanity
     check, which reverts any attempt to send more than the contract
     balance.
   - A withdrawal performs an external SEND, which needs storage gas the
     bare scinvoke RPC does not provision (it reverts with "Insufficient
     Storage Gas"). Sweep tooling MUST call DERO.GetGasEstimate and submit
     via the transfer RPC with fees = gascompute + gasstorage. (The
     estimate is correct only with DERO PR #18, which feeds real chain
     context to the estimator - needed because Pay stores BLOCK_HEIGHT.)
   - The contract cannot see the off-chain price, so an underpayment is
     recorded and rejected by the facilitator at verify time, not here;
     compliant clients deposit the exact challenge amount.

   NOTE: contracts/payment-router.bas is the OLDER invoice-based design
   (Pay(invoiceId)) and is unrelated to this scheme.
*/

Function Initialize() Uint64
5   IF IS_ADDRESS_VALID(SIGNER()) == 0 THEN GOTO 200
10  STORE("owner", SIGNER())
20  RETURN 0
200 RETURN 1
End Function

Function Pay(merchant_id String, order_id String) Uint64
10  DIM mkey as String
20  LET mkey = itoa(strlen(merchant_id)) + "_" + merchant_id + "_" + order_id
30  IF EXISTS("paid_" + mkey) THEN GOTO 100
40  IF DEROVALUE() == 0 THEN GOTO 100
50  STORE("paid_" + mkey, ADDRESS_STRING(SIGNER()))
60  STORE("amt_" + mkey, DEROVALUE())
70  STORE("h_" + mkey, BLOCK_HEIGHT())
80  RETURN 0
100 PANIC()
110 RETURN 1
End Function

Function Withdraw(amount Uint64) Uint64
10  IF LOAD("owner") == SIGNER() THEN GOTO 30
20  RETURN 1
30  SEND_DERO_TO_ADDRESS(SIGNER(), amount)
40  RETURN 0
End Function
