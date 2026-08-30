import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ActivityFeed from '../components/ActivityFeed';
import { useContractEvents } from '../hooks/useContractEvents';

export default function Activity() {
  const feed = useContractEvents();

  return (
    <div className="space-y-5">
      <Card
        title="Live Activity Feed"
        action={
          <Button size="sm" variant="ghost" onClick={() => void feed.refresh()}>
            Refresh
          </Button>
        }
      >
        <ActivityFeed events={feed.events} live={feed.live} error={feed.error} />
        {/*
          Soroban RPC retains roughly a week of ledgers, so this is a recent
          activity view rather than the full contract history.
        */}
        <p className="mt-4 text-[11px] text-mist-400">
          Events are streamed from both the savings and treasury contracts. Soroban RPC
          retains roughly 7 days of ledgers.
        </p>
      </Card>
    </div>
  );
}
