deductUsage() → threshold পার → triggerSweep() → Circle transfer
↓ (fail হলে)
Settlement = PENDING/FAILED
↓
5 min পরে reconciliation job
↓
আবার triggerSweep()

User $0.20 threshold পার করল
→ triggerSweep() call হলো
→ Settlement PENDING তৈরি হলো
→ Circle API call করতে গিয়ে network timeout হলো ❌
→ Settlement PENDING-এ আটকে রইল
→ টাকা DB-তে deduct হয়েছে কিন্তু Circle-এ transfer হয়নি
