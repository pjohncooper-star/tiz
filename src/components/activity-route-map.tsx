"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { ActivityStreamPoint } from "@/lib/activity/record-streams";
import {
  firstLastCoordinates,
  pointAtCursor,
  routeBounds,
  routeFromPoints,
  sliceRoute,
  type ChartCursor,
  type ChartSelection,
  type RouteLines,
} from "@/lib/activity/latlng";

const LIGHT_STYLE = "mapbox://styles/mapbox/streets-v12";
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return dark;
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection" as const, features: [] as object[] };
}

function multiLineFeature(lines: RouteLines) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "MultiLineString" as const, coordinates: lines },
  };
}

function pointFeature(lat: number, lng: number) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
  };
}

function setGeoJson(map: mapboxgl.Map, sourceId: string, data: object) {
  const source = map.getSource(sourceId);
  if (source && source.type === "geojson") {
    source.setData(data as never);
  }
}

function addRouteLayers(map: mapboxgl.Map, dark: boolean) {
  if (!map.getSource("route")) {
    map.addSource("route", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addSource("selection", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addSource("cursor", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addSource("endpoints", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }

  if (!map.getLayer("route-line")) {
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": dark ? "#7dd3fc" : "#0284c7",
        "line-width": 4,
        "line-opacity": 0.55,
      },
    });
    map.addLayer({
      id: "selection-line",
      type: "line",
      source: "selection",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ea580c",
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "endpoint-circles",
      type: "circle",
      source: "endpoints",
      paint: {
        "circle-radius": 5,
        "circle-color": ["match", ["get", "kind"], "start", "#16a34a", "#dc2626"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: "cursor-dot",
      type: "circle",
      source: "cursor",
      paint: {
        "circle-radius": 7,
        "circle-color": "#f8fafc",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#0f172a",
      },
    });
  }
}

type ActivityRouteMapProps = {
  points: ActivityStreamPoint[];
  token: string;
  cursor: ChartCursor | null;
  selection: ChartSelection | null;
};

export function ActivityRouteMap({
  points,
  token,
  cursor,
  selection,
}: ActivityRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const fittedRef = useRef(false);
  const dark = usePrefersDark();

  const lines = useMemo(() => routeFromPoints(points), [points]);
  const selectionLines = useMemo(
    () => (selection ? sliceRoute(points, selection, "time") : []),
    [points, selection]
  );
  const cursorCoord = useMemo(
    () => (cursor ? pointAtCursor(points, cursor, "time") : null),
    [points, cursor]
  );
  const ends = useMemo(() => firstLastCoordinates(points), [points]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: dark ? DARK_STYLE : LIGHT_STYLE,
      attributionControl: true,
      cooperativeGestures: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
    // Style is applied in a separate effect so the map is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = dark ? DARK_STYLE : LIGHT_STYLE;
    const apply = () => addRouteLayers(map, dark);
    if (map.isStyleLoaded()) {
      const current = map.getStyle()?.sprite ?? "";
      if (!current.includes(dark ? "dark-v11" : "streets-v12")) {
        map.once("style.load", apply);
        map.setStyle(next);
        return;
      }
      apply();
    } else {
      map.once("load", apply);
    }
  }, [dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const paint = () => {
      addRouteLayers(map, dark);
      setGeoJson(map, "route", {
        type: "FeatureCollection",
        features: lines.length ? [multiLineFeature(lines)] : [],
      });
      setGeoJson(map, "selection", {
        type: "FeatureCollection",
        features: selectionLines.length ? [multiLineFeature(selectionLines)] : [],
      });
      setGeoJson(
        map,
        "cursor",
        cursorCoord
          ? pointFeature(cursorCoord.lat, cursorCoord.lng)
          : emptyFeatureCollection()
      );
      const endpointFeatures: object[] = [];
      if (ends.start) {
        endpointFeatures.push({
          type: "Feature",
          properties: { kind: "start" },
          geometry: {
            type: "Point",
            coordinates: [ends.start.lng, ends.start.lat],
          },
        });
      }
      if (ends.finish) {
        endpointFeatures.push({
          type: "Feature",
          properties: { kind: "finish" },
          geometry: {
            type: "Point",
            coordinates: [ends.finish.lng, ends.finish.lat],
          },
        });
      }
      setGeoJson(map, "endpoints", {
        type: "FeatureCollection",
        features: endpointFeatures,
      });

      if (!fittedRef.current) {
        const bounds = routeBounds(lines);
        if (bounds) {
          map.fitBounds(bounds, { padding: 36, maxZoom: 15, duration: 0 });
          fittedRef.current = true;
        }
      }
    };

    if (map.isStyleLoaded()) paint();
    else map.once("load", paint);
  }, [lines, selectionLines, cursorCoord, ends, dark]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="mb-4 h-64 w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
      aria-label="Activity route map"
    />
  );
}
