import Link from "next/link";
import { Card } from "@/components/ui";
import { COMPONENT_TYPE_LABELS } from "@/lib/workout/component-types";

type Instance = {
  paletteOrderIndex: number;
  component: { id: string; name: string; componentType: keyof typeof COMPONENT_TYPE_LABELS };
  progressionStep: { label: string } | null;
};

export function SessionComponentProvenance({ instances }: { instances: Instance[] }) {
  if (instances.length === 0) return null;

  const sorted = [...instances].sort((a, b) => a.paletteOrderIndex - b.paletteOrderIndex);

  return (
    <Card title="Built from components">
      <ul className="space-y-2 text-sm">
        {sorted.map((row) => (
          <li key={`${row.component.id}-${row.paletteOrderIndex}`}>
            <Link
              href={`/plan/components/${row.component.id}`}
              className="font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              {row.component.name}
            </Link>
            <span className="text-zinc-500">
              {" "}
              · {COMPONENT_TYPE_LABELS[row.component.componentType]}
              {row.progressionStep ? ` · ${row.progressionStep.label}` : " · base"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
