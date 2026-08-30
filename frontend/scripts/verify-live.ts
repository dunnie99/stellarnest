/**
 * Live verification of StellarNest against its deployed Testnet contracts.
 *
 * This exercises the shipped service modules — the same code the app runs — so
 * it catches integration problems that mocked tests cannot. The event-streaming
 * path is where the version-specific traps live:
 *
 *  - RPC scans *forward* from `startLedger` across a bounded number of ledgers,
 *    so an over-long lookback returns zero events even when recent ones exist.
 *  - `startLedger` and `cursor` are mutually exclusive in the request type.
 *  - `EventResponse.contractId` is a `Contract` instance, not a string.
 *
 * Run with:  npm run verify
 */
import { rpc, Networks, StrKey } from '@stellar/stellar-sdk';
import {
  fetchEvents,
  resolveStartLedger,
  DEFAULT_LOOKBACK_LEDGERS,
} from '../src/services/eventService.ts';
import {
  fetchAllPools,
  fetchMembers,
  fetchPool,
  fetchTreasuryBalance,
  server,
} from '../src/services/contractService.ts';
import {
  IS_CONFIGURED,
  SAVINGS_CONTRACT_ID,
  SOROBAN_RPC_URL,
  TREASURY_CONTRACT_ID,
} from '../src/config.ts';
import { formatXlm } from '../src/utils/format.ts';

/** A funded Testnet account is needed as the source for read simulations. */
const SOURCE = process.env.VERIFY_SOURCE_ACCOUNT ?? '';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  console.log('StellarNest — live Testnet verification');
  console.log(`Endpoint: ${SOROBAN_RPC_URL}`);

  if (!IS_CONFIGURED) {
    console.error(
      '\nContracts are not configured. Run ../scripts/deploy/deploy.sh first.',
    );
    process.exit(1);
  }

  console.log(`Savings:  ${SAVINGS_CONTRACT_ID}`);
  console.log(`Treasury: ${TREASURY_CONTRACT_ID}`);

  /* ---------------------------------------------------------------- */
  section('1. Network and configuration');

  const network = await server.getNetwork();
  check('connected to Testnet', network.passphrase === Networks.TESTNET);

  const health = await server.getHealth();
  const retention = health.latestLedger - health.oldestLedger;
  check(
    'RPC healthy with a retention window',
    health.status === 'healthy' && retention > 0,
    `${retention.toLocaleString('en-US')} ledgers (~${(retention / 17_280).toFixed(1)} days)`,
  );

  check('both contract IDs are valid',
    StrKey.isValidContract(SAVINGS_CONTRACT_ID) && StrKey.isValidContract(TREASURY_CONTRACT_ID),
  );

  /* ---------------------------------------------------------------- */
  section('2. Contract reads');

  if (!SOURCE) {
    console.log('  [SKIP] set VERIFY_SOURCE_ACCOUNT to a funded G… address to run read checks');
  } else {
    const pools = await fetchAllPools(SOURCE);
    check('pools load through the shipped service', pools.length > 0, `${pools.length} pool(s)`);

    if (pools.length > 0) {
      const pool = pools[0];
      console.log(
        `         pool #${pool.id} "${pool.name}" · ${formatXlm(pool.totalContributed)} · ${pool.memberCount}/${pool.maxMembers} members`,
      );

      check('pool fields decode to the right types',
        typeof pool.id === 'number' &&
          typeof pool.totalContributed === 'bigint' &&
          typeof pool.name === 'string',
      );

      const detail = await fetchPool(pool.id, SOURCE);
      check('a single pool fetch matches the list', detail.id === pool.id);

      const members = await fetchMembers(pool.id, SOURCE);
      check('members list loads', members.length === pool.memberCount,
        `${members.length} member(s)`);

      // The two contracts keep independent books; they must agree exactly.
      const treasuryBalance = await fetchTreasuryBalance(pool.id, SOURCE);
      check(
        'savings and treasury balances reconcile',
        treasuryBalance === pool.totalContributed,
        `savings=${formatXlm(pool.totalContributed)} treasury=${formatXlm(treasuryBalance)}`,
      );
    }
  }

  /* ---------------------------------------------------------------- */
  section('3. Event streaming from both contracts');

  const start = await resolveStartLedger();
  const page = await fetchEvents({ startLedger: start }, 100);

  check(
    'events returned from the deployed contracts',
    page.events.length > 0,
    `${page.events.length} events from ledger ${start}`,
  );

  if (page.events.length > 0) {
    const labels = new Set(page.events.map((event) => event.label));
    console.log(`         decoded: ${[...labels].join(', ')}`);

    // The four events Module 3 requires, decoded by the same code the feed uses.
    for (const expected of [
      'Pool Created',
      'Member Joined',
      'Contribution Made',
      'Withdrawal Processed',
    ]) {
      const present = labels.has(expected);
      check(
        `decoded a "${expected}" event`,
        present,
        present ? '' : 'not seen in this window (may simply not have occurred yet)',
      );
    }

    const sources = new Set(page.events.map((event) => event.source));
    check(
      'events are attributed to both contracts',
      sources.has('savings') && sources.has('treasury'),
      [...sources].join(' + '),
    );

    const contribution = page.events.find((event) => event.kind === 'contribution');
    if (contribution) {
      check(
        'a contribution carries a decoded amount and pool id',
        contribution.amount !== null && contribution.poolId !== null,
        `pool #${contribution.poolId} · ${contribution.amount} XLM`,
      );
    }
  }

  /* ---------------------------------------------------------------- */
  section('4. Lookback window behaviour');

  // An over-long lookback burns the forward scan budget on old ledgers and
  // returns nothing. This is why DEFAULT_LOOKBACK_LEDGERS is small.
  const tooFar = await resolveStartLedger(60_000);
  const farPage = await fetchEvents({ startLedger: tooFar }, 100);
  console.log(
    `         lookback 60,000 → ${farPage.events.length} events; ` +
      `lookback ${DEFAULT_LOOKBACK_LEDGERS.toLocaleString('en-US')} → ${page.events.length} events`,
  );
  check(
    'the default lookback finds at least as much as an over-long one',
    page.events.length >= farPage.events.length,
  );

  let mutuallyExclusive = false;
  try {
    await server.getEvents({
      filters: [{ type: 'contract', contractIds: [SAVINGS_CONTRACT_ID] }],
      startLedger: start,
      cursor: page.cursor ?? undefined,
      limit: 1,
    } as never);
  } catch {
    mutuallyExclusive = true;
  }
  check('startLedger and cursor are mutually exclusive', mutuallyExclusive);

  /* ---------------------------------------------------------------- */
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nVerification aborted:', error);
  process.exit(1);
});

// Keeps the unused-import check honest about the rpc namespace type usage.
export type _Rpc = typeof rpc;
