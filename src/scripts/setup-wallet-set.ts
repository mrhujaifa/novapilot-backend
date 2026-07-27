import { circleClient } from "../lib/circle";

/**
 * Run this ONCE per environment (testnet setup, then again for mainnet later).
 * Copy the printed walletSet.id into CIRCLE_WALLET_SET_ID in your .env.
 * Do NOT run this on every deploy or every wallet creation — Circle will
 * happily create a new, orphaned Wallet Set every time you call this.
 */
async function main() {
  const response = await circleClient.createWalletSet({
    name: "NovaPilot",
  });

  const walletSet = response.data?.walletSet;
  if (!walletSet?.id) {
    throw new Error("Wallet set creation failed: no ID returned");
  }

  console.log("Wallet Set created. Add this to your .env:");
  console.log(`CIRCLE_WALLET_SET_ID=${walletSet.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
