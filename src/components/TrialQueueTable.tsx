import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from "@tanstack/react-table";
import type { TrialQueueItem } from "../core/types";

const columns: Array<ColumnDef<TrialQueueItem>> = [
  {
    header: "Priority",
    accessorKey: "priority",
    cell: (info) => <span className={`queue-priority ${info.row.original.priority}`}>{String(info.getValue())}</span>
  },
  {
    header: "Species",
    accessorKey: "species",
    cell: (info) => <strong>{String(info.getValue())}</strong>
  },
  {
    header: "Treatment",
    accessorKey: "treatment"
  },
  {
    header: "Next step",
    accessorKey: "nextStep",
    cell: (info) => (
      <div className="queue-next-step">
        <strong>{info.row.original.nextStep}</strong>
        <span>{info.row.original.reason}</span>
      </div>
    )
  },
  {
    header: "Rows",
    accessorKey: "sourceRows",
    cell: (info) => info.row.original.sourceRows.join(", ")
  },
  {
    header: "Blocked",
    accessorKey: "blockedMetric"
  },
  {
    header: "Reference date",
    accessorKey: "nextDate"
  },
  {
    header: "PC observation",
    accessorKey: "pc",
    cell: (info) => (info.row.original.pc === null ? "Not recorded" : `${info.row.original.pc} / 5`)
  }
];

export function TrialQueueTable({ rows }: { rows: TrialQueueItem[] }) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <section className="panel trial-queue">
      <div className="panel-heading">
        <div>
          <h2>Trial queue</h2>
          <p>Row-specific follow-up work that can change treatment interpretation.</p>
        </div>
      </div>
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
