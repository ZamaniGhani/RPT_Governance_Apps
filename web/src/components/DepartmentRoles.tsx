import { DEPARTMENT_OPTIONS } from '../api/types';

/** The department → permission reference, shown wherever someone needs to know who can do what. */
export function DepartmentRoles({ compact = false }: { compact?: boolean }) {
  return (
    <table className="table" style={{ fontSize: compact ? 12 : 13 }}>
      <thead>
        <tr>
          <th style={{ width: compact ? 96 : 120 }}>Department</th>
          <th>Can do</th>
        </tr>
      </thead>
      <tbody>
        {DEPARTMENT_OPTIONS.map((d) => (
          <tr key={d.code}>
            <td>
              <span className="tag tag-accent">{d.label}</span>
            </td>
            <td style={{ color: 'var(--color-neutral-800)' }}>{d.canDo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
