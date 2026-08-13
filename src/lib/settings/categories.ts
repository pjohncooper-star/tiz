export type SettingsCategory = {
  href: string;
  label: string;
  description: string;
  contents: string[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    href: "/settings/units",
    label: "Units & display",
    description: "How distances, paces and completed workouts are shown.",
    contents: ["Units per sport", "Pool size", "Workout shading"],
  },
  {
    href: "/settings/thresholds",
    label: "Thresholds & paces",
    description:
      "The performance anchors zones and relative targets are calculated from.",
    contents: ["Race paces", "Current thresholds", "Threshold history"],
  },
  {
    href: "/settings/training",
    label: "Training & planning",
    description: "Defaults applied when building seasons and training plans.",
    contents: ["Zone focus", "Training load (ECO)"],
  },
  {
    href: "/settings/workouts",
    label: "Workouts",
    description: "Options offered while building and reviewing sessions.",
    contents: ["Swim equipment", "Self evaluation"],
  },
  {
    href: "/settings/integrations",
    label: "Integrations",
    description: "Connections to other services and calendar apps.",
    contents: ["Strava", "Calendar subscription"],
  },
];
