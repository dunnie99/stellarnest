import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ActivityFeed from './ActivityFeed';
import { makeEvent } from '../test/factories';

describe('ActivityFeed', () => {
  it('renders each of the four contract events', () => {
    render(
      <ActivityFeed
        live
        error={null}
        events={[
          makeEvent({ id: '1', kind: 'pool_created', label: 'Pool Created', amount: null }),
          makeEvent({ id: '2', kind: 'member_joined', label: 'Member Joined', amount: null }),
          makeEvent({ id: '3', kind: 'contribution', label: 'Contribution Made', amount: '100' }),
          makeEvent({ id: '4', kind: 'withdrawal', label: 'Withdrawal Processed', amount: '50' }),
        ]}
      />,
    );

    expect(screen.getByText('Pool Created')).toBeInTheDocument();
    expect(screen.getByText('Member Joined')).toBeInTheDocument();
    expect(screen.getByText('Contribution Made')).toBeInTheDocument();
    expect(screen.getByText('Withdrawal Processed')).toBeInTheDocument();
    expect(screen.getByText('100 XLM')).toBeInTheDocument();
    expect(screen.getByText('50 XLM')).toBeInTheDocument();
  });

  it('shows an empty state when nothing has happened yet', () => {
    render(<ActivityFeed events={[]} live error={null} />);
    expect(screen.getByText('No activity yet.')).toBeInTheDocument();
  });

  it('reports live and offline status', () => {
    const { rerender } = render(<ActivityFeed events={[]} live error={null} />);
    expect(screen.getByText('Live')).toBeInTheDocument();

    rerender(<ActivityFeed events={[]} live={false} error={null} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('surfaces a network failure with the documented message', () => {
    render(<ActivityFeed events={[]} live={false} error="connection refused" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to connect to Stellar network.',
    );
  });

  it('renders newly arrived events without losing existing ones', () => {
    const initial = [makeEvent({ id: '1', label: 'Pool Created' })];
    const { rerender } = render(<ActivityFeed events={initial} live error={null} />);
    expect(within(screen.getByTestId('activity-list')).getAllByRole('listitem')).toHaveLength(1);

    // A live update prepends the newer event.
    rerender(
      <ActivityFeed
        events={[makeEvent({ id: '2', label: 'Contribution Made' }), ...initial]}
        live
        error={null}
      />,
    );

    const items = within(screen.getByTestId('activity-list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Contribution Made');
  });

  it('filters to a single pool when asked', () => {
    render(
      <ActivityFeed
        live
        error={null}
        poolId={1}
        events={[
          makeEvent({ id: '1', poolId: 0, label: 'Pool Created' }),
          makeEvent({ id: '2', poolId: 1, label: 'Contribution Made' }),
        ]}
      />,
    );

    expect(screen.getByText('Contribution Made')).toBeInTheDocument();
    expect(screen.queryByText('Pool Created')).not.toBeInTheDocument();
  });

  it('caps the number of events rendered', () => {
    const events = Array.from({ length: 20 }, (_, index) =>
      makeEvent({ id: String(index) }),
    );
    render(<ActivityFeed events={events} live error={null} max={5} />);

    expect(
      within(screen.getByTestId('activity-list')).getAllByRole('listitem'),
    ).toHaveLength(5);
  });
});
