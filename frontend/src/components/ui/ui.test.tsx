import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';
import Badge from './Badge';
import Card from './Card';
import Input from './Input';
import Modal from './Modal';
import Table, { type Column } from './Table';
import { EmptyMessage, ErrorMessage, LoadingMessage } from './StatusMessage';
import { appError } from '../../types';

describe('Button', () => {
  it('calls its handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('blocks interaction while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honours the disabled prop', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders each variant and size', () => {
    const { rerender } = render(
      <Button variant="secondary" size="sm">
        A
      </Button>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button variant="danger">B</Button>);
    rerender(<Button variant="ghost">C</Button>);
    expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('renders each tone', () => {
    render(
      <>
        <Badge>Neutral</Badge>
        <Badge tone="success">Open</Badge>
        <Badge tone="warning">Full</Badge>
        <Badge tone="danger">Failed</Badge>
        <Badge tone="info">Member</Badge>
      </>,
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders a title, action and children', () => {
    render(
      <Card title="Pools" action={<button type="button">New</button>}>
        <p>Body</p>
      </Card>,
    );

    expect(screen.getByText('Pools')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders without a header', () => {
    render(
      <Card>
        <p>Only body</p>
      </Card>,
    );
    expect(screen.getByText('Only body')).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('associates its label with the field', async () => {
    render(<Input label="Amount (XLM)" defaultValue="" />);
    const field = screen.getByLabelText('Amount (XLM)');

    await userEvent.type(field, '25');
    expect(field).toHaveValue('25');
  });

  it('shows an error and marks the field invalid', () => {
    render(<Input label="Amount" error="Too small" />);

    expect(screen.getByText('Too small')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a hint when there is no error', () => {
    render(<Input label="Amount" hint="Your balance: 10 XLM" />);
    expect(screen.getByText('Your balance: 10 XLM')).toBeInTheDocument();
  });

  it('prefers the error over the hint', () => {
    render(<Input label="Amount" hint="a hint" error="an error" />);
    expect(screen.getByText('an error')).toBeInTheDocument();
    expect(screen.queryByText('a hint')).not.toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Create" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders its content when open', () => {
    render(
      <Modal open title="Create pool" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Create pool' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('closes on the close button, backdrop click and Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Create" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    await userEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when the dialog body is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Create" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    await userEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks background scrolling while open', () => {
    const { unmount } = render(
      <Modal open title="Create" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

interface Row {
  id: string;
  name: string;
  amount: string;
}

const columns: Array<Column<Row>> = [
  { key: 'name', header: 'Name', render: (row) => row.name },
  { key: 'amount', header: 'Amount', hideOnMobile: true, render: (row) => row.amount },
];

describe('Table', () => {
  it('renders headers and rows', () => {
    render(
      <Table
        columns={columns}
        rows={[
          { id: '1', name: 'Alice', amount: '100' },
          { id: '2', name: 'Bob', amount: '50' },
        ]}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
  });

  it('shows the empty message when there are no rows', () => {
    render(
      <Table columns={columns} rows={[]} rowKey={(row) => row.id} empty="No members yet." />,
    );
    expect(screen.getByText('No members yet.')).toBeInTheDocument();
  });

  it('falls back to a default empty message', () => {
    render(<Table columns={columns} rows={[]} rowKey={(row) => row.id} />);
    expect(screen.getByText('Nothing to show.')).toBeInTheDocument();
  });
});

describe('status messages', () => {
  it('announces loading politely', () => {
    render(<LoadingMessage message="Processing Contribution..." />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Processing Contribution...');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders an error with its detail', () => {
    render(<ErrorMessage error={appError('transaction-failed', 'Error(Contract, #7)')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Transaction failed.');
    expect(screen.getByText('Error(Contract, #7)')).toBeInTheDocument();
  });

  it('renders an error without detail', () => {
    render(<ErrorMessage error={appError('network')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to connect to Stellar network.',
    );
  });

  it('renders an empty message', () => {
    render(<EmptyMessage>No activity yet.</EmptyMessage>);
    expect(screen.getByText('No activity yet.')).toBeInTheDocument();
  });
});
