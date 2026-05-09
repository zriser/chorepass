import { pihole } from "../services/pihole.js";

const TEST_MAC = process.argv[2] ?? "02:00:00:ab:cd:ef";

async function main() {
  console.log(`--- pihole test: using MAC ${TEST_MAC} ---`);

  console.log("1. resolving group IDs by name…");
  const ids = await pihole.resolveGroupIds();
  console.log(`   unblocked=${ids.unblocked}  blocked=${ids.blocked}`);

  console.log("2. fetching client record (pre)…");
  try {
    const pre = await pihole.getClient(TEST_MAC);
    console.log("   ", JSON.stringify(pre));
  } catch (e: any) {
    console.log(`   client lookup failed: ${e.message}`);
    console.log(
      `   → add ${TEST_MAC} to Pi-hole clients (any group) before running this test`,
    );
    process.exit(1);
  }

  console.log("3. moving to Kids_Unblocked…");
  const r1 = await pihole.moveToUnblocked(TEST_MAC);
  console.log("   ", r1);
  if (!r1.ok) process.exit(1);

  console.log("4. moving to Kids_Blocked…");
  const r2 = await pihole.moveToBlocked(TEST_MAC);
  console.log("   ", r2);
  if (!r2.ok) process.exit(1);

  console.log("5. fetching client record (post)…");
  const post = await pihole.getClient(TEST_MAC);
  console.log("   ", JSON.stringify(post));

  console.log("\n✓ pihole test passed");
}

main().catch((e) => {
  console.error("pihole test failed:", e);
  process.exit(1);
});
