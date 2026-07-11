/* x402-pay.bas - payment contract for the DeroPay x402 "dero-exact" scheme.

   An agent pays an x402 challenge by invoking Pay with the merchant and
   order from the challenge, depositing the price as DEROVALUE. The
   contract records three PUBLIC state keys per order:

     paid_<merchant>_<order> = payer address string  (facilitator checks payer match)
     amt_<merchant>_<order>  = DERO atomic deposited (facilitator checks >= required)
     h_<merchant>_<order>    = chain height at pay   (facilitator checks confirmations)

   The facilitator (apps/facilitator, routes/verify.ts) reads these via
   DERO.GetSC - payment evidence is public contract state while every
   participant balance stays homomorphically encrypted.

   Paying an already-paid order returns nonzero, which reverts the
   transaction so the second deposit bounces back to its sender instead
   of clobbering the record.

   NOTE: contracts/payment-router.bas is the OLDER invoice-based design
   (Pay(invoiceId)) and is unrelated to this scheme.
*/

Function Initialize() Uint64
10  STORE("owner", SIGNER())
20  RETURN 0
End Function

Function Pay(merchant_id String, order_id String) Uint64
10  DIM paidkey as String
20  LET paidkey = "paid_" + merchant_id + "_" + order_id
30  IF EXISTS(paidkey) THEN GOTO 100
40  IF DEROVALUE() == 0 THEN GOTO 100
50  STORE(paidkey, ADDRESS_STRING(SIGNER()))
60  STORE("amt_" + merchant_id + "_" + order_id, DEROVALUE())
70  STORE("h_" + merchant_id + "_" + order_id, BLOCK_HEIGHT())
80  RETURN 0
100 RETURN 1
End Function

Function Withdraw(amount Uint64) Uint64
10  IF LOAD("owner") == SIGNER() THEN GOTO 30
20  RETURN 1
30  SEND_DERO_TO_ADDRESS(SIGNER(), amount)
40  RETURN 0
End Function
