// Hello World Smart Contract -- Simple Counter
// Used for learning DERO smart contract deployment and interaction.
//
// Deploy:  curl --request POST --data-binary @counter.bas http://127.0.0.1:40403/install_sc
// Call:    scinvoke with entrypoint "Increment"
// Read:    getsc with variables=true, check "count" key

Function Initialize() Uint64
10 STORE("owner", SIGNER())
20 STORE("count", 0)
30 RETURN 0
End Function

// Increment the counter by 1. Anyone can call this.
Function Increment() Uint64
10 STORE("count", LOAD("count") + 1)
20 RETURN 0
End Function

// Reset the counter to 0. Only the owner can call this.
Function Reset() Uint64
10 IF LOAD("owner") == SIGNER() THEN GOTO 30
20 RETURN 1
30 STORE("count", 0)
40 RETURN 0
End Function
