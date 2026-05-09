import { unifi } from "../services/unifi.js";

const TEST_MAC = process.argv[2];

if (!TEST_MAC) {
  console.error("usage: tsx test-unifi.ts <mac>");
  console.error("       use a non-critical device MAC — it will be blocked then unblocked");
  process.exit(1);
}

async function main() {
  console.log(`--- unifi test: using MAC ${TEST_MAC} ---`);

  console.log("1. fetching user record (pre)…");
  const pre = await unifi.getUser(TEST_MAC);
  if (!pre) {
    console.log(`   no user record found for ${TEST_MAC}`);
    console.log("   → device must have connected to the UniFi network at least once");
    process.exit(1);
  }
  console.log(`   blocked=${pre.blocked === true}  hostname=${pre.hostname ?? "?"}  name=${pre.name ?? "?"}`);

  console.log("2. blocking…");
  const r1 = await unifi.block(TEST_MAC);
  console.log("   ", r1);
  if (!r1.ok) process.exit(1);

  console.log("3. verifying blocked…");
  const mid = await unifi.isBlocked(TEST_MAC);
  console.log(`   blocked=${mid}`);
  if (mid !== true) {
    console.log("   ✗ expected blocked=true");
    process.exit(1);
  }

  console.log("4. unblocking…");
  const r2 = await unifi.unblock(TEST_MAC);
  console.log("   ", r2);
  if (!r2.ok) process.exit(1);

  console.log("5. verifying unblocked…");
  const post = await unifi.isBlocked(TEST_MAC);
  console.log(`   blocked=${post}`);
  if (post !== false) {
    console.log("   ✗ expected blocked=false");
    process.exit(1);
  }

  console.log("\n✓ unifi test passed");
}

main().catch((e) => {
  console.error("unifi test failed:", e);
  process.exit(1);
});
